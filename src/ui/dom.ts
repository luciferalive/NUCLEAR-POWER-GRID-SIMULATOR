import type { Severity } from "../simulation/types.js";
export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const esc = (x: unknown) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const f0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "-");
export const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "-");
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "-");
export const pct = (x: number, d = 0) => (x * 100).toFixed(d) + " %";
export const usd = (x: number) => (x < 0 ? "-" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("en-US");
export const usdM = (x: number) => (Math.abs(x) >= 1e6 ? (x < 0 ? "-" : "") + "$" + (Math.abs(x) / 1e6).toFixed(2) + "M" : usd(x));
export const sevClass = (s: Severity) => ({ info: "s-info", notice: "s-notice", warning: "s-warn", alarm: "s-alarm", critical: "s-crit" }[s]);
/** data-act buttons: the shell turns the JSON into a game action. */
export const act = (a: object) => `data-act='${esc(JSON.stringify(a)).replace(/'/g, "&#39;")}'`;
export function btn(label: string, a: object, cls = "", extra = ""): string { return `<button class="btn ${cls}" ${act(a)} ${extra}>${label}</button>`; }
export function bar(value: number, max = 1, cls = "", label = ""): string {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="bar ${cls}"><i style="width:${p}%"></i><span>${label}</span></div>`;
}
export function led(on: boolean | "warn" | "off", label: string): string { return `<span class="led ${on === "warn" ? "warn" : on === "off" ? "off" : on ? "on" : "bad"}"></span>${label}`; }
export function kpi(label: string, value: string, sub = "", cls = ""): string { return `<div class="kpi ${cls}"><label>${label}</label><b>${value}</b><small>${sub}</small></div>`; }
export function table(head: string[], rows: string[][], cls = ""): string {
  return `<table class="tbl ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
/** Semicircle gauge as inline SVG. */
export function gauge(value: number, min: number, max: number, label: string, unit: string, warnAt?: number, critAt?: number): string {
  const p = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const a = Math.PI * (1 - p), cx = 60, cy = 58, r = 44;
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  const col = critAt !== undefined && value >= critAt ? "var(--crit)" : warnAt !== undefined && value >= warnAt ? "var(--warn)" : "var(--ok)";
  return `<div class="gauge"><svg viewBox="0 0 120 70"><path d="M16 58 A44 44 0 0 1 104 58" fill="none" stroke="#243038" stroke-width="9" stroke-linecap="round"/><path d="M16 58 A44 44 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/><line x1="60" y1="58" x2="${(cx + 34 * Math.cos(a)).toFixed(1)}" y2="${(cy - 34 * Math.sin(a)).toFixed(1)}" stroke="#e8eef2" stroke-width="2"/><circle cx="60" cy="58" r="3" fill="#e8eef2"/></svg><b>${value.toFixed(value >= 100 ? 0 : 1)} <small>${unit}</small></b><span>${label}</span></div>`;
}
export function tip(text: string, tipText: string): string { return `<span class="tip" data-tip="${esc(tipText)}">${text}</span>`; }
export function toCsv(rows: (string | number)[][]): string { return rows.map((r) => r.map((c) => { const t = String(c); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(",")).join("\n"); }
export function download(name: string, text: string, type = "text/csv") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
