import { EXPORT_CAP, GEN_NAMEPLATE, LIMITS, PNOM, ROLE_LABEL } from "../../simulation/constants.js";
import { summary } from "../../simulation/engine.js";
import { reactivityBreakdown, netReactivity } from "../../simulation/reactorModel.js";
import type { Equipment, GameState } from "../../simulation/types.js";
import { fmtTime, hourOfDay, sumExpense, sumIncome } from "../../simulation/util.js";
import { drawLines } from "../charts.js";
import { $, act, bar, btn, esc, f0, f1, f2, gauge, kpi, led, pct, sevClass, table, tip, usd, usdM } from "../dom.js";
import { hoursLabels, hourly, type Page } from "../page.js";
import { ui } from "../state.js";

const logHtml = (s: GameState, n = 12, cats?: string[]) => `<div class="logbox">${s.log.filter((l) => !cats || cats.includes(l.cat)).slice(-n).reverse().map((l) => `<div class="${sevClass(l.sev)}"><time>${fmtTime(l.t)}</time>${esc(l.msg)}</div>`).join("") || "<div>Nothing yet.</div>"}</div>`;
const live = (s: GameState) => ({ alarms: Object.values(s.alarms) });
const chart = (id: string, h = 170) => `<canvas class="chart" data-chart="${id}" style="height:${h}px"></canvas>`;
function drawCharts(root: HTMLElement, s: GameState) {
  const n = 48, H = hourly(s, n), L = hoursLabels(s, n);
  const put = (id: string, series: Parameters<typeof drawLines>[1], o: Parameters<typeof drawLines>[2] = {}) => { const c = root.querySelector<HTMLCanvasElement>(`canvas[data-chart="${id}"]`); if (c) drawLines(c, series, { labels: L, ...o }); };
  put("power", [{ name: "net MW", data: H.map((h) => h.netMW), color: "#3fd0a0", fill: true }, { name: "contracted MW", data: H.map((h) => h.contractMW), color: "#4aa8ff" }, { name: "spot MW", data: H.map((h) => h.spotMW), color: "#f0b43c" }]);
  put("price", [{ name: "spot $/MWh", data: H.map((h) => h.price), color: "#f0b43c", fill: true }]);
  put("temps", [{ name: "coolant C", data: H.map((h) => h.tCool), color: "#ff8a52" }]);
  put("rpower", [{ name: "reactor power %", data: H.map((h) => h.powerFrac * 100), color: "#2fe0c4", fill: true }], { min: 0, max: 110 });
  put("demand", [{ name: "customer demand MW", data: H.map((h) => h.demandMW), color: "#4aa8ff" }, { name: "net generation MW", data: H.map((h) => h.netMW), color: "#3fd0a0" }]);
}

