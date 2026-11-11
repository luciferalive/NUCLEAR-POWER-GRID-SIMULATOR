import { createWorld } from "./world/world.js";
import { DIFFICULTY, EXPORT_CAP, PNOM } from "./constants.js";
import { makeContract } from "./economyEngine.js";
import { makeEquipment, newEmployee } from "./maintenanceEngine.js";
import { stepPlant } from "./powerGrid.js";
import { MIN_PER_DAY } from "./util.js";
export const SAVE_VERSION = 2;
export const CUSTOMERS = [
    { id: "steel", name: "Ironvale Steelworks", industry: "steel", region: "North", peakMW: 120, loadShape: "steel", credit: 0.9, reservation: 52, x: 640, y: 230 },
    { id: "alu", name: "Polar Aluminium Smelter", industry: "aluminium", region: "North", peakMW: 95, loadShape: "flat", credit: 0.8, reservation: 46, x: 760, y: 140 },
    { id: "cement", name: "Granite Ridge Cement", industry: "cement", region: "East", peakMW: 45, loadShape: "shift", credit: 0.7, reservation: 56, x: 820, y: 420 },
    { id: "chem", name: "Novaprime Chemicals", industry: "chemical", region: "East", peakMW: 65, loadShape: "flat", credit: 0.85, reservation: 58, x: 700, y: 540 },
    { id: "oil", name: "Blackwater Oil & Gas Terminal", industry: "oil & gas", region: "South", peakMW: 55, loadShape: "flat", credit: 0.75, reservation: 60, x: 520, y: 760 },
    { id: "dc", name: "Helix Data Centers", industry: "data center", region: "West", peakMW: 75, loadShape: "datacenter", credit: 0.95, reservation: 66, x: 180, y: 330 },
    { id: "mine", name: "Deepseam Mining Co.", industry: "mining", region: "North", peakMW: 50, loadShape: "shift", credit: 0.6, reservation: 54, x: 350, y: 120 },
    { id: "mfg", name: "Corvette Manufacturing Group", industry: "manufacturing", region: "West", peakMW: 45, loadShape: "shift", credit: 0.8, reservation: 62, x: 230, y: 560 },
    { id: "resid", name: "Riverbend Power Distribution", industry: "residential", region: "Central", peakMW: 160, loadShape: "residential", credit: 0.97, reservation: 57, x: 430, y: 430 },
    { id: "gov", name: "State Infrastructure Authority", industry: "government", region: "Central", peakMW: 40, loadShape: "government", credit: 0.99, reservation: 49, x: 560, y: 330 },
];
const STAFF = [["operator", 9], ["engineer", 3], ["electrician", 3], ["mechanic", 3], ["safety", 2], ["maintenance", 5], ["security", 4], ["finance", 2], ["manager", 2]];
export function createGame(opts = {}) {
    const difficulty = opts.difficulty ?? "beginner", mode = opts.mode ?? "career", seed = opts.seed ?? 20260101;
    const d = DIFFICULTY[difficulty];
    const cash = mode === "sandbox" ? 999_000_000 : mode === "crisis" ? 6_000_000 : mode === "realistic" ? Math.round(d.startCash * 0.5) : d.startCash;
    const s = {
        version: SAVE_VERSION, t: 0, rngState: seed,
        settings: { difficulty, mode, speed: 1, paused: true, volMaster: 0.7, volAmbience: 0.5, volEquipment: 0.6, volAlarms: 0.8, volUi: 0.5, muted: false, autosave: true, tutorialStep: 0, tutorialDone: false, tooltips: true, companyName: opts.company ?? "Meridian Nuclear Power", seed },
        reactor: { rod: 0.74, rodTarget: 0.74, autoRods: true, n: 0.85, xenon: 0.5, tFuel: 620, tCool: 298, pressure: 155, flowFrac: 1, pumps: [{ id: "RCP-A", on: true, speed: 0.83, flow: 0.33 }, { id: "RCP-B", on: true, speed: 0.83, flow: 0.33 }, { id: "RCP-C", on: true, speed: 0.83, flow: 0.33 }],
            scram: false, scramReason: "", scramSince: 0, burnup: 0.25, containment: 100, protection: true, heatRemoved: 1000, decayHeat: 60, iodine: 0.85, outageLeftMin: 0 },
        turbine: { setpointMW: 340, tripped: false, grossMW: 340, steamMWt: 1000, efficiency: 0.33, rpm: 3000, vibration: 1.5, online: true },
        cooling: { fans: 0.6, basinTemp: 24, condenserTemp: 32, waterUseM3h: 1200, condenserFactor: 1, intakeOpen: true },
        grid: { grossMW: 340, auxMW: 28, netMW: 312, lossMW: 5, contractedMW: 0, spotMW: 0, exportCapMW: EXPORT_CAP, reserveMW: 0, unservedMW: 0, boughtMW: 0, frequency: 50, breakerClosed: true, frequencyEventUntil: 0, connectionOk: true, demandMW: 0 },
        market: { spotPrice: 55, spotSoldMW: 0, spotBoughtMW: 0, regionalDemand: 1500, competitorSupply: 1500, exportCapMW: EXPORT_CAP, priceHistory: [], forecast: [], autoBuy: false, sellSurplus: true, reserveMW: 0, basePrice: 55 },
        finance: { cash, debt: 120_000_000, interestRate: 0.055, loans: [{ id: 1, principal: 120_000_000, rate: 0.055 }], ledger: [], totals: {}, day: {}, month: {}, year: {}, prevDay: {}, prevMonth: {}, dailyHistory: [], assets: 190_000_000, invoices: [], reputation: 70 },
        customers: CUSTOMERS.map((c) => ({ ...c })), contracts: [], offers: [], equipment: makeEquipment(), staff: [], nextEmployeeId: 1,
        inventory: { spares: 20, supplies: 40, components: 4, materials: 0 }, research: { done: [], current: null, progressDays: 0, budgetPerDay: 0 }, upgrades: [],
        events: [], nextEventId: 1, eventHistory: [], weather: { temp: 16, wind: 6, sun: 0.4, rain: 0, kind: "sunny", changeT: 600 },
        safety: { compliance: 88, safetyScore: 90, incidents: [], nextInspectionT: 40 * MIN_PER_DAY, fines: 0, licenceOk: true, drillsDoneT: -5 * MIN_PER_DAY, backupPowerReady: true },
        log: [], alarms: {}, hourly: [], objectives: [],
        stats: { totalMWh: 0, todayMWh: 0, monthMWh: 0, yearMWh: 0, contractMWh: 0, spotMWh: 0, unservedMWh: 0, boughtMWh: 0, scrams: 0, uptimeMin: 0, lastDay: 0, lastMonth: 0, lastYear: 0, profitableMonths: 0, peakNetMW: 0 },
        flags: { staffRatio: 1, staffQuality: 0.8, growth: 0, inflation: 0 },
    };
    for (const [role, n] of STAFF)
        for (let i = 0; i < n; i++) {
            const e = newEmployee(s, role, 2 + ((i * 5) % 11));
            e.cert = true;
            e.training = 0.7;
            s.staff.push(e);
        }
    for (const [cid, cap, price, prio] of [["steel", 70, 53, 2], ["resid", 80, 57, 1], ["dc", 35, 64, 2], ["cement", 25, 55, 3], ["mfg", 25, 60, 3]])
        s.contracts.push(makeContract(s, { customerId: cid, capacityMW: cap, price, days: 400, priority: prio }));
    if (mode === "crisis")
        for (const e of s.equipment) {
            e.condition = Math.max(25, e.condition - 38);
            if (e.condition < 45)
                e.status = "degraded";
        }
    if (mode === "realistic")
        for (const e of s.equipment)
            e.condition = Math.max(40, e.condition - 15);
    s.objectives = objectivesFor(mode);
    // settle the plant into a steady state before the first minute is played (does not touch money or stats)
    s.t = 0;
    for (let i = 0; i < 4000; i++) {
        s.t++;
        stepPlant(s, 1);
    }
    s.world = undefined;
    s.t = 6 * 60;
    createWorld(s);
    s.log = [];
    s.alarms = {};
    s.stats.scrams = 0;
    s.safety.incidents = [];
    s.reactor.burnup = mode === "crisis" ? 0.8 : 0.25;
    s.log.push({ t: s.t, sev: "info", cat: "system", msg: `Welcome, director. ${s.settings.companyName} is online at ${(s.grid.netMW).toFixed(0)} MW net. The clock is paused: press Play when ready.` });
    return s;
}
export function objectivesFor(mode) {
    const d = (days) => days * MIN_PER_DAY;
    if (mode === "career")
        return [
            { id: "o1", text: "Complete 3 profitable months", metric: "profitableMonths", target: 3, deadlineT: d(400), done: false, failed: false },
            { id: "o2", text: "Supply electricity to 7 customers", metric: "activeContracts", target: 7, deadlineT: d(400), done: false, failed: false },
            { id: "o3", text: "Reach a reputation of 85", metric: "reputation", target: 85, deadlineT: d(400), done: false, failed: false },
        ];
    if (mode === "challenge")
        return [
            { id: "o1", text: "Sell 90,000 MWh within 30 days", metric: "totalMWh", target: 90_000, deadlineT: d(30), done: false, failed: false },
            { id: "o2", text: "Hold more than 20 million in cash on day 30", metric: "cash", target: 20_000_000, deadlineT: d(30), done: false, failed: false },
        ];
    if (mode === "crisis")
        return [
            { id: "o1", text: "Stabilise: reach 12 million in cash within 45 days", metric: "cash", target: 12_000_000, deadlineT: d(45), done: false, failed: false },
            { id: "o2", text: "Avoid every SCRAM for 45 days", metric: "noScram", target: 1, deadlineT: d(45), done: false, failed: false },
        ];
    if (mode === "realistic")
        return [
            { id: "o1", text: "Turn a profit in 2 of the first 3 months", metric: "profitableMonths", target: 2, deadlineT: d(100), done: false, failed: false },
            { id: "o2", text: "Keep compliance above 80", metric: "compliance", target: 80, deadlineT: d(100), done: false, failed: false },
        ];
    return [{ id: "o1", text: "Experiment freely: no objectives in Sandbox mode", metric: "none", target: 1, deadlineT: d(9999), done: false, failed: false }];
}
export { PNOM };
