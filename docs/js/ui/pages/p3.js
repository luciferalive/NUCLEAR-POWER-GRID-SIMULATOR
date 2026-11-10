import { ROLE_LABEL, MIN_STAFF } from "../../simulation/constants.js";
import { KIND, staffMetrics } from "../../simulation/maintenanceEngine.js";
import { TECHS, UPGRADES } from "../../simulation/research.js";
import { bonus } from "../../simulation/powerGrid.js";
import { fmtTime } from "../../simulation/util.js";
import { act, bar, btn, esc, f0, f1, f2, kpi, led, pct, sevClass, table, usd, usdM, tip, toCsv } from "../dom.js";
import { ui } from "../state.js";
export const maintenance = { id: "maintenance", title: "Maintenance Department", icon: "11",
    render(s) {
        const m = staffMetrics(s), busy = s.equipment.filter((e) => e.status === "maintenance").length, mon = bonus(s, "alarmLead") > 0 || bonus(s, "hazard") < 0;
        const rows = s.equipment.map((e) => [`<b>${esc(e.id)}</b> ${esc(e.name)}<br><span class="notes">${esc(e.maker)} | installed day ${e.installed}</span>`, bar(e.condition, 100, e.condition < 35 ? "bad" : e.condition < 60 ? "warn" : "", f0(e.condition) + " %"), `<span class="tag ${e.status === "ok" ? "ok" : e.status === "failed" ? "bad" : "warn"}">${e.status}${e.status === "maintenance" ? ` ${f0(e.maintLeftMin / 60)}h` : ""}</span>`, `<span class="n">${(e.failureProb * 100).toFixed(2)} %/d${mon && e.failureProb > 0 ? `<br>~${f0(1 / e.failureProb)} d` : ""}</span>`, `<span class="n">${usd(e.maintCost)}<br>${usdM(e.replaceCost)}</span>`, ["inspection", "repair", "overhaul", "replace"].map((k) => btn(KIND[k].label, { type: "scheduleMaintenance", id: e.id, kind: k }, "sm", e.status === "maintenance" ? "disabled" : "")).join(" ")]);
        return `<h1>Maintenance Department</h1><p class="sub">Equipment wears out faster when it works hard. Worn equipment fails more often, and failures have real effects: a dead pump cuts flow, a dead turbine trips the plant. Maintenance costs money and takes a unit out of service.</p>
<div class="grid g4">${kpi("Jobs running", `${busy} / ${m.maxJobs}`, "technicians limit parallel jobs")}${kpi("Spare-part kits", f0(s.inventory.spares), "repair 2, overhaul 5, replace 8")}${kpi("Technicians", String(m.techs), "electrical + mechanical + maintenance")}${kpi("Staff coverage", pct(m.ratio), "affects wear and failures", m.ratio < 0.8 ? "warn" : "good")}</div>
<div class="row" style="margin:10px 0">${btn("Buy 10 kits (140k)", { type: "buySpares", qty: 10 }, "sm")}${btn("Buy 25 kits", { type: "buySpares", qty: 25 }, "sm")}<span class="notes">Without kits, parts are bought in a hurry at double price.</span></div>
<div class="panel">${table(["Equipment", "Condition", "Status", "Failure risk", "Cost: job / replace", "Schedule"], rows)}</div>
<div class="panel" style="margin-top:12px"><h2>Maintenance history</h2><div class="logbox">${s.equipment.flatMap((e) => e.history.map((h) => ({ t: h.t, e: e.id, w: h.what }))).sort((a, b) => b.t - a.t).slice(0, 25).map((h) => `<div><time>${fmtTime(h.t)}</time>${esc(h.e)}: ${esc(h.w)}</div>`).join("")}</div><p class="notes">Cutting maintenance saves money now but raises failure probability later: that trade-off is the game.</p></div>`;
    } };