export const overview: Page = { id: "overview", title: "Overview Dashboard", icon: "01",
  render(s) {
    const q = summary(s), g = s.grid, r = s.reactor, m = s.market, net = q.revenuePrev - q.expensesPrev;
    const objs = s.objectives.map((o) => `<div class="row"><span class="tag ${o.done ? "ok" : o.failed ? "bad" : ""}">${o.done ? "done" : o.failed ? "failed" : "open"}</span>${esc(o.text)}</div>`).join("");
    return `<h1>${esc(s.settings.companyName)}: Overview</h1><p class="sub">Your plant at a glance. Everything here is read live from the simulation: change something in another room and these numbers move.</p>
<div class="grid g5">${kpi("Cash", usdM(s.finance.cash), `Debt ${usdM(s.finance.debt)}`, s.finance.cash < 3e6 ? "bad" : "")}${kpi("Net output", f0(g.netMW) + " MW", `Gross ${f0(g.grossMW)} / aux ${f0(g.auxMW)}`)}${kpi("Reactor power", pct(r.n), r.scram ? "SCRAM" : `Coolant ${f0(r.tCool)} C`, r.scram ? "bad" : "good")}${kpi("Spot price", "$" + f1(m.spotPrice), "per MWh")}${kpi("Last day profit", usdM(net), `${usdM(q.revenuePrev)} in, ${usdM(q.expensesPrev)} out`, net < 0 ? "bad" : "good")}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Power: generation and sales (48 h)</h2>${chart("power")}</div><div class="panel"><h2>Spot price (48 h)</h2>${chart("price")}</div></div>
<div class="grid g3" style="margin-top:12px"><div class="panel"><h2>Where the electricity goes</h2>${table(["Use", "MW"], [["Gross generation", f1(g.grossMW)], ["Plant's own use (aux)", f1(g.auxMW)], ["Transmission losses", f1(g.lossMW)], ["Contract customers", f1(g.contractedMW)], ["Sold on spot market", f1(g.spotMW)], ["Reserve / unsold", f1(g.reserveMW)]], "")}<p class="notes">Unserved demand: ${f1(g.unservedMW)} MW</p></div>
<div class="panel"><h2>Objectives</h2>${objs || "None"}<h3>Customers</h3><p class="notes">${s.contracts.filter((c) => c.active).length} active contracts, reputation ${f0(s.finance.reputation)}/100</p></div>
<div class="panel"><h2>Active alarms (${live(s).alarms.length})</h2>${live(s).alarms.slice(0, 6).map((a) => `<div class="${sevClass(a.sev)}">${a.acked ? "" : "● "}${esc(a.text)}</div>`).join("") || '<span class="s-info">All clear.</span>'}</div></div>
<div class="panel" style="margin-top:12px"><h2>Recent events</h2>${logHtml(s, 10)}</div>`;
  }, mount: drawCharts };

