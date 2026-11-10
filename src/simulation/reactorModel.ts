import { ALPHA_C, ALPHA_F, BURN_WORTH, BYPASS_FRAC, C_COOL, DT_FUEL, K_SG, LIMITS, PNOM, PUMP_CAP, ROD_CRIT, ROD_SPEED, ROD_WORTH, SCRAM_SPEED, T_REF, T_SG, XENON_WORTH } from "./constants.js";
import type { GameState } from "./types.js";
import { clamp, health, log, relax, setAlarm } from "./util.js";

/** Reactivity (pcm, game units) minus everything that opposes it, as a function of power: net = ext - feedback. */
export function reactivityBreakdown(s: GameState) {
  const r = s.reactor;
  return {
    rod: ROD_WORTH * (r.rod - ROD_CRIT),
    xenon: -XENON_WORTH * r.xenon,
    burnup: -BURN_WORTH * r.burnup,
    fuelTemp: -ALPHA_F * (r.tFuel - T_REF),
    coolantTemp: -ALPHA_C * (r.tCool - T_REF),
  };
}
export function netReactivity(s: GameState) { const b = reactivityBreakdown(s); return b.rod + b.xenon + b.burnup + b.fuelTemp + b.coolantTemp; }

export function updateFlow(s: GameState) {
  const r = s.reactor;
  let total = 0;
  const ids = ["RCP-A", "RCP-B", "RCP-C"];
  r.pumps.forEach((p, i) => {
    const h = health(s, ids[i]);
    p.flow = p.on ? clamp(p.speed, 0, 1) * PUMP_CAP * h : 0;
    total += p.flow;
  });
  r.flowFrac = total;
}

