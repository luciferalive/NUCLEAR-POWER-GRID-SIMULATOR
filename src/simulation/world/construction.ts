import type { GameState } from "../types.js";
import { MIN_PER_DAY, addLedger, clamp, log } from "../util.js";
import { BUILD_CATALOG } from "./data.js";
import type { Project, RegionId } from "./types.js";
import { worldEvent } from "./world.js";

const SITELESS = new Set(["line-upgrade", "connection"]);
export function startProject(s: GameState, o: { kind: string; region?: RegionId; targetId?: string }): string | null {
  const w = s.world, spec = BUILD_CATALOG.find((b) => b.id === o.kind);
  if (!spec) return "Unknown project type";
  if (spec.needsTech && !s.research.done.includes(spec.needsTech)) return `Needs research: ${spec.needsTech}`;
  const cost = Math.round(spec.cost * w.econ.construction * w.econ.cpi);
  if (s.finance.cash < cost * 0.1 && s.settings.mode !== "sandbox") return "Not enough cash for the first stage payments";
  let region: RegionId = o.region ?? "Central", x = 0, y = 0;
  if (SITELESS.has(o.kind)) {
    const l = w.lines.find((q) => q.id === o.targetId && q.kind === "supply"); if (!l) return "Choose a customer line";
    if (o.kind === "connection" && l.status !== "planned") return "That customer is already connected";
    if (o.kind === "line-upgrade" && l.status === "planned") return "Build the connection first";
    if (w.projects.some((p) => p.targetId === l.id && ["permit", "building", "paused"].includes(p.status))) return "A project on that line is already running";
    const c = s.customers.find((q) => q.id === l.customerId)!; region = (w.nodes.find((n) => n.id === "cust-" + c.id)?.region ?? "Central") as RegionId; x = c.x; y = c.y;
  } else {
    const plot = w.plots.find((p) => p.region === region && !p.used); if (!plot) return `No free land left in the ${region} region`;
    plot.used = true; x = plot.x; y = plot.y;
  }
  const p: Project = { id: "PRJ-" + (w.projects.length + 1), kind: o.kind, name: spec.name, region, x, y, cost, paid: 0, days: spec.days, progress: 0, materials: spec.materials, materialsUsed: 0, status: "permit", permitT: s.t + spec.permitDays * MIN_PER_DAY, startT: s.t, targetId: o.targetId, upkeep: spec.upkeep, stalled: "" };
  w.projects.push(p);
  addLedger(s, "permits", -cost * 0.02, `Permit fees ${p.id}`);
  worldEvent(s, "INFRASTRUCTURE", `${spec.name} submitted for approval in the ${region} region`, `Permit decision in ${spec.permitDays} days. Budget ${Math.round(cost / 1e5) / 10} M.`, "info");
  return null;
}
export function projectAction(s: GameState, id: string, what: "pause" | "resume" | "cancel"): string | null {
  const p = s.world.projects.find((q) => q.id === id); if (!p) return "Unknown project";
  if (["done", "cancelled"].includes(p.status)) return "Project is finished";
  if (what === "pause") { if (p.status !== "building") return "Only projects under construction can be delayed"; p.status = "paused"; p.stalled = "Delayed by you"; return null; }
  if (what === "resume") { if (p.status !== "paused") return "Not paused"; p.status = "building"; p.stalled = ""; return null; }
  const fee = (p.cost - p.paid) * 0.05; addLedger(s, "contractors", -fee, `Cancellation fee ${p.id}`);
  p.status = "cancelled"; const plot = s.world.plots.find((q) => q.x === p.x && q.y === p.y); if (plot) plot.used = false;
  log(s, "notice", "construction", `${p.name} cancelled. ${Math.round(p.paid).toLocaleString()} already spent is lost.`); return null;
}
export function progressProjects(s: GameState) {
  const w = s.world, f = s.finance;
  for (const p of w.projects) {
    if (p.status === "permit" && s.t >= p.permitT) {
      const spec = BUILD_CATALOG.find((b) => b.id === p.kind)!;
      if (s.safety.compliance < spec.minCompliance || w.reg.approvals < 40) { p.status = "cancelled"; p.stalled = "Permit refused"; const plot = w.plots.find((q) => q.x === p.x && q.y === p.y); if (plot) plot.used = false; w.reg.approvals = clamp(w.reg.approvals - 8, 0, 100); worldEvent(s, "REGULATION", `Permit refused for ${p.name}`, `The authority requires compliance of at least ${spec.minCompliance} %. Yours is ${s.safety.compliance.toFixed(0)} %.`, "warning"); }
      else { p.status = "building"; worldEvent(s, "INFRASTRUCTURE", `${p.name} receives development approval`, `Construction in the ${p.region} region begins and will take about ${p.days} days.`, "notice"); }
    }
    if (p.status !== "building") continue;
    const needM = p.materials / p.days, pay = p.cost / p.days;
    if ((s.inventory.materials ?? 0) < needM) { p.stalled = "Waiting for construction materials (order them in Procurement)"; continue; }
    if (f.cash < pay && s.settings.mode !== "sandbox") { p.stalled = "Waiting for funds"; continue; }
    s.inventory.materials -= needM; p.materialsUsed += needM; p.stalled = "";
    addLedger(s, "contractors", -pay * 0.6, `Contractor payment ${p.id}`); addLedger(s, "engineering", -pay * 0.25, `Engineering ${p.id}`); addLedger(s, "construction", -pay * 0.15, `Site costs ${p.id}`);
    p.paid += pay; p.progress += 1;
    if (p.progress >= p.days) complete(s, p);
  }
}
function complete(s: GameState, p: Project) {
  const w = s.world; p.status = "done"; f_(s, p);
  switch (p.kind) {
    case "substation": { const r = w.regions.find((x) => x.id === p.region)!; r.tieCapMW += 120; const b = w.lines.find((l) => l.id === "B-" + p.region); if (b) b.capMW += 120; break; }
    case "transformer": { const r = w.regions.find((x) => x.id === p.region)!; r.tieCapMW += 60; w.extraCap.transformer = 1; break; }
    case "line-upgrade": { const l = w.lines.find((x) => x.id === p.targetId)!; l.capMW += 40; l.condition = 100; break; }
    case "connection": { const l = w.lines.find((x) => x.id === p.targetId)!; l.status = "ok"; l.condition = 100; break; }
    case "gas-peaker": w.ownGen.push({ id: p.id, name: `Gas peaker (${p.region})`, kind: "gas", region: p.region, mw: 60, outMW: 0, costPerMWh: 62, x: p.x, y: p.y, online: true }); break;
    case "solar": w.ownGen.push({ id: p.id, name: `Solar farm (${p.region})`, kind: "solar", region: p.region, mw: 40, outMW: 0, costPerMWh: 0, x: p.x, y: p.y, online: true }); break;
    case "wind": w.ownGen.push({ id: p.id, name: `Wind farm (${p.region})`, kind: "wind", region: p.region, mw: 50, outMW: 0, costPerMWh: 0, x: p.x, y: p.y, online: true }); break;
    case "battery": w.batteries.push({ id: p.id, name: `Battery storage (${p.region})`, region: p.region, powerMW: 40, capMWh: 160, energyMWh: 0, effIn: 0.94, effOut: 0.94, mode: "auto", flowMW: 0, lossMWh: 0, chargedMWh: 0, dischargedMWh: 0, x: p.x, y: p.y, wear: 0 }); break;
    case "warehouse": w.buildings.warehouse++; break; case "workshop": w.buildings.workshop++; break; case "admin": w.buildings.admin++; break;
  }
  worldEvent(s, "INFRASTRUCTURE", `${p.name} completed in the ${p.region} region`, "The facility is operational and its upkeep is now part of your daily expenses.", "notice");
}
const f_ = (s: GameState, p: Project) => { s.finance.assets += p.cost * 0.85; };
