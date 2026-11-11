import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../docs/js/simulation/scenarios.js";
import { step, run, dispatch, summary } from "../docs/js/simulation/engine.js";
import { SaveManager, MemoryBackend, exportText, importText, migrate } from "../docs/js/store/saves.js";
import { SimulationClock } from "../docs/js/simulation/simulationClock.js";

const game = (o = {}) => createGame({ difficulty: "beginner", ...o });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("steady state: turbine follows the set point and electricity balance closes", () => {
  const s = game(); run(s, 600);
  near(s.grid.grossMW, s.turbine.setpointMW, 2, "gross ~ setpoint");
  near(s.grid.netMW, s.grid.grossMW - s.grid.auxMW, 1e-6, "net = gross - aux");
  const delivered = s.grid.contractedMW + s.grid.spotMW;
  assert.ok(delivered <= s.grid.netMW - s.grid.lossMW + 1e-6, "never sell more than generated minus losses");
  near(s.grid.contractedMW + s.grid.spotMW + s.grid.reserveMW, Math.max(0, s.grid.netMW - s.grid.lossMW), 1e-6, "contracted + spot + reserve/unsold = deliverable");
});

test("changing the turbine set point changes reactor power, generation, revenue (everything is connected)", () => {
  const s = game(); run(s, 300);
  const n0 = s.reactor.n, g0 = s.grid.grossMW, f0 = s.reactor.heatRemoved;
  dispatch(s, { type: "setSetpoint", mw: 200 }); run(s, 600);
  assert.ok(s.reactor.n < n0 - 0.15, "reactor power fell");
  assert.ok(s.grid.grossMW < g0 - 100 && s.reactor.heatRemoved < f0 - 300, "generation and heat removal fell");
  near(s.grid.grossMW, 200, 4, "gross tracks the new set point");
  const sold = s.grid.spotMW + s.grid.contractedMW;
  assert.ok(sold < 200, "less to sell");
});

test("cooling: losing a pump lowers heat removal capacity and flow", () => {
  const s = game(); run(s, 300);
  dispatch(s, { type: "setPump", id: "RCP-A", on: false }); dispatch(s, { type: "setPump", id: "RCP-B", speed: 1 }); dispatch(s, { type: "setPump", id: "RCP-C", speed: 1 });
  run(s, 60);
  assert.ok(s.reactor.flowFrac > 0.7 && s.reactor.flowFrac <= 0.8, "two pumps at full speed give at most 80 % flow (less when worn)");
  assert.ok(s.reactor.tCool > 297, "coolant runs hotter with less flow");
});

test("a failed pump is reflected in flow; failed turbine trips and reactor reacts", () => {
  const s = game(); run(s, 200);
  const p = s.equipment.find((e) => e.id === "RCP-A"); p.status = "failed";
  run(s, 5); assert.ok(s.reactor.pumps[0].flow === 0, "pump A delivers no flow");
  const t = s.equipment.find((e) => e.id === "TUR-1"); t.status = "failed";
  run(s, 3); assert.equal(s.turbine.tripped, true); assert.equal(s.grid.grossMW, 0);
  run(s, 600);
  assert.ok(s.reactor.n < 0.3 || s.reactor.scram, "reactor backs off (runback or SCRAM) after losing the turbine");
});

test("manual SCRAM drops power, locks rods, and cannot be reset instantly", () => {
  const s = game(); run(s, 100);
  dispatch(s, { type: "scram" }); run(s, 15);
  assert.equal(s.reactor.scram, true); assert.ok(s.reactor.n < 0.02);
  assert.equal(dispatch(s, { type: "resetScram" }).ok, false);
  assert.equal(dispatch(s, { type: "setRod", value: 0.5 }).ok, false);
  run(s, 200); assert.ok(s.reactor.decayHeat > 0, "decay heat remains after shutdown");
  assert.equal(dispatch(s, { type: "resetScram" }).ok, true);
});

test("protection trips the reactor on high coolant temperature when cooling is lost", () => {
  const s = game(); run(s, 100);
  for (const id of ["RCP-A", "RCP-B", "RCP-C"]) dispatch(s, { type: "setPump", id, on: false });
  run(s, 30); assert.equal(s.reactor.scram, true, "low flow SCRAM");
  assert.ok(/flow|temperature|pressure/i.test(s.reactor.scramReason));
});

test("contracts are delivered by priority and shortfalls cost money and reputation", () => {
  const s = game(); run(s, 120);
  dispatch(s, { type: "setSetpoint", mw: 120 }); run(s, 700);
  const short = s.contracts.filter((c) => c.shortfallMW > 0.01);
  assert.ok(short.length > 0, "some customers are short");
  const served = s.contracts.filter((c) => c.active).sort((a, b) => a.priority - b.priority);
  const maxPrioShort = Math.max(...short.map((c) => c.priority)), minPrioFull = Math.min(...served.filter((c) => c.shortfallMW < 0.01 && c.demandMW > 0).map((c) => c.priority), 9);
  assert.ok(served[0].shortfallMW <= short[short.length - 1].shortfallMW + 1e-9, "highest priority served first");
  assert.ok(s.finance.totals.penalties < 0 && s.stats.unservedMWh > 0);
  assert.ok(s.finance.reputation < 70);
  const total = s.contracts.reduce((a, c) => a + c.deliveredMW, 0);
  assert.ok(total <= s.grid.netMW - s.grid.lossMW + 1e-6, "customers never get more than is available");
});

