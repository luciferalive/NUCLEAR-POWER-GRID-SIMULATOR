/** World map renderer. Reads the shared game state every frame but never changes it: drawing is separate from the simulation clock. */
import { REGIONS, RIVERS, ROADS, RAILWAYS, regionPolygons } from "../simulation/world/data.js";
import { fmtTime } from "../simulation/util.js";
import type { GameState } from "../simulation/types.js";
import type { Line, MapNode, NodeKind, RegionId, WxKind } from "../simulation/world/types.js";
import { esc, f0, f1, f2, usd } from "./dom.js";
import { store } from "../store/store.js";

export type Layer = "infra" | "grid" | "cust" | "demand" | "comp" | "weather" | "build" | "econ";
export const LAYERS: { id: Layer; label: string }[] = [{ id: "infra", label: "Infrastructure" }, { id: "grid", label: "Transmission" }, { id: "cust", label: "Industrial customers" }, { id: "demand", label: "Electricity demand" }, { id: "comp", label: "Competitors" }, { id: "weather", label: "Weather" }, { id: "build", label: "Construction" }, { id: "econ", label: "Economic activity" }];
const WX_COLOR: Record<WxKind, string> = { sunny: "255,214,90", cloudy: "170,185,200", rain: "80,140,230", thunderstorm: "150,90,220", heatwave: "255,120,60", "cold wave": "130,200,255", "strong wind": "120,220,200", flooding: "40,110,200", drought: "210,160,70" };
const WX_ICON: Record<WxKind, string> = { sunny: "☀", cloudy: "☁", rain: "☂", thunderstorm: "⚡", heatwave: "♨", "cold wave": "❄", "strong wind": "≋", flooding: "≈", drought: "∅" };
const KIND_COLOR: Partial<Record<NodeKind, string>> = { nuclear: "#2fe0c4", coal: "#9aa3aa", gas: "#ff9a52", wind: "#8ae0ff", solar: "#ffd75a", hydro: "#5aa9ff", substation: "#e8eef2", battery: "#b48cff", external: "#c7a6ff" };

