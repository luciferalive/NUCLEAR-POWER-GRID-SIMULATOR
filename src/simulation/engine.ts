import { DIFFICULTY, GEN_NAMEPLATE } from "./constants.js";
import { acceptOffer, negotiate, stepEconomy } from "./economyEngine.js";
import { drill, resolveEvent, stepEvents, stepSafety } from "./eventEngine.js";
import { fire, hire, scheduleMaintenance, stepMaintenance, train } from "./maintenanceEngine.js";
import { bonus, stepPlant } from "./powerGrid.js";
import { doScram, resetScram } from "./reactorModel.js";
import { buyUpgrade, startResearch, stepResearch } from "./research.js";
import type { Action, GameState } from "./types.js";
import { MIN_PER_DAY, addLedger, clamp, log, sumExpense, sumIncome } from "./util.js";

/** Advance the whole simulation by `dt` minutes. Every subsystem reads and writes the same GameState. */
export function step(s: GameState, dt = 1) {
  s.t += dt;
  stepMaintenance(s, dt);
  stepPlant(s, dt);
  stepEconomy(s, dt);
  stepEvents(s, dt);
  stepSafety(s, dt);
  stepResearch(s, dt);
  if (s.t % 60 === 0) checkObjectives(s);
}
export function run(s: GameState, minutes: number) { for (let i = 0; i < minutes; i++) step(s, 1); }

export interface Result { ok: boolean; msg?: string }
const ok = (msg?: string): Result => ({ ok: true, msg });
const no = (msg: string): Result => ({ ok: false, msg });
const fromErr = (e: string | null, good?: string): Result => (e ? no(e) : ok(good));

export function dispatch(s: GameState, a: Action): Result {
  const r = s.reactor, t = s.turbine, m = s.market;
  switch (a.type) {
    case "setSpeed": s.settings.speed = a.speed; s.settings.paused = a.speed === 0; return ok();
    case "togglePause": s.settings.paused = !s.settings.paused; return ok();
    case "setRod": if (r.scram) return no("Rods are locked in by the SCRAM"); r.autoRods = false; r.rodTarget = clamp(a.value, 0, 1); return ok(`Rod target ${(a.value * 100).toFixed(0)} %`);
    case "setAutoRods": r.autoRods = a.on; if (a.on) log(s, "info", "reactor", "Automatic rod control ON: rods follow the turbine set point."); else log(s, "notice", "reactor", "Manual rod control: you are controlling reactor power."); return ok();
    case "setPump": { const p = r.pumps.find((x) => x.id === a.id); if (!p) return no("Unknown pump"); if (a.on !== undefined) { p.on = a.on; log(s, "info", "reactor", `${p.id} ${a.on ? "started" : "stopped"}.`); } if (a.speed !== undefined) p.speed = clamp(a.speed, 0.2, 1); return ok(); }
    case "setSetpoint": { const cap = GEN_NAMEPLATE * (1 + bonus(s, "cap")); t.setpointMW = clamp(a.mw, 0, cap); return ok(`Turbine set point ${t.setpointMW.toFixed(0)} MW`); }
    case "setIntake": s.cooling.intakeOpen = a.open; log(s, a.open ? "info" : "warning", "cooling", a.open ? "Cooling water intake opened." : "Cooling water intake CLOSED: cooling is severely reduced."); return ok();
    case "setFans": s.cooling.fans = clamp(a.value, 0, 1); return ok();
    case "scram": doScram(s, a.reason ?? "Manual SCRAM by operator"); return ok("SCRAM");
    case "resetScram": return fromErr(resetScram(s), "SCRAM reset");
    case "setProtection": if (!a.on && ["beginner", "normal"].includes(s.settings.difficulty)) return no("Protection bypass is locked on Beginner and Normal"); r.protection = a.on; log(s, a.on ? "info" : "alarm", "reactor", a.on ? "Reactor protection re-armed." : "Reactor protection BYPASSED."); return ok();
    case "tripTurbine": t.tripped = true; log(s, "warning", "turbine", "Turbine tripped manually."); return ok();
    case "resetTurbine": if (s.equipment.find((e) => e.id === "TUR-1")!.status === "failed") return no("Turbine is failed: repair it first"); t.tripped = false; log(s, "info", "turbine", "Turbine reset."); return ok();
    case "setBreaker": if (a.closed && !s.grid.connectionOk) return no("Grid connection is not available"); s.grid.breakerClosed = a.closed; log(s, "info", "grid", `Generator breaker ${a.closed ? "closed" : "opened"}.`); return ok();
    case "setMarket": if (a.autoBuy !== undefined) m.autoBuy = a.autoBuy; if (a.sellSurplus !== undefined) m.sellSurplus = a.sellSurplus; if (a.reserveMW !== undefined) m.reserveMW = clamp(a.reserveMW, 0, 200); return ok();
    case "negotiate": return ok(negotiate(s, a.offerId, a.price));
    case "acceptOffer": return fromErr(acceptOffer(s, a.offerId), "Contract signed");
    case "rejectOffer": { const o = s.offers.find((x) => x.id === a.offerId); if (o) o.status = "rejected"; return ok(); }
    case "terminateContract": { const c = s.contracts.find((x) => x.id === a.id); if (!c || !c.active) return no("Contract not active"); const fee = c.capacityMW * c.price * 24 * 4; addLedger(s, "penalties", -fee, `Early termination ${c.id}`); c.active = false; c.terminated = true; s.finance.reputation = clamp(s.finance.reputation - 6, 0, 100); log(s, "warning", "sales", `Contract ${c.id} terminated early (fee ${Math.round(fee).toLocaleString()}).`); return ok(); }
    case "setPriority": { const c = s.contracts.find((x) => x.id === a.id); if (!c) return no("Unknown contract"); c.priority = a.priority; return ok(); }
    case "chasePayment": { const inv = s.finance.invoices.find((i) => i.id === a.invoiceId); if (!inv || inv.paid) return no("Nothing to chase"); addLedger(s, "administration", -2500, "Collections effort"); s.flags[`chased:${inv.id}`] = 1; return ok("Payment reminder sent"); }
    case "scheduleMaintenance": return fromErr(scheduleMaintenance(s, a.id, a.kind));
    case "hire": return fromErr(hire(s, a.role), "Hired");
    case "fire": return fromErr(fire(s, a.id));
    case "train": return fromErr(train(s, a.id), "Training completed");
    case "setShift": { const e = s.staff.find((x) => x.id === a.id); if (e) e.shift = a.shift; return ok(); }
    case "buySpares": { const q = clamp(Math.floor(a.qty), 1, 200); const cost = q * 14_000 * (1 + (s.flags.inflation ?? 0)); if (s.finance.cash < cost && s.settings.mode !== "sandbox") return no("Not enough cash"); addLedger(s, "spare-parts", -cost, `Bought ${q} spare-part kits`); s.inventory.spares += q; return ok(`Bought ${q} kits`); }
    case "buySupplies": return no("Not used in this version");
    case "startResearch": return fromErr(startResearch(s, a.id));
    case "buyUpgrade": return fromErr(buyUpgrade(s, a.id), "Installed");
    case "takeLoan": { const f = s.finance; if (a.amount <= 0) return no("Enter an amount"); if (f.debt + a.amount > f.assets * 0.9) return no("Debt would exceed 90 % of company assets"); const id = Math.max(0, ...f.loans.map((l) => l.id)) + 1; f.loans.push({ id, principal: a.amount, rate: f.interestRate + 0.01 }); f.debt += a.amount; f.cash += a.amount; f.totals.loan = (f.totals.loan ?? 0) + a.amount; log(s, "info", "finance", `Loan taken: ${a.amount.toLocaleString()}.`); return ok(); }
    case "repayLoan": { const f = s.finance; const l = f.loans.find((x) => x.id === a.id); if (!l) return no("Unknown loan"); const pay = Math.min(l.principal, f.cash); if (pay <= 0) return no("No cash"); l.principal -= pay; f.cash -= pay; f.debt -= pay; f.totals.loan = (f.totals.loan ?? 0) - pay; f.loans = f.loans.filter((x) => x.principal > 1); return ok(); }
    case "resolveEvent": return fromErr(resolveEvent(s, a.id, a.option));
    case "ackAlarm": if (s.alarms[a.key]) s.alarms[a.key].acked = true; return ok();
    case "ackAll": for (const k of Object.keys(s.alarms)) s.alarms[k].acked = true; return ok();
    case "drill": return fromErr(drill(s), "Drill completed");
    case "refuel": {
      if (r.n > 0.01 || r.rod > 0.05) return no("Shut the reactor down first: insert the rods (SCRAM or manual)");
      const cost = 9_000_000; if (s.finance.cash < cost && s.settings.mode !== "sandbox") return no("Refuelling costs 9,000,000");
      addLedger(s, "capital", -cost, "Refuelling outage"); r.burnup = 0; r.outageLeftMin = 8 * MIN_PER_DAY; r.xenon = 0; r.iodine = 0;
      log(s, "notice", "reactor", "Refuelling outage started (8 days)."); return ok();
    }
    case "setSetting": (s.settings as unknown as Record<string, unknown>)[a.key] = a.value; return ok();
  }
}

