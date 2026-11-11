import { log } from "../util.js";
import { worldEvent } from "./world.js";
export const valuation = (s) => { const w = s.world; return s.finance.cash + s.finance.assets + s.finance.invoices.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0) + s.contracts.reduce((a, c) => a + c.accruedUnbilled, 0) - s.finance.debt - w.payables.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0); };
export const ACHIEVEMENTS = [
    { id: "first-mw", name: "First Megawatt", text: "Generate electricity.", test: (s) => s.stats.totalMWh > 1 },
    { id: "first-contract", name: "First Contract", text: "Sign an industrial electricity contract yourself.", test: (s) => (s.flags.signed ?? 0) >= 1 },
    { id: "profitable-month", name: "Profitable Month", text: "Complete a profitable month.", test: (s) => s.stats.profitableMonths >= 1 },
    { id: "grid-operator", name: "Grid Operator", text: "Deliver electricity to five customers at once.", test: (s) => s.contracts.filter((c) => c.active && c.deliveredMW > 0).length >= 5 },
    { id: "powerhouse", name: "Industrial Powerhouse", text: "Deliver electricity to ten customers at once.", test: (s) => s.contracts.filter((c) => c.active && c.deliveredMW > 0).length >= 10 },
    { id: "expansion", name: "Expansion", text: "Build a new substation.", test: (s) => s.world.projects.some((p) => p.kind === "substation" && p.status === "done") },
    { id: "market-leader", name: "Market Leader", text: "Hold the highest market share of all generators.", test: (s) => s.world.marketShare > 0 && s.world.competitors.every((c) => c.share < s.world.marketShare) && s.t > 14 * 1440 },
    { id: "financial-success", name: "Financial Success", text: "Reach a company valuation of 250 M.", test: (s) => valuation(s) >= 250e6 },
    { id: "storage-pioneer", name: "Storage Pioneer", text: "Build battery storage.", test: (s) => s.world.batteries.length > 0 },
    { id: "green-power", name: "Green Power", text: "Own a solar or wind installation.", test: (s) => s.world.ownGen.some((g) => g.kind !== "gas") },
    { id: "connected", name: "Connected", text: "Connect a new industrial customer.", test: (s) => s.world.projects.some((p) => p.kind === "connection" && p.status === "done") },
    { id: "clean-record", name: "Clean Record", text: "Run 60 days without a SCRAM while compliance stays above 80 %.", test: (s) => s.stats.scrams === 0 && s.t > 66 * 1440 && s.safety.compliance > 80 },
    { id: "good-partner", name: "Preferred Customer", text: "Reach a relationship of 90 with a supplier.", test: (s) => s.world.suppliers.some((p) => p.relation >= 90) },
    { id: "debt-free", name: "Debt Free", text: "Repay all loans.", test: (s) => s.finance.debt <= 1 && s.t > 3 * 1440 },
    { id: "survivor", name: "Storm Survivor", text: "Keep delivering through a severe storm without a SCRAM.", test: (s) => Object.values(s.world.weather).some((x) => ["thunderstorm", "flooding"].includes(x.kind)) && s.stats.scrams === 0 && s.grid.contractedMW > 100 && s.t > 20 * 1440 },
    { id: "peak-output", name: "Peak Performer", text: "Reach 350 MW net output.", test: (s) => s.stats.peakNetMW >= 350 },
];
export function checkAchievements(s) {
    const w = s.world;
    for (const a of ACHIEVEMENTS)
        if (!(a.id in w.achievements) && a.test(s)) {
            w.achievements[a.id] = s.t;
            worldEvent(s, "ECONOMY", `Achievement unlocked: ${a.name}`, a.text, "notice");
            log(s, "notice", "achievement", `Achievement unlocked: ${a.name}`);
        }
}