test("negotiation: accepted at/below the hidden limit, countered above, ends after 3 rounds; contract then appears and affects revenue", () => {
  const s = game(); run(s, 60);
  s.offers.push({ id: "T1", customerId: "alu", capacityMW: 30, days: 100, asking: 40, reservation: 50, priority: 3, rounds: 0, expiresT: s.t + 99999, status: "open", note: "" });
  const n0 = s.contracts.length;
  let r = dispatch(s, { type: "negotiate", offerId: "T1", price: 70 }); assert.equal(s.offers[0].status, "open"); assert.match(r.msg, /Counter/);
  r = dispatch(s, { type: "negotiate", offerId: "T1", price: 49.9 }); assert.equal(s.offers[0].status, "accepted"); assert.equal(s.contracts.length, n0 + 1);
  run(s, 300); const c = s.contracts.at(-1); assert.ok(c.deliveredMW > 0 && c.totalRevenue > 0);
  s.offers.push({ id: "T2", customerId: "mine", capacityMW: 20, days: 100, asking: 40, reservation: 30, priority: 3, rounds: 0, expiresT: s.t + 99999, status: "open", note: "" });
  for (let i = 0; i < 3; i++) dispatch(s, { type: "negotiate", offerId: "T2", price: 90 });
  assert.equal(s.offers.find((o) => o.id === "T2").status, "withdrawn");
});

test("equipment wears with use, failure probability rises as condition falls, maintenance restores it and takes the unit out of service", () => {
  const s = game(); const e = s.equipment.find((x) => x.id === "TUR-1");
  const p0 = e.failureProb; e.condition = 30; run(s, 5); assert.ok(e.failureProb > p0 * 3);
  const c0 = e.condition; const cash = s.finance.cash;
  assert.equal(dispatch(s, { type: "scheduleMaintenance", id: "TUR-1", kind: "overhaul" }).ok, true);
  assert.equal(e.status, "maintenance"); assert.ok(s.finance.cash < cash);
  run(s, 20); assert.equal(s.turbine.online, false, "turbine offline while overhauled");
  run(s, 60 * 80); assert.ok(e.condition > c0 + 40 && e.status === "ok");
});

test("poor staffing raises failure probability and slows work", () => {
  const a = game(), b = game(); run(a, 5);
  for (const emp of [...b.staff].filter((x) => x.role === "operator").slice(0, 6)) dispatch(b, { type: "fire", id: emp.id });
  run(b, 5);
  assert.ok(b.flags.staffRatio < a.flags.staffRatio);
  const eq = (g) => g.equipment.find((x) => x.id === "TUR-1").failureProb;
  assert.ok(eq(b) > eq(a));
});

test("finance is consistent: cash change = cash income - cash expenses (+ loans/capital)", () => {
  const s = game({ difficulty: "normal" }); const cash0 = s.finance.cash; run(s, 1440 * 35);
  const t = s.finance.totals;
  const accrued = (t.contracts ?? 0) - (t.cashReceived ?? 0);
  const rest = Object.entries(t).filter(([k]) => !["contracts", "cashReceived"].includes(k)).reduce((a, [, v]) => a + v, 0);
  near(s.finance.cash - cash0, (t.cashReceived ?? 0) + rest, 1, "cash matches the ledger");
  const receivable = summary(s).receivables;
  near(receivable, accrued, 5, "receivables = revenue earned but not yet received");
});

test("determinism: same seed and same actions give identical states", () => {
  const a = game({ seed: 5 }), b = game({ seed: 5 });
  run(a, 1440 * 20); run(b, 1440 * 20);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("clock: advances in whole ticks independent of frame rate, pause stops everything", () => {
  const s = game(), c = new SimulationClock(); s.settings.paused = false; s.settings.speed = 5;
  let n = 0; for (let i = 0; i < 100; i++) n += c.advance(s, 0.01); near(n, 10, 1, "5x speed = 10 ticks per second");
  s.settings.paused = true; assert.equal(c.advance(s, 5), 0);
});

test("saves: round trip, rename, delete, export/import, migration of an unversioned save", async () => {
  const s = game(); run(s, 500);
  const m = new SaveManager(new MemoryBackend());
  await m.save("1", s, "My game"); await m.save("auto", s);
  assert.equal((await m.list()).length, 2);
  const back = await m.load("1"); assert.equal(JSON.stringify(back), JSON.stringify(s));
  await m.rename("1", "Renamed"); assert.equal((await m.list()).find((x) => x.id === "1").name, "Renamed");
  const text = await m.export("1"); const imp = importText(text); assert.equal(imp.state.t, s.t);
  await m.remove("1"); assert.equal((await m.list()).length, 1);
  const old = JSON.parse(JSON.stringify(s)); delete old.version; delete old.flags; delete old.hourly;
  const mig = migrate(old); assert.equal(mig.version, 2); assert.ok(mig.flags.staffRatio === 1 && Array.isArray(mig.hourly));
  assert.throws(() => importText("{nope"), /not valid JSON/); assert.throws(() => importText('{"app":"x"}'), /not a save/);
  const loaded = back; run(loaded, 100); assert.ok(loaded.t > s.t, "a loaded game keeps running");
});

test("30-day run in every mode stays finite and sane", () => {
  for (const mode of ["career", "sandbox", "challenge", "crisis", "realistic"]) for (const difficulty of ["beginner", "hardcore"]) {
    const s = createGame({ mode, difficulty, seed: 3 }); s.settings.paused = false; run(s, 1440 * 30);
    for (const v of [s.finance.cash, s.grid.netMW, s.reactor.tCool, s.reactor.n, s.market.spotPrice]) assert.ok(Number.isFinite(v), `${mode}/${difficulty} finite`);
    assert.ok(s.reactor.tCool > 0 && s.reactor.tCool < 450 && s.reactor.n >= 0);
  }
});