// ------------------------------------------------------------------------------------------------ objectives and derived values
export function metric(s: GameState, key: string): number {
  switch (key) {
    case "cash": return s.finance.cash;
    case "profitableMonths": return s.stats.profitableMonths;
    case "activeContracts": return s.contracts.filter((c) => c.active).length;
    case "reputation": return s.finance.reputation;
    case "totalMWh": return s.stats.totalMWh;
    case "compliance": return s.safety.compliance;
    case "noScram": return s.stats.scrams === 0 ? 1 : 0;
    default: return 0;
  }
}
export function checkObjectives(s: GameState) {
  for (const o of s.objectives) {
    if (o.done || o.failed || o.metric === "none") continue;
    if (metric(s, o.metric) >= o.target && (o.metric !== "noScram" || s.t >= o.deadlineT)) { o.done = true; log(s, "notice", "objective", `Objective complete: ${o.text}`); }
    else if (s.t >= o.deadlineT) { o.failed = true; log(s, "warning", "objective", `Objective failed: ${o.text}`); }
  }
}
export function summary(s: GameState) {
  const f = s.finance;
  return { revenueToday: sumIncome(f.day), expensesToday: sumExpense(f.day), revenuePrev: sumIncome(f.prevDay), expensesPrev: sumExpense(f.prevDay),
    revenueMonth: sumIncome(f.month), expensesMonth: sumExpense(f.month), revenueYear: sumIncome(f.year), expensesYear: sumExpense(f.year),
    receivables: f.invoices.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0) + s.contracts.reduce((a, c) => a + c.accruedUnbilled, 0),
    difficulty: DIFFICULTY[s.settings.difficulty] };
}
