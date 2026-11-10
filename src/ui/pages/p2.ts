import { EXPORT_CAP } from "../../simulation/constants.js";
import { summary } from "../../simulation/engine.js";
import { competitorSupply, customerDemand, marketIndex, regionalDemand } from "../../simulation/economyEngine.js";
import type { GameState } from "../../simulation/types.js";
import { fmtTime, sumExpense, sumIncome, isIncome } from "../../simulation/util.js";
import { drawBars, drawLines } from "../charts.js";
import { act, bar, btn, esc, f0, f1, f2, gauge, kpi, led, pct, table, tip, usd, usdM, toCsv } from "../dom.js";
import { hoursLabels, hourly, type Page } from "../page.js";
import { ui } from "../state.js";

const chart = (id: string, h = 170) => `<canvas class="chart" data-chart="${id}" style="height:${h}px"></canvas>`;
const putLines = (root: HTMLElement, s: GameState, id: string, series: (H: ReturnType<typeof hourly>) => Parameters<typeof drawLines>[1], n = 48, o: Parameters<typeof drawLines>[2] = {}) => { const c = root.querySelector<HTMLCanvasElement>(`canvas[data-chart="${id}"]`); if (c) drawLines(c, series(hourly(s, n)), { labels: hoursLabels(s, n), ...o }); };

export const grid: Page = { id: "grid", title: "Electrical Grid", icon: "07",
  render(s) {
    const g = s.grid;
    const node = (t: string, v: number, extra = "") => `<div class="node"><small>${t}</small><b>${f1(v)} MW</b>${extra}</div>`;
    return `<h1>Electrical Grid</h1><p class="sub">The power balance is always: generation - own use - losses = contracts + spot sales + reserve (unsold). Units: MW is power right now, MWh is energy over time.</p>
<div class="panel"><h2>Power flow right now</h2><div class="flow">${node("Gross generation", g.grossMW)}<span class="arr">→</span>${node("Own use (aux)", -g.auxMW)}<span class="arr">→</span>${node("Net", g.netMW)}<span class="arr">→</span>${node("Losses", -g.lossMW)}<span class="arr">→</span>${node("Deliverable", Math.max(0, g.netMW - g.lossMW))}<span class="arr">→</span><div class="node"><small>Contracts</small><b>${f1(g.contractedMW)} MW</b><small>Spot ${f1(g.spotMW)} | Reserve/unsold ${f1(g.reserveMW)}</small></div></div></div>
<div class="grid g4" style="margin-top:12px">${kpi("Export capacity", f0(g.exportCapMW) + " MW", `of ${f0(EXPORT_CAP)} nominal`)}${kpi("Frequency", f2(g.frequency) + " Hz", g.frequency < 49.7 ? "unstable" : "normal", g.frequency < 49.7 ? "warn" : "")}${kpi("Customer demand", f1(g.demandMW) + " MW", "")}${kpi("Unserved", f1(g.unservedMW) + " MW", "", g.unservedMW > 0.1 ? "bad" : "good")}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Connection</h2><p>${led(g.connectionOk, g.connectionOk ? "Transformer and switchgear OK" : "Connection unavailable")}</p><p>${led(g.breakerClosed, g.breakerClosed ? "Generator breaker closed" : "Generator breaker OPEN")}</p>${btn(g.breakerClosed ? "Open breaker" : "Close breaker", { type: "setBreaker", closed: !g.breakerClosed }, "sm")}<p class="notes">Losses grow with the square of the load on the line (about ${f1(g.lossMW)} MW now). A customer can never receive more than the plant delivers or the connection can carry.</p></div>
<div class="panel"><h2>Demand vs generation (48 h)</h2>${chart("gdemand")}</div></div>`;
  }, mount(root, s) { putLines(root, s, "gdemand", (H) => [{ name: "customer demand", data: H.map((h) => h.demandMW), color: "#4aa8ff" }, { name: "net generation", data: H.map((h) => h.netMW), color: "#3fd0a0", fill: true }]); } };