// ---------------------------------------------------------------------------------------------- facility map
interface Bld { id: string; name: string; x: number; y: number; w: number; h: number; eq: string[]; roles: string[]; desc: string }
export const BUILDINGS: Bld[] = [
  { id: "reactor", name: "Reactor Building", x: 330, y: 190, w: 150, h: 130, eq: ["RCP-A", "RCP-B", "RCP-C", "CRD", "SG-1"], roles: ["operator", "engineer", "safety"], desc: "The reactor and primary coolant loop. Fission heat is made here and carried to the steam generator." },
  { id: "turbine", name: "Turbine Hall", x: 520, y: 200, w: 150, h: 70, eq: ["TUR-1"], roles: ["operator", "mechanic"], desc: "Steam spins the turbine. Efficiency depends on steam heat and on how cold the condenser is." },
  { id: "generator", name: "Generator Building", x: 520, y: 290, w: 150, h: 60, eq: ["GEN-1"], roles: ["electrician", "operator"], desc: "Turns shaft power into electricity (about 98.5 % efficient)." },
  { id: "cooling", name: "Cooling Towers", x: 130, y: 120, w: 150, h: 110, eq: ["CT-1", "CT-2"], roles: ["mechanic", "operator"], desc: "Reject waste heat to the air. Fan speed trades electricity for cooling." },
  { id: "water", name: "Water Treatment", x: 130, y: 260, w: 140, h: 70, eq: ["WTP-1"], roles: ["maintenance", "engineer"], desc: "Cleans and supplies cooling water." },
  { id: "control", name: "Control Room", x: 330, y: 360, w: 150, h: 70, eq: ["INST"], roles: ["operator", "engineer", "manager"], desc: "Where operators monitor and control everything." },
  { id: "transformer", name: "Transformer Yard", x: 720, y: 290, w: 120, h: 70, eq: ["TRF-1"], roles: ["electrician"], desc: "Steps the voltage up for long-distance transmission." },
  { id: "substation", name: "Electrical Substation", x: 720, y: 200, w: 120, h: 70, eq: ["SUB-1"], roles: ["electrician", "operator"], desc: "Switching gear connecting the plant to the grid. Capacity limits how much you can export." },
  { id: "backup", name: "Emergency Backup", x: 130, y: 360, w: 140, h: 70, eq: ["EDG-1"], roles: ["safety", "electrician"], desc: "Backup diesel power for safety systems. Keep it healthy for inspections." },
  { id: "fuel", name: "Fuel Storage", x: 330, y: 70, w: 150, h: 70, eq: [], roles: ["safety", "security"], desc: "Stored fuel assemblies. Fuel burn-up is tracked in the Reactor Room." },
  { id: "admin", name: "Administration", x: 520, y: 380, w: 130, h: 60, eq: [], roles: ["manager", "finance"], desc: "Management, accounting and sales." },
  { id: "security", name: "Security Checkpoint", x: 40, y: 450, w: 110, h: 50, eq: [], roles: ["security"], desc: "Controls access to the site." },
  { id: "workshop", name: "Maintenance Workshop", x: 330, y: 470, w: 150, h: 60, eq: [], roles: ["mechanic", "electrician", "maintenance"], desc: "Technicians repair equipment here. Number of staff limits parallel jobs." },
  { id: "warehouse", name: "Warehouse", x: 520, y: 470, w: 130, h: 60, eq: [], roles: ["maintenance"], desc: "Spare parts inventory." },
  { id: "gridlink", name: "Grid Connection", x: 880, y: 250, w: 90, h: 90, eq: [], roles: [], desc: "Your connection to the regional grid." },
];
function bStatus(s: GameState, b: Bld): "ok" | "warn" | "bad" | "off" {
  const es = b.eq.map((id) => s.equipment.find((e) => e.id === id)!);
  if (es.some((e) => e.status === "failed")) return "bad";
  if (b.id === "reactor") return s.reactor.scram ? "bad" : s.reactor.n < 0.01 ? "off" : es.some((e) => e.status === "degraded" || e.status === "maintenance") ? "warn" : "ok";
  if (b.id === "turbine" || b.id === "generator") return !s.turbine.online ? (s.turbine.tripped ? "bad" : "off") : es.some((e) => e.status === "degraded") ? "warn" : "ok";
  if (b.id === "cooling") return s.cooling.condenserTemp > 45 ? "warn" : s.cooling.fans < 0.05 ? "off" : "ok";
  if (b.id === "gridlink") return !s.grid.connectionOk ? "bad" : !s.grid.breakerClosed ? "off" : s.grid.frequency < 49.7 ? "warn" : "ok";
  if (b.id === "backup") return s.safety.backupPowerReady ? "ok" : "warn";
  if (b.id === "workshop") return s.equipment.some((e) => e.status === "maintenance") ? "warn" : "ok";
  if (es.some((e) => e.status === "maintenance" || e.status === "degraded")) return "warn";
  return "ok";
}
const shiftNow = (s: GameState) => Math.floor(hourOfDay(s.t) / 8);
function equipRow(e: Equipment, s: GameState): string[] { return [`${esc(e.id)} ${esc(e.name)}`, bar(e.condition, 100, e.condition < 35 ? "bad" : e.condition < 60 ? "warn" : "", f0(e.condition) + " %"), `<span class="tag ${e.status === "ok" ? "ok" : e.status === "failed" ? "bad" : "warn"}">${e.status}</span>`, (e.failureProb * 100).toFixed(2) + " %/day"]; }

