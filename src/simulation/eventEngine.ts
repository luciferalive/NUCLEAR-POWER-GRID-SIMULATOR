import { DIFFICULTY, ROLE_LABEL } from "./constants.js";
import { doScram } from "./reactorModel.js";
import { failEquipment, newEmployee } from "./maintenanceEngine.js";
import { nextRandom, pick, randInt, randRange } from "./rng.js";
import type { ActiveEvent, GameState, Role, Severity } from "./types.js";
import { MIN_PER_DAY, addLedger, clamp, eq, log, setAlarm } from "./util.js";

function push(s: GameState, e: Omit<ActiveEvent, "id" | "resolved" | "startT">): ActiveEvent {
  const ev: ActiveEvent = { id: s.nextEventId++, resolved: false, startT: s.t, ...e };
  s.events.push(ev);
  s.eventHistory.push({ t: s.t, kind: e.kind, title: e.title, sev: e.sev });
  if (s.eventHistory.length > 300) s.eventHistory.splice(0, 60);
  log(s, e.sev, "event", `${e.title}: ${e.text}`);
  return ev;
}

/** Events are drawn from per-day hazard rates (scaled by difficulty) with the game's seeded generator, so a save replays identically. */
export function stepEvents(s: GameState, dt: number) {
  const diff = DIFFICULTY[s.settings.difficulty];
  const k = (dt / MIN_PER_DAY) * diff.hazard * (s.settings.mode === "crisis" ? 2 : s.settings.mode === "sandbox" ? 0.5 : 1);
  const roll = (perDay: number) => nextRandom(s) < perDay * k;
  const live = (kind: string) => s.events.some((e) => e.kind === kind && !e.resolved && s.t < e.endT);

  if (roll(0.035) && !live("grid-instability")) {
    s.grid.frequencyEventUntil = s.t + randInt(s, 60, 150);
    push(s, { kind: "grid-instability", title: "Grid instability", text: "System frequency is sagging. Export capacity is reduced while the grid operator rebalances.", sev: "warning", endT: s.grid.frequencyEventUntil, effects: {} });
  }
  if (roll(0.06) && !live("demand-surge")) {
    const surge = randRange(s, 0.1, 0.28), hrs = randInt(s, 5, 14);
    push(s, { kind: "demand-surge", title: "Sudden demand increase", text: `Regional demand jumps by ${(surge * 100).toFixed(0)} % for about ${hrs} h. Spot prices will rise.`, sev: "notice", endT: s.t + hrs * 60, effects: { demandSurge: surge } });
  }
  if (roll(0.05) && s.contracts.some((c) => c.active)) {
    const c = pick(s, s.contracts.filter((x) => x.active));
    const cust = s.customers.find((x) => x.id === c.customerId)!;
    const up = nextRandom(s) < 0.55;
    const f = up ? randRange(s, 1.2, 1.5) : randRange(s, 0.2, 0.5);
    push(s, { kind: "customer", title: up ? `${cust.name} expands` : `${cust.name} cuts production`, text: up ? "Their demand rises for the next weeks. Make sure you can deliver." : "Their demand falls for a while. You will have more power to sell on the spot market.", sev: "info", endT: s.t + randInt(s, 8, 30) * MIN_PER_DAY, effects: { [`cust:${cust.id}`]: f } });
  }
  if (s.weather.kind === "thunderstorm" && roll(0.25) && !live("lightning")) {
    s.grid.breakerClosed = false;
    push(s, { kind: "lightning", title: "Lightning strike on the line", text: "The generator breaker opened to protect the plant. Re-close it from the Electrical Grid page once the line is checked.", sev: "alarm", endT: s.t + 90, effects: {} });
  }
  if (roll(0.012) && !live("rates")) {
    push(s, { kind: "rates", title: "Financial crisis: interest rates jump", text: "Lenders raise rates by 2 points. You can refinance now or accept the higher interest.", sev: "warning", endT: s.t + 5 * MIN_PER_DAY, effects: {},
      options: [{ id: "refi", label: "Refinance (fee $180k, locks old rate)", cost: 180_000, hint: "Pay a fee and keep the old rate." }, { id: "accept", label: "Accept the higher rate", cost: 0, hint: "Loans cost about 2 % more each year." }] });
  }
  if (roll(0.03) && !live("supplier-delay")) {
    s.flags.maintDelayUntil = s.t + 6 * MIN_PER_DAY;
    push(s, { kind: "supplier-delay", title: "Maintenance delays", text: "A supplier strike slows contractors. Maintenance takes about 60 % longer for six days.", sev: "notice", endT: s.t + 6 * MIN_PER_DAY, effects: {} });
  }
  if (roll(0.025) && s.staff.length > 20) {
    const e = pick(s, s.staff.filter((x) => x.role !== "manager"));
    s.staff.splice(s.staff.indexOf(e), 1);
    push(s, { kind: "staff", title: "Staff shortage", text: `${e.name} (${ROLE_LABEL[e.role]}) resigned. Hire a replacement soon.`, sev: "notice", endT: s.t + 2 * MIN_PER_DAY, effects: {} });
  }
  if (roll(0.012) && !live("cyber")) {
    push(s, { kind: "cyber", title: "Cybersecurity incident", text: "Suspicious traffic is probing the plant's business network. Choose a response within 12 hours.", sev: "alarm", endT: s.t + 12 * 60, effects: {},
      options: [{ id: "isolate", label: "Isolate the network (cost $40k)", cost: 40_000, hint: "Safe, but monitoring is degraded for a while." }, { id: "firm", label: "Hire a response firm (cost $120k)", cost: 120_000, hint: "Fast, safe and keeps monitoring working." }, { id: "ignore", label: "Ignore it", cost: 0, hint: "Cheap now, risky: the instrumentation may be compromised." }] });
  }
  // regulator inspection
  if (s.t >= s.safety.nextInspectionT && !live("inspection")) {
    push(s, { kind: "inspection", title: "Regulatory inspection announced", text: "The Nuclear Safety Authority will inspect the plant in 24 hours. Prepare, or take your chances.", sev: "warning", endT: s.t + 24 * 60, effects: {},
      options: [{ id: "prepare", label: "Prepare thoroughly (cost $150k)", cost: 150_000, hint: "Fix records, tidy up, brief staff. Raises the chance of a pass." }, { id: "standard", label: "Business as usual", cost: 0, hint: "Result depends on the plant's real condition." }] });
    s.safety.nextInspectionT = s.t + randInt(s, 80, 120) * MIN_PER_DAY;
  }
  // events end, or default when ignored
  for (const e of s.events) {
    if (e.resolved) continue;
    if (s.t >= e.endT) {
      if (e.options?.length) resolveEvent(s, e.id, e.options[e.options.length - 1].id, true);
      else {
        e.resolved = true;
        if (e.kind === "grid-instability") log(s, "info", "grid", "Grid frequency has recovered.");
        if (e.kind === "lightning" && s.grid.connectionOk && !s.grid.breakerClosed && !s.turbine.tripped) { s.grid.breakerClosed = true; log(s, "info", "grid", "Line checked: breaker auto-reclosed."); }
      }
    }
  }
  if (s.events.length > 60) s.events = s.events.filter((e) => !e.resolved || s.t - e.endT < 3 * MIN_PER_DAY);
  setAlarm(s, "event-open", s.events.some((e) => !e.resolved && e.options?.length), "notice", "A decision is waiting in the Safety & Emergency Center");
}

