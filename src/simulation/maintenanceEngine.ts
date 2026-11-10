import { DIFFICULTY, MIN_STAFF, ROLE_LABEL, SALARY } from "./constants.js";
import { bonus } from "./powerGrid.js";
import { nextRandom, pick, randInt } from "./rng.js";
import type { Employee, Equipment, GameState, Role } from "./types.js";
import { MIN_PER_DAY, addLedger, clamp, day, eq, log, setAlarm } from "./util.js";

export const EQUIPMENT_TABLE: { id: string; name: string; building: string; maker: string; maint: number; replace: number; rate: number; installed: number }[] = [
  { id: "RCP-A", name: "Coolant pump A", building: "reactor", maker: "Halvorsen Pumpworks", maint: 40_000, replace: 900_000, rate: 0.16, installed: -700 },
  { id: "RCP-B", name: "Coolant pump B", building: "reactor", maker: "Halvorsen Pumpworks", maint: 40_000, replace: 900_000, rate: 0.16, installed: -700 },
  { id: "RCP-C", name: "Coolant pump C", building: "reactor", maker: "Halvorsen Pumpworks", maint: 40_000, replace: 900_000, rate: 0.14, installed: -420 },
  { id: "CRD", name: "Control rod drives", building: "reactor", maker: "Meridian Controls", maint: 60_000, replace: 1_400_000, rate: 0.10, installed: -900 },
  { id: "INST", name: "Instrumentation & protection system", building: "control", maker: "Meridian Controls", maint: 55_000, replace: 1_100_000, rate: 0.08, installed: -600 },
  { id: "SG-1", name: "Steam generator", building: "reactor", maker: "Brannock Heavy Industries", maint: 120_000, replace: 6_500_000, rate: 0.09, installed: -1500 },
  { id: "TUR-1", name: "Steam turbine", building: "turbine", maker: "Voss-Kline Turbines", maint: 150_000, replace: 8_000_000, rate: 0.14, installed: -1200 },
  { id: "GEN-1", name: "Main generator", building: "generator", maker: "Voss-Kline Turbines", maint: 110_000, replace: 5_200_000, rate: 0.12, installed: -1200 },
  { id: "CT-1", name: "Cooling tower 1", building: "cooling", maker: "Aquerra Cooling", maint: 70_000, replace: 2_400_000, rate: 0.13, installed: -800 },
  { id: "CT-2", name: "Cooling tower 2", building: "cooling", maker: "Aquerra Cooling", maint: 70_000, replace: 2_400_000, rate: 0.13, installed: -800 },
  { id: "WTP-1", name: "Water treatment plant", building: "water", maker: "Aquerra Cooling", maint: 45_000, replace: 1_600_000, rate: 0.12, installed: -650 },
  { id: "TRF-1", name: "Main step-up transformer", building: "transformer", maker: "Orlund Electric", maint: 90_000, replace: 3_800_000, rate: 0.09, installed: -1100 },
  { id: "SUB-1", name: "Substation switchgear", building: "substation", maker: "Orlund Electric", maint: 65_000, replace: 2_100_000, rate: 0.10, installed: -900 },
  { id: "EDG-1", name: "Emergency diesel generator", building: "backup", maker: "Kestrel Power Systems", maint: 30_000, replace: 700_000, rate: 0.05, installed: -500 },
];
export const KIND = {
  inspection: { hours: 3, costMul: 0.15, spares: 0, gain: 4, label: "Inspection" },
  repair: { hours: 20, costMul: 1, spares: 2, gain: 30, label: "Repair" },
  overhaul: { hours: 60, costMul: 2.2, spares: 5, gain: 65, label: "Overhaul" },
  replace: { hours: 96, costMul: 0, spares: 8, gain: 100, label: "Replacement" },
} as const;