const ROLES = ["operator", "engineer", "electrician", "mechanic", "safety", "maintenance", "security", "finance", "manager"];
export const personnel = { id: "personnel", title: "Personnel Management", icon: "12",
    render(s) {
        const m = staffMetrics(s);
        const cov = ROLES.map((r) => [ROLE_LABEL[r], `${m.count[r] ?? 0} / ${MIN_STAFF[r]}`, bar(Math.min(1, (m.count[r] ?? 0) / MIN_STAFF[r]), 1, (m.count[r] ?? 0) < MIN_STAFF[r] ? "bad" : "", ""), btn("Hire", { type: "hire", role: r }, "sm pri")]);
        const roster = s.staff.slice().sort((a, b) => a.role.localeCompare(b.role)).map((e) => [esc(e.name), ROLE_LABEL[e.role], `<span class="n">${e.exp} y</span>`, `<span class="n">${usd(e.salary)}</span>`, `<select data-chg='{"type":"setShift","id":${e.id}}' data-key="shift">${[0, 1, 2].map((x) => `<option value="${x}" ${x === e.shift ? "selected" : ""}>${["Night 00-08", "Day 08-16", "Evening 16-24"][x]}</option>`).join("")}</select>`, bar(e.training, 1, "info", pct(e.training)), bar(e.perf, 1.2, "", pct(e.perf)), bar(e.fatigue, 1, e.fatigue > 0.5 ? "bad" : "warn", pct(e.fatigue)), e.cert ? '<span class="tag ok">certified</span>' : '<span class="tag warn">training</span>', btn("Train (18k)", { type: "train", id: e.id }, "sm") + " " + btn("Dismiss", { type: "fire", id: e.id }, "sm danger")]);
        return `<h1>Personnel Management</h1><p class="sub">Understaffing and poor training raise wear and failure probability, slow maintenance, and tire your people. Salaries are paid daily (monthly amount / 30).</p>
<div class="grid g4">${kpi("Employees", String(s.staff.length), "")}${kpi("Monthly payroll", usdM(m.monthly), "")}${kpi("Coverage", pct(m.ratio), "of minimum crew", m.ratio < 0.8 ? "warn" : "good")}${kpi("Operator quality", pct(m.quality), "skill, certification, fatigue")}</div>
<div class="grid g12" style="margin-top:12px"><div class="panel"><h2>Crew coverage</h2>${table(["Role", "Have / need", "", ""], cov)}</div><div class="panel"><h2>Roster</h2><div style="max-height:520px;overflow:auto">${table(["Name", "Role", "Exp", "Salary/mo", "Shift", "Training", "Performance", "Fatigue", "Cert", ""], roster)}</div></div></div>`;
    } };
export const research = { id: "research", title: "Research & Development", icon: "13",
    render(s) {
        const r = s.research;
        return `<h1>Research & Development</h1><p class="sub">Research takes time and money (charged daily) and gives lasting advantages. One project at a time.</p>
<div class="panel">${r.current ? `<h2>In progress: ${esc(TECHS.find((t) => t.id === r.current).name)}</h2>${bar(r.progressDays, TECHS.find((t) => t.id === r.current).days, "info", `${f1(r.progressDays)} / ${TECHS.find((t) => t.id === r.current).days} days`)}<p class="notes">Costs ${usd(r.budgetPerDay)} per day.</p>` : "<h2>No project running</h2>"}</div>
<div class="panel" style="margin-top:12px">${table(["Technology", "Category", "Effect", "Cost", "Time", ""], TECHS.map((t) => [esc(t.name), t.category, esc(t.text), `<span class="n">${usdM(t.cost)}</span>`, `${t.days} d`, r.done.includes(t.id) ? '<span class="tag ok">done</span>' : btn(r.current === t.id ? "Running" : "Start", { type: "startResearch", id: t.id }, "sm pri", r.current ? "disabled" : "")]))}</div>`;
    } };
