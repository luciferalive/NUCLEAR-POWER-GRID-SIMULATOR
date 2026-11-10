import { BASE_AUX, ETA0, EXPORT_CAP, FAN_MW, GEN_EFF, GEN_NAMEPLATE, PNOM, PUMP_MW, WATER_PER_MWT_REJECT } from "./constants.js";
import { stepReactor } from "./reactorModel.js";
import type { GameState } from "./types.js";
import { clamp, eq, health, log, relax, setAlarm } from "./util.js";

export const statusFactor = (s: GameState, id: string) => { const e = eq(s, id); return !e ? 1 : e.status === "failed" || e.status === "maintenance" || e.status === "offline" ? 0 : e.status === "degraded" ? 0.75 : 1; };
/** Upgrade / research multipliers (see research.ts for the list). */
export function bonus(s: GameState, key: string): number {
  let m = 0;
  for (const id of [...s.upgrades, ...s.research.done]) m += BONUS[id]?.[key] ?? 0;
  return m;
}
export const BONUS: Record<string, Record<string, number>> = {
  "gen-eff": { eta: 0.012 }, "turbine-uprate": { cap: 0.08 }, "cooling-tech": { cooling: 0.15 }, "grid-hv": { export: 0.2, loss: -0.004 },
  "reliability": { degrade: -0.2 }, "predictive": { hazard: -0.25 }, "monitoring": { alarmLead: 1 }, "fin-opt": { costs: -0.04 }, "env-tech": { water: -0.15 }, "energy-mgmt": { demandResp: 1 },
  "storage": { storage: 1 }, "renewable": { renew: 1 }, "advanced-ops": { rodSpeed: 0.2 }, "ind-mgmt": { priceBoost: 0.02 },
  "turbine-upgrade": { cap: 0.06, eta: 0.004 }, "cooling-towers+": { cooling: 0.2 }, "second-transformer": { export: 0.25 },
};

/** Plant-level step: turbine, cooling, auxiliary load, grid connection. One call = `dt` sim minutes (the engine uses dt = 1). */
export function stepPlant(s: GameState, dt: number) {
  const t = s.turbine, c = s.cooling, r = s.reactor, g = s.grid;
  const wx = s.weather;
  // --- grid connection and turbine availability
  g.connectionOk = statusFactor(s, "TRF-1") > 0 && statusFactor(s, "SUB-1") > 0;
  const turbOk = statusFactor(s, "TUR-1") > 0 && statusFactor(s, "GEN-1") > 0;
  if (!turbOk && !t.tripped) { t.tripped = true; log(s, "alarm", "turbine", "Turbine / generator unavailable: turbine tripped"); }
  if (!g.connectionOk && g.breakerClosed) { g.breakerClosed = false; log(s, "alarm", "grid", "Grid connection lost: generator breaker opened"); }
  t.online = !t.tripped && g.breakerClosed && turbOk;
  if (!t.online && !t.tripped && !g.breakerClosed) { /* waiting for breaker */ }

  // --- efficiency and capacity
  const condF = c.condenserFactor;
  const capacity = GEN_NAMEPLATE * (1 + bonus(s, "cap")) * (0.55 + 0.45 * Math.min(health(s, "TUR-1"), health(s, "GEN-1")) ) * (1 - (eq(s, "TUR-1").status === "degraded" ? 0.1 : 0));
  const eta = (ETA0 + bonus(s, "eta")) * condF * (0.9 + 0.1 * health(s, "TUR-1"));
  const sp = clamp(t.setpointMW, 0, capacity);
  const steamDemand = t.online ? sp / (eta * GEN_EFF) : 0;

  stepReactor(s, dt, steamDemand, eta * GEN_EFF);

  // --- turbine output = steam actually delivered x efficiency (never more than the set point)
  const intake = t.online ? Math.min(r.heatRemoved, steamDemand) : 0;
  t.steamMWt = intake;
  t.efficiency = eta;
  t.grossMW = t.online ? intake * eta * GEN_EFF : 0;
  t.rpm = relax(t.rpm, t.online ? 3000 : t.tripped ? 0 : 3000, dt, t.online ? 1 : 25);
  t.vibration = clamp(0.6 + 4.5 * Math.pow(Math.max(0, 1 - eq(s, "TUR-1").condition / 100), 1.5) + 1.2 * (t.grossMW / GEN_NAMEPLATE) ** 2, 0, 10);
  setAlarm(s, "vib", t.vibration > 6, "warning", `Turbine vibration high (${t.vibration.toFixed(1)} mm/s)`);
  setAlarm(s, "tturb", t.tripped, "alarm", "Turbine is tripped");

  // --- cooling system: heat rejected = heat removed - electricity produced
  const rejected = Math.max(0, r.heatRemoved - t.grossMW);
  const towers = (statusFactor(s, "CT-1") + statusFactor(s, "CT-2")) / 2;
  const towerH = (health(s, "CT-1") + health(s, "CT-2")) / 2;
  const wtp = 0.5 + 0.5 * health(s, "WTP-1");
  const ambientWB = wx.temp - 4 - 5 * wx.rain;
  const U = 70 * (1 + bonus(s, "cooling")) * (0.3 + 0.7 * c.fans) * (0.25 + 0.75 * towers) * (0.7 + 0.3 * towerH) * wtp * (c.intakeOpen ? 1 : 0.2);
  c.basinTemp = relax(c.basinTemp, ambientWB + rejected / Math.max(U, 1), dt, 25);
  c.condenserTemp = c.basinTemp + 6 + 10 * (rejected / PNOM);
  c.condenserFactor = clamp(1 - 0.006 * Math.max(0, c.condenserTemp - 32), 0.6, 1);
  c.waterUseM3h = rejected * WATER_PER_MWT_REJECT * (1 + bonus(s, "water")) * (c.intakeOpen ? 1 : 0.2);
  setAlarm(s, "cond", c.condenserTemp > 45, "warning", `Condenser temperature high (${c.condenserTemp.toFixed(0)} C): efficiency falling`);

  // --- auxiliary electricity: pumps, fans, buildings, plus a share of generation (excitation, lube oil)
  let aux = BASE_AUX * (0.85 + 0.15 * (s.flags.staffRatio ?? 1)) + 0.3;
  for (const p of r.pumps) if (p.on) aux += PUMP_MW * Math.pow(clamp(p.speed, 0, 1), 3) * (p.flow > 0 ? 1 : 0.4);
  aux += FAN_MW * Math.pow(c.fans, 3) * (c.intakeOpen ? 1 : 0.3);
  aux += 0.012 * t.grossMW;
  g.grossMW = t.grossMW; g.auxMW = aux; g.netMW = t.grossMW - aux;

  // --- transmission: capacity and losses
  const capFactor = statusFactor(s, "TRF-1") * (statusFactor(s, "SUB-1") > 0 ? 1 : 0) * (g.breakerClosed ? 1 : 0);
  g.exportCapMW = EXPORT_CAP * (1 + bonus(s, "export")) * capFactor * (s.t < g.frequencyEventUntil ? 0.6 : 1);
  const flow = Math.max(0, g.netMW);
  g.lossMW = flow * (0.012 + bonus(s, "loss") + 0.012 * (flow / Math.max(1, g.exportCapMW || EXPORT_CAP)) ** 2);
  g.frequency = relax(g.frequency, s.t < g.frequencyEventUntil ? 49.55 : 50, dt, 6);
  setAlarm(s, "freq", g.frequency < 49.7, "warning", `Grid frequency low (${g.frequency.toFixed(2)} Hz)`);
  setAlarm(s, "conn", !g.connectionOk, "alarm", "Grid connection unavailable");
  setAlarm(s, "breaker", g.connectionOk && !g.breakerClosed, "notice", "Generator breaker is open");
}