export function makeEquipment(): Equipment[] {
  return EQUIPMENT_TABLE.map((e, i) => ({ id: e.id, name: e.name, building: e.building, maker: e.maker, installed: e.installed, condition: 78 + ((i * 7) % 18), status: "ok" as const,
    failureProb: 0, maintCost: e.maint, replaceCost: e.replace, history: [{ t: 0, what: "Commissioned" }], maintLeftMin: 0, maintTotalMin: 0, maintKind: "" as const, stress: 0 }));
}

export function equipmentStress(s: GameState, id: string): number {
  const r = s.reactor, t = s.turbine, g = s.grid, c = s.cooling;
  switch (id) {
    case "RCP-A": return r.pumps[0].on ? r.pumps[0].speed ** 2 : 0;
    case "RCP-B": return r.pumps[1].on ? r.pumps[1].speed ** 2 : 0;
    case "RCP-C": return r.pumps[2].on ? r.pumps[2].speed ** 2 : 0;
    case "CRD": return Math.abs(r.rodTarget - r.rod) * 20 + (r.scram ? 1 : 0.15);
    case "INST": return 0.4 + (Object.keys(s.alarms).length > 4 ? 0.3 : 0);
    case "SG-1": return clamp(r.heatRemoved / 1200, 0, 1.2) ** 2;
    case "TUR-1": return (t.grossMW / 420) ** 2 + t.vibration / 20;
    case "GEN-1": return (t.grossMW / 420) ** 2;
    case "CT-1": case "CT-2": return c.fans ** 2 * 0.8 + c.condenserTemp / 100;
    case "WTP-1": return clamp(c.waterUseM3h / 1500, 0.1, 1.2);
    case "TRF-1": return (Math.max(0, g.netMW) / 330) ** 2;
    case "SUB-1": return 0.3 + (Math.max(0, g.netMW) / 330) * 0.5;
    case "EDG-1": return 0.02;
  }
  return 0.3;
}

export function staffMetrics(s: GameState) {
  const count: Record<string, number> = {};
  for (const e of s.staff) count[e.role] = (count[e.role] ?? 0) + 1;
  const cov = (r: string) => clamp((count[r] ?? 0) / MIN_STAFF[r], 0, 1);
  const weights: Record<string, number> = { operator: 0.32, engineer: 0.12, electrician: 0.1, mechanic: 0.1, safety: 0.1, maintenance: 0.1, security: 0.06, finance: 0.04, manager: 0.06 };
  let ratio = 0; for (const r of Object.keys(weights)) ratio += weights[r] * cov(r);
  const ops = s.staff.filter((e) => e.role === "operator");
  const quality = ops.length ? ops.reduce((a, e) => a + e.perf * (e.cert ? 1 : 0.8) * (1 - 0.4 * e.fatigue), 0) / ops.length : 0.3;
  const techs = (count.electrician ?? 0) + (count.mechanic ?? 0) + (count.maintenance ?? 0);
  return { count, ratio, quality: clamp(quality, 0, 1.2), techs, maxJobs: Math.max(1, Math.round(techs / 3)), monthly: s.staff.reduce((a, e) => a + e.salary, 0) };
}

