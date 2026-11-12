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
/** Analog dial in the style of a control-room instrument: cream face, tick marks, red zone, moving needle, digital readout. */
export function gauge(value: number, min: number, max: number, label: string, unit: string, warnAt?: number, critAt?: number, decimals = value >= 100 ? 0 : 1): string {
  const cx = 100, cy = 100, A0 = -135, A1 = 135, ang = (v: number) => A0 + (Math.max(min, Math.min(max, v)) - min) / (max - min) * (A1 - A0);
  const pt = (a: number, r: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const arc = (v0: number, v1: number, r: number) => { const [x0, y0] = pt(ang(v0), r), [x1, y1] = pt(ang(v1), r); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${ang(v1) - ang(v0) > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const nMaj = 6, ticks: string[] = [];
  for (let i = 0; i <= nMaj * 4; i++) { const v = min + ((max - min) * i) / (nMaj * 4), a = ang(v), major = i % 4 === 0, [x0, y0] = pt(a, major ? 70 : 74), [x1, y1] = pt(a, 80); ticks.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#2a2a22" stroke-width="${major ? 2 : 1}"/>`); if (major) { const [tx, ty] = pt(a, 58); const lab = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1); ticks.push(`<text x="${tx.toFixed(1)}" y="${(ty + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#2a2a22" font-family="Barlow Condensed,sans-serif" font-weight="600">${lab}</text>`); } }
  const zones = (warnAt !== undefined && critAt !== undefined ? `<path d="${arc(warnAt, critAt, 84)}" stroke="#e8a21a" stroke-width="5" fill="none"/><path d="${arc(critAt, max, 84)}" stroke="#c9372c" stroke-width="5" fill="none"/>` : critAt !== undefined ? `<path d="${arc(critAt, max, 84)}" stroke="#c9372c" stroke-width="5" fill="none"/>` : warnAt !== undefined ? `<path d="${arc(warnAt, max, 84)}" stroke="#c9372c" stroke-width="5" fill="none"/>` : "");
  const col = critAt !== undefined && value >= critAt ? "#ff5a4d" : warnAt !== undefined && value >= warnAt ? "#ffb82e" : "#8cf05a";
  const na = ang(value);
  return `<div class="dial"><svg viewBox="0 0 200 232"><defs><radialGradient id="dface" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#f4efd9"/><stop offset="1" stop-color="#d9d1b0"/></radialGradient><linearGradient id="dring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c7a72"/><stop offset=".5" stop-color="#1e2824"/><stop offset="1" stop-color="#55635b"/></linearGradient></defs>
<circle cx="100" cy="100" r="97" fill="url(#dring)"/><circle cx="100" cy="100" r="90" fill="#11191a"/><circle cx="100" cy="100" r="87" fill="url(#dface)"/>${zones}${ticks.join("")}
<text x="100" y="124" text-anchor="middle" font-size="10" fill="#33332a" font-family="Barlow Condensed,sans-serif" font-weight="700" letter-spacing=".5">${esc(label.toUpperCase())}</text><text x="100" y="135" text-anchor="middle" font-size="8" fill="#55543f" font-family="Share Tech Mono,monospace">${esc(unit)}</text>
<g style="transform:rotate(${na.toFixed(1)}deg);transform-origin:100px 100px;transition:transform .9s cubic-bezier(.3,1.4,.5,1)"><path d="M97 108 L100 22 L103 108 Z" fill="#c4352a" stroke="#7d1f18" stroke-width=".6"/><rect x="98.2" y="108" width="3.6" height="22" fill="#c4352a"/></g><circle cx="100" cy="100" r="8" fill="#2b3430" stroke="#111" stroke-width="1.5"/><circle cx="100" cy="100" r="2.5" fill="#889"/>
<rect x="46" y="186" width="108" height="34" rx="4" fill="#0e1613" stroke="#3b4a42" stroke-width="2"/><text x="100" y="211" text-anchor="middle" font-size="24" fill="${col}" font-family="Share Tech Mono,monospace" style="filter:drop-shadow(0 0 4px ${col}88)">${Number.isFinite(value) ? value.toFixed(decimals) : "-"}</text></svg></div>`;
}
/** Round power button with a glowing ring (on = green, off = red). */
export function pwr(on: boolean, label: string, a: object, extra = ""): string {
  return `<button class="pwr ${on ? "on" : "off"}" ${act(a)} ${extra} title="${esc(label)}"><svg viewBox="0 0 40 40"><path d="M20 8 V19" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M12.5 13.5 A11 11 0 1 0 27.5 13.5" stroke-width="3.2" stroke-linecap="round" fill="none"/></svg></button>`;
}
/** Two-position rotary selector switch (like MAN / AUTO or STOP / RUN). Click anywhere on it to flip. */
export function rotary(title: string, left: string, right: string, isRight: boolean, a: object, extra = ""): string {
  return `<div class="rotary"><div class="rt">${esc(title)}</div><button class="rknob" ${act(a)} ${extra}><span class="rl ${isRight ? "" : "lit"}">${esc(left)}</span><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="25" fill="#26302b" stroke="#0b0f0d" stroke-width="3"/><circle cx="30" cy="30" r="20" fill="#3b4741" stroke="#59685f"/><g style="transform:rotate(${isRight ? 40 : -40}deg);transform-origin:30px 30px;transition:transform .25s"><rect x="25" y="7" width="10" height="46" rx="5" fill="#8a8f4e" stroke="#2c2f12" stroke-width="2"/><rect x="28.2" y="9" width="3.6" height="13" fill="#e6e8b0"/></g></svg><span class="rl ${isRight ? "lit" : ""}">${esc(right)}</span></button></div>`;
}
export const lamp = (color: "g" | "r" | "a" | "off", label: string) => `<span class="lamp ${color}"></span>${label}`;

/** Update `host` so it matches `html` without throwing away elements that are already there (keeps animations, focus, canvases and scroll positions). */
export function morph(host: Element, html: string) {
  const t = document.createElement("template"); t.innerHTML = html;
  morphKids(host, t.content);
}
function morphKids(a: Node, b: Node) {
  const A = Array.from(a.childNodes), B = Array.from(b.childNodes);
  for (let i = 0; i < B.length; i++) {
    const x = A[i], y = B[i];
    if (!x) { a.appendChild(y.cloneNode(true)); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y.cloneNode(true), x); continue; }
    if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType !== 1) continue;
    const ex = x as Element, ey = y as Element;
    if (ex.hasAttribute("data-keep")) continue;
    for (const at of Array.from(ex.attributes)) if (!ey.hasAttribute(at.name)) { if (at.name === "value" && ex instanceof HTMLInputElement) continue; ex.removeAttribute(at.name); }
    for (const at of Array.from(ey.attributes)) if (ex.getAttribute(at.name) !== at.value) ex.setAttribute(at.name, at.value);
    if (ex instanceof HTMLInputElement) { if (document.activeElement !== ex) { if (ex.value !== ey.getAttribute("value") && ey.hasAttribute("value")) ex.value = ey.getAttribute("value")!; ex.checked = ey.hasAttribute("checked"); } }
    else if (ex instanceof HTMLSelectElement) { /* options are morphed below; keep user selection while open */ }
    else if (ex instanceof HTMLOptionElement) ex.selected = ey.hasAttribute("selected");
    if (ex.nodeName !== "CANVAS") morphKids(ex, ey);
  }
  while (a.childNodes.length > B.length) a.removeChild(a.lastChild!);
}
export function tip(text: string, tipText: string): string { return `<span class="tip" data-tip="${esc(tipText)}">${text}</span>`; }
export function toCsv(rows: (string | number)[][]): string { return rows.map((r) => r.map((c) => { const t = String(c); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(",")).join("\n"); }
export function download(name: string, text: string, type = "text/csv") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