export class WorldMap {
  cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; layers = new Set<Layer>(["infra", "grid", "cust"]);
  view = { x: 0, y: 0, k: 1 }; sel: { type: "node" | "line" | "region"; id: string } | null = null; terrain: HTMLCanvasElement | null = null; terrainKey = ""; w = 0; h = 0;
  polys = regionPolygons(); raf = 0; last = 0; phase = 0; drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null; onSelect: () => void = () => {}; frames = 0; fps = 0; fpsT = 0;
  constructor(cv: HTMLCanvasElement) {
    this.cv = cv; this.ctx = cv.getContext("2d")!; this.fit();
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18); }, { passive: false });
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y, moved: false }; });
    cv.addEventListener("pointermove", (e) => { if (!this.drag) return; const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true; this.view.x = this.drag.vx + dx; this.view.y = this.drag.vy + dy; });
    cv.addEventListener("pointerup", (e) => { const d = this.drag; this.drag = null; if (d && !d.moved) { const r = cv.getBoundingClientRect(); this.pick(e.clientX - r.left, e.clientY - r.top); } });
    new ResizeObserver(() => this.fit()).observe(cv);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  fit() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    this.w = r.width; this.h = r.height; this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.view.k === 1 && this.view.x === 0) this.reset(); this.terrain = null;
  }
  reset() { const k = Math.min(this.w, this.h) / 1000; this.view = { k, x: (this.w - 1000 * k) / 2, y: (this.h - 1000 * k) / 2 }; }
  zoomAt(sx: number, sy: number, f: number) { const v = this.view, k = Math.max(0.35, Math.min(6, v.k * f)), a = k / v.k; v.x = sx - (sx - v.x) * a; v.y = sy - (sy - v.y) * a; v.k = k; }
  zoomBy(f: number) { this.zoomAt(this.w / 2, this.h / 2, f); }
  focus(x: number, y: number, k = 2.2) { this.view.k = k; this.view.x = this.w / 2 - x * k; this.view.y = this.h / 2 - y * k; }
  toScreen(x: number, y: number): [number, number] { return [x * this.view.k + this.view.x, y * this.view.k + this.view.y]; }
  toggle(l: Layer) { if (this.layers.has(l)) this.layers.delete(l); else this.layers.add(l); }
  destroy() { cancelAnimationFrame(this.raf); }

  // -------------------------------------------------------------------------------------------------- picking
  path(s: GameState, l: Line): [number, number][] {
    const w = s.world, pt = (id: string): [number, number] => { const n = w.nodes.find((q) => q.id === id)!; return [n.x, n.y]; };
    const a = pt(l.from), b = pt(l.to); return l.via ? [a, pt(l.via), b] : [a, b];
  }
  pick(sx: number, sy: number) {
    const s = store.state, w = s.world; let best: { type: "node" | "line" | "region"; id: string } | null = null, bd = 16;
    for (const n of w.nodes) { if (!this.nodeVisible(s, n)) continue; const [x, y] = this.toScreen(n.x, n.y), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = { type: "node", id: n.id }; } }
    for (const p of w.projects) if (this.layers.has("build") && ["permit", "building", "paused"].includes(p.status)) { const [x, y] = this.toScreen(p.x, p.y), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = { type: "node", id: "prj:" + p.id }; } }
    if (!best && (this.layers.has("grid") || this.layers.has("cust"))) for (const l of w.lines) { if (!this.lineVisible(l)) continue; const pts = this.path(s, l).map(([x, y]) => this.toScreen(x, y)); for (let i = 0; i < pts.length - 1; i++) { const d = segDist(sx, sy, pts[i], pts[i + 1]); if (d < 7 && d < bd + 4) { bd = d; best = { type: "line", id: l.id }; } } }
    if (!best) { const gx = (sx - this.view.x) / this.view.k, gy = (sy - this.view.y) / this.view.k; let rd = 1e12, rid: RegionId = "Central"; for (const r of REGIONS) { const d = (r.cx - gx) ** 2 + (r.cy - gy) ** 2; if (d < rd) { rd = d; rid = r.id; } } best = { type: "region", id: rid }; }
    this.sel = best; this.onSelect();
  }
  nodeVisible(s: GameState, n: MapNode): boolean {
    const L = this.layers;
    if (n.kind === "plot") return L.has("build");
    if (n.owner === "customer") return L.has("cust") || L.has("econ") || L.has("infra") && false;
    if (n.owner !== "us" && n.owner !== "public" && n.owner !== "external") return L.has("comp") || L.has("infra");
    if (["substation", "nuclear", "battery", "external"].includes(n.kind)) return L.has("infra") || L.has("grid");
    return L.has("infra");
  }
  lineVisible(l: Line) { return this.layers.has("grid") || (this.layers.has("cust") && l.kind === "supply"); }

  // -------------------------------------------------------------------------------------------------- drawing
  loop(t: number) {
    if (!document.body.contains(this.cv)) return;
    const dt = Math.min(0.1, (t - this.last) / 1000 || 0.016); this.last = t; this.phase += dt;
    this.frames++; if (t - this.fpsT > 1000) { this.fps = this.frames; this.frames = 0; this.fpsT = t; }
    try { this.draw(store.state); } catch (e) { console.error(e); }
    this.raf = requestAnimationFrame((q) => this.loop(q));
  }
  buildTerrain() {
    const c = document.createElement("canvas"), dpr = 1; c.width = 1000 * dpr; c.height = 1000 * dpr; const g = c.getContext("2d")!;
    g.fillStyle = "#16221b"; g.fillRect(0, 0, 1000, 1000);
    const rc: Record<string, string> = { North: "#1c2c22", West: "#1f2a1f", East: "#222b20", South: "#1b2a24", Central: "#233226" };
    for (const r of REGIONS) { const p = this.polys[r.id]; g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = rc[r.id]; g.fill(); }
    for (let i = 0; i < 150; i++) { const x = (i * 197 + 31) % 1000, y = (i * 311 + 77) % 1000, r = 10 + (i * 13) % 34; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, i % 3 ? "rgba(70,100,70,.16)" : "rgba(110,95,60,.12)"); gr.addColorStop(1, "transparent"); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    g.beginPath(); [[0, 1000], [1000, 1000], [1000, 400], [975, 470], [950, 560], [900, 640], [800, 760], [700, 880], [560, 950], [440, 960], [330, 950], [230, 975], [120, 1000]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = "#0e2a3d"; g.fill(); g.strokeStyle = "#2b5b78"; g.lineWidth = 2; g.stroke();
    g.lineCap = "round"; g.lineJoin = "round";
    for (const rv of RIVERS) { g.beginPath(); rv.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = "#1f5a82"; g.lineWidth = 7; g.stroke(); g.strokeStyle = "#2b78a8"; g.lineWidth = 3; g.stroke(); }
    for (const rd of ROADS) { g.beginPath(); rd.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = "#3a3f35"; g.lineWidth = 4; g.stroke(); g.strokeStyle = "#8a8a6a"; g.lineWidth = 1; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]); }
    for (const rl of RAILWAYS) { g.beginPath(); rl.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = "#555"; g.lineWidth = 3; g.stroke(); g.strokeStyle = "#bbb"; g.lineWidth = 1; g.setLineDash([2, 7]); g.stroke(); g.setLineDash([]); }
    for (const r of REGIONS) { const p = this.polys[r.id]; g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.strokeStyle = "rgba(200,220,230,.35)"; g.lineWidth = 2; g.setLineDash([10, 6]); g.stroke(); g.setLineDash([]); }
    this.terrain = c;
  }
  draw(s: GameState) {
    const g = this.ctx, v = this.view, w = s.world; if (!this.w) { this.fit(); return; }
    if (!this.terrain) this.buildTerrain();
    g.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    g.fillStyle = "#08121a"; g.fillRect(0, 0, this.w, this.h);
    g.save(); g.translate(v.x, v.y); g.scale(v.k, v.k); g.drawImage(this.terrain!, 0, 0);
    this.drawRegionOverlay(g, s);
    if (this.layers.has("grid") || this.layers.has("cust")) this.drawLines(g, s);
    if (this.layers.has("build")) this.drawConstruction(g, s);
    g.restore();
    for (const n of w.nodes) if (this.nodeVisible(s, n)) this.drawNode(g, s, n);
    this.drawOverlayText(g, s);
    g.fillStyle = "rgba(220,235,240,.55)"; g.font = "10px monospace"; g.fillText(`${this.fps} fps | zoom ${v.k.toFixed(2)}x | ${fmtTime(s.t)}`, 8, this.h - 8);
  }
  drawRegionOverlay(g: CanvasRenderingContext2D, s: GameState) {
    const w = s.world;
    for (const r of w.regions) {
      const p = this.polys[r.id]; const wx = w.weather[r.id];
      const fill = (css: string) => { g.beginPath(); p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = css; g.fill(); };
      if (this.layers.has("weather")) {
        fill(`rgba(${WX_COLOR[wx.kind]},${0.12 + 0.1 * Math.min(1, wx.rain + (wx.kind === "heatwave" || wx.kind === "cold wave" ? 1 : 0))})`);
        if (wx.rain > 0.3) { g.strokeStyle = `rgba(${WX_COLOR[wx.kind]},.55)`; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 46; i++) { const x = r.cx - 150 + ((i * 53 + this.phase * 90) % 300), y = r.cy - 120 + ((i * 97 + this.phase * 220) % 240); g.moveTo(x, y); g.lineTo(x - 3, y + 10); } g.stroke(); }
        if (wx.kind === "thunderstorm" && Math.sin(this.phase * 7 + r.cx) > 0.94) { g.strokeStyle = "rgba(255,255,200,.9)"; g.lineWidth = 2; g.beginPath(); g.moveTo(r.cx, r.cy - 60); g.lineTo(r.cx - 12, r.cy - 25); g.lineTo(r.cx + 6, r.cy - 20); g.lineTo(r.cx - 8, r.cy + 20); g.stroke(); }
      }
      if (this.layers.has("demand")) { const u = r.demandMW / Math.max(1, r.genMW + r.importMW + r.deliveredByUsMW); const col = r.shortageMW > 10 ? "255,80,70" : u > 0.95 ? "255,190,60" : "60,200,150"; fill(`rgba(${col},${0.12 + 0.2 * Math.min(1, r.demandMW / 700)})`); }
      if (this.layers.has("econ")) { const m = w.econ.manufacturing; fill(`rgba(${m > 1.02 ? "80,220,140" : m < 0.98 ? "255,110,90" : "170,190,200"},${0.18 * r.industrialShare + 0.08})`); }
    }
  }
  drawLines(g: CanvasRenderingContext2D, s: GameState) {
    const w = s.world;
    for (const l of w.lines) {
      if (!this.lineVisible(l)) continue;
      const pts = this.path(s, l), util = l.capMW > 0 ? l.flowMW / l.capMW : 0, flowing = l.flowMW > 0.05 && l.status === "ok";
      let col = "rgba(150,165,175,.45)", wd = 1.4 / this.view.k * 1.4, dash: number[] = [];
      if (l.status === "fault") { col = Math.sin(this.phase * 8) > 0 ? "#ff4d4d" : "#a02a2a"; wd = 2.4; dash = [6, 5]; }
      else if (l.status === "planned") { col = "rgba(235,240,245,.7)"; wd = 1.8; dash = [3, 6]; }
      else if (l.kind === "import" && flowing) { col = "#b48cff"; wd = 2.4; }
      else if (flowing) { col = util > 0.95 ? "#ffb02e" : l.kind === "backbone" ? "rgba(80,170,255,.85)" : "#2fe0c4"; wd = 1.6 + Math.min(3.2, util * 3.2); }
      else if (l.kind === "backbone") { col = "rgba(110,130,150,.5)"; wd = 1.6; }
      g.lineCap = "round"; g.lineJoin = "round"; g.setLineDash(dash.map((d) => d / Math.sqrt(this.view.k)));
      if (flowing) { g.strokeStyle = col.startsWith("#") ? col + "33" : col; g.lineWidth = wd * 2.6; path(g, pts); g.stroke(); }
      g.strokeStyle = col; g.lineWidth = wd; path(g, pts); g.stroke(); g.setLineDash([]);
      if (this.sel?.type === "line" && this.sel.id === l.id) { g.strokeStyle = "#fff"; g.lineWidth = wd + 2; g.globalAlpha = 0.5; path(g, pts); g.stroke(); g.globalAlpha = 1; }
      if (flowing) this.arrows(g, pts, l.flowMW, util > 0.95 ? "#ffd27a" : l.kind === "import" ? "#e2d0ff" : "#d6fff6");
      if (l.status === "fault") { const m = mid(pts); g.fillStyle = "#ff4d4d"; g.font = `bold ${14 / Math.sqrt(this.view.k)}px sans-serif`; g.textAlign = "center"; g.fillText("✕", m[0], m[1] + 5); g.textAlign = "left"; }
    }
  }
  /** Arrow chevrons travel along the line from source to destination. Speed follows the real MW flow; no flow, no arrows. */
  arrows(g: CanvasRenderingContext2D, pts: [number, number][], mw: number, col: string) {
    const segs: { a: [number, number]; b: [number, number]; len: number }[] = []; let tot = 0;
    for (let i = 0; i < pts.length - 1; i++) { const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push({ a: pts[i], b: pts[i + 1], len }); tot += len; }
    const gap = 34, speed = 16 + Math.min(110, mw * 0.9), off = (this.phase * speed) % gap, size = 5 / Math.sqrt(this.view.k) * 1.3;
    g.fillStyle = col; g.globalAlpha = 0.95;
    for (let d = off; d < tot; d += gap) {
      let r = d; for (const sg of segs) { if (r <= sg.len) { const k = r / sg.len, x = sg.a[0] + (sg.b[0] - sg.a[0]) * k, y = sg.a[1] + (sg.b[1] - sg.a[1]) * k, an = Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0]); g.save(); g.translate(x, y); g.rotate(an); g.beginPath(); g.moveTo(size, 0); g.lineTo(-size, -size * 0.85); g.lineTo(-size * 0.35, 0); g.lineTo(-size, size * 0.85); g.closePath(); g.fill(); g.restore(); break; } r -= sg.len; }
    }
    g.globalAlpha = 1;
  }
  drawConstruction(g: CanvasRenderingContext2D, s: GameState) {
    const w = s.world;
    for (const p of w.plots) if (!p.used) { g.strokeStyle = "rgba(255,230,150,.45)"; g.lineWidth = 1; g.setLineDash([3, 3]); g.strokeRect(p.x - 9, p.y - 9, 18, 18); g.setLineDash([]); }
    for (const p of w.projects) {
      if (!["permit", "building", "paused"].includes(p.status)) continue;
      if (p.targetId) { const l = w.lines.find((q) => q.id === p.targetId); if (l) { g.strokeStyle = "rgba(255,210,80,.85)"; g.lineWidth = 2; g.setLineDash([4, 5]); path(g, this.path(s, l)); g.stroke(); g.setLineDash([]); } }
      g.fillStyle = "rgba(255,190,50,.18)"; g.fillRect(p.x - 13, p.y - 13, 26, 26); g.strokeStyle = "#ffbe32"; g.lineWidth = 1.5; g.strokeRect(p.x - 13, p.y - 13, 26, 26);
      g.fillStyle = "#33281a"; g.fillRect(p.x - 12, p.y + 15, 24, 5); g.fillStyle = p.status === "building" ? "#ffbe32" : "#888"; g.fillRect(p.x - 12, p.y + 15, 24 * (p.status === "permit" ? 0 : p.progress / p.days), 5);
      g.fillStyle = "#ffe08a"; g.font = "bold 13px sans-serif"; g.textAlign = "center"; g.fillText(p.status === "permit" ? "P" : "⚒", p.x, p.y + 5); g.textAlign = "left";
    }
  }
  drawNode(g: CanvasRenderingContext2D, s: GameState, n: MapNode) {
    const [x, y] = this.toScreen(n.x, n.y), v = this.view; if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) return;
    const big = n.kind === "city" ? 13 : n.id === "our-plant" ? 15 : 9, sz = big * Math.min(1.8, Math.max(0.8, Math.sqrt(v.k)));
    let col = KIND_COLOR[n.kind] ?? "#cfd8dc", ring = "";
    const w = s.world;
    if (n.owner === "customer") { const c = s.contracts.find((q) => q.customerId === n.ref && q.active), l = w.lines.find((q) => q.customerId === n.ref); col = "#d9e4ea"; ring = !c ? "#6b7a84" : l?.status === "fault" ? "#ff4d4d" : c.shortfallMW > 0.5 ? "#ffb02e" : c.deliveredMW > 0.1 ? "#2fe0c4" : "#6b7a84"; if (l?.status === "planned") ring = "#e8eef2"; }
    if (n.owner !== "customer" && n.owner !== "public" && n.owner !== "us" && n.owner !== "external") { const c = w.competitors.find((q) => q.id === n.ref); if (c) ring = c.status === "online" || c.status === "building" ? "#ff9a52" : "#ff4d4d"; }
    if (n.id === "our-plant") ring = s.reactor.scram ? "#ff4d4d" : "#2fe0c4";
    g.save(); g.translate(x, y);
    g.beginPath(); g.arc(0, 0, sz + 3, 0, 7); g.fillStyle = "rgba(8,18,26,.82)"; g.fill();
    if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.stroke(); if (n.id === "our-plant") { g.globalAlpha = 0.35 + 0.25 * Math.sin(this.phase * 3); g.beginPath(); g.arc(0, 0, sz + 7, 0, 7); g.stroke(); g.globalAlpha = 1; } }
    icon(g, n.kind, sz, col);
    g.restore();
    const showLabel = v.k > 1.15 || n.id === "our-plant" || n.kind === "city" && v.k > 0.8 || this.sel?.id === n.id;
    if (showLabel) { g.font = `${n.id === "our-plant" ? "bold " : ""}11px sans-serif`; g.textAlign = "center"; const label = n.name + this.badge(s, n); g.lineWidth = 3; g.strokeStyle = "rgba(6,12,16,.9)"; g.strokeText(label, x, y + sz + 14); g.fillStyle = "#e8f0f4"; g.fillText(label, x, y + sz + 14); g.textAlign = "left"; }
    if (this.sel?.type === "node" && this.sel.id === n.id) { g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, sz + 8, 0, 7); g.stroke(); }
  }
  badge(s: GameState, n: MapNode): string {
    const w = s.world, L = this.layers;
    if (n.owner === "customer" && (L.has("econ") || L.has("cust"))) { const c = s.contracts.find((q) => q.customerId === n.ref && q.active); const i = w.intel[n.ref!]; return c ? ` ${f0(c.deliveredMW)}/${f0(c.demandMW)} MW` + (i && i.state !== "normal" ? ` (${i.state})` : "") : ""; }
    if (L.has("comp")) { const c = w.competitors.find((q) => q.id === n.ref); if (c) return ` ${f0(c.outMW)} MW | ${(c.share * 100).toFixed(0)} %`; }
    if (n.id === "our-plant") return ` ${f0(s.grid.netMW)} MW`;
    return "";
  }
  drawOverlayText(g: CanvasRenderingContext2D, s: GameState) {
    const w = s.world, L = this.layers; g.textAlign = "center";
    for (const r of w.regions) {
      const [x, y] = this.toScreen(r.cx, r.cy - 70); g.font = "bold 12px sans-serif"; g.fillStyle = "rgba(210,225,232,.55)"; g.fillText(r.id.toUpperCase(), x, y);
      let t = ""; if (L.has("demand")) t = `demand ${f0(r.demandMW)} MW | supply ${f0(r.genMW + r.importMW)} MW${r.shortageMW > 5 ? " | SHORT " + f0(r.shortageMW) : ""}`;
      else if (L.has("weather")) t = `${WX_ICON[w.weather[r.id].kind]} ${w.weather[r.id].kind} ${f0(w.weather[r.id].temp)}°C`;
      else if (L.has("econ")) t = `industry ${f0(r.industrialMW)} MW | pop ${(r.popIdx * 100).toFixed(0)}`;
      if (t) { g.font = "11px sans-serif"; g.fillStyle = r.shortageMW > 5 && L.has("demand") ? "#ff8a80" : "#e8f0f4"; g.fillText(t, x, y + 14); }
    }
    g.textAlign = "left";
  }
}
function path(g: CanvasRenderingContext2D, pts: [number, number][]) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); }
const mid = (pts: [number, number][]): [number, number] => { const m = pts[Math.floor(pts.length / 2)], p = pts[Math.floor((pts.length - 1) / 2)]; return [(m[0] + p[0]) / 2, (m[1] + p[1]) / 2]; };
function segDist(px: number, py: number, a: [number, number], b: [number, number]) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy)); }

