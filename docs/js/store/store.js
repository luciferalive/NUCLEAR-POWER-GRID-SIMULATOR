import { dispatch } from "../simulation/engine.js";
import { SimulationClock } from "../simulation/simulationClock.js";
import { createGame } from "../simulation/scenarios.js";
/** Tiny central store: one authoritative GameState, subscribers get told after ticks and actions. */
class Store {
    state = createGame();
    clock = new SimulationClock();
    ls = new Set();
    subscribe(f) { this.ls.add(f); return () => this.ls.delete(f); }
    emit(kind) { for (const f of this.ls)
        f(kind); }
    replace(s) { this.state = s; this.clock = new SimulationClock(); this.emit("load"); }
    act(a) { const r = dispatch(this.state, a); this.emit("action"); return r; }
    tick(realSeconds) { const n = this.clock.advance(this.state, realSeconds); if (n > 0)
        this.emit("tick"); return n; }
}
export const store = new Store();
