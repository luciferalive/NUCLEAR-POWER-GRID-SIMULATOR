export interface Series { name: string; data: number[]; color: string; fill?: boolean; dash?: boolean }
export interface ChartOpts { min?: number; max?: number; unit?: string; labels?: string[]; step?: boolean }
/** Minimal canvas line chart: auto-scaled, HiDPI aware. Canvas must have data-chart set; call draw(canvas, series). */
export function drawLines(c: HTMLCanvasElement, series: Series[], o: ChartOpts = {}) {
  const dpr = window.devicePixelRatio || 1, W = c.clientWidth || 400, H = c.clientHeight || 160;
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const all = series.flatMap((s) => s.data).filter(Number.isFinite);
  if (!all.length) { g.fillStyle = "#5b6b75"; g.font = "12px sans-serif"; g.fillText("No data yet: run the simulation", 12, 20); return; }
  let lo = o.min ?? Math.min(...all), hi = o.max ?? Math.max(...all);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; if (o.min === undefined) lo -= pad; if (o.max === undefined) hi += pad;
  const L = 44, R = 8, T = 8, B = 18, w = W - L - R, h = H - T - B;
  g.strokeStyle = "#1f2b33"; g.fillStyle = "#6f8290"; g.font = "10px sans-serif"; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = T + (h * i) / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); const v = hi - ((hi - lo) * i) / 4; g.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), 4, y + 3); }
  if (o.labels?.length) { const n = o.labels.length; for (let i = 0; i < 5; i++) { const k = Math.round(((n - 1) * i) / 4); g.fillText(o.labels[k] ?? "", L + (w * i) / 4 - 8, H - 4); } }
  for (const s of series) {
    const n = s.data.length; if (n < 2) continue;
    g.beginPath(); g.strokeStyle = s.color; g.lineWidth = 1.6; g.setLineDash(s.dash ? [4, 3] : []);
    s.data.forEach((v, i) => { const x = L + (w * i) / (n - 1), y = T + h * (1 - (v - lo) / (hi - lo)); if (i === 0) g.moveTo(x, y); else { if (o.step) g.lineTo(x, g.getTransform().f); g.lineTo(x, y); } });
    g.stroke(); g.setLineDash([]);
    if (s.fill) { g.lineTo(L + w, T + h); g.lineTo(L, T + h); g.closePath(); g.fillStyle = s.color + "22"; g.fill(); }
  }
  let lx = L + 6; g.font = "11px sans-serif";
  for (const s of series) { g.fillStyle = s.color; g.fillRect(lx, T + 3, 10, 3); g.fillStyle = "#9db0bc"; g.fillText(s.name, lx + 14, T + 9); lx += 24 + g.measureText(s.name).width; }
}
export function drawBars(c: HTMLCanvasElement, labels: string[], data: number[], color = "#3fb6a8", neg = "#e05d5d") {
  const dpr = window.devicePixelRatio || 1, W = c.clientWidth || 400, H = c.clientHeight || 160;
  c.width = W * dpr; c.height = H * dpr; const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!data.length) return;
  const hi = Math.max(1, ...data.map(Math.abs)), L = 40, T = 8, B = 18, w = W - L - 6, h = H - T - B, zero = T + h / 2, bw = w / data.length;
  g.strokeStyle = "#1f2b33"; g.beginPath(); g.moveTo(L, zero); g.lineTo(W - 6, zero); g.stroke(); g.fillStyle = "#6f8290"; g.font = "10px sans-serif"; g.fillText(Math.round(hi).toLocaleString(), 2, T + 8); g.fillText("-" + Math.round(hi).toLocaleString(), 2, T + h);
  data.forEach((v, i) => { const bh = (Math.abs(v) / hi) * (h / 2); g.fillStyle = v >= 0 ? color : neg; g.fillRect(L + i * bw + 1, v >= 0 ? zero - bh : zero, Math.max(1, bw - 2), bh); if (labels[i] && data.length <= 16) { g.fillStyle = "#6f8290"; g.fillText(labels[i], L + i * bw, H - 4); } });
}