export const market: Page = { id: "market", title: "Electricity Market", icon: "08",
  render(s) {
    const m = s.market, fc = m.forecast;
    const hi = Math.max(...fc, 0), lo = Math.min(...fc, 1e9);
    return `<h1>Electricity Market</h1><p class="sub">Spot price comes from supply and demand in the region. When demand is higher than supply, prices climb; when many plants run, prices fall. Selling more of your own power also pushes the price down.</p>
<div class="grid g4">${kpi("Spot price", "$" + f1(m.spotPrice), "per MWh")}${kpi("Regional demand", f0(m.regionalDemand) + " MW", "")}${kpi("Competitor supply", f0(m.competitorSupply) + " MW", "")}${kpi("Market index", f2(marketIndex(s)), "vs base $55")}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Price history (7 days)</h2>${chart("mprice")}</div><div class="panel"><h2>24 h forecast</h2>${chart("mfc")}<p class="notes">Cheapest hour $${f1(lo)}, dearest $${f1(hi)}. Plan maintenance and output for the cheap hours.</p></div></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Your trading settings</h2><label class="row"><input type="checkbox" ${m.sellSurplus ? "checked" : ""} data-chk='{"type":"setMarket"}' data-key="sellSurplus"> Sell surplus electricity on the spot market</label>
<label class="row"><input type="checkbox" ${m.autoBuy ? "checked" : ""} data-chk='{"type":"setMarket"}' data-key="autoBuy"> Buy electricity to cover contracts when we are short ${tip("?", "Costs spot price + 12 % but avoids penalties and reputation damage.")}</label>
<h3>Reserve to keep (MW)</h3><input type="range" min="0" max="100" value="${m.reserveMW}" data-ain='{"type":"setMarket"}' data-key="reserveMW"> <b>${f0(m.reserveMW)} MW</b>
<p class="notes">Right now: selling ${f1(m.spotSoldMW)} MW at $${f1(m.spotPrice)}; buying ${f1(m.spotBoughtMW)} MW. Spot market depth is limited, so selling more lowers the price.</p></div>
<div class="panel"><h2>Competitors and supply</h2>${table(["Technology", "Capacity MW", "Now"], [["Coal station", "520", "93 %"], ["Gas station", "430", "93 %"], ["Hydro", "210", "80 %"], ["Wind farms", "280", pct(Math.min(1, 0.12 + s.weather.wind / 22))], ["Solar farms", "200", pct(s.weather.sun * 0.95)], ["Nuclear plant B", "380", "93 %"]])}<p class="notes">Wind and solar depend on the weather (${esc(s.weather.kind)}, wind ${f0(s.weather.wind)} m/s): that moves the price.</p></div></div>
<div class="panel" style="margin-top:12px"><h2>Does more generation mean more profit?</h2><p class="notes">Not automatically. Extra output costs fuel, water and wear, and a flooded market pays less per MWh. When the spot price is below your cost of making power (about $12 per MWh of fuel and water plus wear), lower the turbine set point.</p></div>`;
  }, mount(root, s) {
    const c = root.querySelector<HTMLCanvasElement>('canvas[data-chart="mprice"]'); if (c) drawLines(c, [{ name: "spot $/MWh", data: s.market.priceHistory.slice(-168), color: "#f0b43c", fill: true }]);
    const d = root.querySelector<HTMLCanvasElement>('canvas[data-chart="mfc"]'); if (d) drawLines(d, [{ name: "forecast $/MWh", data: s.market.forecast, color: "#4aa8ff", fill: true }]);
  } };

