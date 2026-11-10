import { addLedger, log } from "./util.js";
export const TECHS = [
    { id: "gen-eff", name: "High-efficiency generator windings", category: "Generator efficiency", cost: 4_500_000, days: 45, text: "+1.2 points of thermal-to-electric efficiency." },
    { id: "grid-hv", name: "High-voltage grid connection", category: "Grid infrastructure", cost: 5_500_000, days: 60, text: "+20 % export capacity and lower transmission losses." },
    { id: "storage", name: "Grid-scale energy storage research", category: "Energy storage", cost: 3_000_000, days: 50, text: "Unlocks battery storage (World update). Lets you shift energy to peak hours." },
    { id: "renewable", name: "Renewable integration", category: "Renewable energy", cost: 2_500_000, days: 40, text: "Better forecasts of weather-driven competitors (World update)." },
    { id: "ind-mgmt", name: "Industrial energy management", category: "Industrial energy management", cost: 2_200_000, days: 35, text: "+2 % price on contracts and spot sales through smarter dispatch." },
    { id: "reliability", name: "Equipment reliability programme", category: "Equipment reliability", cost: 3_200_000, days: 45, text: "-20 % equipment wear." },
    { id: "predictive", name: "Predictive maintenance analytics", category: "Predictive maintenance", cost: 3_800_000, days: 50, text: "-25 % failure probability and days-to-failure forecasts.", needs: "reliability" },
    { id: "monitoring", name: "Advanced monitoring suite", category: "Advanced monitoring", cost: 2_000_000, days: 30, text: "Shows the contribution of every system to alarms and an extra 30 min warning on trips." },
    { id: "fin-opt", name: "Financial optimisation", category: "Financial optimization", cost: 1_800_000, days: 30, text: "-4 % on running costs." },
    { id: "env-tech", name: "Water-saving cooling technology", category: "Environmental technology", cost: 2_600_000, days: 40, text: "-15 % cooling-water use and better compliance." },
];
export const UPGRADES = [
    { id: "turbine-uprate", name: "Turbine uprate kit", cost: 7_500_000, text: "+8 % maximum electrical output (needs a good turbine)." },
    { id: "cooling-towers+", name: "Extra cooling cells", cost: 3_200_000, text: "+20 % cooling capacity." },
    { id: "second-transformer", name: "Parallel transformer bay", cost: 4_800_000, text: "+25 % grid export capacity." },
    { id: "advanced-ops", name: "Digital control-room upgrade", cost: 2_900_000, text: "Faster automatic rod control and operator support." },
];
export function startResearch(s, id) {
    const t = TECHS.find((x) => x.id === id);
    if (!t)
        return "Unknown technology";
    if (s.research.done.includes(id))
        return "Already researched";
    if (s.research.current)
        return "Another project is running";
    if (t.needs && !s.research.done.includes(t.needs))
        return `Requires ${TECHS.find((x) => x.id === t.needs)?.name}`;
    if (s.finance.cash < t.cost * 0.1 && s.settings.mode !== "sandbox")
        return "Not enough cash to start";
    s.research.current = id;
    s.research.progressDays = 0;
    s.research.budgetPerDay = t.cost / t.days;
    log(s, "notice", "research", `Research started: ${t.name} (${t.days} days, ${Math.round(s.research.budgetPerDay).toLocaleString()} per day).`);
    return null;
}
export function stepResearch(s, dt) {
    const id = s.research.current;
    if (!id)
        return;
    const t = TECHS.find((x) => x.id === id);
    const funded = s.finance.cash > 0 || s.settings.mode === "sandbox";
    if (funded)
        s.research.progressDays += dt / 1440;
    if (s.research.progressDays >= t.days) {
        s.research.done.push(id);
        s.research.current = null;
        s.research.budgetPerDay = 0;
        log(s, "notice", "research", `Research complete: ${t.name}. ${t.text}`);
    }
}
export function buyUpgrade(s, id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u)
        return "Unknown upgrade";
    if (s.upgrades.includes(id))
        return "Already installed";
    if (s.finance.cash < u.cost && s.settings.mode !== "sandbox")
        return "Not enough cash";
    addLedger(s, "capital", -u.cost, `Upgrade: ${u.name}`);
    s.upgrades.push(id);
    log(s, "notice", "upgrades", `Installed: ${u.name}.`);
    return null;
}
