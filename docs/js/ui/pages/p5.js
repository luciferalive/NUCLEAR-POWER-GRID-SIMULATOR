import { ACHIEVEMENTS, valuation } from "../../simulation/world/achievements.js";
import { BUILD_CATALOG, ITEM_LABEL, SUPPLIERS } from "../../simulation/world/data.js";
import { WAREHOUSE_CAP, contractor } from "../../simulation/world/world.js";
import { quotePrice, warehouseFree } from "../../simulation/world/actions.js";
import { MIN_PER_DAY, fmtTime, sumExpense, sumIncome } from "../../simulation/util.js";
import { WorldMap, LAYERS, panelHtml } from "../worldmap.js";
import { act, bar, btn, esc, f0, f1, f2, kpi, led, pct, table, tip, usd, usdM } from "../dom.js";
import { drawLines } from "../charts.js";
import { ui } from "../state.js";
const W = (cmd) => ({ type: "world", cmd });
const wbtn = (label, cmd, cls = "sm", extra = "") => btn(label, W(cmd), cls, extra);
const tabBtn = (key, value, label, cur) => btn(label, { type: "setTab", key, value }, "sm " + (cur === value ? "pri" : ""));
// ---------------------------------------------------------------------------------------------- world map
let wm = null, lastPanel = "";
export const worldmap = { id: "worldmap", title: "World Map", icon: "19",
    render() {
        return `<h1>World Map</h1><p class="sub">The whole power system on one map: regions, power plants, customers and the transmission network. Arrows move only when electricity really flows, faster for more MW. Click anything to inspect it.</p>
<div class="wm"><div class="wm-main"><canvas id="wmcv"></canvas><div class="wm-tools"><button class="btn sm" data-wm="in">+</button><button class="btn sm" data-wm="out">−</button><button class="btn sm" data-wm="reset">Reset view</button><button class="btn sm" data-wm="plant">Find plant</button></div></div>
<div class="wm-side"><div class="panel"><h2>Layers</h2><div id="wm-layers"></div></div><div class="panel" id="wm-info"></div><div class="panel"><h2>Legend</h2><div class="legend"><span><i style="background:#2fe0c4"></i> active supply</span><span><i style="background:#ffb02e"></i> at limit / short</span><span><i style="background:#ff4d4d"></i> fault</span><span><i style="background:#b48cff"></i> import</span><span><i style="background:#4aa8ff"></i> backbone</span><span><i style="background:#e8eef2"></i> planned</span></div></div></div></div>`;
    },
    mount(root, s) {
        const cv = root.querySelector("#wmcv");
        if (!wm || wm.cv !== cv) {
            wm?.destroy();
            wm = new WorldMap(cv);
            lastPanel = "";
            wm.onSelect = () => { lastPanel = ""; refresh(); };
            root.querySelectorAll("[data-wm]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.wm; if (k === "in")
                wm.zoomBy(1.3);
            else if (k === "out")
                wm.zoomBy(1 / 1.3);
            else if (k === "reset")
                wm.reset();
            else if (k === "plant")
                wm.focus(480, 560, 2.4); }));
            root.querySelector("#wm-layers").innerHTML = LAYERS.map((l) => `<label class="row"><input type="checkbox" data-layer="${l.id}" ${wm.layers.has(l.id) ? "checked" : ""}> ${l.label}</label>`).join("");
            root.querySelectorAll("[data-layer]").forEach((c) => c.addEventListener("change", () => wm.toggle(c.dataset.layer)));
        }
        const refresh = () => { const h = panelHtml(store(s), wm.sel); if (h !== lastPanel) {
            root.querySelector("#wm-info").innerHTML = h;
            lastPanel = h;
        } };
        refresh();
    } };
