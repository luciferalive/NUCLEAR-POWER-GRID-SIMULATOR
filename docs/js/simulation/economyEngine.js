import { DIFFICULTY, LOAD_SHAPES, PNOM, REGION_SHAPE, WATER_PRICE } from "./constants.js";
import { allocate, bonus } from "./powerGrid.js";
import { nextRandom, randRange, pick } from "./rng.js";
import { MIN_PER_DAY, addLedger, clamp, day, dayOfYear, hourOfDay, log, relax, sumExpense, sumIncome } from "./util.js";
const FUEL_PER_MWT_MIN = 0.07; // $ per MWt-minute of fission heat (fictional)
export const PRICE_SCALE = 55;
// ------------------------------------------------------------------------------------------------ weather
export function stepWeather(s) {
    const w = s.weather;
    const d = dayOfYear(s.t), h = hourOfDay(s.t);
    if (s.t >= w.changeT) {
        const r = nextRandom(s);
        const summer = Math.sin((2 * Math.PI * (d - 100)) / 360);
        const kinds = ["sunny", "sunny", "cloudy", "cloudy", "rain", "strong wind", "thunderstorm"];
        if (summer > 0.5 && r < 0.12)
            w.kind = "heatwave";
        else if (summer < -0.5 && r < 0.12)
            w.kind = "cold wave";
        else
            w.kind = pick(s, kinds);
        w.changeT = s.t + Math.round(randRange(s, 8, 36) * 60);
        if (w.kind !== "sunny" && w.kind !== "cloudy")
            log(s, w.kind === "thunderstorm" || w.kind === "heatwave" || w.kind === "cold wave" ? "notice" : "info", "weather", `Weather: ${w.kind}`);
    }
    const base = 15 + 12 * Math.sin((2 * Math.PI * (d - 100)) / 360) + 6 * Math.sin((2 * Math.PI * (h - 9)) / 24);
    const off = { heatwave: 9, "cold wave": -10, rain: -3, thunderstorm: -3, cloudy: -1, sunny: 1, "strong wind": -1 }[w.kind] ?? 0;
    w.temp = relax(w.temp, base + off, 1, 90);
    w.wind = relax(w.wind, w.kind === "strong wind" ? 17 : w.kind === "thunderstorm" ? 14 : 6, 1, 120);
    const daylight = clamp(Math.sin((Math.PI * (h - 6)) / 12), 0, 1);
    w.sun = relax(w.sun, daylight * (w.kind === "sunny" || w.kind === "heatwave" ? 1 : w.kind === "cloudy" ? 0.5 : 0.2), 1, 30);
    w.rain = relax(w.rain, w.kind === "rain" ? 0.8 : w.kind === "thunderstorm" ? 1 : 0, 1, 40);
}
// ------------------------------------------------------------------------------------------------ market
const COMPETITORS = [
    { id: "coal", cap: 520, kind: "fixed" }, { id: "gas", cap: 430, kind: "fixed" }, { id: "hydro", cap: 210, kind: "hydro" },
    { id: "wind", cap: 280, kind: "wind" }, { id: "solar", cap: 200, kind: "solar" }, { id: "nuclear-b", cap: 380, kind: "fixed" },
];
export function competitorSupply(s, hour = hourOfDay(s.t)) {
    let tot = 0;
    for (const c of COMPETITORS) {
        let a = 1;
        if (c.kind === "wind")
            a = clamp(0.12 + s.weather.wind / 22, 0.05, 1);
        else if (c.kind === "solar")
            a = clamp(s.weather.sun, 0, 1) * 0.95;
        else if (c.kind === "hydro")
            a = 0.8;
        else
            a = 0.93 + 0.05 * Math.sin(s.t / 5000 + c.cap);
        tot += c.cap * a;
    }
    return tot;
}
export function regionalDemand(s, hour = hourOfDay(s.t), temp = s.weather.temp) {
    const d = dayOfYear(s.t);
    const season = 1 + 0.09 * Math.cos((4 * Math.PI * d) / 360);
    const weather = 1 + 0.012 * Math.max(0, temp - 27) + 0.01 * Math.max(0, 4 - temp);
    const h0 = Math.floor(hour) % 24, f = hour - Math.floor(hour);
    const shape = REGION_SHAPE[h0] * (1 - f) + REGION_SHAPE[(h0 + 1) % 24] * f;
    const surge = s.events.filter((e) => !e.resolved && e.effects.demandSurge && s.t < e.endT).reduce((a, e) => a + e.effects.demandSurge, 0);
    return 2300 * shape * season * weather * (1 + (s.flags.growth ?? 0)) * (1 + surge);
}
export function spotPriceFor(s, demand, supply) {
    const vol = DIFFICULTY[s.settings.difficulty].volatility;
    const scarcity = Math.pow(Math.max(0.3, demand) / Math.max(150, supply), 2.2 * (0.7 + 0.3 * vol));
    return clamp(s.market.basePrice * scarcity, 14, 450);
}
export function forecastPrices(s) {
    const out = [];
    for (let i = 1; i <= 24; i++) {
        const h = (hourOfDay(s.t) + i) % 24;
        const sun = clamp(Math.sin((Math.PI * (h - 6)) / 12), 0, 1) * 0.6;
        const keep = s.weather.sun;
        s.weather.sun = sun;
        const sup = competitorSupply(s, h) + (s.grid.spotMW || 0);
        s.weather.sun = keep;
        out.push(spotPriceFor(s, regionalDemand(s, h, s.weather.temp), sup));
    }
    return out;
}
// ------------------------------------------------------------------------------------------------ customers and contracts
const SHAPE_FOR = { steel: "steel", aluminium: "flat", cement: "shift", chemical: "flat", "oil & gas": "flat", "data center": "datacenter", mining: "shift", manufacturing: "shift", residential: "residential", government: "government" };
export function customerDemand(s, c) {
    const shape = LOAD_SHAPES[c.loadShape] ?? LOAD_SHAPES.flat;
    const h = hourOfDay(s.t), h0 = Math.floor(h) % 24, f = h - Math.floor(h);
    const k = shape[h0] * (1 - f) + shape[(h0 + 1) % 24] * f;
    const ev = s.events.filter((e) => !e.resolved && s.t < e.endT && e.effects[`cust:${c.id}`] !== undefined).reduce((a, e) => a * e.effects[`cust:${c.id}`], 1);
    const growth = c.industry === "residential" ? 1 + (s.flags.growth ?? 0) : 1;
    const weather = c.industry === "residential" ? 1 + 0.012 * Math.max(0, s.weather.temp - 27) + 0.01 * Math.max(0, 4 - s.weather.temp) : 1;
    return c.peakMW * k * ev * growth * weather;
}
export function makeContract(s, o) {
    const n = s.contracts.length + 1;
    return { id: `C-${String(n).padStart(4, "0")}`, customerId: o.customerId, capacityMW: o.capacityMW, price: o.price, startT: s.t, endT: s.t + o.days * MIN_PER_DAY,
        priority: o.priority, penalty: Math.round(o.price * 2.2), active: true, terminated: false, demandMW: 0, deliveredMW: 0, shortfallMW: 0,
        monthMWh: 0, totalMWh: 0, totalRevenue: 0, accruedUnbilled: 0, lateCount: 0 };
}
export function marketIndex(s) {
    const h = s.market.priceHistory;
    if (!h.length)
        return 1;
    const avg = h.slice(-168).reduce((a, b) => a + b, 0) / Math.min(168, h.length);
    return clamp(avg / PRICE_SCALE, 0.7, 1.5);
}
export function generateOffers(s) {
    const open = s.offers.filter((o) => o.status === "open");
    if (open.length >= 5)
        return;
    const busy = new Set([...s.contracts.filter((c) => c.active).map((c) => c.customerId), ...open.map((o) => o.customerId)]);
    const free = s.customers.filter((c) => !busy.has(c.id));
    const pool = free.length ? free : s.customers.filter((c) => !open.some((o) => o.customerId === c.id));
    if (!pool.length)
        return;
    const c = pick(s, pool);
    const cap = Math.max(10, Math.round((c.peakMW * randRange(s, 0.45, 0.85)) / 5) * 5);
    const reservation = Math.round(c.reservation * marketIndex(s) * randRange(s, 0.95, 1.08) * 100) / 100;
    const o = { id: `O-${s.t}-${c.id}`, customerId: c.id, capacityMW: cap, days: pick(s, [90, 180, 365, 730]), asking: Math.round(reservation * 0.93 * 100) / 100, reservation,
        priority: pick(s, [2, 3, 3, 4]), rounds: 0, expiresT: s.t + 12 * MIN_PER_DAY, status: "open", note: "Request for a new supply contract" };
    s.offers.push(o);
    log(s, "info", "sales", `${c.name} requests a ${cap} MW supply contract (${o.days} days). They offer $${o.asking}/MWh.`);
    if (s.offers.length > 40)
        s.offers.splice(0, s.offers.length - 30);
}
export function negotiate(s, offerId, price) {
    const o = s.offers.find((x) => x.id === offerId && x.status === "open");
    if (!o)
        return "Offer is no longer open";
    const c = s.customers.find((x) => x.id === o.customerId);
    o.rounds++;
    if (price <= o.reservation + 1e-9) {
        acceptOffer(s, offerId, price);
        return `${c.name} accepts $${price.toFixed(2)}/MWh`;
    }
    if (o.rounds >= 3) {
        o.status = "withdrawn";
        o.note = "Customer walked away after three rounds";
        log(s, "notice", "sales", `${c.name} ended the negotiation (too expensive).`);
        return `${c.name} walked away`;
    }
    o.lastCounter = Math.round(o.reservation * (1 + 0.03 * (3 - o.rounds)) * 100) / 100;
    o.asking = Math.min(o.asking, o.lastCounter);
    o.note = `Counter-offer: $${o.lastCounter}/MWh (${3 - o.rounds} round(s) left)`;
    return o.note;
}
export function acceptOffer(s, offerId, price) {
    const o = s.offers.find((x) => x.id === offerId && x.status === "open");
    if (!o)
        return "Offer is no longer open";
    const p = price ?? o.lastCounter ?? o.asking;
    s.contracts.push(makeContract(s, { customerId: o.customerId, capacityMW: o.capacityMW, price: p, days: o.days, priority: o.priority }));
    o.status = "accepted";
    const c = s.customers.find((x) => x.id === o.customerId);
    log(s, "notice", "sales", `Contract signed with ${c.name}: ${o.capacityMW} MW at $${p.toFixed(2)}/MWh for ${o.days} days.`);
    return null;
}
// ------------------------------------------------------------------------------------------------ the per-minute economy step
export function stepEconomy(s, dt) {
    const m = s.market, g = s.grid, f = s.finance, diff = DIFFICULTY[s.settings.difficulty];
    stepWeather(s);
    m.regionalDemand = regionalDemand(s);
    m.competitorSupply = competitorSupply(s);
    m.exportCapMW = g.exportCapMW;
    g.demandMW = 0;
    for (const c of s.contracts) {
        if (!c.active || c.terminated) {
            c.demandMW = 0;
            continue;
        }
        const cust = s.customers.find((x) => x.id === c.customerId);
        c.demandMW = Math.min(c.capacityMW, customerDemand(s, cust));
        g.demandMW += c.demandMW;
    }
    const al = allocate(s, dt, (surplus, cap) => {
        const depth = Math.max(15, (m.regionalDemand - m.competitorSupply) * 0.9 + 30);
        return Math.max(0, Math.min(surplus, cap, depth));
    });
    m.spotSoldMW = al.spot;
    m.spotBoughtMW = al.bought;
    const target = spotPriceFor(s, m.regionalDemand, m.competitorSupply + al.spot);
    m.spotPrice = relax(m.spotPrice, target, dt, 20);
    const hours = dt / 60;
    // revenue (accrual) -- contracts are billed monthly, spot is paid at once
    for (const c of s.contracts) {
        if (c.deliveredMW > 0) {
            const mwh = c.deliveredMW * hours, rev = mwh * c.price;
            c.monthMWh += mwh;
            c.totalMWh += mwh;
            c.totalRevenue += rev;
            c.accruedUnbilled += rev;
            addLedger(s, "contracts", rev, `Delivery ${c.id}`, false);
            s.stats.contractMWh += mwh;
        }
        if (c.shortfallMW > 0.01 && c.active) {
            const mwh = c.shortfallMW * hours;
            s.stats.unservedMWh += mwh;
            addLedger(s, "penalties", -mwh * c.penalty, `Undelivered energy ${c.id}`);
            f.reputation = clamp(f.reputation - 0.004 * c.shortfallMW * hours * 10 / Math.max(10, c.capacityMW), 0, 100);
        }
        else if (c.active && c.deliveredMW > 0)
            f.reputation = clamp(f.reputation + 0.0004 * hours * 10, 0, 100);
    }
    const bonusPrice = 1 + bonus(s, "priceBoost");
    if (al.spot > 0) {
        const rev = al.spot * hours * m.spotPrice * bonusPrice;
        addLedger(s, "spot", rev, "Spot sales");
        s.stats.spotMWh += al.spot * hours;
    }
    if (al.bought > 0) {
        addLedger(s, "grid-purchases", -al.bought * hours * m.spotPrice * 1.12, "Electricity bought to cover contracts");
        s.stats.boughtMWh += al.bought * hours;
    }
    if (g.netMW < 0) {
        addLedger(s, "grid-purchases", -(-g.netMW) * hours * m.spotPrice * 1.15, "Auxiliary electricity bought from grid");
    }
    const mwhNet = Math.max(0, g.netMW) * hours;
    s.stats.totalMWh += mwhNet;
    s.stats.todayMWh += mwhNet;
    s.stats.monthMWh += mwhNet;
    s.stats.yearMWh += mwhNet;
    if (g.netMW > s.stats.peakNetMW)
        s.stats.peakNetMW = g.netMW;
    if (g.netMW > 5)
        s.stats.uptimeMin += dt;
    // running costs
    const costScale = 1 + bonus(s, "costs") + (s.flags.inflation ?? 0);
    addLedger(s, "fuel", -s.reactor.n * PNOM * dt * FUEL_PER_MWT_MIN * costScale, "Fuel consumption");
    addLedger(s, "water", -s.cooling.waterUseM3h * hours * WATER_PRICE * costScale, "Cooling water and treatment");
    if (!s.flags.coolingCostOnly)
        addLedger(s, "waste", -(0.002 * PNOM * s.reactor.n) * dt * costScale, "Waste management");
    // hourly record
    if (s.t % 60 === 0) {
        m.priceHistory.push(m.spotPrice);
        if (m.priceHistory.length > 24 * 14)
            m.priceHistory.shift();
        m.forecast = forecastPrices(s);
        s.hourly.push({ t: s.t, grossMW: g.grossMW, netMW: g.netMW, demandMW: g.demandMW, contractMW: g.contractedMW, spotMW: g.spotMW, price: m.spotPrice,
            revenue: sumIncome(f.day), tCool: s.reactor.tCool, powerFrac: s.reactor.n });
        if (s.hourly.length > 24 * 90)
            s.hourly.splice(0, 24 * 30);
    }
    if (s.t % (MIN_PER_DAY / 2) === 0 && s.t > 0) {
        if (nextRandom(s) < 0.45)
            generateOffers(s);
    }
    // offers expire
    for (const o of s.offers)
        if (o.status === "open" && s.t > o.expiresT) {
            o.status = "withdrawn";
            o.note = "Offer expired";
        }
    if (s.t % MIN_PER_DAY === 0 && s.t > 0)
        dailyRollover(s, diff.payDelay);
}
function dailyRollover(s, payDelay) {
    const f = s.finance;
    const d = day(s.t);
    // salaries, insurance, administration, compliance, R&D, interest are charged daily (1/30 of the monthly amount)
    const salaries = s.staff.reduce((a, e) => a + e.salary, 0) / 30;
    const assets = f.assets;
    addLedger(s, "salaries", -salaries, "Daily salaries");
    addLedger(s, "insurance", -(assets * 0.00012), "Insurance premium");
    addLedger(s, "administration", -(26000 + 120 * s.staff.length), "Administration");
    addLedger(s, "compliance", -(14000 + (100 - s.safety.compliance) * 450), "Regulatory compliance");
    if (s.research.current)
        addLedger(s, "research", -s.research.budgetPerDay, "Research & development");
    let interest = 0;
    for (const l of f.loans) {
        interest += (l.principal * l.rate) / 360;
    }
    if (interest > 0)
        addLedger(s, "interest", -interest, "Loan interest");
    addLedger(s, "storage-site", -4500, "Facility upkeep and logistics");
    // monthly: loan amortisation + invoicing
    if (d % 30 === 0)
        monthlyRollover(s, payDelay);
    // invoice payments
    for (const inv of f.invoices) {
        if (inv.paid)
            continue;
        const cust = s.customers.find((c) => c.id === inv.customerId);
        if (s.t >= inv.dueT) {
            const p = clamp(0.35 + 0.65 * cust.credit - 0.05 * payDelay, 0.05, 0.98) + (s.flags[`chased:${inv.id}`] ? 0.3 : 0);
            if (nextRandom(s) < p) {
                inv.paid = true;
                inv.paidT = s.t;
                inv.overdue = false;
                f.cash += inv.amount;
                f.totals.cashReceived = (f.totals.cashReceived ?? 0) + inv.amount;
                log(s, "info", "finance", `Payment received: ${cust.name} paid ${Math.round(inv.amount).toLocaleString()}`);
            }
            else if (!inv.overdue) {
                inv.overdue = true;
                const c = s.contracts.find((x) => x.id === inv.contractId);
                if (c)
                    c.lateCount++;
                log(s, "notice", "finance", `${cust.name} is late paying invoice ${inv.id}`);
            }
        }
    }
    f.invoices = f.invoices.filter((i) => !i.paid || s.t - (i.paidT ?? 0) < 90 * MIN_PER_DAY);
    // contracts end
    for (const c of s.contracts)
        if (c.active && s.t >= c.endT) {
            c.active = false;
            log(s, "notice", "sales", `Contract ${c.id} has ended.`);
        }
    // roll finance windows
    f.prevDay = f.day;
    f.day = {};
    f.dailyHistory.push({ t: s.t, revenue: sumIncome(f.prevDay), expenses: sumExpense(f.prevDay), net: sumIncome(f.prevDay) - sumExpense(f.prevDay) });
    if (f.dailyHistory.length > 800)
        f.dailyHistory.shift();
    s.stats.todayMWh = 0;
    if (d % 360 === 0) {
        f.year = {};
        s.stats.yearMWh = 0;
    }
    // asset value = book value of equipment + cash-independent plant value
    f.assets = 180_000_000 + s.equipment.reduce((a, e) => a + (e.condition / 100) * e.replaceCost * 0.4, 0) + (s.upgrades.length * 4_000_000);
}
function monthlyRollover(s, payDelay) {
    const f = s.finance;
    const income = sumIncome(f.month), exp = sumExpense(f.month);
    if (s.t > 0 && income - exp > 0)
        s.stats.profitableMonths++;
    f.prevMonth = f.month;
    f.month = {};
    s.stats.monthMWh = 0;
    for (const c of s.contracts) {
        if (c.accruedUnbilled > 1) {
            const inv = { id: `INV-${s.t}-${c.id}`, customerId: c.customerId, contractId: c.id, issuedT: s.t, dueT: s.t + Math.round(12 * payDelay) * MIN_PER_DAY, amount: c.accruedUnbilled, paid: false, overdue: false };
            f.invoices.push(inv);
            c.accruedUnbilled = 0;
            c.monthMWh = 0;
        }
    }
    // loan amortisation: 1/120 of principal per month
    for (const l of f.loans) {
        const pay = Math.min(l.principal, l.principal / 120 + 1);
        l.principal -= pay;
        f.cash -= pay;
        f.totals.loan = (f.totals.loan ?? 0) - pay;
    }
    f.loans = f.loans.filter((l) => l.principal > 1);
    f.debt = f.loans.reduce((a, l) => a + l.principal, 0);
}