export const map: Page = { id: "map", title: "Facility Map", icon: "02",
  render(s) {
    const sel = BUILDINGS.find((b) => b.id === ui.mapSel) ?? BUILDINGS[0];
    const exporting = s.grid.contractedMW + s.grid.spotMW > 1;
    const bl = BUILDINGS.map((b) => {
      const st = bStatus(s, b);
      let deco = "";
      if (b.id === "cooling") deco = [0, 1].map((i) => `<g transform="translate(${b.x + 38 + i * 74} ${b.y + 62})"><circle r="22" fill="#0a1216" stroke="#3a5262"/><g class="${s.cooling.fans > 0.05 ? "spin" : ""}" style="animation-duration:${(1.6 - s.cooling.fans).toFixed(2)}s"><path d="M0 0 L0 -17 M0 0 L15 8 M0 0 L-15 8" stroke="#8fd7e6" stroke-width="4" stroke-linecap="round"/></g></g>`).join("");
      if (b.id === "turbine") deco = `<g transform="translate(${b.x + 75} ${b.y + 46})"><g class="${s.turbine.online ? "spin" : ""}" style="animation-duration:.5s"><circle r="14" fill="none" stroke="#f0b43c" stroke-width="3" stroke-dasharray="6 5"/></g></g>`;
      if (b.id === "reactor") deco = `<circle cx="${b.x + 75}" cy="${b.y + 78}" r="${14 + s.reactor.n * 16}" fill="${s.reactor.scram ? "#ff5a52" : "#2fe0c4"}" opacity="${0.25 + s.reactor.n * 0.5}" class="${s.reactor.n > 0.05 ? "glow" : ""}"/>`;
      if (b.id === "gridlink") deco = `<path d="M${b.x + 20} ${b.y + 70} L${b.x + 45} ${b.y + 18} L${b.x + 70} ${b.y + 70} M${b.x + 28} ${b.y + 52} H${b.x + 62}" stroke="#cfe0e8" fill="none" stroke-width="3"/>`;
      return `<g class="bld ${st} ${b.id === sel.id ? "sel" : ""}" data-bld="${b.id}"><rect class="b" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6"/>${deco}<text x="${b.x + 8}" y="${b.y + 15}">${esc(b.name)}</text><circle cx="${b.x + b.w - 11}" cy="${b.y + 11}" r="5" fill="${st === "ok" ? "#3fd0a0" : st === "warn" ? "#f0b43c" : st === "bad" ? "#ff5a52" : "#3a444b"}"/></g>`;
    }).join("");
    const link = (x1: number, y1: number, x2: number, y2: number, on: boolean, dir = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? "#2fe0c4" : "#2b3942"}" stroke-width="3" ${on ? `stroke-dasharray="10 8" style="animation:dash ${dir > 0 ? 1 : 1}s linear infinite"` : ""}/>`;
    const lines = link(480, 255, 520, 235, s.reactor.heatRemoved > 10) + link(595, 270, 595, 290, s.turbine.online) + link(670, 320, 720, 320, s.turbine.online) + link(780, 290, 780, 270, exporting) + link(840, 235, 880, 280, exporting && s.grid.breakerClosed) + link(480, 220, 280, 175, s.cooling.fans > 0.05) + link(200, 260, 200, 230, s.cooling.waterUseM3h > 10) + link(405, 360, 405, 320, true);
    const st = bStatus(s, sel);
    const staff = s.staff.filter((e) => sel.roles.includes(e.role) && e.shift === shiftNow(s));
    const es = sel.eq.map((id) => s.equipment.find((e) => e.id === id)!);
    const power = sel.id === "reactor" ? s.reactor.pumps.reduce((a, p) => a + (p.on ? 6 * p.speed ** 3 : 0), 0) : sel.id === "cooling" ? 5 * s.cooling.fans ** 3 : sel.id === "control" ? 4 : sel.id === "turbine" ? 0.012 * s.turbine.grossMW : sel.id === "gridlink" ? s.grid.lossMW : 1.5;
    const alerts = Object.values(s.alarms).filter((a) => new RegExp({ reactor: "coolant|pressure|flow|scram|protect|fuel", turbine: "turbine|vibration", generator: "turbine|generator", cooling: "condenser|cooling|tower", gridlink: "grid|frequency|breaker|connection", backup: "backup", water: "water", control: "INST|cyber|decision" }[sel.id] ?? "^$", "i").test(a.text));
    const hist = es.flatMap((e) => e.history.slice(-3).map((h) => `${e.id}: ${h.what} (${fmtTime(h.t)})`)).slice(-6);
    return `<h1>Facility Map</h1><p class="sub">Click any building. Colours and animations show the real state: green = running, amber = degraded or in maintenance, red = failed or tripped, dark = offline. Moving dashes show energy actually flowing.</p>
<style>@keyframes dash{to{stroke-dashoffset:-36}}</style><div class="grid g21"><div><svg class="map" viewBox="0 0 1000 560"><defs><pattern id="gr" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#12202a" stroke-width="1"/></pattern></defs><rect width="1000" height="560" fill="url(#gr)"/>${lines}${bl}</svg></div>
<div class="panel"><h2>${esc(sel.name)} <span class="tag ${st === "ok" ? "ok" : st === "bad" ? "bad" : "warn"}">${st}</span></h2><p class="notes">${esc(sel.desc)}</p>
${es.length ? table(["Equipment", "Condition", "Status", "Failure risk"], es.map((e) => equipRow(e, s))) : '<p class="notes">No monitored equipment.</p>'}
<h3>Personnel on this shift (${staff.length})</h3><p class="notes">${staff.slice(0, 6).map((e) => `${esc(e.name)} (${ROLE_LABEL[e.role]})`).join(", ") || "Nobody assigned to this shift."}</p>
<h3>Electricity use</h3><p class="notes">${f1(power)} MW now</p><h3>Maintenance</h3><p class="notes">${es.filter((e) => e.condition < 60).map((e) => `${e.id} at ${f0(e.condition)} %: schedule maintenance`).join("; ") || "Nothing urgent."}</p>
<h3>Alerts</h3>${alerts.map((a) => `<div class="${sevClass(a.sev)}">${esc(a.text)}</div>`).join("") || '<p class="notes">None.</p>'}<h3>History</h3><p class="notes">${hist.map(esc).join("<br>") || "No events recorded."}</p></div></div>`;
  } };