export const customers: Page = { id: "customers", title: "Industrial Customers", icon: "09",
  render(s) {
    const act_ = s.contracts.filter((c) => c.active);
    const cust = (id: string) => s.customers.find((c) => c.id === id)!;
    const totalRev = act_.reduce((a, c) => a + c.deliveredMW * c.price, 0);
    const rows = act_.map((c) => { const u = cust(c.customerId); return [esc(u.name), esc(u.industry), `<span class="n">${f1(c.deliveredMW)} / ${f1(c.demandMW)}</span>`, `<span class="n">${f0(c.capacityMW)}</span>`, `<span class="n">$${f2(c.price)}</span>`, `<span class="n">${usd(c.deliveredMW * c.price)}/h</span>`, `<select data-chg='{"type":"setPriority","id":"${c.id}"}' data-key="priority">${[1, 2, 3, 4, 5].map((p) => `<option ${p === c.priority ? "selected" : ""}>${p}</option>`).join("")}</select>`, c.shortfallMW > 0.01 ? '<span class="tag bad">SHORT</span>' : '<span class="tag ok">SUPPLIED</span>', btn("End", { type: "terminateContract", id: c.id }, "sm danger")]; });
    const offers = s.offers.filter((o) => o.status === "open").map((o) => { const u = cust(o.customerId); const val = ui.offerPrice[o.id] ?? o.asking; return [esc(u.name), `<span class="n">${f0(o.capacityMW)} MW / ${o.days} d</span>`, `<span class="n">$${f2(o.asking)}</span>`, `<span class="notes">${esc(o.note)}</span>`, `<input type="number" step="0.5" id="p-${o.id}" value="${val}" style="width:80px" data-offer="${o.id}"> ${btn("Propose", { type: "negotiate", offerId: o.id }, "sm", `data-from="p-${o.id}" data-key="price"`)} ${btn("Accept", { type: "acceptOffer", offerId: o.id }, "sm pri")} ${btn("Reject", { type: "rejectOffer", offerId: o.id }, "sm")}`]; });
    const inv = s.finance.invoices.filter((i) => !i.paid);
    const consumption = s.customers.map((u) => { const c = s.contracts.find((x) => x.customerId === u.id && x.active); return [esc(u.name), `<span class="n">${f1(customerDemand(s, u))}</span>`, c ? "yes" : "no"]; });
    return `<h1>Electricity Distribution & Sales</h1><p class="sub">Who gets our electricity, how much, at what price, and what it earns. Customers are served in priority order (1 = first): in a shortage the low-priority ones lose power first, and you pay penalties.</p>
<div class="grid g5">${kpi("WHO is receiving?", f0(act_.length) + " customers", "active contracts")}${kpi("HOW MUCH supplying?", f1(act_.reduce((a, c) => a + c.deliveredMW, 0)) + " MW", `of ${f1(act_.reduce((a, c) => a + c.demandMW, 0))} demanded`)}${kpi("HOW MUCH selling?", f1(s.grid.spotMW) + " MW spot", `${f1(s.grid.contractedMW)} MW contracted`)}${kpi("AT WHAT PRICE?", "$" + f2(act_.reduce((a, c) => a + c.deliveredMW * c.price, 0) / Math.max(1, act_.reduce((a, c) => a + c.deliveredMW, 0))), `avg contract, spot $${f1(s.market.spotPrice)}`)}${kpi("REVENUE rate", usd(totalRev + s.grid.spotMW * s.market.spotPrice) + "/h", `month ${usdM(sumIncome(s.finance.month))}`)}</div>
<div class="panel" style="margin-top:12px"><h2>Contracts</h2>${rows.length ? table(["Customer", "Industry", "Supplying / demand MW", "Contract MW", "Price", "Revenue", "Priority", "Status", ""], rows) : "<p class='notes'>No contracts. Accept an offer below.</p>"}</div>
<div class="panel" style="margin-top:12px"><h2>New offers (negotiate the price)</h2>${offers.length ? table(["Customer", "Size / length", "They offer", "Reply", "Your move"], offers) : "<p class='notes'>No open offers. New ones arrive every few days.</p>"}<p class="notes">Propose a price. If it is under their limit they sign at once; otherwise they counter. After three rounds they walk away.</p></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Invoices and payments</h2>${inv.length ? table(["Customer", "Amount", "Due", "Status", ""], inv.map((i) => [esc(cust(i.customerId).name), `<span class="n">${usd(i.amount)}</span>`, fmtTime(i.dueT), i.overdue ? '<span class="tag bad">OVERDUE</span>' : '<span class="tag">open</span>', btn("Chase", { type: "chasePayment", invoiceId: i.id }, "sm")])) : "<p class='notes'>No outstanding invoices. Invoices are issued every 30 days and are due about 12 days later.</p>"}<p class="notes">Unbilled this month: ${usd(s.contracts.reduce((a, c) => a + c.accruedUnbilled, 0))}</p></div>
<div class="panel"><h2>Customer demand now</h2>${table(["Customer", "Wants MW", "Contract"], consumption)}</div></div>`;
  } };

