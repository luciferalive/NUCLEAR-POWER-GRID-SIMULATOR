import { sound } from "./audio/audio.js";
import { createGame } from "./simulation/scenarios.js";
import { SPEEDS } from "./simulation/simulationClock.js";
import { fmtTime } from "./simulation/util.js";
import { IdbBackend, MemoryBackend, SaveManager, importText } from "./store/saves.js";
import { store } from "./store/store.js";
import { $, download, esc, f0, toCsv, usdM } from "./ui/dom.js";
import * as P1 from "./ui/pages/p1.js";
import * as P2 from "./ui/pages/p2.js";
import * as P3 from "./ui/pages/p3.js";
import * as P4 from "./ui/pages/p4.js";
import * as P5 from "./ui/pages/p5.js";
import { ui } from "./ui/state.js";
const PAGES = [P1.overview, P1.map, P1.reactor, P1.control, P1.turbine, P1.cooling, P2.grid, P2.market, P2.customers, P2.finance, P3.maintenance, P3.personnel, P3.research, P3.safety, P3.reports, P3.upgrades, P4.settings, P4.tutorial, P5.worldmap, P5.command, P5.network, P5.expenses, P5.procurement, P5.construction, P5.economy, P5.news, P5.regulator, P5.achievements];
let backend;
try {
    backend = typeof indexedDB !== "undefined" ? new IdbBackend() : new MemoryBackend();
}
catch {
    backend = new MemoryBackend();
}
const saves = new SaveManager(backend);
function toast(msg, kind = "info") {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), 5000);
}
async function refreshSaves() { try {
    P4.saveCache.list = await saves.list();
}
catch {
    P4.saveCache.list = [];
} }
async function doSave(id) { try {
    await saves.save(id, store.state);
    P4.saveCache.ok = true;
    P4.saveCache.msg = id === "auto" ? "" : `Saved to slot ${id}.`;
    if (id !== "auto")
        toast(`Saved to slot ${id}`);
}
catch (e) {
    P4.saveCache.ok = false;
    P4.saveCache.msg = "Save failed: " + e.message;
    toast(P4.saveCache.msg, "bad");
} await refreshSaves(); }
function shell() {
    $("#app").innerHTML = `<header id="hdr"></header><nav id="nav"></nav><main id="main"></main><footer id="ftr"></footer>`;
    const c = document.createElement("div");
    c.id = "coach";
    document.body.appendChild(c);
    $("#nav").innerHTML = PAGES.map((p) => (p.id === "worldmap" ? '<div class="navhead">LIVING WORLD</div>' : "") + `<a href="#${p.id}" data-page="${p.id}"><i>${p.icon}</i>${esc(p.title)}</a>`).join("");
}
function header() {
    const s = store.state, st = s.settings, g = s.grid;
    const alarms = Object.values(s.alarms).filter((a) => !a.acked).length;
    $("#hdr").innerHTML = `<b class="brand">${esc(st.companyName)}</b><span class="clock">${fmtTime(s.t)}</span>
<span class="speed">${btnS("pause", st.paused ? "▶ Resume" : "❚❚ Pause", st.paused)}${SPEEDS.filter((x) => x > 0).map((x) => btnS("speed" + x, x + "x", !st.paused && st.speed === x)).join("")}</span>
<span class="hk">Cash <b>${usdM(s.finance.cash)}</b></span><span class="hk">Net <b>${f0(g.netMW)} MW</b></span><span class="hk">Reactor <b>${f0(s.reactor.n * 100)}%</b></span>
<span class="alarmchip ${alarms ? "on" : ""}" data-cmd="ackall">${alarms} alarm${alarms === 1 ? "" : "s"}${s.reactor.scram ? " | SCRAM" : ""}</span><button class="btn sm" data-cmd="mute">${st.muted ? "Sound off" : "Sound on"}</button>`;
}
const btnS = (cmd, label, on) => `<button class="${on ? "on" : ""}" data-cmd="${cmd}">${label}</button>`;
let lastHtml = "", lastPage = "";
function render(force = false) {
    const s = store.state, page = PAGES.find((p) => p.id === ui.page) ?? PAGES[0];
    header();
    $("#ftr").textContent = `Fictional educational simulation | ${s.settings.mode} / ${s.settings.difficulty} | ${s.contracts.filter((c) => c.active).length} contracts | day ${Math.floor(s.t / 1440) + 1}`;
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.page === page.id));
    const main = $("#main"), ae = document.activeElement;
    const editing = ae && main.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName);
    if (!force && editing && lastPage === page.id) {
        coach();
        return;
    }
    let html;
    try {
        html = page.render(s);
    }
    catch (e) {
        html = `<div class="panel"><h2>This page failed to draw</h2><pre>${esc(e.stack ?? e)}</pre></div>`;
        console.error(e);
    }
    if (force || html !== lastHtml || lastPage !== page.id) {
        const y = main.scrollTop;
        main.innerHTML = html;
        main.scrollTop = lastPage === page.id ? y : 0;
        lastHtml = html;
        lastPage = page.id;
    }
    try {
        page.mount?.(main, s);
    }
    catch (e) {
        console.error(e);
    }
    coach();
}
function coach() {
    const s = store.state, el = $("#coach"), st = s.settings;
    el.className = "";
    if (st.tutorialDone || ui.coachOff || st.tutorialStep >= P4.TUTORIAL.length || !$("#modal").hidden) {
        el.innerHTML = "";
        el.style.display = "none";
        return;
    }
    el.className = "coach";
    el.style.display = "";
    const t = P4.TUTORIAL[st.tutorialStep], done = t.check(s);
    const h = `<div><b>Tutorial ${st.tutorialStep + 1}/${P4.TUTORIAL.length}: ${esc(t.title)}</b> ${done ? '<span class="s-info">✔ done</span>' : ""}<p>${esc(t.text)}</p>${done ? "" : `<small>${esc(t.hint)}</small>`}<span class="row"><button class="btn sm pri" data-cmd="tutnext">${done ? "Next" : "Skip step"}</button><button class="btn sm" data-cmd="tutoff">Hide tutorial</button></span></div>`;
    if (el.innerHTML !== h)
        el.innerHTML = h;
}
function modal(html) { const m = $("#modal"); m.hidden = false; m.innerHTML = `<div class="box">${html}</div>`; }
function closeModal() { $("#modal").hidden = true; $("#modal").innerHTML = ""; }
function startModal() {
    const hasAuto = P4.saveCache.list.some((x) => x.id === "auto");
    modal(`<h1>Nuclear Power Grid Simulator</h1><p>You run a fictional nuclear power company: keep the plant safe, keep customers supplied and keep the company profitable. Everything is a simplified, fictional model for fun and learning.</p>
<div class="row">${hasAuto ? '<button class="btn pri" data-cmd="continue">Continue last game</button>' : ""}<button class="btn ${hasAuto ? "" : "pri"}" data-cmd="newgame">New game</button><button class="btn" data-cmd="import">Import save file</button></div>${hasAuto ? "" : '<p class="notes">First time? Choose New game, Beginner, Career. The tutorial will guide you.</p>'}`);
}
function newGameModal() {
    modal(`<h1>New game</h1><label>Company name<br><input id="ng-name" value="Meridian Nuclear Power" maxlength="40"></label>
<label>Mode<br><select id="ng-mode"><option value="career">Career: grow the company, goals and objectives</option><option value="sandbox">Sandbox: unlimited money, experiment freely</option><option value="challenge">Challenge: harder goals and deadlines</option><option value="crisis">Crisis: worn plant, little cash, survive</option><option value="realistic">Realistic: less cash, stricter</option></select></label>
<label>Difficulty<br><select id="ng-diff"><option value="beginner">Beginner</option><option value="normal">Normal</option><option value="advanced">Advanced</option><option value="expert">Expert</option><option value="hardcore">Hardcore</option></select></label>
<div class="row"><button class="btn pri" data-cmd="ng-go">Start</button><button class="btn" data-cmd="ng-cancel">Back</button></div>`);
}
function loadState(s) { store.replace(s); closeModal(); render(true); }
async function appCmd(a) {
    const cmd = a.cmd, id = String(a.id ?? "");
    switch (cmd) {
        case "guide":
            ui.guide = String(a.value);
            render(true);
            break;
        case "coach":
            ui.coachOff = !ui.coachOff;
            render(true);
            break;
        case "tut":
            tutStep(Number(a.value));
            break;
        case "save":
            await doSave(id);
            render(true);
            break;
        case "load":
            try {
                loadState(await saves.load(id));
                toast("Game loaded");
            }
            catch (e) {
                toast("Load failed: " + e.message, "bad");
            }
            break;
        case "rename": {
            const n = prompt("Name for this save:");
            if (n) {
                await saves.rename(id, n);
                await refreshSaves();
                render(true);
            }
            break;
        }
        case "export":
            try {
                download(`power-grid-save-${id}.json`, await saves.export(id), "application/json");
            }
            catch (e) {
                toast("Export failed: " + e.message, "bad");
            }
            break;
        case "delete":
            if (confirm("Delete this save?")) {
                await saves.remove(id);
                await refreshSaves();
                render(true);
            }
            break;
        case "newgame":
            newGameModal();
            break;
        case "import":
            pickFile();
            break;
    }
}
function tutStep(d) {
    const st = store.state.settings, n = Math.max(0, st.tutorialStep + d);
    store.act({ type: "setSetting", key: "tutorialStep", value: Math.min(n, P4.TUTORIAL.length) });
    if (n >= P4.TUTORIAL.length)
        store.act({ type: "setSetting", key: "tutorialDone", value: true });
    render(true);
}
function pickFile() {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = ".json,application/json";
    i.onchange = async () => { const f = i.files?.[0]; if (!f)
        return; try {
        const r = importText(await f.text());
        loadState(r.state);
        toast(`Imported "${r.name}"`);
    }
    catch (e) {
        P4.saveCache.ok = false;
        P4.saveCache.msg = "Import failed: " + e.message;
        toast(P4.saveCache.msg, "bad");
        render(true);
    } };
    i.click();
}
function csvOf(what) {
    const s = store.state;
    if (what === "report") {
        const r = P3.buildReport(s, ui.reportKind);
        download(`report-${ui.reportKind}.csv`, toCsv([r.head, ...r.rows]));
        return;
    }
    const f = s.finance;
    const rows = [["Category", "Today", "Month", "Year", "All time"], ...Object.keys(f.totals).sort().map((k) => [k, Math.round(f.day[k] ?? 0), Math.round(f.month[k] ?? 0), Math.round(f.year[k] ?? 0), Math.round(f.totals[k] ?? 0)])];
    download("finance.csv", toCsv(rows));
}
function gameAct(a) { const r = store.act(a); if (!r.ok && r.msg)
    toast(r.msg, "bad");
else
    sound.click(); render(true); }