import { store as theStore } from "../../store/store.js";
const store = (_s) => theStore.state;
// ---------------------------------------------------------------------------------------------- command center
function attention(s) {
    const w = s.world, a = [];
    if (s.reactor.scram)
        a.push({ sev: "crit", text: "Reactor is SCRAMMED: no electricity is being generated.", page: "reactor" });
    for (const l of w.lines)
        if (l.status === "fault")
            a.push({ sev: "crit", text: `Transmission line ${l.id} is faulty: supply interrupted until ${fmtTime(l.faultUntil)}.`, page: "network" });
    for (const r of w.regions)
        if (r.shortageMW > 25)
            a.push({ sev: "warn", text: `${r.id} region short of ${f0(r.shortageMW)} MW (prices x${f2(r.priceMul)}).`, page: "network" });
    for (const c of s.contracts)
        if (c.active && c.shortfallMW > 1)
            a.push({ sev: "warn", text: `${s.customers.find((x) => x.id === c.customerId).name} short by ${f1(c.shortfallMW)} MW: penalties accrue.`, page: "customers" });
    for (const e of s.equipment)
        if (e.status === "failed")
            a.push({ sev: "crit", text: `${e.name} has failed.`, page: "maintenance" });
    for (const e of s.equipment)
        if (e.status !== "failed" && e.condition < 30)
            a.push({ sev: "warn", text: `${e.name} condition ${f0(e.condition)} %: schedule maintenance.`, page: "maintenance" });
    for (const p of w.payables)
        if (!p.paid && p.dueT - s.t < 3 * MIN_PER_DAY)
            a.push({ sev: "warn", text: `Supplier invoice ${usd(p.amount)} due ${fmtTime(p.dueT)}.`, page: "procurement" });
    if (s.inventory.spares < 4)
        a.push({ sev: "warn", text: `Only ${f0(s.inventory.spares)} spare-part kits left.`, page: "procurement" });
    if (s.inventory.supplies < 10)
        a.push({ sev: "warn", text: `Maintenance supplies nearly out (${f0(s.inventory.supplies)}): emergency purchases are expensive.`, page: "procurement" });
    for (const p of w.projects)
        if (p.stalled && p.status === "building")
            a.push({ sev: "warn", text: `${p.name}: ${p.stalled}.`, page: "construction" });
    if (w.reg.wasteStored > w.reg.wasteCap * 0.8)
        a.push({ sev: "warn", text: `Waste storage ${pct(w.reg.wasteStored / w.reg.wasteCap)} full: ship waste.`, page: "regulator" });
    if (!w.reg.reportFiled && s.t > w.reg.reportDueT - 3 * MIN_PER_DAY)
        a.push({ sev: "info", text: "Monthly financial report due: file it in Regulator & Compliance.", page: "regulator" });
    for (const e of s.events.filter((x) => !x.resolved && x.options?.length))
        a.push({ sev: "warn", text: `Decision needed: ${e.title}`, page: "safety" });
    if (s.finance.cash < 3e6)
        a.push({ sev: "crit", text: `Cash is low: ${usdM(s.finance.cash)}.`, page: "finance" });
    return a;
}
export const command = { id: "command", title: "Command Center", icon: "20",
    render(s) {
        const w = s.world, g = s.grid, a = attention(s), m = s.market;
        const act_ = s.contracts.filter((c) => c.active), sup = act_.filter((c) => c.deliveredMW > 0.1).length;
        const latest = w.news.slice(-5).reverse();
        return `<h1>Command Center</h1><p class="sub">Everything that needs you, on one screen. Click an item to jump to the right place.</p>
<div class="grid g5">${kpi("Net output", f0(g.netMW) + " MW", `reactor ${f0(s.reactor.n * 100)} %`, s.reactor.scram ? "bad" : "good")}${kpi("Cash", usdM(s.finance.cash), `valuation ${usdM(valuation(s))}`)}${kpi("Spot price", "$" + f1(m.spotPrice), `${w.econ.phase} economy`)}${kpi("Customers supplied", `${sup} / ${act_.length}`, `${f0(g.contractedMW)} MW contracted`)}${kpi("Market share", (w.marketShare * 100).toFixed(1) + " %", `${w.competitors.filter((c) => c.status === "online").length} competitors online`)}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Needs attention (${a.length})</h2>${a.length ? a.map((x) => `<div class="att ${x.sev}"><a href="#${x.page}">${esc(x.text)}</a></div>`).join("") : "<p class='s-info'>All clear. Nothing needs you right now.</p>"}</div>
<div class="panel"><h2>Latest news</h2>${latest.map((n) => `<div class="news ${n.sev}"><time>${fmtTime(n.t)}</time><b>${esc(n.cat)}</b> ${esc(n.headline)}</div>`).join("") || "<p class='notes'>No news yet.</p>"}<p><a href="#news">All news and timeline →</a></p></div></div>
<div class="grid g3" style="margin-top:12px"><div class="panel"><h2>Weather by region</h2>${table(["Region", "Now", "Next"], w.regions.map((r) => [r.id, `${w.weather[r.id].kind} ${f0(w.weather[r.id].temp)}°C`, esc(w.weather[r.id].forecast[0])]))}</div>
<div class="panel"><h2>Transmission</h2>${table(["Line", "Flow", "Status"], w.lines.filter((l) => l.kind === "supply" && l.status !== "planned").sort((x, y) => y.flowMW - x.flowMW).slice(0, 6).map((l) => [l.id.slice(2), `${f0(l.flowMW)}/${f0(l.capMW)} MW`, l.status === "fault" ? '<span class="tag bad">FAULT</span>' : l.flowMW / l.capMW > 0.95 ? '<span class="tag warn">LIMIT</span>' : '<span class="tag ok">ok</span>']))}</div>
<div class="panel"><h2>Money today</h2>${table(["", ""], [["Income", usd(sumIncome(s.finance.day))], ["Expenses", usd(sumExpense(s.finance.day))], ["Orders in transit", String(w.orders.filter((o) => o.status === "transit").length)], ["Unpaid supplier invoices", usd(w.payables.filter((p) => !p.paid).reduce((x, p) => x + p.amount, 0))], ["Projects running", String(w.projects.filter((p) => p.status === "building").length)]])}</div></div>`;
    } };
