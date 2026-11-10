export const hourly = (s, n) => s.hourly.slice(-n);
export const hoursLabels = (s, n) => hourly(s, n).map((h) => `D${Math.floor(h.t / 1440) + 1} ${String(Math.floor((h.t % 1440) / 60)).padStart(2, "0")}h`);
