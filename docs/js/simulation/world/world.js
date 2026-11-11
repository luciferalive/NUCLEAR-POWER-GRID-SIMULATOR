import { nextRandom, pick, randInt, randRange } from "../rng.js";
import { MIN_PER_DAY, addLedger, clamp, dayOfYear, hourOfDay, log, relax, setAlarm } from "../util.js";
import { COMPETITORS, ITEM_PRICE, OUR_PLANT, REGIONS, REGION_SUB, STATIC_NODES, SUBSTATIONS, SUPPLIERS, regionOf } from "./data.js";
const KIND_FOR = { steel: "steel", aluminium: "aluminium", cement: "cement", chemical: "chemical", "oil & gas": "refinery", "data center": "datacenter", mining: "mine", manufacturing: "factory", residential: "residential", government: "government" };
export const WAREHOUSE_CAP = { spares: 150, supplies: 400, components: 40, materials: 12000 };
export const hasWorld = (s) => !!s.world;
/** Record a world event on the timeline and (optionally) as a news article. News is only ever created from real simulation events. */
export function worldEvent(s, cat, headline, body, sev = "info", news = true) {
    const w = s.world;
    w.timeline.push({ t: s.t, cat, text: headline });
    if (w.timeline.length > 500)
        w.timeline.splice(0, 100);
    if (news) {
        w.news.push({ id: w.newsId++, t: s.t, cat: cat, headline, body, sev });
        if (w.news.length > 200)
            w.news.splice(0, 50);
    }
}
// ------------------------------------------------------------------------------------------------ creation
function makeWeather(s) {
    const out = {};
    for (const r of REGIONS)
        out[r.id] = { kind: "sunny", temp: 15, wind: 6, sun: 0.5, rain: 0, since: 0, until: s.t + 24 * 60, forecast: ["sunny", "cloudy", "sunny"] };
    return out;
}
export function createWorld(s) {
    const nodes = [...SUBSTATIONS, ...STATIC_NODES, { id: OUR_PLANT.id, kind: "nuclear", name: "Our Nuclear Power Plant", region: "Central", x: OUR_PLANT.x, y: OUR_PLANT.y, owner: "us" },
        { id: "ext-grid", kind: "external", name: "External Grid Interconnector", region: "East", x: 955, y: 160, owner: "external" }];
    const competitors = COMPETITORS.map((c) => { nodes.push({ id: c.node, kind: c.tech === "nuclear" ? "nuclear" : c.tech, name: c.name, region: c.region, x: c.x, y: c.y, owner: c.id, ref: c.id }); return { id: c.id, name: c.name, tech: c.tech, region: c.region, capMW: c.capMW, outMW: c.capMW * 0.8, cash: c.cash, marginalCost: c.marginalCost, node: c.node, bidPrice: c.marginalCost * 1.2, share: 0, status: "online", statusUntil: 0, profitDay: 0 }; });
    for (const c of s.customers)
        nodes.push({ id: "cust-" + c.id, kind: KIND_FOR[c.industry] ?? "factory", name: c.name, region: regionOf(c.x, c.y), x: c.x, y: c.y, owner: "customer", ref: c.id });
    const lines = [];
    const base = { flowMW: 0, lossMW: 0, faultUntil: 0, lastFaultT: 0, condition: 90, contractedMW: 0 };
    for (const c of s.customers) {
        const reg = regionOf(c.x, c.y), sub = SUBSTATIONS.find((n) => n.id === REGION_SUB[reg]);
        lines.push({ ...base, id: "L-" + c.id, kind: "supply", from: OUR_PLANT.id, via: sub.id, to: "cust-" + c.id, customerId: c.id, capMW: Math.max(25, Math.round((c.peakMW * 1.15) / 5) * 5), status: "ok", reliability: 0.97, lengthKm: Math.round(Math.hypot(c.x - OUR_PLANT.x, c.y - OUR_PLANT.y) / 4) });
    }
    lines.push({ ...base, id: "L-export", kind: "export", from: OUR_PLANT.id, to: "sub-c", capMW: s.grid.exportCapMW, status: "ok", reliability: 0.99, lengthKm: 12 });
    lines.push({ ...base, id: "L-import", kind: "import", from: "ext-grid", to: OUR_PLANT.id, capMW: 120, status: "ok", reliability: 0.98, lengthKm: 160 });
    for (const r of REGIONS)
        if (r.id !== "Central")
            lines.push({ ...base, id: "B-" + r.id, kind: "backbone", from: "sub-c", to: REGION_SUB[r.id], capMW: r.tieCapMW, status: "ok", reliability: 0.99, lengthKm: Math.round(Math.hypot(r.cx - 500, r.cy - 470) / 5) });
    for (const c of competitors)
        lines.push({ ...base, id: "T-" + c.id, kind: "backbone", from: c.node, to: REGION_SUB[c.region], capMW: Math.round(c.capMW * 1.1), status: "ok", reliability: 0.99, lengthKm: 30 });
    const plots = [];
    for (const r of REGIONS)
        for (let i = 0; i < 3; i++)
            plots.push({ id: `plot-${r.id}-${i}`, region: r.id, x: Math.round(r.cx + (i - 1) * 70 + (r.id === "Central" ? 90 : 0)), y: Math.round(r.cy + 90 + (i % 2) * 40), used: false });
    const w = {
        regions: REGIONS.map((r) => ({ id: r.id, name: r.id, cx: r.cx, cy: r.cy, popIdx: 1, weight: r.weight, industrialShare: r.industrialShare, tieCapMW: r.tieCapMW, demandMW: 0, industrialMW: 0, residentialMW: 0, genMW: 0, capMW: 0, importMW: 0, exportMW: 0, lossMW: 0, shortageMW: 0, priceMul: 1, deliveredByUsMW: 0 })),
        weather: makeWeather(s), nodes, lines, competitors, econ: { phase: "expansion", phaseUntil: s.t + 120 * MIN_PER_DAY, growth: 0.025, inflation: 0.025, cpi: 1, interest: 0.055, fuelIdx: 1, fx: 1, construction: 1, manufacturing: 1, popIdx: 1, waterIdx: 1, demandIdx: 1, lastDay: -1 },
        suppliers: SUPPLIERS.map((x) => ({ ...x, stock: { ...x.stock } })), quotes: [], orders: [], payables: [], projects: [], batteries: [], ownGen: [],
        intel: {}, news: [], newsId: 1, timeline: [], achievements: {}, reg: { env: 90, reporting: 90, waste: 90, inspections: 85, approvals: 100, wasteStored: 20, wasteCap: 100, nextAuditT: s.t + 40 * MIN_PER_DAY, reportDueT: s.t + 35 * MIN_PER_DAY, reportFiled: false, findings: [], lastInspectionT: s.t },
        compSupplyMW: 1500, marketShare: 0, records: { demand: 0, price: 0 }, plots, extraCap: {}, buildings: { warehouse: 0, workshop: 0, admin: 0 }, flags: { maintBudget: 1, adminLevel: 1, contractor: 0, lastNewsDemandT: -99999, lastNewsPriceT: -99999 }, expense: { facilityDay: 0 },
    };
    for (const c of s.customers)
        w.intel[c.id] = { state: "normal", mult: 1, until: 0, plan: "", payScore: c.credit, growthPending: 0 };
    s.world = w;
    s.inventory.components ??= 6;
    s.inventory.materials ??= 0;
    stepCompetitors(s, true);
    stepRegions(s);
    worldEvent(s, "INFRASTRUCTURE", "Meridian region grid operator publishes its first network map", "Five regions, six competing generators and your nuclear plant now share one interconnected grid.", "info", false);
    return w;
}
// ------------------------------------------------------------------------------------------------ hooks used by the base engine
export function demandMult(s, c) {
    const w = s.world;
    if (!w)
        return 1;
    const i = w.intel[c.id], e = w.econ, reg = regionOf(c.x, c.y), wx = w.weather[reg];
    if (c.industry === "residential")
        return e.popIdx * (1 + 0.5 * (e.demandIdx - 1));
    if (c.industry === "government")
        return 1 + 0.2 * (e.popIdx - 1);
    return clamp(e.manufacturing, 0.7, 1.35) * (i?.mult ?? 1) * (wx?.kind === "flooding" ? 0.9 : 1);
}
export const lineOf = (s, customerId) => s.world?.lines.find((l) => l.customerId === customerId);
/** MW a customer line can carry right now. A faulty or planned line carries nothing. */
export function lineCap(s, customerId) {
    const l = lineOf(s, customerId);
    if (!l)
        return Infinity;
    return l.status === "fault" || l.status === "planned" ? 0 : l.capMW;
}
export const regionCapNow = (s) => { const o = {}; for (const r of s.world.regions)
    o[r.id] = r.tieCapMW; return o; };