// ---------------------------------------------------------------------------------------------- regions and transmission
export const network = { id: "network", title: "Regions & Transmission", icon: "21",
    render(s) {
        const w = s.world;
        const reg = w.regions.map((r) => [`<b>${r.id}</b>`, `<span class="n">${f0(r.demandMW)}</span>`, `<span class="n">${f0(r.industrialMW)} / ${f0(r.residentialMW)}</span>`, `<span class="n">${f0(r.genMW)}</span>`, `<span class="n">${f1(r.deliveredByUsMW)}</span>`, `<span class="n">${f0(r.importMW)} / ${f0(r.exportMW)}</span>`, `<span class="n">${f1(r.lossMW)}</span>`, bar(r.deliveredByUsMW, r.tieCapMW, r.deliveredByUsMW / r.tieCapMW > 0.9 ? "warn" : "", `${f0(r.deliveredByUsMW)}/${f0(r.tieCapMW)}`), r.shortageMW > 5 ? `<span class="tag bad">SHORT ${f0(r.shortageMW)}</span>` : '<span class="tag ok">ok</span>']);
        const lines = w.lines.filter((l) => l.kind === "supply").map((l) => { const c = s.customers.find((x) => x.id === l.customerId), u = l.capMW ? l.flowMW / l.capMW : 0; return [esc(c.name), `<span class="n">${f1(l.flowMW)} / ${f0(l.capMW)} MW</span>`, bar(u, 1, u > 0.95 ? "warn" : "", pct(u)), `<span class="n">${f2(l.lossMW)}</span>`, bar(l.condition, 100, l.condition < 40 ? "bad" : "", f0(l.condition) + " %"), l.status === "fault" ? `<span class="tag bad">FAULT</span> ${wbtn("Rush 120k", { c: "repairLine", id: l.id }, "sm danger")}` : l.status === "planned" ? `<span class="tag">planned</span> ${wbtn("Build connection", { c: "project", kind: "connection", targetId: l.id }, "sm pri")}` : `<span class="tag ok">ok</span>`, l.status === "planned" ? "" : wbtn("Maintain", { c: "maintainLine", id: l.id }) + " " + wbtn("+40 MW", { c: "project", kind: "line-upgrade", targetId: l.id })]; });
        return `<h1>Regions & Transmission</h1><p class="sub">Electricity has to travel. Each customer has its own line and each region has a substation. A line or substation at its limit blocks deliveries even when the plant has power to spare.</p>
<div class="panel"><h2>Regional grids</h2>${table(["Region", "Demand MW", "Industrial / residential", "Local generation", "We supply", "Import / export", "Losses", "Our use of substation", "Status"], reg)}<p class="notes">External interconnector currently imports ${f0(w.flags.extImportMW ?? 0)} MW into deficit regions. Competitors supply ${f0(w.compSupplyMW)} MW in total.</p></div>
<div class="panel" style="margin-top:12px"><h2>Customer transmission lines</h2>${table(["Customer", "Flow / capacity", "Utilisation", "Loss MW", "Condition", "Status", "Actions"], lines)}<p class="notes">Storms, wind and floods raise fault risk; worn lines fail more often. Wheeling charges are paid per MWh delivered (Expenses page).</p></div>`;
    } };