/** One 1-minute step of the reactor + primary loop. Needs turbine steam demand (MWt) decided by the plant model. */
export function stepReactor(s: GameState, dt: number, steamDemandMWt: number, etaEst: number) {
  const r = s.reactor;
  updateFlow(s);
  // --- automatic rod control: follow the turbine load setpoint (rods only move at the real rod speed)
  if (r.scram) { r.rodTarget = 0; }
  else if (r.autoRods && s.turbine.online && !s.turbine.tripped && health(s, "CRD") > 0) {
    const want = clamp((s.turbine.setpointMW / Math.max(0.2, etaEst)) / PNOM, 0, 1.05);
    const have = r.n * 0.935 + r.decayHeat / PNOM;
    const err = want - have;
    r.rodTarget = clamp(r.rodTarget + 0.12 * err * dt, 0, 1);
    if (r.tCool > LIMITS.tCoolHigh - 6) r.rodTarget = Math.max(0, r.rodTarget - 0.01 * dt); // runback when hot
  }
  const runback = r.autoRods && !r.scram && !s.turbine.online;           // grid lost / turbine out: automatic runback to house load
  if (runback) r.rodTarget = Math.min(r.rodTarget, 0.5);
  const crd = health(s, "CRD");
  const speed = r.scram ? SCRAM_SPEED : runback ? 0.05 : ROD_SPEED * (crd > 0 ? 0.5 + 0.5 * crd : 0);
  const dRod = clamp(r.rodTarget - r.rod, -speed * dt, speed * dt);
  r.rod = clamp(r.rod + dRod, 0, 1);

  // --- neutron population: quasi-static balance of reactivity and temperature feedback, relaxed with a time constant
  const ext = ROD_WORTH * (r.rod - ROD_CRIT) - XENON_WORTH * r.xenon - BURN_WORTH * r.burnup - ALPHA_F * (r.tCool - T_REF) - ALPHA_C * (r.tCool - T_REF);
  let nEq = r.scram || r.outageLeftMin > 0 ? 0 : clamp(ext / (ALPHA_F * DT_FUEL), 0, 1.6);
  if (r.rod < 0.02) nEq = 0;
  r.n = relax(r.n, nEq, dt, r.scram ? 0.4 : 3);
  if (r.n < 0.0005) r.n = 0;
  r.tFuel = r.tCool + r.n * DT_FUEL;

  // --- poisons (game abstraction of iodine / xenon dynamics, time constants in minutes)
  const lI = 0.00175, lX = 0.00126, sX = 0.00192;
  r.iodine = clamp(r.iodine + (lI * r.n - lI * r.iodine) * dt, 0, 2);
  r.xenon = clamp(r.xenon + (lI * r.iodine - (lX + sX * r.n) * r.xenon) * dt, 0, 1.6);
  r.burnup = clamp(r.burnup + (r.n * dt) / (400 * 1440 * (1 + 0.0 )), 0, 1);

  // --- decay heat follows recent power
  const dTarget = 0.065 * PNOM * r.n;
  r.decayHeat = relax(r.decayHeat, dTarget, dt, dTarget > r.decayHeat ? 120 : 420);
  const q = r.n * PNOM * 0.935 + r.decayHeat;

  // --- heat removal: limited by coolant flow x temperature difference and by what the steam side can accept
  const cap = K_SG * Math.pow(Math.max(r.flowFrac, 0), 0.8) * Math.max(0, r.tCool - T_SG);
  const bypass = BYPASS_FRAC * PNOM * 1;
  const accept = Math.max(0, steamDemandMWt) + bypass;
  r.heatRemoved = Math.min(cap, accept);
  r.tCool += ((q - r.heatRemoved) / C_COOL) * dt;
  r.tCool = clamp(r.tCool, 20, 450);
  // pressure follows coolant temperature (+ a small flow term)
  r.pressure = relax(r.pressure, 155 + 1.4 * (r.tCool - 300) - 3 * (1 - clamp(r.flowFrac, 0, 1)), dt, 4);

  // --- protection system (fictional game setpoints) and alarms
  let reason = "";
  if (r.protection && !r.scram) {
    if (r.tCool > LIMITS.tCoolTrip) reason = "High coolant temperature";
    else if (r.pressure > LIMITS.pressureTrip) reason = "High primary pressure";
    else if (r.n > LIMITS.nTrip) reason = "High neutron power";
    else if (r.flowFrac < LIMITS.flowTrip && r.n > 0.1) reason = "Low coolant flow";
    else if (s.turbine.tripped && r.n > 0.45 && !s.turbine.online) reason = "Turbine trip at high power";
  }
  if (reason) doScram(s, reason);
  setAlarm(s, "tcool", r.tCool > LIMITS.tCoolHigh, "warning", `Coolant temperature high (${r.tCool.toFixed(0)} C)`);
  setAlarm(s, "press", r.pressure > LIMITS.pressureHigh, "warning", `Primary pressure high (${r.pressure.toFixed(0)} bar)`);
  setAlarm(s, "flow", r.flowFrac < 0.6 && r.n > 0.3, "alarm", `Low coolant flow (${(r.flowFrac * 100).toFixed(0)} %)`);
  setAlarm(s, "scram", r.scram, "critical", `REACTOR SCRAM: ${r.scramReason}`);
  setAlarm(s, "noprot", !r.protection, "alarm", "Reactor protection is BYPASSED");
  setAlarm(s, "fuel", r.burnup > 0.9, "notice", "Fuel nearly exhausted: plan a refuelling outage");
  if (r.outageLeftMin > 0) { r.outageLeftMin = Math.max(0, r.outageLeftMin - dt); if (r.outageLeftMin === 0) log(s, "notice", "reactor", "Refuelling outage complete: reactor available"); }
}

export function doScram(s: GameState, reason: string) {
  const r = s.reactor;
  if (r.scram) return;
  r.scram = true; r.scramReason = reason; r.scramSince = s.t; r.rodTarget = 0; r.autoRods = r.autoRods;
  s.stats.scrams++;
  log(s, "critical", "reactor", `SCRAM: ${reason}. Control rods inserted.`);
  s.safety.incidents.push({ t: s.t, text: `Reactor SCRAM: ${reason}`, sev: "alarm" });
  s.safety.safetyScore = clamp(s.safety.safetyScore - 2, 0, 100);
}
export function resetScram(s: GameState): string | null {
  const r = s.reactor;
  if (!r.scram) return "Reactor is not scrammed";
  if (s.t - r.scramSince < 20) return "Wait at least 20 minutes after a SCRAM before resetting";
  if (r.tCool > 330) return "Coolant is still too hot to reset";
  if (r.flowFrac < 0.2) return "Start coolant pumps first";
  r.scram = false; r.scramReason = ""; r.rodTarget = 0;
  log(s, "notice", "reactor", "SCRAM reset. Rods are fully inserted; withdraw them slowly to restart.");
  return null;
}