/** Extra supply (own renewables/gas/battery) used by allocate(). Returns MW added to the pool and records what was used. */
export function supplyAssist(s, needMW, spotPrice, dt) {
    const w = s.world;
    if (!w)
        return { renewMW: 0, gasMW: 0, batMW: 0 };
    let renew = 0, gas = 0, bat = 0;
    for (const g of w.ownGen) {
        if (!g.online) {
            g.outMW = 0;
            continue;
        }
        const wx = w.weather.Central;
        if (g.kind === "solar")
            g.outMW = g.mw * clamp(wx.sun, 0, 1) * 0.95;
        else if (g.kind === "wind")
            g.outMW = g.mw * clamp(0.1 + wx.wind / 22, 0.05, 1);
        if (g.kind !== "gas")
            renew += g.outMW;
    }
    let need = Math.max(0, needMW - renew);
    for (const b of w.batteries) { // discharge
        b.flowMW = 0;
        const avail = Math.min(b.powerMW, (b.energyMWh * 60 * b.effOut) / dt);
        if (b.mode === "discharge" || (b.mode === "auto" && need > 0)) {
            const d = Math.min(avail, b.mode === "discharge" ? b.powerMW : need);
            if (d > 0) {
                b.energyMWh -= (d * dt / 60) / b.effOut;
                b.dischargedMWh += d * dt / 60;
                b.lossMWh += (d * dt / 60) * (1 / b.effOut - 1);
                b.flowMW = d;
                bat += d;
                need -= d;
            }
        }
    }
    for (const g of w.ownGen)
        if (g.kind === "gas" && g.online) {
            const run = need > 0 || spotPrice > g.costPerMWh * 1.2;
            g.outMW = run ? (need > 0 ? Math.min(g.mw, Math.max(need, spotPrice > g.costPerMWh * 1.2 ? g.mw : 0)) : g.mw) : 0;
            gas += g.outMW;
            need = Math.max(0, need - g.outMW);
        }
        else if (g.kind === "gas")
            g.outMW = 0;
    return { renewMW: renew, gasMW: gas, batMW: bat };
}
/** Surplus may charge batteries (auto mode when price is low or surplus is large; manual charge mode always). Returns MW taken from the surplus. */
export function batteryCharge(s, surplusMW, spotPrice, dt) {
    const w = s.world;
    if (!w)
        return 0;
    let left = surplusMW, taken = 0;
    for (const b of w.batteries) {
        if (b.flowMW > 0)
            continue;
        if (!(b.mode === "charge" || (b.mode === "auto" && (spotPrice < s.market.basePrice * 0.95 || surplusMW > 40))))
            continue;
        const space = Math.max(0, b.capMWh - b.energyMWh), c = Math.min(b.powerMW, left, (space * 60) / (dt * b.effIn));
        if (c > 0.001) {
            b.energyMWh += c * dt / 60 * b.effIn;
            b.chargedMWh += c * dt / 60;
            b.lossMWh += c * dt / 60 * (1 - b.effIn);
            b.flowMW = -c;
            left -= c;
            taken += c;
        }
    }
    return taken;
}
export function worldAssets(s) {
    const w = s.world;
    if (!w)
        return 0;
    return w.projects.filter((p) => p.status === "done").reduce((a, p) => a + p.cost * 0.85, 0);
}
export const adminMul = (s) => (s.world ? (s.world.flags.adminLevel === 0 ? 0.8 : s.world.flags.adminLevel === 2 ? 1.12 : 1) * (1 - 0.06 * Math.min(1, s.world.buildings.admin)) * s.world.econ.cpi : 1);
export const contractor = (s) => { const k = s.world?.flags.contractor ?? 0; return k === 1 ? { name: "Lowrate Services Ltd.", costMul: 0.7, hoursMul: 1.3, hazard: 0.06 } : k === 2 ? { name: "PrimeTech Engineering", costMul: 1.35, hoursMul: 0.8, hazard: -0.08 } : { name: "In-house crew", costMul: 1, hoursMul: 1, hazard: 0 }; };
export function worldBonus(s, key) {
    const w = s.world;
    if (!w)
        return 0;
    const b = w.flags.maintBudget ?? 1;
    if (key === "degrade")
        return (1 - b) * 0.75;
    if (key === "hazard")
        return (1 - b) * 0.9 + contractor(s).hazard;
    if (key === "loss")
        return -0.003 * Math.min(2, w.extraCap.transformer ? 1 : 0);
    return 0;
}
export const extraJobs = (s) => (s.world ? Math.min(2, s.world.buildings.workshop) : 0);
export const wasteWeather = (s) => s.world?.econ.waterIdx ?? 1;
export const fuelIdx = (s) => s.world?.econ.fuelIdx ?? 1;
// ------------------------------------------------------------------------------------------------ weather
const SEVERE = ["thunderstorm", "heatwave", "cold wave", "flooding", "drought", "strong wind"];
function pickKind(s, reg, prev) {
    const w = s.world, d = dayOfYear(s.t), summer = Math.sin((2 * Math.PI * (d - 100)) / 360), r = nextRandom(s);
    const dry = w.flags["dry:" + reg] ?? 0, wet = w.flags["wet:" + reg] ?? 0;
    if (dry > 22 && summer > 0.2 && r < 0.5)
        return "drought";
    if (wet >= 3 && r < 0.4)
        return "flooding";
    if (summer > 0.5 && r < 0.08)
        return "heatwave";
    if (summer < -0.5 && r < 0.08)
        return "cold wave";
    return pick(s, ["sunny", "sunny", "cloudy", "cloudy", "rain", "strong wind", "thunderstorm", "sunny"]);
}
function stepWeatherRegions(s) {
    const w = s.world, d = dayOfYear(s.t), h = hourOfDay(s.t);
    const acc = 0.75 + (s.research.done.includes("renewable") ? 0.15 : 0);
    for (const r of REGIONS) {
        const x = w.weather[r.id];
        if (r.id === "Central") {
            x.kind = s.weather.kind;
            x.temp = s.weather.temp;
            x.wind = s.weather.wind;
            x.sun = s.weather.sun;
            x.rain = s.weather.rain;
        }
        else if (s.t >= x.until) {
            const prevKind = x.kind;
            let next = x.forecast.shift() ?? pickKind(s, r.id, x.kind);
            if (nextRandom(s) > acc)
                next = pickKind(s, r.id, x.kind); // forecasts are not perfect
            x.kind = next;
            x.forecast.push(pickKind(s, r.id, next));
            x.since = s.t;
            x.until = s.t + Math.round(randRange(s, 10, 40) * 60) * (next === "drought" ? 20 : next === "flooding" ? 3 : 1);
            if (["rain", "thunderstorm", "flooding"].includes(next)) {
                w.flags["wet:" + r.id] = (w.flags["wet:" + r.id] ?? 0) + 1;
                w.flags["dry:" + r.id] = 0;
            }
            else {
                w.flags["wet:" + r.id] = 0;
                w.flags["dry:" + r.id] = (w.flags["dry:" + r.id] ?? 0) + (x.until - x.since) / MIN_PER_DAY;
            }
            if (SEVERE.includes(next) && prevKind !== next)
                worldEvent(s, "WEATHER", `${cap(next)} hits the ${r.id} region`, `Local conditions: ${cap(next)}. ${next === "thunderstorm" || next === "strong wind" || next === "flooding" ? "Transmission lines in the region are at higher risk of faults." : next === "heatwave" ? "Electricity demand is rising for cooling." : next === "cold wave" ? "Heating demand is rising." : "Hydro output and water supply are reduced."}`, "warning", next !== "strong wind");
            else if (SEVERE.includes(x.forecast[0]) && x.forecast[0] !== "strong wind" && nextRandom(s) < 0.5)
                worldEvent(s, "WEATHER", `${cap(x.forecast[0])} expected in the ${r.id} region`, `Forecast: ${cap(x.forecast[0])} is expected within the next day or two.`, "notice");
        }
        if (r.id !== "Central") {
            const base = 15 + 12 * Math.sin((2 * Math.PI * (d - 100)) / 360) + 6 * Math.sin((2 * Math.PI * (h - 9)) / 24) + (r.id === "North" ? -3 : r.id === "South" ? 3 : 0);
            const off = { heatwave: 9, "cold wave": -10, rain: -3, thunderstorm: -3, flooding: -3, drought: 4, cloudy: -1, sunny: 1, "strong wind": -1 }[x.kind] ?? 0;
            x.temp = relax(x.temp, base + off, 60, 240);
            x.wind = relax(x.wind, x.kind === "strong wind" ? 17 : x.kind === "thunderstorm" ? 14 : 6, 60, 240);
            const dl = clamp(Math.sin((Math.PI * (h - 6)) / 12), 0, 1);
            x.sun = relax(x.sun, dl * (["sunny", "heatwave", "drought"].includes(x.kind) ? 1 : x.kind === "cloudy" ? 0.5 : 0.2), 60, 120);
            x.rain = relax(x.rain, ["rain", "thunderstorm", "flooding"].includes(x.kind) ? 0.9 : 0, 60, 120);
        }
    }
}
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const wxStress = (k) => (k === "thunderstorm" ? 6 : k === "strong wind" ? 4 : k === "flooding" ? 8 : k === "heatwave" ? 2 : k === "cold wave" ? 2 : 1);
// ------------------------------------------------------------------------------------------------ competitors and regions
function stepCompetitors(s, init = false) {
    const w = s.world, m = s.market;
    let tot = 0;
    for (const c of w.competitors) {
        const wx = w.weather[c.region];
        if (c.status !== "online" && c.status !== "building" && s.t >= c.statusUntil) {
            c.status = "online";
            if (c.capMW >= 300)
                worldEvent(s, "COMPETITION", `${c.name} returns to service`, `${c.name} has finished its ${c.status === "online" ? "outage" : "works"} and is generating again.`, "info");
        }
        let a = 0.93;
        if (c.tech === "wind")
            a = clamp(0.1 + wx.wind / 22, 0.05, 1);
        else if (c.tech === "solar")
            a = clamp(wx.sun, 0, 1) * 0.95;
        else if (c.tech === "hydro")
            a = wx.kind === "drought" ? 0.5 : 0.8;
        c.marginalCost = (COMPETITORS.find((x) => x.id === c.id).marginalCost) * (c.tech === "coal" || c.tech === "gas" ? w.econ.fuelIdx : 1) * w.econ.cpi;
        c.bidPrice = c.marginalCost * 1.18;
        const price = init ? m.basePrice : m.spotPrice;
        if ((c.tech === "coal" || c.tech === "gas") && price < c.marginalCost)
            a *= 0.55; // too expensive to run: they cut output
        c.outMW = c.status === "online" || c.status === "building" ? c.capMW * a : 0;
        tot += c.outMW;
    }
    w.compSupplyMW = tot;
    const ours = s.grid.contractedMW + s.grid.spotMW, all = tot + ours + 1e-9;
    for (const c of w.competitors)
        c.share = c.outMW / all;
    w.marketShare = ours / all;
}
function competitorsDaily(s) {
    const w = s.world, spot = s.market.spotPrice;
    for (const c of w.competitors) {
        const profit = c.outMW * 24 * (spot - c.marginalCost) - c.capMW * 700;
        c.profitDay = profit;
        c.cash += profit;
        if (c.status === "online" && nextRandom(s) < 0.007) {
            c.status = nextRandom(s) < 0.5 ? "outage" : "maintenance";
            c.statusUntil = s.t + randInt(s, 2, 10) * MIN_PER_DAY;
            if (c.capMW >= 250)
                worldEvent(s, "COMPETITION", `${c.name} goes offline for ${c.status === "outage" ? "an unplanned outage" : "maintenance"}`, `${Math.round(c.capMW)} MW leaves the market for about ${Math.round((c.statusUntil - s.t) / MIN_PER_DAY)} days. Expect higher spot prices.`, "notice");
        }
        if (!c.building && c.cash > 70e6 && spot > s.market.basePrice * 1.12 && w.econ.phase !== "recession" && nextRandom(s) < 0.02) {
            const add = c.tech === "nuclear" ? 0 : Math.round(randRange(s, 40, 110) / 10) * 10;
            if (add > 0) {
                c.cash -= add * 0.9e6;
                c.building = { addMW: add, doneT: s.t + randInt(s, 120, 220) * MIN_PER_DAY };
                worldEvent(s, "COMPETITION", `${c.name} announces a new ${add} MW facility`, `Prices are high, so ${c.name} is investing. It will come online in about ${Math.round((c.building.doneT - s.t) / MIN_PER_DAY)} days and should push prices down.`, "notice");
            }
        }
        if (c.building && s.t >= c.building.doneT) {
            c.capMW += c.building.addMW;
            worldEvent(s, "COMPETITION", `${c.name} opens ${c.building.addMW} MW of new capacity`, `Total capacity of ${c.name} is now ${Math.round(c.capMW)} MW.`, "notice");
            c.building = undefined;
        }
    }
}
function stepRegions(s) {
    const w = s.world, m = s.market, avgPop = w.regions.reduce((a, r) => a + r.popIdx * r.weight, 0);
    const g0 = 1 + 0.012 * Math.max(0, s.weather.temp - 27) + 0.01 * Math.max(0, 4 - s.weather.temp);
    for (const r of w.regions) {
        const wx = w.weather[r.id], f = (1 + 0.012 * Math.max(0, wx.temp - 27) + 0.01 * Math.max(0, 4 - wx.temp)) / g0;
        r.demandMW = m.regionalDemand * r.weight * f * (r.popIdx / avgPop);
        r.industrialMW = r.demandMW * r.industrialShare * clamp(w.econ.manufacturing, 0.7, 1.35) / 1.0;
        if (r.industrialMW > r.demandMW * 0.95)
            r.industrialMW = r.demandMW * 0.95;
        r.residentialMW = r.demandMW - r.industrialMW;
        r.genMW = w.competitors.filter((c) => c.region === r.id).reduce((a, c) => a + c.outMW, 0) + w.ownGen.filter((g) => g.region === r.id).reduce((a, g) => a + g.outMW, 0);
        r.capMW = w.competitors.filter((c) => c.region === r.id).reduce((a, c) => a + (c.status === "online" ? c.capMW : 0), 0);
        r.deliveredByUsMW = s.contracts.filter((c) => c.active).reduce((a, c) => { const cu = s.customers.find((x) => x.id === c.customerId); return a + (regionOf(cu.x, cu.y) === r.id ? c.deliveredMW : 0); }, 0) + (r.id === "Central" ? s.grid.spotMW : 0);
    }
    // simplified balance: surplus regions export to deficit regions through the tie lines (3 % lost on the way);
    // what is still missing nationally is covered by the external interconnector, up to its capacity. Beyond that: a real shortage.
    const net = w.regions.map((r) => r.genMW + r.deliveredByUsMW - r.demandMW);
    const tie = gridCap;
    const exp = w.regions.map((r, i) => Math.min(Math.max(0, net[i]), tie(r))); // a region can only export as much as its tie line carries
    const surplus = exp.reduce((a, x) => a + x, 0);
    let deficit = 0;
    w.regions.forEach((r, i) => { r.importMW = Math.min(Math.max(0, -net[i]), tie(r)); deficit += r.importMW; });
    const moved = Math.min(surplus * 0.97, deficit), k = deficit > 0 ? moved / deficit : 0;
    w.regions.forEach((r, i) => { r.importMW *= k; r.exportMW = surplus > 0 ? (exp[i] / surplus) * moved / 0.97 : 0; r.lossMW = r.exportMW * 0.03; });
    const room = w.regions.map((r) => Math.max(0, tie(r) - r.importMW)), rest = w.regions.map((r, i) => Math.min(Math.max(0, -net[i] - r.importMW), room[i]));
    const restTot = rest.reduce((a, x) => a + x, 0), ext = Math.min(restTot, EXT_CAP), kx = restTot > 0 ? ext / restTot : 0;
    w.regions.forEach((r, i) => { r.importMW += rest[i] * kx; r.shortageMW = Math.max(0, -net[i] - r.importMW); r.priceMul = 1 + 3 * r.shortageMW / Math.max(1, r.demandMW); });
    w.flags.extImportMW = ext;
}
const EXT_CAP = 750;
/** Regional import/export capacity of the shared grid (our own delivery capacity into a region is smaller: tieCapMW). */
export const gridCap = (r) => (r.id === "Central" ? 700 : r.tieCapMW * 2.2);
// ------------------------------------------------------------------------------------------------ transmission lines
function stepLines(s, dt) {
    const w = s.world, g = s.grid, hours = dt / 60;
    const flows = {};
    let totalFlow = 0, sq = 0;
    for (const l of w.lines) {
        if (l.kind === "supply") {
            const c = s.contracts.find((x) => x.customerId === l.customerId && x.active);
            l.contractedMW = c?.capacityMW ?? 0;
            l.flowMW = c?.deliveredMW ?? 0;
            if (l.status === "ok" && !c)
                l.flowMW = 0;
        }
        else if (l.id === "L-export") {
            l.flowMW = g.spotMW;
            l.capMW = g.exportCapMW;
            l.contractedMW = 0;
        }
        else if (l.id === "L-import") {
            l.flowMW = g.boughtMW + Math.max(0, -g.netMW);
            l.contractedMW = 0;
        }
        if (l.kind === "supply" || l.id === "L-export") {
            flows[l.id] = l.flowMW;
            totalFlow += l.flowMW;
            sq += l.flowMW ** 2;
        }
    }
    for (const l of w.lines) {
        if (l.kind === "supply" || l.id === "L-export") {
            l.lossMW = sq > 0 ? g.lossMW * (l.flowMW ** 2) / sq : 0;
        }
        else if (l.kind === "backbone") {
            const reg = l.id.startsWith("B-") ? w.regions.find((r) => r.id === l.id.slice(2)) : null;
            if (reg) {
                l.capMW = gridCap(reg);
                l.flowMW = Math.max(reg.importMW, reg.exportMW);
                l.lossMW = reg.lossMW;
            }
            else {
                const c = w.competitors.find((x) => "T-" + x.id === l.id);
                l.flowMW = c?.outMW ?? 0;
                l.lossMW = l.flowMW * 0.012;
            }
        }
        else if (l.id === "L-import")
            l.lossMW = l.flowMW * 0.02;
    }
    const grossLines = w.lines.filter((l) => l.kind === "supply" || l.id === "L-export").reduce((a, l) => a + l.lossMW, 0);
    s.stats.peakNetMW = Math.max(s.stats.peakNetMW, 0);
    // wheeling and grid-connection charges are real costs of using the network
    const delivered = w.lines.filter((l) => l.kind === "supply").reduce((a, l) => a + l.flowMW, 0);
    if (delivered > 0)
        addLedger(s, "transmission", -delivered * hours * 0.9 * w.econ.cpi, "Transmission charges (wheeling)");
    void grossLines;
    void flows;
}
function lineFaultsHourly(s) {
    const w = s.world, lowHaz = s.research.done.includes("grid-hv") ? 0.7 : 1;
    for (const l of w.lines) {
        if (l.kind === "backbone")
            continue;
        if (l.status === "fault" && s.t >= l.faultUntil) {
            l.status = "ok";
            setAlarm(s, "line-" + l.id, false, "warning", `Line ${l.id} fault`);
            worldEvent(s, "INFRASTRUCTURE", `Transmission line ${l.id} restored`, "Repairs completed and supply resumed on the connection.", "info", false);
        }
        if (l.status !== "ok")
            continue;
        const reg = l.customerId ? regionOf(s.customers.find((c) => c.id === l.customerId).x, s.customers.find((c) => c.id === l.customerId).y) : "Central";
        const loadStress = l.capMW > 0 ? Math.max(0, l.flowMW / l.capMW - 0.7) * 2 : 0;
        const haz = 0.00012 * (1 + (100 - l.condition) / 35) * wxStress(w.weather[reg].kind) * (1 + loadStress) * lowHaz / Math.max(0.2, l.reliability);
        l.condition = clamp(l.condition - 0.004 * (1 + loadStress) * wxStress(w.weather[reg].kind) ** 0.5, 5, 100);
        if (nextRandom(s) < haz) {
            l.status = "fault";
            l.faultUntil = s.t + Math.round(randRange(s, 6, 30) * 60 * (1 - 0.1 * Math.min(1, w.buildings.workshop)));
            l.lastFaultT = s.t;
            l.condition = clamp(l.condition - 6, 5, 100);
            const nm = l.customerId ? s.customers.find((c) => c.id === l.customerId).name : l.id;
            setAlarm(s, "line-" + l.id, true, "warning", `Transmission line to ${nm} is FAULTY: supply interrupted`);
            worldEvent(s, "INFRASTRUCTURE", `Transmission fault interrupts supply to ${nm}`, `The connection failed (${w.weather[reg].kind} in the ${reg} region). Repair crews are on site; you can pay for a rush repair in the Transmission screen.`, "warning");
        }
    }
}
// ------------------------------------------------------------------------------------------------ economy, customers
const PHASES = ["expansion", "boom", "slowdown", "recession", "recovery"];
const TARGET = { expansion: { g: 0.03, i: 0.025, r: 0.05 }, boom: { g: 0.055, i: 0.045, r: 0.07 }, slowdown: { g: 0.012, i: 0.04, r: 0.075 }, recession: { g: -0.03, i: 0.012, r: 0.04 }, recovery: { g: 0.02, i: 0.018, r: 0.045 } };
function stepEconomyDaily(s) {
    const e = s.world.econ;
    if (s.t >= e.phaseUntil) {
        e.phase = PHASES[(PHASES.indexOf(e.phase) + 1) % PHASES.length];
        e.phaseUntil = s.t + Math.round(randRange(s, 70, 190)) * MIN_PER_DAY;
        const text = { expansion: "The economy enters an expansion: factories hire and orders grow.", boom: "The economy is booming. Manufacturing output is surging, inflation is picking up.", slowdown: "Growth slows. The central bank keeps interest rates high.", recession: "The economy enters a recession. Factories cut production and electricity demand falls.", recovery: "Recovery begins. Production is slowly returning." }[e.phase];
        worldEvent(s, "ECONOMY", `Economy: ${cap(e.phase)} phase begins`, text, e.phase === "recession" ? "warning" : "notice");
    }
    const tg = TARGET[e.phase];
    e.growth = relax(e.growth, tg.g, 1, 30);
    e.inflation = relax(e.inflation, tg.i, 1, 45);
    e.interest = relax(e.interest, tg.r, 1, 40);
    e.cpi *= 1 + e.inflation / 360;
    e.manufacturing = clamp(1 + e.growth * 4, 0.8, 1.25);
    e.popIdx *= 1 + 0.008 / 360;
    e.demandIdx = clamp(1 + e.growth * 1.5, 0.9, 1.15) * 1;
    e.construction = clamp(1 + e.growth * 3, 0.9, 1.3);
    e.fuelIdx = clamp(relax(e.fuelIdx, 1 + e.growth * 5 + (s.weather.kind === "cold wave" ? 0.15 : 0), 1, 25) + randRange(s, -0.012, 0.012), 0.6, 1.8);
    e.fx = clamp(relax(e.fx, 1, 1, 90) + randRange(s, -0.004, 0.004), 0.85, 1.2);
    const drought = Object.values(s.world.weather).some((x) => x.kind === "drought");
    e.waterIdx = relax(e.waterIdx, drought ? 1.5 : 1, 1, 8);
    s.flags.inflation = e.cpi - 1;
    s.finance.interestRate = e.interest;
    for (const emp of s.staff)
        emp.salary *= 1 + e.inflation / 360 * 0.8;
    if (Math.floor(s.t / MIN_PER_DAY) % 30 === 0 && e.inflation > 0.04)
        worldEvent(s, "FINANCE", `Inflation reaches ${(e.inflation * 100).toFixed(1)} %`, "Supplier prices and salaries are rising with the price level.", "notice");
    s.flags.growth = (e.popIdx - 1) * 1;
}
function customerIntelDaily(s) {
    const w = s.world, e = w.econ;
    for (const c of s.customers) {
        const i = w.intel[c.id];
        if (!i)
            continue;
        const con = s.contracts.find((x) => x.customerId === c.id && x.active);
        i.payScore = relax(i.payScore, clamp(c.credit * (1 - 0.12 * (con?.lateCount ?? 0)), 0.2, 1), 1, 60);
        if (i.state !== "normal" && s.t >= i.until) {
            if (i.state === "expanding") {
                c.peakMW = Math.round(c.peakMW * 1.2);
                const l = lineOf(s, c.id);
                worldEvent(s, "INDUSTRY", `${c.name} completes its expansion`, `Peak demand is now ${c.peakMW} MW.${l && c.peakMW > l.capMW ? " Its connection is smaller than that: upgrade the line to supply it fully." : ""}`, "notice");
                if (con) {
                    s.offers.push({ id: `O-${s.t}-${c.id}-x`, customerId: c.id, capacityMW: Math.min(c.peakMW, Math.round(c.peakMW * 0.8)), days: 365, asking: Math.round(c.reservation * 0.95 * 100) / 100, reservation: Math.round(c.reservation * 1.05 * 100) / 100, priority: 2, rounds: 0, expiresT: s.t + 12 * MIN_PER_DAY, status: "open", note: "Larger contract requested after expansion" });
                }
            }
            if (i.state === "switching")
                worldEvent(s, "INDUSTRY", `${c.name} is open to new supply offers again`, "", "info", false);
            i.state = "normal";
            i.mult = 1;
            i.plan = "";
        }
        if (i.state !== "normal")
            continue;
        const ind = c.industry !== "residential" && c.industry !== "government";
        if (ind && nextRandom(s) < 0.0035 * (e.growth > 0.02 ? 2 : 0.4)) {
            i.state = "expanding";
            i.until = s.t + randInt(s, 35, 70) * MIN_PER_DAY;
            i.plan = "New production line (+20 % demand)";
            i.mult = 1.0;
            worldEvent(s, "INDUSTRY", `${c.name} announces a new ${c.industry === "data center" ? "data hall" : "production line"}`, `Demand is expected to grow by about 20 % in roughly ${Math.round((i.until - s.t) / MIN_PER_DAY)} days.`, "notice");
        }
        else if (ind && nextRandom(s) < 0.002 * (e.phase === "recession" ? 4 : 1)) {
            i.state = "shutdown";
            i.mult = 0.05;
            i.until = s.t + randInt(s, 6, 18) * MIN_PER_DAY;
            i.plan = "Temporary shutdown";
            worldEvent(s, "INDUSTRY", `${c.name} temporarily shuts down`, `${e.phase === "recession" ? "Weak orders" : "Planned works"}: electricity demand drops for about ${Math.round((i.until - s.t) / MIN_PER_DAY)} days.`, "notice");
        }
        else if (con && ind) {
            const unhappy = con.shortfallMW > 0.5 || con.lateCount > 1, cheaper = s.market.spotPrice < con.price * 0.8;
            if (nextRandom(s) < (unhappy ? 0.01 : 0) + (cheaper ? 0.004 : 0)) {
                con.active = false;
                i.state = "switching";
                i.until = s.t + 45 * MIN_PER_DAY;
                i.plan = "Switched supplier";
                s.finance.reputation = clamp(s.finance.reputation - 4, 0, 100);
                worldEvent(s, "INDUSTRY", `${c.name} switches electricity supplier`, `${unhappy ? "Unreliable supply" : "Cheaper offers elsewhere"} cost you the contract.`, "warning");
            }
        }
    }
    // new industrial zone: a brand-new customer appears and needs a grid connection built
    if (nextRandom(s) < 0.006 * (e.growth > 0.02 ? 2 : 0.3) && s.customers.length < 14) {
        const used = new Set(s.customers.map((c) => c.name)), opts = NEW.filter((n) => !used.has(n.name));
        if (opts.length) {
            const n = pick(s, opts), reg = pick(s, REGIONS.map((r) => r.id));
            const rg = REGIONS.find((r) => r.id === reg), x = Math.round(rg.cx + randRange(s, -110, 110)), y = Math.round(rg.cy + randRange(s, -90, 90));
            const c = { id: "n" + s.customers.length, name: n.name, industry: n.industry, region: reg, peakMW: n.peak, loadShape: n.shape, credit: randRange(s, 0.7, 0.95), reservation: n.res, x, y };
            s.customers.push(c);
            w.intel[c.id] = { state: "normal", mult: 1, until: 0, plan: "", payScore: c.credit, growthPending: 0 };
            w.nodes.push({ id: "cust-" + c.id, kind: KIND_FOR[c.industry] ?? "factory", name: c.name, region: reg, x, y, owner: "customer", ref: c.id });
            const sub = REGION_SUB[reg];
            w.lines.push({ id: "L-" + c.id, kind: "supply", from: OUR_PLANT.id, via: sub, to: "cust-" + c.id, customerId: c.id, capMW: Math.round((c.peakMW * 1.15) / 5) * 5, status: "planned", flowMW: 0, lossMW: 0, faultUntil: 0, lastFaultT: 0, condition: 100, contractedMW: 0, reliability: 0.97, lengthKm: Math.round(Math.hypot(x - OUR_PLANT.x, y - OUR_PLANT.y) / 4) });
            worldEvent(s, "INFRASTRUCTURE", `New industrial zone approved in the ${reg} region`, `${c.name} (${c.peakMW} MW peak) is moving in. It has no grid connection to your plant yet: build an Industrial connection in Construction to bid for its business.`, "notice");
        }
    }
}
import { NEW_CUSTOMER_NAMES as NEW } from "./data.js";
// ------------------------------------------------------------------------------------------------ main step
export function stepWorld(s, dt) {
    const w = s.world;
    if (!w)
        return;
    stepLines(s, dt);
    for (const g of w.ownGen)
        if (g.outMW > 0 && g.kind === "gas") {
            addLedger(s, "fuel", -g.outMW * dt / 60 * g.costPerMWh * w.econ.fuelIdx, "Gas peaker fuel");
        }
    for (const b of w.batteries) {
        b.energyMWh = Math.max(0, b.energyMWh - b.energyMWh * 0.00002 * dt);
    }
    if (s.t % 60 === 0) {
        stepWeatherRegions(s);
        stepCompetitors(s);
        stepRegions(s);
        lineFaultsHourly(s);
        deliveries(s);
        checkAchievements(s);
        newsWatch(s);
    }
    if (s.t % MIN_PER_DAY === 0 && s.t > 0)
        dailyWorld(s);
}
function newsWatch(s) {
    const w = s.world, m = s.market;
    if (m.regionalDemand > w.records.demand * 1.015 && s.t > 5 * MIN_PER_DAY) {
        if (w.records.demand > 0 && s.t - w.flags.lastNewsDemandT > 10 * MIN_PER_DAY) {
            worldEvent(s, "ENERGY MARKET", "Regional electricity demand reaches a new record", `Demand peaked at ${Math.round(m.regionalDemand)} MW.`, "notice");
            w.flags.lastNewsDemandT = s.t;
        }
        w.records.demand = m.regionalDemand;
    }
    else if (w.records.demand === 0)
        w.records.demand = m.regionalDemand;
    if (m.spotPrice > m.basePrice * 1.6 && s.t - w.flags.lastNewsPriceT > 6 * MIN_PER_DAY) {
        worldEvent(s, "ENERGY MARKET", `Spot price spikes to $${m.spotPrice.toFixed(0)}/MWh`, `Supply is tight against demand of ${Math.round(m.regionalDemand)} MW.`, "warning");
        w.flags.lastNewsPriceT = s.t;
    }
    for (const r of w.regions)
        if (r.shortageMW > 25 && !w.flags["shortage:" + r.id] && s.t - (w.flags["shortageT:" + r.id] ?? -1e9) > 8 * MIN_PER_DAY) {
            w.flags["shortage:" + r.id] = 1;
            w.flags["shortageT:" + r.id] = s.t;
            worldEvent(s, "ENERGY MARKET", `Electricity shortage in the ${r.id} region`, `${Math.round(r.shortageMW)} MW of demand cannot be met. Local prices are ${((r.priceMul - 1) * 100).toFixed(0)} % higher.`, "warning");
        }
        else if (r.shortageMW < 8)
            w.flags["shortage:" + r.id] = 0;
}
function deliveries(s) {
    const w = s.world;
    for (const o of w.orders) {
        if (o.status !== "transit" || s.t < o.eta)
            continue;
        const sup = w.suppliers.find((x) => x.id === o.supplierId);
        if (!o.delayed && nextRandom(s) > sup.reliability) {
            o.delayed = true;
            o.eta = s.t + randInt(s, 3, 10) * MIN_PER_DAY;
            sup.lateCount++;
            sup.relation = clamp(sup.relation - 3, 0, 100);
            worldEvent(s, "FINANCE", `${sup.name} delays delivery of ${o.item}`, `Order ${o.id} now arrives in about ${Math.round((o.eta - s.t) / MIN_PER_DAY)} days. Maintenance plans may need to change.`, "notice");
            continue;
        }
        const free = Math.max(0, WAREHOUSE_CAP[o.item] * (1 + (o.item === "spares" || o.item === "components" ? w.buildings.warehouse : 0)) - (s.inventory[o.item] ?? 0));
        const got = Math.min(o.qty, free);
        s.inventory[o.item] = (s.inventory[o.item] ?? 0) + got;
        o.status = "delivered";
        o.deliveredT = s.t;
        const amt = got * o.unitPrice, cat = { spares: "spare-parts", supplies: "supplies", components: "equipment-replacement", materials: "construction" }[o.item];
        addLedger(s, cat, -amt, `Delivery ${o.id}`, false);
        addLedger(s, "logistics", -(350 + amt * 0.004), `Receiving ${o.id}`);
        addLedger(s, "transportation", -amt * 0.012, `Freight ${o.id}`);
        w.payables.push({ id: "P-" + o.id, supplierId: o.supplierId, amount: amt, dueT: s.t + o.terms * MIN_PER_DAY, paid: false, note: `${got} x ${o.item}` });
        sup.ordersTotal += amt;
        sup.relation = clamp(sup.relation + 1, 0, 100);
        log(s, "notice", "procurement", `Order ${o.id} delivered: ${got} x ${o.item}${got < o.qty ? ` (warehouse full, ${o.qty - got} refused)` : ""}.`);
    }
    w.orders = w.orders.filter((o) => o.status === "transit" || s.t - (o.deliveredT ?? o.placedT) < 120 * MIN_PER_DAY);
}
// ------------------------------------------------------------------------------------------------ daily
function dailyWorld(s) {
    const w = s.world, f = s.finance, cpi = w.econ.cpi, day = Math.floor(s.t / MIN_PER_DAY);
    stepEconomyDaily(s);
    competitorsDaily(s);
    customerIntelDaily(s);
    // supplier stock refills slowly; overdue payables hurt the relationship and the price
    for (const p of w.suppliers) {
        for (const k of Object.keys(p.stock))
            p.stock[k] = Math.min(p.stock[k] + Math.ceil(ITEM_BASE_STOCK[k] * 0.03), ITEM_BASE_STOCK[k]);
    }
    for (const p of w.payables)
        if (!p.paid) {
            if (s.t >= p.dueT) {
                if (f.cash > p.amount) {
                    f.cash -= p.amount;
                    p.paid = true;
                    p.paidT = s.t;
                    const sup = w.suppliers.find((x) => x.id === p.supplierId);
                    sup.relation = clamp(sup.relation + 0.5, 0, 100);
                }
                else {
                    const sup = w.suppliers.find((x) => x.id === p.supplierId);
                    sup.relation = clamp(sup.relation - 2, 0, 100);
                }
            }
        }
    w.payables = w.payables.filter((p) => !p.paid || s.t - (p.paidT ?? 0) < 60 * MIN_PER_DAY);
    // facility costs come from real assets: buildings, projects, lines, security, supplies use
    const bld = 15 + w.projects.filter((p) => p.status === "done").length, bm = w.flags.maintBudget;
    addLedger(s, "facility-maintenance", -(bld * 1000 * bm * cpi), `Facility maintenance (${bld} buildings)`);
    addLedger(s, "security", -(6500 * cpi + (s.research.done.includes("monitoring") ? 800 : 0)), "Site security");
    addLedger(s, "logistics", -(600 * cpi), "Logistics and handling");
    addLedger(s, "grid-connection", -(11000 * cpi), "Grid connection charges");
    const upkeep = w.projects.filter((p) => p.status === "done").reduce((a, p) => a + p.upkeep, 0);
    if (upkeep > 0)
        addLedger(s, "facility-maintenance", -upkeep * cpi, "Upkeep of new infrastructure");
    addLedger(s, "transmission", -w.lines.filter((l) => l.status !== "planned" && l.kind === "supply").length * 180 * cpi, "Transmission line upkeep");
    const use = 0.8 + 0.12 * bld;
    if ((s.inventory.supplies ?? 0) >= use)
        s.inventory.supplies -= use;
    else {
        const miss = use - (s.inventory.supplies ?? 0);
        s.inventory.supplies = 0;
        addLedger(s, "supplies", -miss * ITEM_PRICE.supplies * 2.2 * cpi, "Emergency supplies bought at spot price");
    }
    w.expense.facilityDay = bld;
    progressProjects(s);
    regulatorDaily(s);
    for (const l of w.lines)
        if (l.kind === "supply" && l.status === "ok")
            l.condition = clamp(l.condition + 0.02, 0, 100);
    if (day % 30 === 0)
        taxes(s);
    w.suppliers.forEach((p) => { p.priceMul = clamp(p.priceMul * (1 + w.econ.inflation / 360 * 0.5) * (p.relation < 35 ? 1.0006 : 1), 0.7, 2.5); });
    if (day % 45 === 0 && w.econ.inflation > 0.04)
        worldEvent(s, "FINANCE", "Supplier prices increase following inflation", `Inflation is ${(w.econ.inflation * 100).toFixed(1)} %. Spare-part and material quotes are higher.`, "notice");
    if (day % 30 === 0)
        rolloverReport(s);
}
const ITEM_BASE_STOCK = { spares: 400, supplies: 2500, components: 30, materials: 9000 };
function taxes(s) {
    const f = s.finance, m = f.prevMonth;
    let inc = 0, exp = 0;
    for (const [k, v] of Object.entries(m)) {
        if (k === "contracts" || k === "spot" || k === "other")
            inc += v;
        else if (k !== "loan" && k !== "capital" && k !== "taxes")
            exp -= v;
    }
    const profit = inc - exp;
    if (profit > 0)
        addLedger(s, "taxes", -profit * 0.18, "Corporate tax on last month's profit");
}
function rolloverReport(s) { const r = s.world.reg; r.reportFiled = false; r.reportDueT = s.t + 7 * MIN_PER_DAY; }
import { progressProjects } from "./construction.js";
import { regulatorDaily } from "./regulator.js";
import { checkAchievements } from "./achievements.js";
export { stepCompetitors, stepRegions };