// ---------------------------------------------------------------------------------------------- expenses
const GROUPS = [
    ["Plant operations", ["fuel", "water", "waste", "grid-purchases", "supplies"]], ["Personnel", ["salaries", "training"]], ["Maintenance & facilities", ["maintenance", "facility-maintenance", "equipment-replacement", "spare-parts", "security"]],
    ["Grid & transmission", ["transmission", "grid-connection"]], ["Logistics", ["logistics", "transportation"]], ["Construction", ["construction", "contractors", "engineering", "permits"]],
    ["Administration & compliance", ["administration", "insurance", "compliance", "fines", "taxes", "penalties"]], ["Finance & research", ["interest", "research"]],
];
export const expenses = { id: "expenses", title: "Expenses & Cost Management", icon: "22",
    render(s) {
        const f = s.finance, win = ui.tab.exp || "month", rec = win === "day" ? f.day : win === "year" ? f.year : f.month, w = s.world;
        const all = Object.keys({ ...f.totals, ...rec }).filter((k) => !["contracts", "spot", "other", "cashReceived", "loan", "capital"].includes(k)), seen = new Set();
        const total = Math.max(1, sumExpense(rec)), mwh = Math.max(1, win === "day" ? s.stats.todayMWh : win === "year" ? s.stats.yearMWh : s.stats.monthMWh);
        const gRows = GROUPS.map(([name, keys]) => { keys.forEach((k) => seen.add(k)); const v = keys.reduce((a, k) => a - (rec[k] ?? 0), 0); return { name, v, keys }; });
        const other = all.filter((k) => !seen.has(k)).reduce((a, k) => a - (rec[k] ?? 0), 0);
        if (other > 1)
            gRows.push({ name: "Other", v: other, keys: all.filter((k) => !seen.has(k)) });
        const rows = gRows.map((g) => [`<b>${g.name}</b>`, `<span class="n">${usd(g.v)}</span>`, bar(g.v, total, "info", pct(g.v / total)), `<span class="notes">${g.keys.filter((k) => Math.abs(rec[k] ?? 0) > 1).map((k) => `${k} ${usd(-(rec[k] ?? 0))}`).join(", ") || "-"}</span>`]);
        const mb = w.flags.maintBudget, al = w.flags.adminLevel, ct = contractor(s);
        const level = (cur, v, label, cmd) => wbtn(label, cmd, "sm " + (Math.abs(cur - v) < 0.01 ? "pri" : ""));
        const fixed = (11000 + 6500 + 600 + w.expense.facilityDay * 1000 * mb + (26000 + 120 * s.staff.length)) * w.econ.cpi + s.staff.reduce((a, e) => a + e.salary, 0) / 30;
        return `<h1>Expenses & Cost Management</h1><p class="sub">Every cost comes from something real: fuel from reactor heat, water from cooling, wheeling charges from deliveries, freight from orders, contractor payments from construction. Cut the wrong cost and it comes back bigger later.</p>
<div class="grid g5">${kpi("Expenses (" + win + ")", usd(sumExpense(rec)), "")}${kpi("Income (" + win + ")", usd(sumIncome(rec)), "")}${kpi("Cost per MWh", "$" + f2(sumExpense(rec) / mwh), `${f0(mwh)} MWh sold/generated`)}${kpi("Fixed cost per day", usdM(fixed), "salaries, admin, security, facilities")}${kpi("Inflation", pct(w.econ.inflation, 1), `price level x${f2(w.econ.cpi)}`, w.econ.inflation > 0.04 ? "warn" : "")}</div>
<div class="row" style="margin:12px 0">${tabBtn("exp", "day", "Today", win)} ${tabBtn("exp", "month", "This month", win)} ${tabBtn("exp", "year", "This year", win)}</div>
<div class="panel"><h2>Where the money goes</h2>${table(["Department", "Amount", "Share", "Details"], rows)}</div>
<div class="grid g3" style="margin-top:12px"><div class="panel"><h2>Maintenance budget ${tip("?", "Spending less saves facility costs but raises equipment wear and failure probability. Spending more does the opposite.")}</h2><div class="row">${level(mb, 0.7, "Lean (-30 %)", { c: "budget", maint: 0.7 })}${level(mb, 1, "Normal", { c: "budget", maint: 1 })}${level(mb, 1.25, "Generous (+25 %)", { c: "budget", maint: 1.25 })}</div><p class="notes">Wear ${(mb < 1 ? "+" : "") + ((1 - mb) * 75).toFixed(0)} % per day effect, failure risk ${(mb < 1 ? "+" : "") + ((1 - mb) * 90).toFixed(0)} %.</p></div>
<div class="panel"><h2>Administration</h2><div class="row">${level(al, 0, "Lean", { c: "admin", level: 0 })}${level(al, 1, "Normal", { c: "admin", level: 1 })}${level(al, 2, "Extended", { c: "admin", level: 2 })}</div><p class="notes">Lean saves 20 % of admin cost but financial reporting and compliance slowly suffer. Extended costs 12 % more.</p></div>
<div class="panel"><h2>Maintenance contractor</h2>${[0, 1, 2].map((n) => { const names = ["In-house crew", "Lowrate Services Ltd.", "PrimeTech Engineering"]; return wbtn(names[n], { c: "contractor", n }, "sm " + (w.flags.contractor === n ? "pri" : "")); }).join(" ")}<p class="notes">Now: <b>${ct.name}</b>. Cost x${ct.costMul}, repair time x${ct.hoursMul}, failure risk ${ct.hazard >= 0 ? "+" : ""}${(ct.hazard * 100).toFixed(0)} %. Cheap contractors are slower and less careful; premium ones cost more but fail less.</p></div></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Loans & interest</h2>${table(["Loan", "Principal", "Rate", ""], f.loans.map((l) => [`#${l.id}`, usd(l.principal), pct(l.rate, 2), btn("Repay", { type: "repayLoan", id: l.id }, "sm")]))}<p class="notes">Market rate now ${pct(w.econ.interest, 1)}. ${wbtn("Refinance all loans", { c: "refinance" }, "sm pri")} costs 1 % of debt and only works when the market rate is lower than yours.</p></div>
<div class="panel"><h2>Cost-saving checklist</h2><ul class="notes"><li>Buy spares and supplies in bulk when prices are low (Procurement).</li><li>Negotiate supplier prices; keep relationships above 70.</li><li>Run fans only as needed: they use power.</li><li>Ship waste before storage is full to avoid fines.</li><li>Avoid penalties: keep lines healthy and contracts supplied.</li></ul></div></div>`;
    } };
// ---------------------------------------------------------------------------------------------- procurement
export const procurement = { id: "procurement", title: "Procurement & Supply Chain", icon: "23",
    render(s) {
        const w = s.world, items = ["spares", "supplies", "components", "materials"];
        const st = items.map((i) => { const cap = WAREHOUSE_CAP[i] * (1 + (i === "spares" || i === "components" ? w.buildings.warehouse : 0)), inc = w.orders.filter((o) => o.status === "transit" && o.item === i).reduce((a, o) => a + o.qty, 0); return [ITEM_LABEL[i], bar(s.inventory[i], cap, s.inventory[i] < cap * 0.1 ? "bad" : "info", `${f0(s.inventory[i])} / ${f0(cap)}`), `<span class="n">${f0(inc)}</span>`, `<span class="n">${usd(quotePrice(s, "sup-1", i, 10) / (i === "spares" ? 1 : 1))}</span>`]; });
        const sup = w.suppliers.map((p) => [`<b>${esc(p.name)}</b><br><span class="notes">${p.country}</span>`, p.categories.join(", "), `<span class="n">x${f2(p.priceMul)}</span>`, `<span class="n">${p.leadDays} d</span>`, bar(p.reliability, 1, "", pct(p.reliability)), `<span class="n">${p.terms} d</span>`, bar(p.relation, 100, p.relation < 40 ? "bad" : "info", f0(p.relation)), Object.entries(p.stock).map(([k, v]) => `${k}:${f0(v)}`).join(" "), wbtn("Negotiate", { c: "negotiate", supplierId: p.id })]);
        const compare = items.map((i) => { const opts = w.suppliers.filter((p) => p.categories.includes(i)).map((p) => ({ p, price: quotePrice(s, p.id, i, 10) })).sort((a, b) => a.price - b.price); return [ITEM_LABEL[i], opts.map((o, k) => `${k === 0 ? "<b>" : ""}${esc(o.p.name.split(" ")[0])} ${usd(o.price)} (${o.p.leadDays}d, ${pct(o.p.reliability)})${k === 0 ? " ← cheapest</b>" : ""}`).join("<br>")]; });
        const quotes = w.quotes.filter((q) => !q.ordered && s.t <= q.expiresT).map((q) => [q.id, esc(w.suppliers.find((p) => p.id === q.supplierId).name), ITEM_LABEL[q.item], f0(q.qty), usd(q.unitPrice), usd(q.unitPrice * q.qty), `${q.leadDays} d / ${q.terms} d terms`, fmtTime(q.expiresT), wbtn("Place order", { c: "order", quoteId: q.id }, "sm pri")]);
        const orders = w.orders.filter((o) => o.status === "transit").map((o) => [o.id, esc(w.suppliers.find((p) => p.id === o.supplierId).name), `${f0(o.qty)} x ${o.item}`, usd(o.qty * o.unitPrice), fmtTime(o.eta), o.delayed ? '<span class="tag warn">DELAYED</span>' : '<span class="tag">in transit</span>', wbtn("Cancel (10 % fee)", { c: "cancelOrder", id: o.id }, "sm danger")]);
        const pay = w.payables.filter((p) => !p.paid).map((p) => [p.id, esc(w.suppliers.find((x) => x.id === p.supplierId).name), esc(p.note), usd(p.amount), fmtTime(p.dueT), s.t > p.dueT ? '<span class="tag bad">OVERDUE</span>' : "", wbtn("Pay now", { c: "pay", id: p.id }, "sm")]);
        const opt = (list) => list.map((x) => `<option value="${x}">${x}</option>`).join("");
        return `<h1>Procurement & Supply Chain</h1><p class="sub">Parts, supplies and materials come from suppliers, not from thin air. Ask for a quotation, compare, order, wait for delivery, pay on the supplier's terms. Late deliveries and empty shelves delay maintenance and construction.</p>
<div class="grid g2"><div class="panel"><h2>Warehouse</h2>${table(["Item", "Stock", "On order", "Price / unit (typical)"], st)}<p class="notes">Maintenance supplies are used every day (more buildings, more use). Spare kits are used by every job. Components are used by replacements. Materials are used by construction.</p>
<div class="row">${btn("Emergency supplies x20 (2.2x price)", { type: "buySupplies", qty: 20 }, "sm")}${btn("Emergency spares x10", { type: "buySpares", qty: 10 }, "sm")}</div></div>
<div class="panel"><h2>Request a quotation</h2><div id="qform" class="form"><label>Supplier<select data-f="supplierId">${w.suppliers.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>Item<select data-f="item">${opt(["spares", "supplies", "components", "materials"])}</select></label><label>Quantity<input type="number" data-f="qty" value="10" min="1" style="width:90px"></label>${btn("Request quote", { type: "world", cmd: { c: "quote" } }, "pri", 'data-collect="qform"')}</div>
<h3>Price comparison (10 units)</h3>${table(["Item", "Suppliers, cheapest first"], compare)}</div></div>
<div class="panel" style="margin-top:12px"><h2>Quotations</h2>${quotes.length ? table(["Ref", "Supplier", "Item", "Qty", "Unit", "Total", "Delivery / terms", "Valid until", ""], quotes) : "<p class='notes'>No open quotations.</p>"}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Orders in transit</h2>${orders.length ? table(["Order", "Supplier", "Goods", "Value", "Expected", "Status", ""], orders) : "<p class='notes'>Nothing on order.</p>"}</div>
<div class="panel"><h2>Supplier invoices (payables)</h2>${pay.length ? table(["Invoice", "Supplier", "For", "Amount", "Due", "", ""], pay) : "<p class='notes'>No unpaid supplier invoices.</p>"}<p class="notes">Invoices are paid automatically on the due date when cash allows. Paying late damages the relationship and raises future prices.</p></div></div>
<div class="panel" style="margin-top:12px"><h2>Suppliers</h2>${table(["Supplier", "Sells", "Price", "Lead time", "Reliability", "Terms", "Relationship", "Stock", ""], sup)}</div>`;
    } };
// ---------------------------------------------------------------------------------------------- construction, storage, generation
export const construction = { id: "construction", title: "Construction & Storage", icon: "24",
    render(s) {
        const w = s.world;
        const cat = BUILD_CATALOG.map((b) => {
            const locked = b.needsTech && !s.research.done.includes(b.needsTech), cost = Math.round(b.cost * w.econ.construction * w.econ.cpi);
            const needsLine = b.needsLine;
            const lineOpts = w.lines.filter((l) => l.kind === "supply" && (b.id === "connection" ? l.status === "planned" : l.status !== "planned")).map((l) => `<option value="${l.id}">${esc(s.customers.find((c) => c.id === l.customerId).name)}</option>`).join("");
            const form = needsLine ? `<select data-f="targetId">${lineOpts}</select>` : `<select data-f="region">${["Central", "North", "East", "South", "West"].map((r) => `<option>${r}</option>`).join("")}</select>`;
            return [`<b>${b.name}</b><br><span class="notes">${b.text}</span>`, `<span class="n">${usdM(cost)}</span>`, `${b.days} d + ${b.permitDays} d permit`, `${f0(b.materials)} t`, `${b.minCompliance} %`, `<span class="n">${usd(b.upkeep)}/d</span>`, locked ? `<span class="tag">needs research: ${b.needsTech}</span>` : `<span id="bf-${b.id}" class="row">${form} ${btn("Start", { type: "world", cmd: { c: "project", kind: b.id } }, "sm pri", `data-collect="bf-${b.id}"`)}</span>`];
        });
        const prj = w.projects.filter((p) => p.status !== "cancelled").map((p) => [p.id, esc(p.name), p.region, `<span class="tag ${p.status === "done" ? "ok" : p.status === "building" ? "" : "warn"}">${p.status}</span>`, p.status === "done" ? "100 %" : bar(p.progress, p.days, "info", `${p.progress}/${p.days} d`), `<span class="n">${usdM(p.paid)} / ${usdM(p.cost)}</span>`, `<span class="notes">${esc(p.stalled)}</span>`, ["building", "paused"].includes(p.status) ? (p.status === "building" ? wbtn("Delay", { c: "projectCtl", id: p.id, what: "pause" }) : wbtn("Resume", { c: "projectCtl", id: p.id, what: "resume" })) + " " + wbtn("Cancel", { c: "projectCtl", id: p.id, what: "cancel" }, "sm danger") : p.status === "permit" ? wbtn("Cancel", { c: "projectCtl", id: p.id, what: "cancel" }, "sm danger") : ""]);
        const bat = w.batteries.map((b) => [esc(b.name), bar(b.energyMWh, b.capMWh, "info", `${f0(b.energyMWh)} / ${f0(b.capMWh)} MWh`), `<span class="n">${b.flowMW > 0 ? "+" : ""}${f1(b.flowMW)} MW</span>`, `<select data-chg='${esc(JSON.stringify({ type: "world", cmd: { c: "battery", id: b.id } }))}' data-key="cmd.mode" data-str="1">${["auto", "charge", "discharge", "idle"].map((m) => `<option ${m === b.mode ? "selected" : ""}>${m}</option>`).join("")}</select>`, `<span class="n">${f1(b.chargedMWh)} in / ${f1(b.dischargedMWh)} out MWh</span>`, `<span class="n">${f1(b.lossMWh)} MWh lost</span>`]);
        const gen = w.ownGen.map((g) => [esc(g.name), g.kind, `<span class="n">${f1(g.outMW)} / ${f0(g.mw)} MW</span>`, g.costPerMWh ? "$" + g.costPerMWh + "/MWh fuel" : "free", `<label class="row"><input type="checkbox" ${g.online ? "checked" : ""} data-chk='${esc(JSON.stringify({ type: "world", cmd: { c: "gen", id: g.id } }))}' data-key="cmd.online"> online</label>`]);
        return `<h1>Construction & Energy Storage</h1><p class="sub">Build to grow: more substation capacity, new connections, own generation and batteries. Every project needs a permit (compliance), land, money paid in stages and construction materials from the warehouse.</p>
<div class="panel"><h2>Available projects</h2>${table(["Project", "Cost", "Time", "Materials", "Min. compliance", "Upkeep", "Where / start"], cat)}<p class="notes">Free land plots: ${w.plots.filter((p) => !p.used).length} of ${w.plots.length}. Order materials in Procurement or projects stall.</p></div>
<div class="panel" style="margin-top:12px"><h2>Projects</h2>${prj.length ? table(["Ref", "Project", "Region", "Status", "Progress", "Paid / budget", "Note", ""], prj) : "<p class='notes'>No projects yet.</p>"}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Battery storage</h2>${bat.length ? table(["Battery", "Charge", "Now", "Mode", "Energy", "Losses"], bat) : "<p class='notes'>No batteries. Research Energy storage, then build one. Auto mode charges from surplus when prices are low and discharges to cover shortages and peaks.</p>"}</div>
<div class="panel"><h2>Own generation</h2>${gen.length ? table(["Plant", "Type", "Output", "Fuel cost", ""], gen) : "<p class='notes'>No extra plants. Gas peakers run when you are short or prices are high; solar and wind follow the weather.</p>"}</div></div>`;
    } };
// ---------------------------------------------------------------------------------------------- economy and competition
export const economy = { id: "economy", title: "Economy & Competition", icon: "25",
    render(s) {
        const w = s.world, e = w.econ, m = s.market, tot = w.competitors.reduce((a, c) => a + c.outMW, 0) + s.grid.contractedMW + s.grid.spotMW;
        const wx = w.regions.map((r) => { const x = w.weather[r.id]; return [r.id, `${x.kind}`, `${f0(x.temp)} °C`, `${f0(x.wind)} m/s`, `sun ${pct(x.sun)}`, x.forecast.map((k) => esc(k)).join(" → ")]; });
        const comp = w.competitors.map((c) => [`<b>${esc(c.name)}</b>`, c.tech, c.region, `<span class="n">${f0(c.capMW)}</span>`, `<span class="n">${f0(c.outMW)}</span>`, `<span class="n">$${f1(c.bidPrice)}</span>`, bar(c.share, 0.3, "info", (c.share * 100).toFixed(1) + " %"), `<span class="tag ${c.status === "online" ? "ok" : "bad"}">${c.status}</span>`, `<span class="n">${usdM(c.cash)}</span>`, c.building ? `+${c.building.addMW} MW by ${fmtTime(c.building.doneT)}` : ""]);
        return `<h1>Economy & Competition</h1><p class="sub">The wider world moves on its own. The economy runs in phases (expansion, boom, slowdown, recession, recovery) that change factory demand, inflation, interest rates and fuel prices. Competitors bid, break down, and build.</p>
<div class="grid g5">${kpi("Economic phase", e.phase.toUpperCase(), `until ${fmtTime(e.phaseUntil)}`, e.phase === "recession" ? "bad" : e.phase === "boom" ? "good" : "")}${kpi("Growth", pct(e.growth, 1), "annual")}${kpi("Inflation", pct(e.inflation, 1), `price level x${f2(e.cpi)}`, e.inflation > 0.04 ? "warn" : "")}${kpi("Interest rate", pct(e.interest, 1), "market")}${kpi("Fuel index", "x" + f2(e.fuelIdx), `FX x${f2(e.fx)}`)}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Spot price history (7 days)</h2><canvas class="chart" data-chart="eprice"></canvas><p class="notes">Industrial activity x${f2(e.manufacturing)} | population x${f2(e.popIdx)} | construction cost x${f2(e.construction)} | water price x${f2(e.waterIdx)}. Spot $${f1(m.spotPrice)}/MWh vs base $${f0(m.basePrice)}.</p></div>
<div class="panel"><h2>Weather by region</h2>${table(["Region", "Now", "Temp", "Wind", "Sun", "Forecast (next 3)"], wx)}<p class="notes">Forecasts are usually right, not always. Storms and floods raise line faults; heat and cold raise demand; drought cuts hydro and raises water prices.</p></div></div>
<div class="panel" style="margin-top:12px"><h2>Competitors (our market share ${(w.marketShare * 100).toFixed(1)} %, total supply ${f0(tot)} MW)</h2>${table(["Company", "Tech", "Region", "Capacity MW", "Output MW", "Offer $/MWh", "Share", "Status", "Cash", "Building"], comp)}</div>`;
    }, mount(root, s) { const c = root.querySelector('canvas[data-chart="eprice"]'); if (c)
        drawLines(c, [{ name: "spot $/MWh", data: s.market.priceHistory.slice(-168), color: "#f0b43c", fill: true }]); } };
// ---------------------------------------------------------------------------------------------- news
export const news = { id: "news", title: "World News & Timeline", icon: "26",
    render(s) {
        const w = s.world, cur = ui.tab.news || "ALL", cats = ["ALL", "ENERGY MARKET", "INDUSTRY", "COMPETITION", "WEATHER", "FINANCE", "INFRASTRUCTURE", "REGULATION", "ECONOMY"];
        const list = w.news.filter((n) => cur === "ALL" || n.cat === cur).slice().reverse().slice(0, 60);
        return `<h1>World News & Timeline</h1><p class="sub">Every headline here comes from something that really happened in the simulation, and usually changes something for you.</p>
<div class="row" style="margin-bottom:10px">${cats.map((c) => tabBtn("news", c, c === "ALL" ? "All" : c.charAt(0) + c.slice(1).toLowerCase(), cur)).join(" ")}</div>
<div class="grid g12"><div class="panel"><h2>News</h2>${list.map((n) => `<div class="newsitem ${n.sev}"><time>${fmtTime(n.t)}</time><b>${esc(n.cat)}</b><h4>${esc(n.headline)}</h4>${n.body ? `<p>${esc(n.body)}</p>` : ""}</div>`).join("") || "<p class='notes'>No news in this category yet.</p>"}</div>
<div class="panel"><h2>Timeline</h2><div class="logbox" style="max-height:640px">${w.timeline.slice().reverse().slice(0, 120).map((t) => `<div><time>${fmtTime(t.t)}</time>${esc(t.text)}</div>`).join("")}</div></div></div>`;
    } };
// ---------------------------------------------------------------------------------------------- regulator
export const regulator = { id: "regulator", title: "Regulator & Compliance", icon: "27",
    render(s) {
        const r = s.world.reg, row = (n, v, t) => [n, bar(v, 100, v < 50 ? "bad" : v < 70 ? "warn" : "", f0(v) + " %"), `<span class="notes">${t}</span>`];
        return `<h1>Regulator & Compliance</h1><p class="sub">The regulator audits you every 45-60 days. Poor scores mean fines, refused construction permits and, in the end, a suspended licence.</p>
<div class="grid g4">${kpi("Overall compliance", f0(s.safety.compliance) + " %", "", s.safety.compliance < 60 ? "bad" : "good")}${kpi("Next audit", fmtTime(r.nextAuditT), "")}${kpi("Waste storage", pct(r.wasteStored / r.wasteCap), `${f1(r.wasteStored)} / ${r.wasteCap} units`, r.wasteStored > r.wasteCap * 0.8 ? "warn" : "")}${kpi("Fines to date", usd(s.safety.fines), "")}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Scores</h2>${table(["Area", "Score", "What drives it"], [row("Environmental", r.env, "basin temperature, intake"), row("Financial reporting", r.reporting, "monthly report filed on time"), row("Waste management", r.waste, "storage level, shipping"), row("Equipment inspections", r.inspections, "every unit serviced in 120 days"), row("Infrastructure approvals", r.approvals, "permit refusals lower it"), row("Safety standards", s.safety.safetyScore, "drills, incidents")])}</div>
<div class="panel"><h2>Actions</h2><p>${r.reportFiled ? led(true, "Monthly report filed") : led(false, "Monthly report due " + fmtTime(r.reportDueT))}</p><p>${wbtn("File monthly financial report (12k)", { c: "fileReport" }, "sm pri")}</p><p>${wbtn("Ship 10 units of waste", { c: "shipWaste", units: 10 }, "sm")} ${wbtn("Ship 30", { c: "shipWaste", units: 30 }, "sm")}</p><p class="notes">Waste costs $18k per unit (treatment 70 %, transport 30 %). Storage above capacity is fined daily.</p></div></div>
<div class="panel" style="margin-top:12px"><h2>Audit findings</h2>${r.findings.length ? table(["Time", "Result", "Fine"], r.findings.slice().reverse().map((f) => [fmtTime(f.t), esc(f.text), usd(f.fine)])) : "<p class='notes'>No audits yet.</p>"}</div>`;
    } };
// ---------------------------------------------------------------------------------------------- achievements
export const achievements = { id: "achievements", title: "Achievements", icon: "28",
    render(s) {
        const n = Object.keys(s.world.achievements).length;
        return `<h1>Achievements</h1><p class="sub">${n} of ${ACHIEVEMENTS.length} unlocked. Each one is earned by real results in the simulation.</p><div class="grid g4">${ACHIEVEMENTS.map((a) => { const t = s.world.achievements[a.id]; return `<div class="panel ach ${t !== undefined ? "got" : ""}"><h3>${t !== undefined ? "★" : "☆"} ${esc(a.name)}</h3><p class="notes">${esc(a.text)}</p>${t !== undefined ? `<small class="s-info">Unlocked ${fmtTime(t)}</small>` : "<small class='notes'>Locked</small>"}</div>`; }).join("")}</div>`;
    } };
export { act, SUPPLIERS, warehouseFree, usdM };
