import { dispatch, type Result } from "../simulation/engine.js";
import { SimulationClock } from "../simulation/simulationClock.js";
import { createGame } from "../simulation/scenarios.js";
import type { Action, GameState } from "../simulation/types.js";

type Listener = (kind: "tick" | "action" | "load") => void;
/** Tiny central store: one authoritative GameState, subscribers get told after ticks and actions. */
class Store {
  state: GameState = createGame();
  clock = new SimulationClock();
  private ls = new Set<Listener>();
  subscribe(f: Listener) { this.ls.add(f); return () => this.ls.delete(f); }
  emit(kind: "tick" | "action" | "load") { for (const f of this.ls) f(kind); }
  replace(s: GameState) { this.state = s; this.clock = new SimulationClock(); this.emit("load"); }
  act(a: Action): Result { const r = dispatch(this.state, a); this.emit("action"); return r; }
  tick(realSeconds: number) { const n = this.clock.advance(this.state, realSeconds); if (n > 0) this.emit("tick"); return n; }
}
export const store = new Store();
