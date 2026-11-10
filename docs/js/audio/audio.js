/** Procedural industrial soundscape (no audio files). Nothing starts until the first click, per browser autoplay rules. */
class Sound {
    ctx = null;
    master;
    bus = {};
    layers = {};
    alarmTimer = 0;
    started = false;
    where = "overview";
    noise(ctx) { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++)
        d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s; }
    start() {
        if (this.started) {
            this.ctx?.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC)
            return;
        const ctx = (this.ctx = new AC());
        this.started = true;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        for (const k of ["ambience", "equipment", "alarms", "ui"]) {
            const g = ctx.createGain();
            g.connect(this.master);
            this.bus[k] = g;
        }
        const mk = (name, bus, build) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus[bus]); this.layers[name] = g; build(g); };
        mk("rumble", "ambience", (o) => { const n = this.noise(ctx), f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 140; n.connect(f).connect(o); n.start(); });
        mk("vent", "ambience", (o) => { const n = this.noise(ctx), f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 0.6; n.connect(f).connect(o); n.start(); });
        mk("tower", "equipment", (o) => { const n = this.noise(ctx), f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 450; f.Q.value = 0.4; n.connect(f).connect(o); n.start(); });
        mk("hum", "equipment", (o) => { for (const fr of [50, 100, 150]) {
            const os = ctx.createOscillator();
            os.frequency.value = fr;
            const g = ctx.createGain();
            g.gain.value = fr === 50 ? 0.5 : 0.2;
            os.connect(g).connect(o);
            os.start();
        } });
        mk("turbine", "equipment", (o) => { const os = ctx.createOscillator(); os.type = "sawtooth"; os.frequency.value = 118; const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400; os.connect(f).connect(o); os.start(); const n = this.noise(ctx), f2 = ctx.createBiquadFilter(); f2.type = "highpass"; f2.frequency.value = 2500; const g2 = ctx.createGain(); g2.gain.value = 0.05; n.connect(f2).connect(g2).connect(o); n.start(); });
        mk("room", "ambience", (o) => { const n = this.noise(ctx), f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 600; n.connect(f).connect(o); n.start(); });
    }
    ramp(g, v) { g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.4); }
    /** Called a few times per second with the live game state. Sound follows the simulation, and the player's location in the plant. */
    update(s, page) {
        if (!this.ctx)
            return;
        const st = s.settings;
        this.where = page;
        this.master.gain.value = st.muted ? 0 : st.volMaster;
        this.bus.ambience.gain.value = st.volAmbience;
        this.bus.equipment.gain.value = st.volEquipment;
        this.bus.alarms.gain.value = st.volAlarms;
        this.bus.ui.gain.value = st.volUi;
        const hall = page === "turbine" ? 1 : page === "reactor" || page === "map" ? 0.45 : page === "control" ? 0.25 : 0.15, tower = page === "cooling" ? 1 : page === "map" ? 0.4 : 0.1;
        const load = s.turbine.online ? s.turbine.grossMW / 420 : 0;
        this.ramp(this.layers.rumble, 0.35 * (0.4 + s.reactor.flowFrac * 0.6) * (page === "reactor" ? 1.4 : 1));
        this.ramp(this.layers.vent, 0.05 + 0.04 * (page === "control" ? 1 : 0));
        this.ramp(this.layers.hum, 0.05 + 0.05 * (s.grid.breakerClosed ? 1 : 0) * (page === "grid" || page === "map" ? 1.5 : 1));
        this.ramp(this.layers.tower, 0.25 * s.cooling.fans * tower);
        this.ramp(this.layers.turbine, 0.18 * load * hall);
        this.ramp(this.layers.room, page === "control" ? 0.1 : 0.03);
        const worst = Object.values(s.alarms).filter((a) => !a.acked).sort((a, b) => sevRank(b.sev) - sevRank(a.sev))[0];
        if (worst && sevRank(worst.sev) >= 3) {
            const now = performance.now();
            if (now - this.alarmTimer > (worst.sev === "critical" ? 700 : 1800)) {
                this.alarmTimer = now;
                this.beep(worst.sev === "critical" ? 880 : 620, worst.sev === "critical" ? 2 : 1);
            }
        }
    }
    beep(freq, n = 1, bus = "alarms") { if (!this.ctx)
        return; for (let i = 0; i < n; i++) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime + i * 0.22;
        o.type = "square";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(this.bus[bus]);
        o.start(t);
        o.stop(t + 0.2);
    } }
    click() { if (!this.ctx)
        return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime; o.type = "triangle"; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.05); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); o.connect(g).connect(this.bus.ui); o.start(t); o.stop(t + 0.07); }
    notify() { if (!this.ctx)
        return; const t0 = this.ctx.currentTime; [660, 880].forEach((f, i) => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + i * 0.12); g.gain.exponentialRampToValueAtTime(0.16, t0 + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.2); o.connect(g).connect(this.bus.ui); o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.22); }); }
    /** Equipment start / stop: a rising or falling sweep. */
    sweep(up) { if (!this.ctx)
        return; const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime; o.type = "sawtooth"; o.frequency.setValueAtTime(up ? 60 : 180, t); o.frequency.exponentialRampToValueAtTime(up ? 180 : 50, t + 1.2); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3); const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500; o.connect(f).connect(g).connect(this.bus.equipment); o.start(t); o.stop(t + 1.4); }
}
const sevRank = (s) => ({ info: 0, notice: 1, warning: 2, alarm: 3, critical: 4 }[s] ?? 0);
export const sound = new Sound();