document.addEventListener("click", (ev) => {
    sound.start();
    const t = ev.target.closest("[data-act],[data-cmd],[data-page]");
    if (!t)
        return;
    if (t.dataset.page) {
        ui.page = t.dataset.page;
        return;
    }
    if (t.dataset.cmd) {
        void shellCmd(t.dataset.cmd);
        return;
    }
    const a = JSON.parse(t.dataset.act);
    if (t.dataset.from) {
        const inp = document.getElementById(t.dataset.from);
        a[t.dataset.key] = Number(inp.value);
        ui.offerPrice[String(a.offerId)] = Number(inp.value);
    }
    if (t.dataset.collect) {
        const form = document.getElementById(t.dataset.collect);
        const cmd = { ...(a.cmd ?? {}) };
        form.querySelectorAll("[data-f]").forEach((el) => { cmd[el.dataset.f] = el.type === "number" ? Number(el.value) : el.value; });
        a.cmd = cmd;
    }
    if (a.type === "app") {
        void appCmd(a);
        return;
    }
    if (a.type === "setTab") {
        ui.tab[String(a.key)] = String(a.value);
        if (a.key === "report")
            ui.reportKind = String(a.value);
        render(true);
        return;
    }
    if (a.type === "csv") {
        csvOf(String(a.what));
        return;
    }
    if (a.type === "negotiate") {
        const r = store.act(a);
        toast(r.msg ?? (r.ok ? "Done" : "Failed"), r.ok ? "info" : "warn");
        render(true);
        return;
    }
    if (a.type === "map") {
        ui.mapSel = String(a.id);
        render(true);
        return;
    }
    gameAct(a);
});
async function shellCmd(c) {
    const s = store.state;
    switch (c) {
        case "pause":
            store.act({ type: "togglePause" });
            break;
        case "mute":
            store.act({ type: "setSetting", key: "muted", value: !s.settings.muted });
            break;
        case "ackall":
            store.act({ type: "ackAll" });
            break;
        case "tutnext":
            tutStep(1);
            return;
        case "tutoff":
            ui.coachOff = true;
            break;
        case "continue":
            try {
                loadState(await saves.load("auto"));
            }
            catch (e) {
                toast("Could not load: " + e.message, "bad");
            }
            return;
        case "newgame":
            newGameModal();
            return;
        case "import":
            pickFile();
            return;
        case "ng-cancel":
            startModal();
            return;
        case "ng-go": {
            const v = (id) => document.getElementById(id).value;
            loadState(createGame({ company: v("ng-name") || "Meridian Nuclear Power", mode: v("ng-mode"), difficulty: v("ng-diff"), seed: Math.floor(Math.random() * 1e9) }));
            return;
        }
        default: if (c.startsWith("speed")) {
            store.act({ type: "setSpeed", speed: Number(c.slice(5)) });
            if (s.settings.paused)
                store.act({ type: "togglePause" });
        }
    }
    render(true);
}
function fieldAction(el, value) {
    const a = JSON.parse(el.dataset.ain ?? el.dataset.chk ?? el.dataset.chg);
    if (el.dataset.skey)
        a.key = el.dataset.skey;
    const v = el.dataset.str ? String(el.value) : typeof value === "number" ? value * Number(el.dataset.scale ?? 1) : value;
    const path = el.dataset.key.split(".");
    let o = a;
    for (let i = 0; i < path.length - 1; i++)
        o = o[path[i]];
    o[path[path.length - 1]] = v;
    return a;
}
document.addEventListener("input", (ev) => { const el = ev.target; if (el.dataset.ain)
    store.act(fieldAction(el, Number(el.value))); });
