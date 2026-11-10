/** Small seeded PRNG (mulberry32). The state lives in GameState.rngState so saves replay identically. */
export function nextRandom(s) {
    s.rngState = (s.rngState + 0x6d2b79f5) | 0;
    let t = s.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function randRange(s, a, b) { return a + (b - a) * nextRandom(s); }
export function randInt(s, a, b) { return Math.floor(randRange(s, a, b + 1)); }
export function pick(s, arr) { return arr[Math.floor(nextRandom(s) * arr.length) % arr.length]; }