export function resolveEvent(s: GameState, id: number, option: string, auto = false): string | null {
  const e = s.events.find((x) => x.id === id);
  if (!e || e.resolved) return "Event is no longer active";
  const o = e.options?.find((x) => x.id === option);
  if (!o) return "Unknown option";
  if (o.cost > 0) addLedger(s, "other-expenses", -o.cost, `${e.title}: ${o.label}`);
  e.resolved = true; e.choice = option;
  log(s, "info", "event", `${auto ? "(No decision made) " : ""}${e.title}: ${o.label}`);
  if (e.kind === "rates") {
    if (option === "refi") log(s, "info", "finance", "Refinanced: interest rate unchanged.");
    else for (const l of s.finance.loans) l.rate += 0.02;
    if (option !== "refi") s.finance.interestRate += 0.02;
  } else if (e.kind === "cyber") {
    if (option === "isolate") { const i = eq(s, "INST"); i.condition = Math.max(0, i.condition - 6); }
    if (option === "ignore") {
      if (nextRandom(s) < 0.6) { const i = eq(s, "INST"); i.condition = Math.max(0, i.condition - 30); s.safety.compliance = clamp(s.safety.compliance - 8, 0, 100); log(s, "alarm", "event", "The attacker tampered with instrumentation settings. Inspect the INST system."); }
      else log(s, "info", "event", "The intrusion fizzled out.");
    }
  } else if (e.kind === "inspection") {
    const sf = s.safety;
    const overdue = s.equipment.filter((x) => x.condition < 40).length;
    const score = sf.compliance * 0.5 + sf.safetyScore * 0.3 + (s.flags.staffRatio ?? 1) * 20 - overdue * 6 + (option === "prepare" ? 15 : 0) + (nextRandom(s) - 0.5) * 10;
    if (score >= 70) { sf.compliance = clamp(sf.compliance + 4, 0, 100); log(s, "notice", "regulator", `Inspection passed (score ${score.toFixed(0)}).`); }
    else if (score >= 50) { const fine = 120_000; sf.fines += fine; addLedger(s, "fines", -fine, "Inspection findings"); sf.compliance = clamp(sf.compliance - 3, 0, 100); log(s, "warning", "regulator", `Inspection found minor issues: fine ${fine.toLocaleString()}.`); }
    else { const fine = 900_000; sf.fines += fine; addLedger(s, "fines", -fine, "Serious inspection findings"); sf.compliance = clamp(sf.compliance - 12, 0, 100); log(s, "alarm", "regulator", `Inspection failed: fine ${fine.toLocaleString()} and an improvement order.`); }
  }
  return null;
}