document.addEventListener("pointerup", () => { const a = document.activeElement; if (a?.type === "range") {
    a.blur();
    render(true);
} });
document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.dataset.chk)
        gameAct(fieldAction(el, el.checked));
    else if (el.dataset.chg)
        gameAct(fieldAction(el, Number(el.value)));
});
window.addEventListener("hashchange", () => { ui.page = location.hash.slice(1) || "overview"; render(true); });
let lastLog, last = performance.now(), lastPaint = 0, lastAuto = performance.now(), lastEvents = 0;
function notifications() {
    const s = store.state, L = s.log;
    let i = L.length - 1;
    const fresh = [];
    while (i >= 0 && `${L[i].t}|${L[i].msg}` !== lastLog && fresh.length < 8)
        fresh.push(L[i--]);
    if (L.length)
        lastLog = `${L[L.length - 1].t}|${L[L.length - 1].msg}`;
    for (const e of fresh.reverse())
        if (e.sev === "warning" || e.sev === "alarm" || e.sev === "critical") {
            toast(e.msg, e.sev === "warning" ? "warn" : "bad");
            if (e.sev !== "warning")
                sound.beep(e.sev === "critical" ? 980 : 740, 2);
        }
    const n = s.events.filter((e) => !e.resolved).length;
    if (n > lastEvents)
        sound.notify();
    lastEvents = n;
}
function loop(now) {
    const dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    if (!$("#modal").hidden) {
        requestAnimationFrame(loop);
        return;
    }
    store.tick(dt);
    if (now - lastPaint > 250) {
        lastPaint = now;
        notifications();
        render();
        sound.update(store.state, ui.page);
    }
    if (store.state.settings.autosave && now - lastAuto > 60000 && !store.state.settings.paused) {
        lastAuto = now;
        void doSave("auto");
    }
    requestAnimationFrame(loop);
}
async function main() {
    shell();
    ui.page = location.hash.slice(1) || "overview";
    await refreshSaves();
    render(true);
    startModal();
    requestAnimationFrame(loop);
    window.__game = { store, ui, saves };
}
void main();