/** Small vector icons, one identity per facility type. */
function icon(g: CanvasRenderingContext2D, kind: NodeKind, s: number, col: string) {
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(1.2, s / 7); g.lineCap = "round"; g.lineJoin = "round";
  const u = s / 10, L = (...p: number[]) => { g.beginPath(); for (let i = 0; i < p.length; i += 2) (i ? g.lineTo(p[i] * u, p[i + 1] * u) : g.moveTo(p[i] * u, p[i + 1] * u)); g.stroke(); };
  const R = (x: number, y: number, w: number, h: number, fill = false) => (fill ? g.fillRect(x * u, y * u, w * u, h * u) : g.strokeRect(x * u, y * u, w * u, h * u));
  switch (kind) {
    case "nuclear": g.beginPath(); g.moveTo(-6 * u, 7 * u); g.quadraticCurveTo(-3 * u, 0, -4.5 * u, -7 * u); g.lineTo(4.5 * u, -7 * u); g.quadraticCurveTo(3 * u, 0, 6 * u, 7 * u); g.closePath(); g.stroke(); L(-3, -3.5, 3, -3.5); g.beginPath(); g.arc(0, 2 * u, 1.6 * u, 0, 7); g.fill(); break;
    case "coal": R(-6, -1, 12, 8); L(-3, -1, -3, -7); L(3, -1, 3, -7); g.fillStyle = "#777"; g.beginPath(); g.arc(-3 * u, -8 * u, 1.4 * u, 0, 7); g.fill(); break;
    case "gas": g.beginPath(); g.moveTo(0, -8 * u); g.quadraticCurveTo(7 * u, 0, 0, 7 * u); g.quadraticCurveTo(-7 * u, 0, 0, -8 * u); g.fill(); break;
    case "wind": L(0, 6, 0, -1); L(0, -1, 0, -8); L(0, -1, 6.5, 3); L(0, -1, -6.5, 3); break;
    case "solar": R(-7, -4, 14, 8); L(-2.3, -4, -2.3, 4); L(2.3, -4, 2.3, 4); L(-7, 0, 7, 0); L(0, 4, 0, 7); break;
    case "hydro": L(-7, -5, 7, -5, 7, 5, -7, 5); L(-5, 0, -2.5, -2, 0, 0, 2.5, -2, 5, 0); L(-5, 3, -2.5, 1, 0, 3, 2.5, 1, 5, 3); break;
    case "substation": R(-6, -6, 12, 12); g.beginPath(); g.moveTo(1.5 * u, -5 * u); g.lineTo(-3 * u, 1 * u); g.lineTo(0, 1 * u); g.lineTo(-1.5 * u, 5 * u); g.lineTo(3 * u, -1 * u); g.lineTo(0, -1 * u); g.closePath(); g.fill(); break;
    case "steel": R(-7, 1, 14, 6); L(-5, 1, -5, -6, -2, -6, -2, 1); L(2, 1, 2, -3, 6, -3, 6, 1); break;
    case "aluminium": g.beginPath(); g.moveTo(-6 * u, 5 * u); g.lineTo(-3.5 * u, -4 * u); g.lineTo(3.5 * u, -4 * u); g.lineTo(6 * u, 5 * u); g.closePath(); g.stroke(); L(-4, 0, 4, 0); break;
    case "cement": R(-6, -2, 9, 8); L(3, 0, 7, -5); L(-3, -2, -3, -6); L(0, -2, 0, -6); break;
    case "chemical": L(-2, -7, -2, -2, -6, 6, 6, 6, 2, -2, 2, -7); L(-3, 2, 3, 2); break;
    case "refinery": R(-3, -7, 3, 14); R(2, -3, 4, 10); L(-6, -2, 6, -2); L(-6, 3, 6, 3); break;
    case "mine": g.beginPath(); g.moveTo(-8 * u, 6 * u); g.lineTo(-2 * u, -4 * u); g.lineTo(2 * u, 2 * u); g.lineTo(5 * u, -2 * u); g.lineTo(8 * u, 6 * u); g.closePath(); g.stroke(); L(-1, -8, 5, -5); break;
    case "datacenter": R(-6, -7, 12, 4); R(-6, -2, 12, 4); R(-6, 3, 12, 4); g.fillRect(3 * u, -6 * u, 1.6 * u, 1.6 * u); g.fillRect(3 * u, -1 * u, 1.6 * u, 1.6 * u); g.fillRect(3 * u, 4 * u, 1.6 * u, 1.6 * u); break;
    case "factory": R(-7, 0, 14, 7); L(-5, 0, -5, -7); L(-1, 0, -1, -4); L(3, 0, 3, -7); break;
    case "city": R(-7, -1, 4, 8); R(-2, -7, 5, 14); R(4, 1, 3, 6); break;
    case "residential": L(-6, 1, 0, -6, 6, 1); R(-4.5, 1, 9, 6); break;
    case "commercial": R(-4, -7, 8, 14); L(-4, -3, 4, -3); L(-4, 1, 4, 1); L(-4, 5, 4, 5); break;
    case "hospital": R(-6, -6, 12, 12); R(-1.3, -4, 2.6, 8, true); R(-4, -1.3, 8, 2.6, true); break;
    case "airport": g.beginPath(); g.moveTo(0, -8 * u); g.lineTo(1.5 * u, -2 * u); g.lineTo(8 * u, 2 * u); g.lineTo(1.2 * u, 1.5 * u); g.lineTo(1 * u, 6 * u); g.lineTo(3.5 * u, 8 * u); g.lineTo(-3.5 * u, 8 * u); g.lineTo(-1 * u, 6 * u); g.lineTo(-1.2 * u, 1.5 * u); g.lineTo(-8 * u, 2 * u); g.lineTo(-1.5 * u, -2 * u); g.closePath(); g.fill(); break;
    case "port": L(0, -7, 0, 6); L(-4, -3, 4, -3); g.beginPath(); g.arc(0, -8 * u, 1.3 * u, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 1 * u, 6 * u, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); break;
    case "railstation": R(-5, -6, 10, 10); R(-3, -3, 6, 3); g.beginPath(); g.arc(-3 * u, 6 * u, 1.2 * u, 0, 7); g.arc(3 * u, 6 * u, 1.2 * u, 0, 7); g.fill(); break;
    case "government": L(-7, -3, 0, -8, 7, -3, -7, -3); L(-5, -2, -5, 5); L(-1.7, -2, -1.7, 5); L(1.7, -2, 1.7, 5); L(5, -2, 5, 5); L(-7, 6, 7, 6); break;
    case "water": g.beginPath(); g.moveTo(0, -8 * u); g.quadraticCurveTo(7 * u, 1 * u, 0, 7 * u); g.quadraticCurveTo(-7 * u, 1 * u, 0, -8 * u); g.fill(); break;
    case "battery": R(-6, -4, 11, 8); R(5, -2, 2, 4, true); R(-4.5, -2.5, 4, 5, true); break;
    case "external": L(-7, 0, 5, 0); L(1, -4, 6, 0, 1, 4); break;
    default: R(-5, -5, 10, 10);
  }
}

