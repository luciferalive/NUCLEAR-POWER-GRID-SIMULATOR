import { step } from "./engine.js";
import type { GameState } from "./types.js";

export const SPEEDS = [0, 1, 2, 5, 10];
export const TICKS_PER_SECOND_AT_1X = 2;   // 1 tick = 1 simulated minute, so 1x = 2 simulated minutes per real second

/** Drives the simulation from real time. Calculation is independent of the screen frame rate: it always advances in whole 1-minute ticks. */
export class SimulationClock {
  private acc = 0;
  maxTicksPerFrame = 90;
  advance(s: GameState, realSeconds: number): number {
    if (s.settings.paused || s.settings.speed === 0) { this.acc = 0; return 0; }
    this.acc += realSeconds * TICKS_PER_SECOND_AT_1X * s.settings.speed;
    let n = Math.floor(this.acc);
    this.acc -= n;
    if (n > this.maxTicksPerFrame) { n = this.maxTicksPerFrame; this.acc = 0; }
    for (let i = 0; i < n; i++) step(s, 1);
    return n;
  }
}
