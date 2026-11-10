import type { GameState } from "../simulation/types.js";
export interface Page { id: string; title: string; icon: string; render(s: GameState): string; mount?(root: HTMLElement, s: GameState): void; }
export const hourly = (s: GameState, n: number) => s.hourly.slice(-n);
export const hoursLabels = (s: GameState, n: number) => hourly(s, n).map((h) => `D${Math.floor(h.t / 1440) + 1} ${String(Math.floor((h.t % 1440) / 60)).padStart(2, "0")}h`);