// -------------------------------------------------------------------------------------------------- info panel
const KIND_NAME: Record<string, string> = { nuclear: "Nuclear power plant", coal: "Coal power station", gas: "Gas power station", wind: "Wind farm", solar: "Solar farm", hydro: "Hydroelectric station", substation: "Electrical substation", steel: "Steel manufacturing plant", aluminium: "Aluminium smelter", cement: "Cement factory", chemical: "Chemical plant", refinery: "Oil refinery", mine: "Mining facility", datacenter: "Data center", factory: "Industrial factory", city: "City", residential: "Residential district", commercial: "Commercial district", hospital: "Hospital", airport: "Airport", port: "Port", railstation: "Railway station", government: "Government facility", water: "Water treatment plant", battery: "Battery storage", external: "External grid interconnector" };
const row = (k: string, v: string) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`;
export function panelHtml(s: GameState, sel: WorldMap["sel"]): string {
  const w = s.world; if (!sel) return `<p class="notes">Click a building, a transmission line or a region to inspect it. Scroll to zoom, drag to pan.</p>`;
  if (sel.type === "region") {
    const r = w.regions.find((q) => q.id === sel.id)!, x = w.weather[r.id];
    return `<h3>${r.id} region</h3><table class="tbl">${row("Electricity demand", f0(r.demandMW) + " MW")}${row("Industrial / residential", `${f0(r.industrialMW)} / ${f0(r.residentialMW)} MW`)}${row("Local generation", f0(r.genMW) + " MW")}${row("Installed capacity", f0(r.capMW) + " MW")}${row("Supplied by us", f1(r.deliveredByUsMW) + " MW")}${row("Imports / exports", `${f0(r.importMW)} / ${f0(r.exportMW)} MW`)}${row("Grid losses", f1(r.lossMW) + " MW")}${row("Substation capacity", f0(r.tieCapMW) + " MW")}${row("Shortage", r.shortageMW > 1 ? `<b class="s-alarm">${f0(r.shortageMW)} MW</b>` : "none")}${row("Local price factor", "x" + f2(r.priceMul))}${row("Weather", `${x.kind}, ${f0(x.temp)} °C, wind ${f0(x.wind)} m/s`)}${row("Forecast", x.forecast.join(" → "))}</table>`;
  }
  if (sel.type === "line") {
    const l = w.lines.find((q) => q.id === sel.id)!, a = w.nodes.find((n) => n.id === l.from)!, b = w.nodes.find((n) => n.id === l.to)!;
    const util = l.capMW ? l.flowMW / l.capMW : 0, st = l.status === "fault" ? `<b class="s-crit">FAULT until ${fmtTime(l.faultUntil)}</b>` : l.status === "planned" ? "PLANNED (not built)" : l.flowMW > 0.05 ? (util > 0.95 ? '<b class="s-warn">OVERLOADED / at limit</b>' : '<b class="s-info">ACTIVE</b>') : "INACTIVE (no flow)";
    const mx = l.customerId ? `<div class="row" style="margin-top:8px">${l.status === "fault" ? `<button class="btn sm danger" data-act='${esc(JSON.stringify({ type: "world", cmd: { c: "repairLine", id: l.id } }))}'>Rush repair (120k)</button>` : ""}${l.status !== "planned" ? `<button class="btn sm" data-act='${esc(JSON.stringify({ type: "world", cmd: { c: "maintainLine", id: l.id } }))}'>Maintain line (70k)</button><button class="btn sm pri" data-act='${esc(JSON.stringify({ type: "world", cmd: { c: "project", kind: "line-upgrade", targetId: l.id } }))}'>Upgrade +40 MW</button>` : `<button class="btn sm pri" data-act='${esc(JSON.stringify({ type: "world", cmd: { c: "project", kind: "connection", targetId: l.id } }))}'>Build connection</button>`}</div>` : "";
    return `<h3>${esc(a.name)} → ${esc(b.name)}</h3><table class="tbl">${row("Source", esc(a.name))}${row("Destination", esc(b.name))}${row("Current flow", f1(l.flowMW) + " MW")}${row("Capacity", f0(l.capMW) + " MW")}${row("Utilisation", (util * 100).toFixed(0) + " %")}${row("Losses", f2(l.lossMW) + " MW")}${row("Status", st)}${row("Contracted supply", l.contractedMW ? f0(l.contractedMW) + " MW" : "-")}${row("Condition", f0(l.condition) + " %")}${row("Length", l.lengthKm + " km")}</table>${mx}`;
  }
  if (sel.id.startsWith("prj:")) { const p = w.projects.find((q) => "prj:" + q.id === sel.id)!; return `<h3>${esc(p.name)}</h3><table class="tbl">${row("Region", p.region)}${row("Status", p.status)}${row("Progress", p.status === "permit" ? "awaiting permit" : `${p.progress} / ${p.days} days`)}${row("Budget", usd(p.cost))}${row("Paid so far", usd(p.paid))}${row("Materials used", `${f0(p.materialsUsed)} / ${f0(p.materials)} t`)}${row("Note", esc(p.stalled || "on schedule"))}</table>`; }
  const n = w.nodes.find((q) => q.id === sel.id); if (!n) return "";
  const name = `<h3>${esc(n.name.toUpperCase())}</h3><p class="notes">${KIND_NAME[n.kind] ?? n.kind} | ${n.region} region</p>`;
  if (n.id === "our-plant") return `${name}<table class="tbl">${row("Reactor power", f1(s.reactor.n * 100) + " %")}${row("Gross / net", `${f0(s.grid.grossMW)} / ${f0(s.grid.netMW)} MW`)}${row("Contracted", f0(s.grid.contractedMW) + " MW")}${row("Spot sales", f0(s.grid.spotMW) + " MW")}${row("Market share", (w.marketShare * 100).toFixed(1) + " %")}${row("Own assets", `${w.ownGen.length} generators, ${w.batteries.length} batteries`)}${row("Status", s.reactor.scram ? '<b class="s-crit">SCRAMMED</b>' : "ONLINE")}</table>`;
  if (n.owner === "customer") {
    const c = s.customers.find((q) => q.id === n.ref)!, con = s.contracts.find((q) => q.customerId === c.id && q.active), l = w.lines.find((q) => q.customerId === c.id)!, i = w.intel[c.id], inv = s.finance.invoices.filter((q) => q.customerId === c.id && !q.paid);
    const pay = !con && !inv.length ? "no contract" : inv.some((q) => q.overdue) ? '<b class="s-alarm">OVERDUE</b>' : inv.length ? "invoice open" : "PAID";
    const status = l.status === "planned" ? "NOT CONNECTED" : l.status === "fault" ? '<b class="s-crit">LINE FAULT</b>' : !con ? "NO CONTRACT" : con.shortfallMW > 0.5 ? '<b class="s-warn">SHORT SUPPLY</b>' : con.deliveredMW > 0.1 ? '<b class="s-info">ACTIVE</b>' : "IDLE";
    return `${name}<table class="tbl">${row("Electricity demand", con ? f0(con.demandMW) + " MW" : f0(c.peakMW) + " MW peak")}${row("Current supply", con ? f1(con.deliveredMW) + " MW" : "0 MW")}${row("Supplier", con ? "Our Nuclear Power Plant" : "none")}${row("Contract price", con ? "$" + f2(con.price) + "/MWh" : "-")}${row("Supply status", status)}${row("Monthly consumption", con ? f0(con.monthMWh) + " MWh so far" : "-")}${row("Payment status", pay)}${row("Customer plan", esc(i?.plan || "normal operation"))}${row("Credit score", ((i?.payScore ?? c.credit) * 100).toFixed(0) + " %")}${row("Line capacity", f0(l.capMW) + " MW")}</table>`;
  }
  const comp = w.competitors.find((q) => q.id === n.ref);
  if (comp) return `${name}<table class="tbl">${row("Operator", esc(comp.name))}${row("Technology", comp.tech)}${row("Installed capacity", f0(comp.capMW) + " MW")}${row("Current generation", f0(comp.outMW) + " MW")}${row("Offer price", "$" + f1(comp.bidPrice) + "/MWh")}${row("Market share", (comp.share * 100).toFixed(1) + " %")}${row("Cash", usd(comp.cash))}${row("Status", comp.status.toUpperCase())}${comp.building ? row("Building", `+${comp.building.addMW} MW by ${fmtTime(comp.building.doneT)}`) : ""}</table>`;
  const og = w.ownGen.find((q) => q.x === n.x && q.y === n.y); void og;
  const sub = n.kind === "substation" ? (() => { const r = w.regions.find((q) => q.id === n.region)!; return row("Delivery capacity", f0(r.tieCapMW) + " MW") + row("Delivered by us", f1(r.deliveredByUsMW) + " MW"); })() : "";
  const pop = n.pop ? row("Population", n.pop.toLocaleString()) : "";
  return `${name}<table class="tbl">${row("Owner", n.owner === "public" ? "public / grid operator" : n.owner)}${pop}${sub}${row("Weather here", w.weather[n.region].kind)}</table>`;
}
