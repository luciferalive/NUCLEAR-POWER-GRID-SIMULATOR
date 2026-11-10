import { SAVE_VERSION } from "../simulation/scenarios.js";
export class MemoryBackend {
    m = new Map();
    async get(k) { const v = this.m.get(k); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
    async set(k, v) { this.m.set(k, JSON.parse(JSON.stringify(v))); }
    async del(k) { this.m.delete(k); }
    async keys() { return [...this.m.keys()]; }
}
/** IndexedDB backend (browser). One object store, key -> value. */
export class IdbBackend {
    db;
    constructor(name = "nuclear-grid-sim") {
        this.db = new Promise((res, rej) => {
            const r = indexedDB.open(name, 1);
            r.onupgradeneeded = () => r.result.createObjectStore("saves");
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
    }
    tx(mode, f) {
        return this.db.then((db) => new Promise((res, rej) => { const r = f(db.transaction("saves", mode).objectStore("saves")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    }
    get(k) { return this.tx("readonly", (s) => s.get(k)); }
    async set(k, v) { await this.tx("readwrite", (s) => s.put(v, k)); }
    async del(k) { await this.tx("readwrite", (s) => s.delete(k)); }
    async keys() { return (await this.tx("readonly", (s) => s.getAllKeys())).map(String); }
}
/** Each entry upgrades a save from version N to N+1. Never edit old entries: add a new one when the state shape changes. */
export const MIGRATIONS = {
    // 0 -> 1: saves made before versioning (defensive: fill every field the engine expects)
    0: (r) => { r.flags ??= {}; r.flags.staffRatio ??= 1; r.flags.growth ??= 0; r.flags.inflation ??= 0; r.objectives ??= []; r.hourly ??= []; r.eventHistory ??= []; },
};
export function migrate(raw) {
    if (!raw || typeof raw !== "object")
        throw new Error("Not a save file");
    let v = Number(raw.version ?? 0);
    if (v > SAVE_VERSION)
        throw new Error(`This save is from a newer version of the game (v${v}).`);
    while (v < SAVE_VERSION) {
        MIGRATIONS[v]?.(raw);
        v++;
        raw.version = v;
    }
    for (const k of ["reactor", "turbine", "grid", "finance", "settings", "customers", "contracts", "equipment", "staff"])
        if (!raw[k])
            throw new Error(`Save is missing "${k}"`);
    return raw;
}
export class SaveManager {
    b;
    constructor(b) {
        this.b = b;
    }
    key = (id) => "slot:" + id;
    async list() {
        const out = [];
        for (const k of await this.b.keys())
            if (k.startsWith("slot:")) {
                const r = (await this.b.get(k));
                if (r?.meta)
                    out.push(r.meta);
            }
        return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    }
    async save(id, s, name) {
        const old = (await this.b.get(this.key(id)));
        const meta = { id, name: name ?? old?.meta.name ?? (id === "auto" ? "Autosave" : `Slot ${id}`), savedAt: new Date().toISOString(), day: Math.floor(s.t / 1440) + 1, version: SAVE_VERSION,
            company: s.settings.companyName, cash: Math.round(s.finance.cash), difficulty: s.settings.difficulty, mode: s.settings.mode };
        await this.b.set(this.key(id), { meta, state: s });
        return meta;
    }
    async load(id) {
        const r = (await this.b.get(this.key(id)));
        if (!r)
            throw new Error("Save not found");
        return migrate(r.state);
    }
    async rename(id, name) { const r = (await this.b.get(this.key(id))); if (!r)
        return; r.meta.name = name; await this.b.set(this.key(id), r); }
    async remove(id) { await this.b.del(this.key(id)); }
    async export(id) { const r = (await this.b.get(this.key(id))); if (!r)
        throw new Error("Save not found"); return exportText(r.state, r.meta.name); }
}
export function exportText(s, name = "export") { return JSON.stringify({ app: "nuclear-power-grid-simulator", version: SAVE_VERSION, name, exportedAt: new Date().toISOString(), state: s }); }
export function importText(text) {
    let j;
    try {
        j = JSON.parse(text);
    }
    catch {
        throw new Error("That file is not valid JSON");
    }
    if (j.app !== "nuclear-power-grid-simulator" || !j.state)
        throw new Error("That file is not a save from this game");
    const state = migrate({ ...j.state, version: j.state.version ?? j.version });
    return { name: j.name ?? "Imported", state };
}
