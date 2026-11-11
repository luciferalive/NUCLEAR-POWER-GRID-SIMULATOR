import { MIN_PER_DAY, addLedger, clamp } from "../util.js";
import { worldEvent } from "./world.js";
export function regulatorDaily(s) {
    const w = s.world, r = w.reg, day = Math.floor(s.t / MIN_PER_DAY);
    r.wasteStored += s.reactor.n * 0.35 * (s.research.done.includes("env-tech") ? 0.9 : 1);
    r.env = clamp(r.env + (s.cooling.basinTemp > 33 ? -0.5 : 0.15) + (s.cooling.intakeOpen ? 0 : -0.5), 0, 100);
    r.waste = clamp(r.waste + (r.wasteStored > r.wasteCap * 0.9 ? -1.4 : r.wasteStored > r.wasteCap * 0.7 ? -0.3 : 0.2), 0, 100);
    r.reporting = clamp(r.reporting + (r.reportFiled || s.t < r.reportDueT ? 0.1 : -1.2) + (w.flags.adminLevel === 0 ? -0.15 : 0.03), 0, 100);
    const stale = s.equipment.filter((e) => !e.history.some((h) => s.t - h.t < 120 * MIN_PER_DAY && !/Commissioned/.test(h.what))).length;
    r.inspections = clamp(100 - stale * 7, 0, 100);
    r.approvals = clamp(r.approvals + 0.1, 0, 100);
    if (r.wasteStored > r.wasteCap) {
        addLedger(s, "fines", -35_000, "Waste storage over capacity");
        r.wasteStored = r.wasteCap;
        r.waste = clamp(r.waste - 4, 0, 100);
    }
    if (s.t >= r.nextAuditT) {
        const avg = (r.env + r.reporting + r.waste + r.inspections + r.approvals + s.safety.safetyScore) / 6;
        r.nextAuditT = s.t + (45 + Math.round((day * 7) % 15)) * MIN_PER_DAY;
        r.lastInspectionT = s.t;
        s.safety.compliance = clamp(s.safety.compliance + (avg - 72) * 0.12, 0, 100);
        if (avg < 62) {
            const fine = Math.round((62 - avg) * 45_000);
            addLedger(s, "fines", -fine, "Regulatory audit findings");
            s.safety.fines += fine;
            r.findings.push({ t: s.t, text: `Audit score ${avg.toFixed(0)} %: weakest area ${weakest(s)}`, fine });
            worldEvent(s, "REGULATION", `Regulator fines the company after an audit`, `Audit score ${avg.toFixed(0)} %. Weakest area: ${weakest(s)}. Fine ${fine.toLocaleString()}.`, "warning");
        }
        else {
            r.findings.push({ t: s.t, text: `Audit passed with ${avg.toFixed(0)} %`, fine: 0 });
            worldEvent(s, "REGULATION", "Regulator completes an audit: no penalties", `Audit score ${avg.toFixed(0)} %.`, "info");
        }
        if (r.findings.length > 30)
            r.findings.shift();
    }
}
const weakest = (s) => { const r = s.world.reg, a = [["environmental", r.env], ["financial reporting", r.reporting], ["waste management", r.waste], ["equipment inspections", r.inspections], ["infrastructure approvals", r.approvals]]; return a.sort((x, y) => x[1] - y[1])[0][0]; };
