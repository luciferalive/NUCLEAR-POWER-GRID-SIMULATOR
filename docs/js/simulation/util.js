export const MIN_PER_DAY = 1440;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Exponential approach: the same result however the step is split. */
export const relax = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
export const day = (t) => Math.floor(t / MIN_PER_DAY);
export const hourOfDay = (t) => (t % MIN_PER_DAY) / 60;
export const dayOfYear = (t) => day(t) % 360;
export const eq = (s, id) => s.equipment.find((e) => e.id === id);
/** 0..1 how well a piece of equipment works (0 when failed / in maintenance). */
export function health(s, id) {
    const e = eq(s, id);
    if (!e || e.status === "failed" || e.status === "maintenance" || e.status === "offline")
        return 0;
    return e.status === "degraded" ? clamp(e.condition / 100 + 0.1, 0.35, 0.95) : clamp(0.55 + e.condition / 220, 0.6, 1);
}
export function log(s, sev, cat, msg) {
    s.log.push({ t: s.t, sev, cat, msg });
    if (s.log.length > 600)
        s.log.splice(0, s.log.length - 500);
}
export function setAlarm(s, key, on, sev, text) {
    const a = s.alarms[key];
    if (on) {
        if (!a) {
            s.alarms[key] = { since: s.t, sev, text, acked: false };
            log(s, sev, "alarm", text);
        }
        else {
            a.text = text;
            a.sev = sev;
        }
    }
    else if (a) {
        delete s.alarms[key];
        log(s, "info", "alarm", `Cleared: ${text}`);
    }
}
export function fmtTime(t) {
    const d = day(t) + 1, h = Math.floor(hourOfDay(t)), m = Math.floor(t % 60);
    return `Day ${d} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** Book income / expense. cash=false books revenue that has been earned but not yet paid (accrual). */
export function addLedger(s, cat, amount, note, cash = true) {
    const f = s.finance;
    if (cash)
        f.cash += amount;
    f.totals[cat] = (f.totals[cat] ?? 0) + amount;
    f.day[cat] = (f.day[cat] ?? 0) + amount;
    f.month[cat] = (f.month[cat] ?? 0) + amount;
    f.year[cat] = (f.year[cat] ?? 0) + amount;
    if (Math.abs(amount) >= 500) {
        f.ledger.push({ t: s.t, cat, amount, note });
        if (f.ledger.length > 400)
            f.ledger.splice(0, 100);
    }
}
export const INCOME_CATS = ["contracts", "spot", "other"];
export const isIncome = (cat) => INCOME_CATS.includes(cat);
export const sumIncome = (rec) => Object.entries(rec).filter(([k]) => isIncome(k)).reduce((a, [, v]) => a + v, 0);
export const sumExpense = (rec) => -Object.entries(rec).filter(([k]) => !isIncome(k) && k !== "loan" && k !== "capital").reduce((a, [, v]) => a + v, 0);
export const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("en-US");