/** Compliance / safety score drift and licence handling (daily-ish; cheap enough to run every step). */
export function stepSafety(s: GameState, dt: number) {
  const sf = s.safety;
  const worn = s.equipment.filter((e) => e.condition < 40).length;
  const target = clamp(100 - worn * 6 - (1 - (s.flags.staffRatio ?? 1)) * 30 - (s.reactor.protection ? 0 : 25) - (s.alarms.scram ? 8 : 0) + (s.research.done.includes("env-tech") ? 4 : 0), 5, 100);
  sf.compliance += (target - sf.compliance) * (dt / (MIN_PER_DAY * 12));
  const sTarget = clamp(95 - worn * 4 - (s.reactor.protection ? 0 : 30) - (eq(s, "EDG-1").condition < 40 ? 10 : 0) - (s.t - sf.drillsDoneT > 40 * MIN_PER_DAY ? 8 : 0), 5, 100);
  sf.safetyScore += (sTarget - sf.safetyScore) * (dt / (MIN_PER_DAY * 15));
  const edg = eq(s, "EDG-1");
  sf.backupPowerReady = edg.status === "ok" && edg.condition > 40;
  setAlarm(s, "backup", !sf.backupPowerReady, "alarm", "Emergency backup power is NOT ready");
  const was = sf.licenceOk;
  sf.licenceOk = sf.compliance > 15;
  if (was && !sf.licenceOk) { log(s, "critical", "regulator", "Operating licence SUSPENDED. The reactor was shut down."); doScram(s, "Licence suspended"); }
  if (!was && sf.compliance > 40) { sf.licenceOk = true; log(s, "notice", "regulator", "Operating licence restored."); }
  if (!sf.licenceOk) sf.licenceOk = false;
  setAlarm(s, "compliance", sf.compliance < 50, "warning", `Compliance low (${sf.compliance.toFixed(0)} %): inspection risk`);
}
export function drill(s: GameState): string | null {
  if (s.t - s.safety.drillsDoneT < 14 * MIN_PER_DAY) return "A drill was held less than 14 days ago";
  addLedger(s, "other-expenses", -25_000, "Emergency drill");
  s.safety.drillsDoneT = s.t; s.safety.safetyScore = clamp(s.safety.safetyScore + 4, 0, 100);
  for (const e of s.staff) e.fatigue = clamp(e.fatigue + 0.02, 0, 1);
  log(s, "info", "safety", "Emergency drill completed.");
  return null;
}