export const upgrades = { id: "upgrades", title: "Technology Upgrades", icon: "16",
    render(s) {
        return `<h1>Technology Upgrades</h1><p class="sub">Buy hardware that improves the plant at once. Research (previous page) unlocks software and know-how.</p>
<div class="panel">${table(["Upgrade", "Effect", "Cost", ""], UPGRADES.map((u) => [esc(u.name), esc(u.text), `<span class="n">${usdM(u.cost)}</span>`, s.upgrades.includes(u.id) ? '<span class="tag ok">installed</span>' : btn("Buy", { type: "buyUpgrade", id: u.id }, "sm pri")]))}</div>
<div class="panel" style="margin-top:12px"><h2>Active bonuses</h2><p class="notes">Efficiency +${(bonus(s, "eta") * 100).toFixed(1)} pts | Output +${(bonus(s, "cap") * 100).toFixed(0)} % | Cooling +${(bonus(s, "cooling") * 100).toFixed(0)} % | Export +${(bonus(s, "export") * 100).toFixed(0)} % | Wear ${(bonus(s, "degrade") * 100).toFixed(0)} % | Failures ${(bonus(s, "hazard") * 100).toFixed(0)} % | Costs ${(bonus(s, "costs") * 100).toFixed(0)} %</p></div>`;
    } };
export const safety = { id: "safety", title: "Safety & Emergency Center", icon: "14",
    render(s) {
        const sf = s.safety, open = s.events.filter((e) => !e.resolved);
        const decisions = open.filter((e) => e.options?.length).map((e) => `<div class="panel warn" style="margin-bottom:8px"><b class="${sevClass(e.sev)}">${esc(e.title)}</b><p>${esc(e.text)}</p><p class="notes">Decide before ${fmtTime(e.endT)} or the last option is chosen for you.</p><div class="row">${e.options.map((o) => btn(o.label, { type: "resolveEvent", id: e.id, option: o.id }, "sm") + `<span class="notes">${esc(o.hint)}</span>`).join("")}</div></div>`).join("");
        const running = open.filter((e) => !e.options?.length && s.t < e.endT);
        return `<h1>Safety & Emergency Center</h1><p class="sub">Fictionalised, high-level game mechanics: scores, inspections and decisions. This is not a real emergency procedure.</p>
<div class="grid g4">${kpi("Compliance", f0(sf.compliance) + " %", "regulator rating", sf.compliance < 50 ? "bad" : "good")}${kpi("Safety culture", f0(sf.safetyScore) + " %", "", sf.safetyScore < 60 ? "warn" : "good")}${kpi("Licence", sf.licenceOk ? "VALID" : "SUSPENDED", `fines to date ${usd(sf.fines)}`, sf.licenceOk ? "good" : "bad")}${kpi("Backup power", sf.backupPowerReady ? "READY" : "NOT READY", "emergency diesel", sf.backupPowerReady ? "good" : "bad")}</div>
<div class="panel" style="margin-top:12px"><h2>Decisions waiting</h2>${decisions || "<p class='notes'>No decisions waiting.</p>"}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Active situations</h2>${running.map((e) => `<div class="${sevClass(e.sev)}">${esc(e.title)}: ${esc(e.text)}</div>`).join("") || "<p class='notes'>Nothing active.</p>"}<h3>Training</h3>${btn("Emergency drill (25k)", { type: "drill" }, "sm")}<p class="notes">Raises safety culture. Next inspection: ${fmtTime(sf.nextInspectionT)}.</p></div>
<div class="panel"><h2>Incident history</h2><div class="logbox">${sf.incidents.slice(-20).reverse().map((i) => `<div class="${sevClass(i.sev)}"><time>${fmtTime(i.t)}</time>${esc(i.text)}</div>`).join("") || "<div>No incidents.</div>"}</div></div></div>`;
    } };
export const reports = { id: "reports", title: "Reports & Analytics", icon: "15",
    render(s) {
        const kinds = [["hourly", "Hourly generation"], ["daily", "Daily summary"], ["monthly", "Monthly production"], ["sales", "Electricity sales"], ["customers", "Industrial customers"], ["equipment", "Equipment performance"], ["incidents", "Incident history"], ["financial", "Financial statement"]];
        const rep = buildReport(s, ui.reportKind);
        return `<h1>Reports & Analytics</h1><p class="sub">Pick a report; export it as CSV for a spreadsheet.</p>
<div class="row">${kinds.map(([k, l]) => btn(l, { type: "setTab", key: "report", value: k }, "sm " + (ui.reportKind === k ? "pri" : ""), `data-tab="report:${k}"`)).join("")}<span class="sp"></span>${btn("Download CSV", { type: "csv", what: "report" }, "sm pri")}</div>
<div class="panel" style="margin-top:12px"><h2>${kinds.find((k) => k[0] === ui.reportKind)[1]}</h2><div style="max-height:560px;overflow:auto">${table(rep.head, rep.rows.slice(-200).map((r) => r.map((c) => String(c))))}</div></div>`;
    } };