// ---------------------------------------------------------------------------------------------- reactor room
export const reactor: Page = { id: "reactor", title: "Reactor Room", icon: "03",
  render(s) {
    const r = s.reactor, b = reactivityBreakdown(s), net = netReactivity(s);
    const w = (v: number, label: string) => `<div class="row"><span style="width:150px">${label}</span>${bar(Math.abs(v), 2500, v < 0 ? "bad" : "", (v > 0 ? "+" : "") + f0(v) + " pcm")}</div>`;
    return `<h1>Reactor Room</h1><p class="sub">A simplified, fictional model for learning. The reactor makes heat; coolant carries it away; temperature and poisons push back on the chain reaction. Limits shown are game limits, not real ones.</p>
<div class="grid g5"><div class="panel">${gauge(r.n * 100, 0, 125, "Reactor power", "%", 105, 120)}</div><div class="panel">${gauge(r.tCool, 200, 350, "Coolant temp", "C", LIMITS.tCoolHigh, LIMITS.tCoolTrip - 3)}</div><div class="panel">${gauge(r.pressure, 100, 190, "Pressure", "bar", LIMITS.pressureHigh, LIMITS.pressureTrip - 4)}</div><div class="panel">${gauge(r.flowFrac * 100, 0, 130, "Coolant flow", "%")}</div><div class="panel">${gauge(r.burnup * 100, 0, 100, "Fuel burn-up", "%", 85, 98)}</div></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Control rods</h2><div class="row"><b>${led(r.scram ? false : r.autoRods, r.autoRods ? "AUTO: follows turbine set point" : "MANUAL")}</b><span class="sp"></span>${btn(r.autoRods ? "Switch to manual" : "Switch to auto", { type: "setAutoRods", on: !r.autoRods }, "sm")}</div>
<p class="notes">Withdrawn ${pct(r.rod)} (target ${pct(r.rodTarget)}). Rods move slowly: ${tip("why?", "Real rods move at a limited speed. Plan ahead: power responds a few minutes after you move them.")}</p>
<input type="range" min="0" max="100" value="${Math.round(r.rodTarget * 100)}" data-ain='{"type":"setRod"}' data-key="value" data-scale="0.01" ${r.scram ? "disabled" : ""}>
<div class="row" style="margin-top:8px">${btn("SCRAM (emergency shutdown)", { type: "scram" }, "danger")}${btn("Reset SCRAM", { type: "resetScram" }, "", r.scram ? "" : "disabled")}${btn(r.protection ? "Bypass protection" : "Re-arm protection", { type: "setProtection", on: !r.protection }, "sm")}</div>
<p class="notes">Protection ${r.protection ? "armed" : "BYPASSED"} ${r.scram ? ` | SCRAM: ${esc(r.scramReason)}` : ""} ${r.outageLeftMin > 0 ? `| Outage ${f0(r.outageLeftMin / 1440)} days left` : ""}</p></div>
<div class="panel"><h2>Coolant pumps</h2>${table(["Pump", "State", "Speed", "Flow"], r.pumps.map((p) => [p.id, btn(p.on ? "Stop" : "Start", { type: "setPump", id: p.id, on: !p.on }, p.on ? "sm danger" : "sm pri"), `<input type="range" min="20" max="100" value="${Math.round(p.speed * 100)}" data-ain='{"type":"setPump","id":"${p.id}"}' data-key="speed" data-scale="0.01" style="width:110px"> ${f0(p.speed * 100)}%`, `<span class="n">${f1(p.flow * 100)} %</span>`]))}<p class="notes">All three pumps are needed for full power. Pumps use electricity (grows with speed cubed).</p></div></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Why is power what it is? (reactivity, pcm)</h2><p class="notes">The chain reaction settles where the total is zero. Rods add reactivity; temperature, xenon poison and burn-up take it away.</p>${w(b.rod, "Control rods")}${w(b.fuelTemp, "Fuel temperature")}${w(b.coolantTemp, "Coolant temperature")}${w(b.xenon, "Xenon poison")}${w(b.burnup, "Fuel burn-up")}<p class="notes">Net now: <b>${f0(net)} pcm</b> (about 0 when steady).</p></div>
<div class="panel"><h2>Heat balance</h2>${table(["Quantity", "Value"], [["Fission power", f0(r.n * PNOM * 0.935) + " MWt"], ["Decay heat", f0(r.decayHeat) + " MWt"], ["Heat removed", f0(r.heatRemoved) + " MWt"], ["Fuel temperature", f0(r.tFuel) + " C"], ["Xenon poison", f2(r.xenon)], ["Containment", f0(r.containment) + " %"]])}${btn("Refuelling outage (9M, 8 days)", { type: "refuel" }, "sm", "")}<p class="notes">Refuelling needs the reactor shut down. After a SCRAM, xenon builds up for hours and can make restarting hard.</p></div></div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Reactor power (48 h)</h2>${chart("rpower")}</div><div class="panel"><h2>Coolant temperature (48 h)</h2>${chart("temps")}</div></div>
<div class="panel" style="margin-top:12px"><h2>Reactor log</h2>${logHtml(s, 12, ["reactor", "alarm"])}</div>`;
  }, mount: drawCharts };

