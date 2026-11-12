import { esc, f0, f1 } from "./dom.js";
/** Animated 2D plant schematic. Every colour, speed and number comes from the live game state. */
export function mimic(s) {
    const r = s.reactor, t = s.turbine, c = s.cooling, g = s.grid;
    const pumpsOn = r.pumps.filter((p) => p.on && p.flow > 0.05);
    const flow = r.flowFrac;
    const hot = (v) => { const k = Math.max(0, Math.min(1, (v - 200) / 150)); return `rgb(${Math.round(70 + 185 * k)},${Math.round(150 - 90 * k)},${Math.round(230 - 190 * k)})`; };
    const hotC = hot(r.tCool), coldC = hot(Math.max(200, r.tCool - 35));
    const dur = (f) => (f > 0.05 ? `animation-duration:${(1.4 / Math.max(0.15, f)).toFixed(2)}s` : "animation:none");
    const pf = dur(flow), steamOn = t.steamMWt > 5, sf = dur(Math.min(1.5, t.steamMWt / 900)), spinTurb = t.rpm > 60;
    const turbDur = `animation-duration:${(60 / Math.max(60, t.rpm) * 0.9).toFixed(2)}s${spinTurb ? "" : ";animation:none"}`;
    const glow = Math.min(1, r.n);
    const online = t.online && g.breakerClosed;
    const fanDur = `animation-duration:${c.fans > 0.03 ? (0.9 / Math.max(0.1, c.fans)).toFixed(2) : 0}s${c.fans > 0.03 ? "" : ";animation:none"}`;
    const plumes = Math.max(0, Math.min(1, (r.heatRemoved - t.grossMW) / 700));
    const tag = (x, y, a, b, col = "#1d261f") => `<g><rect x="${x - 46}" y="${y - 13}" width="92" height="30" rx="4" fill="#0b120e" stroke="#4b5a51" stroke-width="2"/><text x="${x}" y="${y - 1}" text-anchor="middle" font-size="10" fill="#9bb09b">${esc(a)}</text><text x="${x}" y="${y + 12}" text-anchor="middle" font-size="14" fill="${col}" style="font-family:Share Tech Mono,monospace">${esc(b)}</text></g>`;
    const lcd = "#8cf05a";
    return `<svg class="mimic" viewBox="0 0 1000 420" role="img" aria-label="Live plant diagram">
<defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#7d8a85"/><stop offset=".5" stop-color="#d9e0dc"/><stop offset="1" stop-color="#7d8a85"/></linearGradient>
<linearGradient id="conc" x1="0" x2="1"><stop offset="0" stop-color="#aeb4ac"/><stop offset=".5" stop-color="#e3e6dc"/><stop offset="1" stop-color="#9fa59d"/></linearGradient>
<radialGradient id="core" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#fff6b0" stop-opacity="${0.25 + glow * 0.75}"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="${0.15 + glow * 0.6}"/></radialGradient></defs>
<g opacity=".5"><circle cx="90" cy="60" r="26" fill="#fff"/><circle cx="120" cy="64" r="20" fill="#fff"/><circle cx="640" cy="40" r="22" fill="#fff"/><circle cx="670" cy="46" r="16" fill="#fff"/></g>
<!-- containment -->
<path d="M40 340 V160 Q40 50 170 50 Q300 50 300 160 V340 Z" fill="url(#conc)" stroke="#3b443f" stroke-width="4"/>
<text x="170" y="38" text-anchor="middle" font-size="15" fill="#1d261f">CONTAINMENT ${f0(r.containment)}%</text>
<!-- reactor vessel -->
<rect x="70" y="150" width="76" height="170" rx="30" fill="url(#steel)" stroke="#2a332e" stroke-width="3"/>
<rect x="82" y="190" width="52" height="96" rx="6" fill="url(#core)" ${r.scram ? 'opacity=".25"' : ""}/>
<g>${[0, 1, 2, 3].map((i) => `<rect x="${88 + i * 12}" y="118" width="6" height="${(30 + (1 - r.rod) * 130).toFixed(0)}" fill="#33332e" stroke="#000" stroke-width="1" style="transition:height 1s"/>`).join("")}</g>
<text x="108" y="222" text-anchor="middle" font-size="13" fill="#2a1500">${f0(r.n * 100)}%</text>
<text x="108" y="366" text-anchor="middle" font-size="13" fill="#1d261f">REACTOR</text>
<!-- pressurizer -->
<rect x="170" y="130" width="36" height="110" rx="14" fill="url(#steel)" stroke="#2a332e" stroke-width="3"/><path d="M146 200 H170" stroke="${hotC}" stroke-width="6"/>
<text x="178" y="112" text-anchor="middle" font-size="10" fill="#1d261f">PRESS ${f0(r.pressure)} bar</text>
<!-- steam generator -->
<rect x="228" y="120" width="52" height="190" rx="20" fill="url(#steel)" stroke="#2a332e" stroke-width="3"/>
<text x="254" y="366" text-anchor="middle" font-size="13" fill="#1d261f">STEAM GEN</text>
<!-- primary loop -->
<path d="M146 180 H254 V150" fill="none" stroke="${hotC}" stroke-width="7"/><path class="flow" style="${pf}" d="M146 180 H254 V150" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5"/>
<path d="M254 300 V345 H108 V320" fill="none" stroke="${coldC}" stroke-width="7"/><path class="flow" style="${pf}" d="M254 300 V345 H108 V320" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5"/>
${pumpsOn.length || true ? r.pumps.map((p, i) => `<g transform="translate(${150 + i * 34},345)"><circle r="13" fill="${p.on && p.flow > 0.05 ? "#58e05a" : "#c02a1e"}" stroke="#0b0f0d" stroke-width="3"/><path class="${p.on ? "spin" : ""}" style="${p.on ? dur(p.speed * 1.2) : ""}" d="M0 -8 L5 4 L-5 4 Z" fill="#fff"/></g>`).join("") : ""}
<!-- steam line -->
<path d="M280 140 H330 V110 H520" fill="none" stroke="${steamOn ? "#f3f6f8" : "#8a948f"}" stroke-width="9"/>
${steamOn ? `<path class="flow fast" style="${sf}" d="M280 140 H330 V110 H520" fill="none" stroke="#8ab4d8" stroke-width="3"/>` : ""}
<!-- turbine -->
<g transform="translate(520,110)"><path d="M0 -42 L130 -70 V70 L0 42 Z" fill="url(#steel)" stroke="#2a332e" stroke-width="3"/>
<g class="${spinTurb ? "spin" : ""}" style="${turbDur}"><circle cx="64" cy="0" r="22" fill="#3b4741" stroke="#0b0f0d" stroke-width="3"/>${[0, 60, 120, 180, 240, 300].map((a) => `<rect x="62" y="-34" width="4" height="26" fill="#d0d6cf" transform="rotate(${a} 64 0)"/>`).join("")}</g>
<text x="64" y="96" text-anchor="middle" font-size="13" fill="#1d261f">TURBINE ${f0(t.rpm)} rpm</text></g>
<!-- generator -->
<rect x="660" y="64" width="96" height="92" rx="10" fill="url(#steel)" stroke="#2a332e" stroke-width="3"/><text x="708" y="104" text-anchor="middle" font-size="16" fill="#1d261f">GEN</text><text x="708" y="128" text-anchor="middle" font-size="18" fill="#a31d12" style="font-family:Share Tech Mono,monospace">${f1(t.grossMW)} MW</text>
<rect x="640" y="104" width="22" height="12" fill="#6d7a72"/>
<!-- grid: breaker, transformer, pylon, city -->
<path d="M756 110 H800" stroke="#222" stroke-width="5"/>
<g transform="translate(800,110)"><rect x="0" y="-12" width="30" height="24" rx="3" fill="${g.breakerClosed ? "#58e05a" : "#c02a1e"}" stroke="#0b0f0d" stroke-width="3"/><text x="30" y="32" text-anchor="end" font-size="11" fill="#1d261f">BREAKER ${g.breakerClosed ? "CLOSED" : "OPEN"}</text></g>
<path d="M830 110 H850" stroke="#222" stroke-width="5"/>
<rect x="850" y="84" width="44" height="52" rx="4" fill="#5b7a8c" stroke="#0b0f0d" stroke-width="3"/><path d="M858 96 h28 M858 108 h28 M858 120 h28" stroke="#cfe" stroke-width="3"/>
<path d="M894 110 H920 V90" stroke="#222" stroke-width="4" fill="none"/>
<g stroke="#2b2b2b" stroke-width="4" fill="none"><path d="M920 90 V210 M900 130 H940 M906 160 H934"/><path d="M920 150 L900 210 M920 150 L940 210"/></g>
<path class="${online ? "flow" : ""}" style="${dur(Math.min(1.2, g.netMW / 400))}" d="M920 120 V380" stroke="${online ? "#ffd23d" : "none"}" stroke-width="3" fill="none"/>
<g transform="translate(720,300)">${[0, 1, 2, 3, 4].map((i) => `<rect x="${i * 26}" y="${-20 - ((i * 37) % 4) * 14}" width="20" height="${40 + ((i * 37) % 4) * 14}" fill="#59687a" stroke="#0b0f0d" stroke-width="2"/>${[0, 1, 2].map((j) => `<rect x="${i * 26 + 4}" y="${-14 - ((i * 37) % 4) * 14 + j * 14}" width="5" height="6" class="${online ? "" : ""}" fill="${online ? "#ffe27a" : "#2a3238"}"/><rect x="${i * 26 + 12}" y="${-14 - ((i * 37) % 4) * 14 + j * 14}" width="5" height="6" fill="${online ? "#ffe27a" : "#2a3238"}"/>`).join("")}`).join("")}</g>
<text x="780" y="362" text-anchor="middle" font-size="14" fill="#1d261f">CITY: ${f0(g.contractedMW)} MW delivered</text>
${online ? `<text class="zap" x="906" y="64" font-size="26" fill="#ffb82e">⚡</text>` : ""}
<!-- condenser + cooling tower -->
<path d="M650 180 V250 H520 V300" fill="none" stroke="${steamOn ? "#7fb7e6" : "#8a948f"}" stroke-width="6"/><path class="flow slow" style="${dur(flow)}" d="M650 180 V250 H520 V300" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
<rect x="450" y="300" width="140" height="40" rx="6" fill="url(#steel)" stroke="#2a332e" stroke-width="3"/><text x="520" y="325" text-anchor="middle" font-size="12" fill="#1d261f">CONDENSER ${f1(c.condenserTemp)}°C</text>
<path d="M450 320 H400 V250" fill="none" stroke="#5ba3d6" stroke-width="6"/><path class="flow slow" d="M450 320 H400 V250" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
<g transform="translate(340,250)"><path d="M0 70 Q14 0 4 -60 H76 Q66 0 80 70 Z" fill="url(#conc)" stroke="#3b443f" stroke-width="3"/>
<g class="spin" style="${fanDur}"><path d="M40 -64 m-20 0 h40" stroke="#222" stroke-width="5"/></g>
<text x="40" y="92" text-anchor="middle" font-size="13" fill="#1d261f">TOWER ${f0(c.fans * 100)}% fans</text>
<g>${[0, 1, 2].map(() => `<ellipse class="plume" cx="40" cy="-70" rx="${22 + plumes * 14}" ry="${12 + plumes * 8}" fill="#fff" opacity="${plumes < 0.04 ? 0 : 0.7}" ${plumes < 0.04 ? 'style="animation:none"' : ""}/>`).join("")}</g></g>
<!-- readouts -->
${tag(80, 392, "COOLANT", f1(r.tCool) + " °C", lcd)}${tag(184, 392, "FLOW", f0(flow * 100) + " %", lcd)}${tag(552, 392, "STEAM", f0(t.steamMWt) + " MWt", lcd)}${tag(656, 392, "BASIN", f1(c.basinTemp) + " °C", lcd)}
${r.scram ? `<rect x="40" y="52" width="260" height="30" fill="#c02a1e" class="pulse"/><text x="170" y="74" text-anchor="middle" font-size="20" fill="#fff">REACTOR SCRAMMED</text>` : ""}
</svg>`;
}
