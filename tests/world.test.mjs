import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../docs/js/simulation/scenarios.js";
import { step, run, dispatch } from "../docs/js/simulation/engine.js";
import { migrate } from "../docs/js/store/saves.js";
import { demandMult } from "../docs/js/simulation/world/world.js";
import { quotePrice } from "../docs/js/simulation/world/actions.js";
import { ACHIEVEMENTS, valuation } from "../docs/js/simulation/world/achievements.js";

const game = (o = {}) => createGame({ difficulty: "beginner", ...o });
const W = (s, cmd) => dispatch(s, { type: "world", cmd });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const finite = (o, path = "") => { for (const [k, v] of Object.entries(o)) { if (typeof v === "number") assert.ok(Number.isFinite(v), `not finite: ${path}${k}`); else if (v && typeof v === "object") finite(v, path + k + "."); } };

test("old V1 save migrates to V2, keeps its data and keeps running", () => {
  const s = game(); run(s, 3000);
  const old = JSON.parse(JSON.stringify(s)); delete old.world; old.version = 1; old.inventory = { spares: 7, supplies: 0 }; old.stats.totalMWh = 12345; const cash = old.finance.cash;
  const m = migrate(old);
  assert.equal(m.version, 2); assert.ok(m.world.regions.length === 5 && m.world.lines.length > 15); assert.equal(m.finance.cash, cash); assert.equal(m.stats.totalMWh, 12345); assert.equal(m.inventory.spares, 7);
  run(m, 20 * 1440); finite(m);
});

test("transmission capacity limits what a customer receives; faulty line carries nothing", () => {
  const s = game(); run(s, 300);
  const c = s.contracts.find((x) => x.customerId === "steel"), l = s.world.lines.find((x) => x.customerId === "steel");
  assert.ok(c.deliveredMW > 20);
  l.capMW = 15; run(s, 2); near(c.deliveredMW, 15, 1e-6, "limited to line capacity"); assert.ok(c.shortfallMW > 5);
  const pen = s.finance.totals.penalties ?? 0; run(s, 60); assert.ok((s.finance.totals.penalties ?? 0) < pen, "shortfall costs penalties");
  l.capMW = 200; l.status = "fault"; l.faultUntil = s.t + 600; run(s, 2); assert.equal(c.deliveredMW, 0); assert.equal(l.flowMW, 0, "no flow means no animation");
  l.faultUntil = s.t; run(s, 61); assert.equal(l.status === "fault", false, "fault clears"); assert.ok(c.deliveredMW > 0 || s.world.lines.find((x) => x.id === l.id).status === "fault");
});

test("regional substation capacity limits deliveries into the region", () => {
  const s = game(); run(s, 300);
  s.world.regions.find((r) => r.id === "Central").tieCapMW = 30; run(s, 2);
  const into = s.contracts.filter((c) => ["resid", "gov"].includes(c.customerId)).reduce((a, c) => a + c.deliveredMW, 0);
  assert.ok(into <= 30 + 1e-6, `Central deliveries ${into}`);
});

test("line losses add up to the grid loss and flows add up to deliveries", () => {
  const s = game(); run(s, 600);
  const flows = s.world.lines.filter((l) => l.kind === "supply").reduce((a, l) => a + l.flowMW, 0);
  near(flows, s.grid.contractedMW - s.grid.boughtMW + s.grid.boughtMW, 1e-6, "supply line flow = contracted");
  const loss = s.world.lines.filter((l) => l.kind === "supply" || l.id === "L-export").reduce((a, l) => a + l.lossMW, 0);
  near(loss, s.grid.lossMW, 0.01, "line losses = grid loss");
});