// ---------------------------------------------------------------------------------------------- control room
export const control: Page = { id: "control", title: "Control Room", icon: "04",
  render(s) {
    const al = Object.entries(s.alarms), r = s.reactor, t = s.turbine, g = s.grid;
    const ann = (label: string, on: boolean, lvl: "on" | "w" | "c" = "w") => `<div class="${on ? lvl : ""}">${label}</div>`;
    return `<h1>Control Room</h1><p class="sub">The plant on one wall. Everything here updates from the other rooms. Acknowledge alarms to silence them; the cause must still be fixed.</p>
<div class="grid g3"><div class="scr"><h2>Reactor</h2><div>Power <b>${pct(r.n)}</b> | Rods ${pct(r.rod)}</div><div>Coolant ${f1(r.tCool)} C | ${f0(r.pressure)} bar</div><div>Flow ${pct(r.flowFrac)} | Burn-up ${pct(r.burnup)}</div><div>${led(!r.scram, r.scram ? "SCRAMMED" : "CRITICAL / STABLE")}</div></div>
<div class="scr"><h2>Turbine & generator</h2><div>Set point ${f0(t.setpointMW)} MW | Gross ${f1(t.grossMW)} MW</div><div>Efficiency ${pct(t.efficiency, 1)} | ${f0(t.rpm)} rpm</div><div>Vibration ${f1(t.vibration)} mm/s</div><div>${led(t.online, t.online ? "ON LINE" : t.tripped ? "TRIPPED" : "OFF LINE")}</div></div>
<div class="scr"><h2>Cooling</h2><div>Fans ${pct(s.cooling.fans)} | Basin ${f1(s.cooling.basinTemp)} C</div><div>Condenser ${f1(s.cooling.condenserTemp)} C</div><div>Water ${f0(s.cooling.waterUseM3h)} m3/h</div><div>${led(s.cooling.condenserTemp < 45 ? true : "warn", "HEAT SINK")}</div></div>
<div class="scr"><h2>Grid</h2><div>Net ${f1(g.netMW)} MW | Losses ${f1(g.lossMW)} MW</div><div>Frequency ${f2(g.frequency)} Hz</div><div>Export cap ${f0(g.exportCapMW)} MW</div><div>${led(g.breakerClosed && g.connectionOk, g.breakerClosed ? "BREAKER CLOSED" : "BREAKER OPEN")}</div></div>
<div class="scr"><h2>Money</h2><div>Cash ${usdM(s.finance.cash)}</div><div>Spot ${usd(s.market.spotPrice)}/MWh</div><div>Today ${usdM(sumIncome(s.finance.day))} in / ${usdM(sumExpense(s.finance.day))} out</div><div>Reputation ${f0(s.finance.reputation)}</div></div>
<div class="scr"><h2>Demand</h2><div>Customer demand ${f1(g.demandMW)} MW</div><div>Delivered ${f1(g.contractedMW)} MW</div><div>Unserved ${f1(g.unservedMW)} MW</div><div>${led(g.unservedMW < 0.1, "SUPPLY OBLIGATIONS")}</div></div></div>
<div class="grid g12" style="margin-top:12px"><div class="panel"><h2>Annunciator</h2><div class="ann">${ann("SCRAM", r.scram, "c")}${ann("HI TEMP", r.tCool > LIMITS.tCoolHigh)}${ann("HI PRESS", r.pressure > LIMITS.pressureHigh)}${ann("LO FLOW", r.flowFrac < 0.6 && r.n > 0.3, "c")}${ann("TURB TRIP", t.tripped, "c")}${ann("VIBRATION", t.vibration > 6)}${ann("COND TEMP", s.cooling.condenserTemp > 45)}${ann("GRID FREQ", g.frequency < 49.7)}${ann("BREAKER", !g.breakerClosed)}${ann("NO BACKUP", !s.safety.backupPowerReady, "c")}${ann("PROT BYPASS", !r.protection, "c")}${ann("UNDERSTAFF", (s.flags.staffRatio ?? 1) < 0.8)}</div>
<h3>Alarms (${al.length})</h3>${btn("Acknowledge all", { type: "ackAll" }, "sm")}<div class="logbox" style="margin-top:6px;max-height:220px">${al.map(([k, a]) => `<div class="${sevClass(a.sev)}">${a.acked ? "" : "● "}${esc(a.text)} <button class="btn sm" ${act({ type: "ackAlarm", key: k })}>ack</button></div>`).join("") || "<div>No active alarms.</div>"}</div></div>
<div class="panel"><h2>Event log</h2>${logHtml(s, 40)}</div></div>`;
  } };