export function stepMaintenance(s: GameState, dt: number) {
  const diff = DIFFICULTY[s.settings.difficulty];
  const m = staffMetrics(s);
  s.flags.staffRatio = m.ratio;
  s.flags.staffQuality = m.quality;
  const delay = s.t < (s.flags.maintDelayUntil ?? 0) ? 1.6 : 1;
  const speedF = clamp(m.ratio * 0.6 + m.quality * 0.5, 0.3, 1.4) / delay;
  for (const e of s.equipment) {
    e.stress = equipmentStress(s, e.id);
    const row = EQUIPMENT_TABLE.find((x) => x.id === e.id)!;
    if (e.status === "maintenance") {
      e.maintLeftMin -= dt * speedF;
      if (e.maintLeftMin <= 0) finishMaintenance(s, e);
      continue;
    }
    if (e.status === "failed" || e.status === "offline") { e.failureProb = 0; continue; }
    // degradation: load stress x wear rate, reduced by technology, increased by poor staffing
    const wearFactor = (1 + bonus(s, "degrade")) * (1 + (1 - m.ratio) * 0.8);
    e.condition = clamp(e.condition - (row.rate * (0.15 + Math.pow(e.stress, 1.5)) * wearFactor * dt) / MIN_PER_DAY * 1.6, 0, 100);
    // failure probability per day grows quickly as condition falls
    const base = 0.0006 * (1 + Math.pow((100 - e.condition) / 22, 2));
    const crew = 1 + (1 - m.ratio) * 1.2 + (1 - clamp(m.quality, 0, 1)) * 0.5;
    e.failureProb = clamp(base * diff.hazard * crew * (1 + bonus(s, "hazard")) * (0.4 + e.stress), 0, 0.5);
    e.status = e.condition < 45 ? "degraded" : "ok";
    if (nextRandom(s) < e.failureProb * (dt / MIN_PER_DAY)) failEquipment(s, e);
  }
  setAlarm(s, "maint", s.equipment.some((e) => e.condition < 35 && e.status !== "failed" && e.status !== "maintenance"), "warning", "Equipment condition critical: schedule maintenance");
  setAlarm(s, "staff", m.ratio < 0.8, "notice", `Understaffed: coverage ${(m.ratio * 100).toFixed(0)} %`);
  // fatigue and shifts
  const overload = clamp(1 - m.ratio, 0, 1);
  for (const emp of s.staff) {
    emp.fatigue = clamp(emp.fatigue + (overload * 0.03 + 0.001 - 0.002) * (dt / 60) * 0.5, 0, 1);
    emp.perf = clamp(0.35 + emp.exp * 0.04 + emp.training * 0.25 - emp.fatigue * 0.3, 0.2, 1.2);
  }
}

export function failEquipment(s: GameState, e: Equipment) {
  e.status = "failed"; e.history.push({ t: s.t, what: "FAILED" });
  log(s, "alarm", "equipment", `${e.name} (${e.id}) has FAILED. Schedule a repair.`);
  s.safety.incidents.push({ t: s.t, text: `${e.name} failed`, sev: "warning" });
  s.eventHistory.push({ t: s.t, kind: "failure", title: `${e.name} failure`, sev: "alarm" });
  setAlarm(s, "fail-" + e.id, true, "alarm", `${e.name} FAILED`);
}

export function scheduleMaintenance(s: GameState, id: string, kind: keyof typeof KIND): string | null {
  const e = eq(s, id);
  if (!e) return "Unknown equipment";
  if (e.status === "maintenance") return "Already under maintenance";
  const k = KIND[kind];
  const m = staffMetrics(s);
  if (s.equipment.filter((x) => x.status === "maintenance").length >= m.maxJobs) return `Not enough technicians: only ${m.maxJobs} job(s) at a time. Hire electricians, mechanics or maintenance workers.`;
  if (e.status === "failed" && kind === "inspection") return "A failed unit needs a repair, overhaul or replacement";
  if (!s.flags.safeToMaintain && ["RCP-A", "RCP-B", "RCP-C"].includes(id) && s.reactor.pumps.filter((p) => p.flow > 0).length <= 1 && s.reactor.n > 0.05 && !e.status.includes("failed")) return "Keep at least two pumps running while the reactor is producing power";
  const cost = kind === "replace" ? e.replaceCost : e.maintCost * k.costMul;
  let extra = 0;
  if (s.inventory.spares >= k.spares) s.inventory.spares -= k.spares; else { extra = (k.spares - s.inventory.spares) * 14_000 * 2; s.inventory.spares = 0; }
  addLedger(s, "maintenance", -(cost + extra), `${k.label} ${e.name}`);
  e.status = "maintenance"; e.maintKind = kind; e.maintTotalMin = e.maintLeftMin = k.hours * 60;
  e.history.push({ t: s.t, what: `${k.label} started` });
  log(s, "notice", "maintenance", `${k.label} of ${e.name} started (${k.hours} h).`);
  return null;
}
function finishMaintenance(s: GameState, e: Equipment) {
  const k = KIND[e.maintKind as keyof typeof KIND] ?? KIND.repair;
  e.condition = clamp(e.maintKind === "replace" ? 100 : e.condition + k.gain, 0, 100);
  if (e.maintKind === "replace") e.installed = day(s.t);
  e.status = e.condition < 45 ? "degraded" : "ok";
  e.history.push({ t: s.t, what: `${k.label} completed (condition ${e.condition.toFixed(0)} %)` });
  setAlarm(s, "fail-" + e.id, false, "alarm", `${e.name} FAILED`);
  e.maintKind = ""; e.maintLeftMin = 0;
  log(s, "notice", "maintenance", `${e.name} back in service (condition ${e.condition.toFixed(0)} %).`);
}