export function buildReport(s, kind) {
    const d = (t) => Math.floor(t / 1440) + 1;
    switch (kind) {
        case "hourly": return { head: ["Time", "Gross MW", "Net MW", "Demand MW", "Contract MW", "Spot MW", "Price $/MWh", "Coolant C", "Reactor %"], rows: s.hourly.map((h) => [fmtTime(h.t), +h.grossMW.toFixed(1), +h.netMW.toFixed(1), +h.demandMW.toFixed(1), +h.contractMW.toFixed(1), +h.spotMW.toFixed(1), +h.price.toFixed(2), +h.tCool.toFixed(1), +(h.powerFrac * 100).toFixed(1)]) };
        case "daily": {
            const m = new Map();
            for (const h of s.hourly) {
                const k = d(h.t), a = m.get(k) ?? { n: 0, mwh: 0, p: 0, max: 0 };
                a.n++;
                a.mwh += Math.max(0, h.netMW);
                a.p += h.price;
                a.max = Math.max(a.max, h.netMW);
                m.set(k, a);
            }
            return { head: ["Day", "Net energy MWh", "Avg price", "Peak MW"], rows: [...m].map(([k, a]) => [k, +a.mwh.toFixed(0), +(a.p / a.n).toFixed(2), +a.max.toFixed(1)]) };
        }
        case "monthly": {
            const m = new Map();
            for (const h of s.hourly) {
                const k = Math.floor((d(h.t) - 1) / 30) + 1;
                m.set(k, (m.get(k) ?? 0) + Math.max(0, h.netMW));
            }
            return { head: ["Month", "Net energy MWh"], rows: [...m].map(([k, v]) => [k, +v.toFixed(0)]) };
        }
        case "sales": return { head: ["Metric", "Value"], rows: [["Contract energy MWh", +s.stats.contractMWh.toFixed(0)], ["Spot energy MWh", +s.stats.spotMWh.toFixed(0)], ["Bought MWh", +s.stats.boughtMWh.toFixed(0)], ["Unserved MWh", +s.stats.unservedMWh.toFixed(0)], ["Contract revenue", Math.round(s.finance.totals.contracts ?? 0)], ["Spot revenue", Math.round(s.finance.totals.spot ?? 0)], ["Penalties", Math.round(s.finance.totals.penalties ?? 0)]] };
        case "customers": return { head: ["Customer", "Industry", "Contract MW", "Price", "Total MWh", "Total revenue", "Late payments", "Active"], rows: s.contracts.map((c) => { const u = s.customers.find((x) => x.id === c.customerId); return [u.name, u.industry, c.capacityMW, c.price, +c.totalMWh.toFixed(0), Math.round(c.totalRevenue), c.lateCount, c.active ? "yes" : "no"]; }) };
        case "equipment": return { head: ["ID", "Name", "Condition %", "Status", "Failure %/day", "Stress"], rows: s.equipment.map((e) => [e.id, e.name, +e.condition.toFixed(1), e.status, +(e.failureProb * 100).toFixed(3), +e.stress.toFixed(2)]) };
        case "incidents": return { head: ["Time", "Severity", "Incident"], rows: s.safety.incidents.map((i) => [fmtTime(i.t), i.sev, i.text]) };
        default: return { head: ["Category", "Today", "This month", "This year", "All time"], rows: [...new Set([...Object.keys(s.finance.totals)])].sort().map((k) => [k, Math.round(s.finance.day[k] ?? 0), Math.round(s.finance.month[k] ?? 0), Math.round(s.finance.year[k] ?? 0), Math.round(s.finance.totals[k] ?? 0)]) };
    }
}
export { act, led, f2, toCsv, tip };