// ---------------------------------------------------------------------------------------------- turbine hall
export const turbine: Page = { id: "turbine", title: "Turbine Hall", icon: "05",
  render(s) {
    const t = s.turbine, g = s.grid, cap = GEN_NAMEPLATE;
    return `<h1>Turbine Hall</h1><p class="sub">Steam from the steam generator spins the turbine; the generator makes electricity. Set the output you want: with automatic rod control the reactor follows. Efficiency = electricity out / heat in.</p>
<div class="grid g4">${kpi("Gross output", f1(t.grossMW) + " MW", `of set point ${f0(t.setpointMW)}`)}${kpi("Efficiency", pct(t.efficiency, 1), "heat to electricity")}${kpi("Steam heat in", f0(t.steamMWt) + " MWt", "")}${kpi("Status", t.online ? "ON LINE" : t.tripped ? "TRIPPED" : "OFF LINE", `${f0(t.rpm)} rpm`, t.online ? "good" : "bad")}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Load set point</h2><p class="notes">${f0(t.setpointMW)} MW (max about ${f0(cap)} MW with your upgrades, less if the turbine is worn).</p><input type="range" min="0" max="${Math.round(cap * 1.1)}" value="${Math.round(t.setpointMW)}" data-ain='{"type":"setSetpoint"}' data-key="mw">
<div class="row" style="margin-top:8px">${btn("-20 MW", { type: "setSetpoint", mw: t.setpointMW - 20 }, "sm")}${btn("+20 MW", { type: "setSetpoint", mw: t.setpointMW + 20 }, "sm")}${btn("Trip turbine", { type: "tripTurbine" }, "danger sm")}${btn("Reset turbine", { type: "resetTurbine" }, "sm")}${btn(g.breakerClosed ? "Open breaker" : "Close breaker", { type: "setBreaker", closed: !g.breakerClosed }, "sm")}</div><p class="notes">More output means more wear (wear grows with load squared) and burns fuel faster. More generation does not automatically mean more profit: see the Electricity Market.</p></div>
<div class="panel"><h2>Instruments</h2><div class="grid g3"><div>${gauge(t.grossMW, 0, 460, "Gross power", "MW", 400, 440)}</div><div>${gauge(t.vibration, 0, 10, "Vibration", "mm/s", 6, 8.5)}</div><div>${gauge(t.efficiency * 100, 20, 40, "Efficiency", "%")}</div></div></div></div>
<div class="panel" style="margin-top:12px"><h2>How the turbine works</h2><p class="notes">Heat removed from the reactor = steam energy. Turbine converts about ${pct(t.efficiency, 0)} into shaft power; the rest is rejected in the condenser. Colder condenser water raises efficiency. Efficiency now: ${pct(t.efficiency, 2)} = base 33.5 % x condenser factor ${f2(s.cooling.condenserFactor)} x turbine condition factor.</p></div>`;
  } };