export const finance: Page = { id: "finance", title: "Finance & Accounting", icon: "10",
  render(s) {
    const f = s.finance, q = summary(s), win = (ui.tab.finance as "day" | "month" | "year") || "month";
    const rec = win === "day" ? f.day : win === "year" ? f.year : f.month;
    const cats = Object.entries(rec).filter(([k]) => !["cashReceived", "loan", "capital"].includes(k));
    const inc = cats.filter(([k]) => isIncome(k)), exp = cats.filter(([k]) => !isIncome(k));
    const tabs = ["day", "month", "year"].map((w) => btn(w === "day" ? "Today" : w === "month" ? "This month" : "This year", { type: "setTab", key: "finance", value: w } as never, w === win ? "sm pri" : "sm", `data-tab="finance:${w}"`)).join(" ");
    return `<h1>Finance & Accounting</h1><p class="sub">Revenue is booked when electricity is delivered (accrual). Customers pay later by invoice, so cash and profit differ. Expenses come from real activity: fuel from reactor heat, water from cooling, and so on.</p>
<div class="grid g5">${kpi("Cash", usdM(f.cash), "", f.cash < 2e6 ? "bad" : "")}${kpi("Receivables", usdM(q.receivables), "earned, not yet paid")}${kpi("Debt", usdM(f.debt), `${pct(f.interestRate, 1)} base rate`)}${kpi("Asset value", usdM(f.assets), "plant + equipment")}${kpi("Net worth", usdM(f.cash + q.receivables + f.assets - f.debt), "")}</div>
<div class="row" style="margin:12px 0">${tabs}<span class="sp"></span>${btn("Download CSV", { type: "csv", what: "finance" } as never, "sm")}</div>
<div class="grid g2"><div class="panel"><h2>Income</h2>${table(["Category", "Amount"], [...inc.map(([k, v]) => [k, `<span class="n">${usd(v)}</span>`]), ["<b>Total income</b>", `<b class="n">${usd(sumIncome(rec))}</b>`]])}</div><div class="panel"><h2>Expenses</h2>${table(["Category", "Amount"], [...exp.sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, `<span class="n">${usd(-v)}</span>`]), ["<b>Total expenses</b>", `<b class="n">${usd(sumExpense(rec))}</b>`]])}<p class="notes">Net profit this period: <b>${usd(sumIncome(rec) - sumExpense(rec))}</b></p></div></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Daily profit (last 30 days)</h2><canvas class="chart" data-chart="profit"></canvas></div><div class="panel"><h2>Loans</h2>${table(["Loan", "Principal", "Rate", ""], f.loans.map((l) => [`#${l.id}`, `<span class="n">${usd(l.principal)}</span>`, pct(l.rate, 1), btn("Repay", { type: "repayLoan", id: l.id }, "sm")]))}<div class="row" style="margin-top:8px">${btn("Borrow 5M", { type: "takeLoan", amount: 5_000_000 }, "sm")}${btn("Borrow 20M", { type: "takeLoan", amount: 20_000_000 }, "sm")}</div><p class="notes">Interest is charged daily. Repayment of 1/120 of the principal each month. Borrowing is capped at 90 % of assets.</p></div></div>
<div class="panel" style="margin-top:12px"><h2>Latest transactions</h2><div class="logbox">${f.ledger.slice(-25).reverse().map((l) => `<div><time>${fmtTime(l.t)}</time>${esc(l.cat)} ${usd(l.amount)} ${esc(l.note)}</div>`).join("")}</div></div>`;
  }, mount(root, s) { const c = root.querySelector<HTMLCanvasElement>('canvas[data-chart="profit"]'); if (c) { const d = s.finance.dailyHistory.slice(-30); drawBars(c, d.map((x) => String(Math.floor(x.t / 1440))), d.map((x) => x.net)); } } };
export { act, bar, gauge, led, regionalDemand, competitorSupply, toCsv };