export interface Allocation { contracts: number; spot: number; bought: number; unserved: number; surplusUnsold: number }

/** Power balance for one step. Generation -> losses -> (reserve kept back) -> contracts by priority -> spot market. */
export function allocate(s: GameState, dt: number, spotSoldFn: (surplus: number, cap: number) => number): Allocation {
  const g = s.grid, m = s.market;
  const deliverable = Math.max(0, g.netMW - g.lossMW);
  let avail = Math.min(deliverable, g.exportCapMW);
  const active = s.contracts.filter((c) => c.active && !c.terminated).sort((a, b) => a.priority - b.priority || b.price - a.price);
  let contracted = 0, shortfallTotal = 0;
  const wantReserve = Math.min(m.reserveMW, avail);
  let pool = avail; // MW available to contracts (reserve only withheld from spot sales)
  for (const c of active) {
    const want = c.demandMW;
    const give = Math.min(want, pool);
    c.deliveredMW = give; c.shortfallMW = Math.max(0, want - give);
    pool -= give; contracted += give; shortfallTotal += c.shortfallMW;
  }
  for (const c of s.contracts) if (!active.includes(c)) { c.deliveredMW = 0; c.shortfallMW = 0; c.demandMW = 0; }
  // buy from the market to cover obligations if allowed (limited by remaining connection capacity)
  let bought = 0;
  if (m.autoBuy && shortfallTotal > 0.01) {
    bought = Math.min(shortfallTotal, Math.max(0, g.exportCapMW - contracted));
    let left = bought;
    for (const c of active) { if (left <= 0) break; const add = Math.min(c.shortfallMW, left); c.deliveredMW += add; c.shortfallMW -= add; left -= add; contracted += add; }
    shortfallTotal -= bought;
  }
  // surplus goes to the spot market (minus the reserve the player wants to keep)
  let spot = 0, unsold = 0;
  const surplus = Math.max(0, pool - wantReserve);
  if (m.sellSurplus && surplus > 0.01 && g.breakerClosed) { spot = spotSoldFn(surplus, Math.max(0, g.exportCapMW - contracted)); unsold = surplus - spot; }
  else unsold = surplus;
  g.contractedMW = contracted; g.spotMW = spot; g.boughtMW = bought; g.unservedMW = shortfallTotal;
  g.reserveMW = Math.max(0, pool - surplus) + unsold;
  return { contracts: contracted, spot, bought, unserved: shortfallTotal, surplusUnsold: unsold };
}