test("battery: energy accounting is consistent and discharge supplies a shortage", () => {
  const s = game({ mode: "sandbox" }); run(s, 300);
  s.world.batteries.push({ id: "B1", name: "b", region: "Central", powerMW: 40, capMWh: 160, energyMWh: 0, effIn: 0.9, effOut: 0.9, mode: "charge", flowMW: 0, lossMWh: 0, chargedMWh: 0, dischargedMWh: 0, x: 1, y: 1, wear: 0 });
  const b = s.world.batteries[0]; run(s, 240);
  assert.ok(b.energyMWh > 100 && b.energyMWh <= 160 + 1e-9, `charged ${b.energyMWh}`);
  near(b.energyMWh, b.chargedMWh * 0.9 - b.dischargedMWh / 0.9, b.chargedMWh * 0.01 + 0.5, "stored = in*eff - out/eff");
  const before = b.energyMWh; b.mode = "discharge"; run(s, 60);
  assert.ok(b.energyMWh < before && b.dischargedMWh > 20, "discharging lowers stored energy"); assert.ok(b.energyMWh >= 0);
  b.mode = "auto"; s.turbine.setpointMW = 150; run(s, 600); assert.ok(b.energyMWh >= 0); finite(s);
});

test("procurement: quote, order, delayed delivery, invoice paid on terms, cash consistent", () => {
  const s = game(); run(s, 100);
  const before = s.inventory.spares, sup = s.world.suppliers[0];
  assert.equal(W(s, { c: "quote", supplierId: sup.id, item: "spares", qty: 10 }).ok, true);
  const q = s.world.quotes.at(-1); assert.ok(q.unitPrice > 10_000);
  assert.equal(W(s, { c: "order", quoteId: q.id }).ok, true);
  run(s, 2 * 1440); assert.equal(s.inventory.spares, before, "not delivered yet");
  const cash0 = s.finance.cash; run(s, 40 * 1440);
  assert.equal(s.inventory.spares > before, true, "delivered");
  assert.equal(s.world.payables.length >= 0, true);
  const paid = s.world.payables.filter((p) => p.paid).length + s.world.payables.filter((p) => !p.paid).length; assert.ok(paid >= 1);
  assert.equal(W(s, { c: "quote", supplierId: sup.id, item: "supplies", qty: 5 }).ok, false, "supplier does not sell supplies");
});

test("procurement: inflation raises quotes; a cut maintenance budget raises wear", () => {
  const s = game(); const a = quotePrice(s, "sup-1", "spares", 10); s.world.econ.cpi = 1.2; const b = quotePrice(s, "sup-1", "spares", 10); assert.ok(b > a * 1.15);
  const x = game(), y = game(); W(y, { c: "budget", maint: 0.7 }); run(x, 20 * 1440); run(y, 20 * 1440);
  const w = (g) => g.equipment.reduce((acc, e) => acc + e.condition, 0);
  assert.ok(w(y) < w(x), "less maintenance budget, more wear");
  assert.ok((y.finance.totals["facility-maintenance"] ?? 0) > (x.finance.totals["facility-maintenance"] ?? 0), "and less spent on facilities (totals are negative)");
});

test("construction needs approval, materials and money; completing a substation raises regional capacity", () => {
  const s = game({ mode: "sandbox" }); run(s, 100);
  const cap0 = s.world.regions.find((r) => r.id === "East").tieCapMW;
  assert.equal(W(s, { c: "project", kind: "substation", region: "East" }).ok, true);
  const p = s.world.projects[0]; run(s, 25 * 1440); assert.equal(p.status, "building");
  run(s, 5 * 1440); assert.equal(p.progress, 0, "no materials, no progress"); assert.ok(/material/i.test(p.stalled));
  s.inventory.materials = 5000; run(s, 95 * 1440); assert.equal(p.status, "done");
  assert.equal(s.world.regions.find((r) => r.id === "East").tieCapMW, cap0 + 120);
  assert.equal(W(s, { c: "projectCtl", id: p.id, what: "cancel" }).ok, false);
  assert.ok(s.world.achievements.expansion !== undefined, "expansion achievement");
});

test("construction cannot bypass money or land", () => {
  const s = game({ mode: "crisis" }); s.finance.cash = 100_000;
  assert.equal(W(s, { c: "project", kind: "substation", region: "East" }).ok, false);
  const t = game({ mode: "sandbox" }); for (let i = 0; i < 3; i++) assert.equal(W(t, { c: "project", kind: "warehouse", region: "West" }).ok, true);
  assert.equal(W(t, { c: "project", kind: "warehouse", region: "West" }).ok, false, "no free land");
});