// ---------------------------------------------------------------------------------------------- cooling
export const cooling: Page = { id: "cooling", title: "Cooling Systems", icon: "06",
  render(s) {
    const c = s.cooling, t = s.turbine, rej = Math.max(0, s.reactor.heatRemoved - t.grossMW);
    return `<h1>Cooling Systems</h1><p class="sub">Waste heat must go somewhere. Cooling towers reject it to the air using water and fan power. Hot weather and worn towers make the condenser warmer and the turbine less efficient.</p>
<div class="grid g4">${kpi("Heat rejected", f0(rej) + " MWt", "")}${kpi("Condenser temp", f1(c.condenserTemp) + " C", `factor ${f2(c.condenserFactor)}`, c.condenserTemp > 45 ? "warn" : "")}${kpi("Basin temp", f1(c.basinTemp) + " C", `outside ${f1(s.weather.temp)} C, ${s.weather.kind}`)}${kpi("Water use", f0(c.waterUseM3h) + " m3/h", usd((c.waterUseM3h * 0.85)) + "/h")}</div>
<div class="grid g2" style="margin-top:12px"><div class="panel"><h2>Tower fans</h2><p class="notes">Speed ${pct(c.fans)}: more cooling costs electricity (fan power grows with speed cubed).</p><input type="range" min="0" max="100" value="${Math.round(c.fans * 100)}" data-ain='{"type":"setFans"}' data-key="value" data-scale="0.01"><div class="row" style="margin-top:8px">${btn(c.intakeOpen ? "Close water intake" : "Open water intake", { type: "setIntake", open: !c.intakeOpen }, c.intakeOpen ? "danger sm" : "pri sm")}</div><p class="notes">${led(c.intakeOpen, c.intakeOpen ? "Water intake open" : "Water intake CLOSED: cooling is severely reduced")}</p></div>
<div class="panel"><h2>Equipment</h2>${table(["Unit", "Condition", "Status", "Risk"], ["CT-1", "CT-2", "WTP-1"].map((id) => equipRow(s.equipment.find((e) => e.id === id)!, s)))}</div></div>
<div class="panel" style="margin-top:12px"><h2>How cooling works</h2><p class="notes">Basin temperature settles at outside wet-bulb temperature + heat rejected / (tower capacity). Condenser = basin + 6 C + load term. Every degree above 32 C costs about 0.6 % of turbine efficiency. Try raising the fans on a hot day and watch the efficiency and the aux load change.</p></div>`;
  } };
export { EXPORT_CAP, f2 };