// ------------------------------------------------------------------------------------------------ personnel
const FIRST = ["Alma", "Boris", "Chen", "Dara", "Emil", "Farah", "Goran", "Hana", "Ivo", "Jun", "Kira", "Luca", "Mira", "Nils", "Oren", "Pia", "Quin", "Rhea", "Sven", "Tara", "Ugo", "Vera", "Wen", "Xan", "Yara", "Zed"];
const LAST = ["Aldrin", "Brask", "Corvin", "Dalloway", "Eskil", "Fenwick", "Garrow", "Hollis", "Ivarsen", "Jessop", "Kovac", "Lindqvist", "Marek", "Novak", "Okafor", "Petrov", "Quill", "Rossi", "Sato", "Thorne", "Ulrich", "Varga", "Weiss", "Yilmaz"];
export function newEmployee(s: GameState, role: Role, exp?: number): Employee {
  const e = exp ?? randInt(s, 1, 12);
  const salary = Math.round(SALARY[role] * (1 + e * 0.025));
  return { id: s.nextEmployeeId++, name: `${pick(s, FIRST)} ${pick(s, LAST)}`, role, exp: e, salary, shift: (s.nextEmployeeId % 3) as 0 | 1 | 2, training: clamp(0.3 + e * 0.04, 0, 1), perf: 0.8, fatigue: 0.05, cert: e >= 3, hiredT: s.t };
}
export function hire(s: GameState, role: Role): string | null {
  if (s.staff.length >= 90) return "Staff limit reached";
  const emp = newEmployee(s, role, randInt(s, 0, 6));
  const fee = emp.salary * 1.2;
  if (s.finance.cash < fee && s.settings.mode !== "sandbox") return "Not enough cash for the hiring costs";
  addLedger(s, "salaries", -fee, `Recruiting ${ROLE_LABEL[role]}`);
  emp.cert = false; emp.training = 0.2;
  s.staff.push(emp); log(s, "info", "personnel", `Hired ${emp.name} as ${ROLE_LABEL[role]} (salary ${emp.salary}/month).`);
  return null;
}
export function fire(s: GameState, id: number): string | null {
  const i = s.staff.findIndex((e) => e.id === id);
  if (i < 0) return "Unknown employee";
  const e = s.staff[i];
  addLedger(s, "salaries", -e.salary * 2, `Severance ${e.name}`);
  s.staff.splice(i, 1); log(s, "notice", "personnel", `${e.name} (${ROLE_LABEL[e.role]}) was dismissed.`);
  return null;
}
export function train(s: GameState, id: number): string | null {
  const e = s.staff.find((x) => x.id === id);
  if (!e) return "Unknown employee";
  if (e.training >= 1 && e.cert) return "Already fully trained";
  const cost = 18_000;
  if (s.finance.cash < cost && s.settings.mode !== "sandbox") return "Not enough cash for training";
  addLedger(s, "salaries", -cost, `Training ${e.name}`);
  e.training = clamp(e.training + 0.35, 0, 1); e.exp += 1; if (e.training >= 0.6) e.cert = true;
  e.fatigue = clamp(e.fatigue + 0.05, 0, 1);
  log(s, "info", "personnel", `${e.name} completed training.`);
  return null;
}