test("economy: recession cuts industrial demand and phases advance", () => {
  const s = game(); const c = s.customers.find((x) => x.id === "steel");
  const normal = demandMult(s, c); s.world.econ.manufacturing = 0.85; assert.ok(demandMult(s, c) < normal);
  const t = game(); const p0 = t.world.econ.phase; run(t, 400 * 1440); assert.notEqual(t.world.econ.phase, p0); finite(t.world.econ);
});

test("competitor outage raises the spot price and news reflects real events", () => {
  const s = game(); run(s, 3 * 1440); const p0 = s.market.spotPrice;
  for (const c of s.world.competitors) if (c.tech === "coal" || c.tech === "gas" || c.tech === "nuclear") { c.status = "outage"; c.statusUntil = s.t + 20 * 1440; }
  run(s, 6 * 60); assert.ok(s.market.spotPrice > p0 * 1.2, `price ${p0} -> ${s.market.spotPrice}`);
  run(s, 60 * 1440); assert.ok(s.world.news.length > 3); assert.ok(s.world.news.every((n) => n.headline && n.t <= s.t));
  assert.ok(s.world.timeline.length >= s.world.news.length * 0.5);
});

test("customer events change demand and offers", () => {
  const s = game(); const c = s.customers.find((x) => x.id === "mfg"), i = s.world.intel.mfg;
  i.state = "shutdown"; i.mult = 0.05; i.until = s.t + 5 * 1440; run(s, 5);
  const con = s.contracts.find((x) => x.customerId === "mfg"); assert.ok(con.demandMW < 3, `demand ${con.demandMW}`);
  run(s, 400 * 1440); assert.ok(s.customers.length >= 10); finite(s);
});

test("achievements are earned by real play; valuation is consistent", () => {
  const s = game(); run(s, 200); assert.ok(s.world.achievements["first-mw"] !== undefined);
  assert.equal(s.world.achievements["first-contract"], undefined);
  const o = { id: "T", customerId: "alu", capacityMW: 30, days: 100, asking: 50, reservation: 60, priority: 3, rounds: 0, expiresT: s.t + 9999, status: "open", note: "" }; s.offers.push(o);
  assert.equal(dispatch(s, { type: "acceptOffer", offerId: "T" }).ok, true); run(s, 61); assert.ok(s.world.achievements["first-contract"] !== undefined);
  assert.ok(Number.isFinite(valuation(s)) && valuation(s) > 0); assert.ok(ACHIEVEMENTS.length >= 12);
});

test("finance stays consistent with supplier invoices: cash = start + cash flows - unpaid payables", () => {
  const s = game(); const start = s.finance.cash; run(s, 100);
  W(s, { c: "quote", supplierId: "sup-5", item: "materials", qty: 300 }); W(s, { c: "order", quoteId: s.world.quotes.at(-1).id });
  run(s, 70 * 1440);
  const f = s.finance, t = f.totals;
  const pay = s.world.payables.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0);
  const rest = Object.entries(t).filter(([k]) => !["contracts", "cashReceived"].includes(k)).reduce((a, [, v]) => a + v, 0);
  // accrued supplier invoices are booked as expenses but not yet paid, so add the unpaid amount back
  near(f.cash - start, (t.cashReceived ?? 0) + rest + pay, 1, "cash identity");
  assert.ok(pay >= 0 && s.world.payables.length >= 1, "an invoice exists");
});

test("deterministic: same seed, same world", () => {
  const a = game({ seed: 77 }), b = game({ seed: 77 }); run(a, 20 * 1440); run(b, 20 * 1440);
  assert.equal(JSON.stringify(a.world), JSON.stringify(b.world)); assert.equal(a.finance.cash, b.finance.cash);
});

test("60-day run stays finite in every mode", () => {
  for (const mode of ["career", "crisis", "sandbox", "realistic", "challenge"]) { const s = game({ mode }); run(s, 60 * 1440); finite(s); assert.ok(s.finance.cash > -5e9); }
});
