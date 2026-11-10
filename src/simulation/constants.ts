/** All numbers are FICTIONAL game units for an educational simulator. They are not real plant data or operating limits. */
export const PNOM = 1200;            // rated thermal power, MWt
export const ETA0 = 0.335;           // base thermal -> electrical efficiency
export const GEN_EFF = 0.985;        // generator efficiency
export const C_COOL = 400;           // coolant loop thermal capacity, MWt*min/degC
export const T_SG = 255;             // steam-generator secondary temperature, degC
export const K_SG = 26.7;            // heat transfer coefficient, MWt/degC at rated flow
export const DT_FUEL = 380;          // fuel - coolant temperature difference at rated power, degC
export const T_REF = 290;            // reference temperature for feedback, degC
export const ROD_WORTH = 4000;       // pcm over the full travel
export const ROD_CRIT = 0.4;         // rod position that cancels the reference state
export const ALPHA_F = 2.0;          // pcm per degC (fuel temperature, negative feedback)
export const ALPHA_C = 8.0;          // pcm per degC (coolant temperature, negative feedback)
export const XENON_WORTH = 1100;     // pcm at xenon = 1
export const BURN_WORTH = 1500;      // pcm at burnup = 1
export const ROD_SPEED = 0.01;       // rod travel per minute (normal)
export const SCRAM_SPEED = 0.5;
export const PUMP_CAP = 0.4;         // flow fraction per pump at speed 1 (3 pumps -> 1.2)
export const PUMP_MW = 6;            // electrical MW per pump at full speed
export const BYPASS_FRAC = 0.3;     // steam dump capacity, fraction of PNOM
export const LIMITS = { tCoolTrip: 335, pressureTrip: 180, nTrip: 1.25, flowTrip: 0.15, tCoolHigh: 322, pressureHigh: 170 };
export const GEN_NAMEPLATE = 420;    // MW electrical
export const BASE_AUX = 10;          // MW buildings, lighting, control room
export const FAN_MW = 5;
export const EXPORT_CAP = 330;       // MW grid connection
export const FUEL_COST_PER_MWT_DAY = 1.35; // $ per MWt-day * 1000 -> see economy
export const WATER_PER_MWT_REJECT = 1.6;   // m3/h per MWt rejected
export const WATER_PRICE = 0.85;     // $ per m3
export const SALARY: Record<string, number> = { operator: 7800, engineer: 9800, electrician: 6400, mechanic: 6100, safety: 7600, maintenance: 5200, security: 4300, finance: 6900, manager: 12500 };
export const MIN_STAFF: Record<string, number> = { operator: 6, engineer: 2, electrician: 2, mechanic: 2, safety: 2, maintenance: 3, security: 3, finance: 1, manager: 1 };
export const ROLE_LABEL: Record<string, string> = { operator: "Plant operator", engineer: "Engineer", electrician: "Electrical technician", mechanic: "Mechanical technician", safety: "Safety officer", maintenance: "Maintenance worker", security: "Security", finance: "Financial staff", manager: "Management" };
export const DIFFICULTY = {
  beginner: { hazard: 0.35, volatility: 0.6, payDelay: 0.5, startCash: 60_000_000, score: 0.8 },
  normal: { hazard: 1, volatility: 1, payDelay: 1, startCash: 40_000_000, score: 1 },
  advanced: { hazard: 1.5, volatility: 1.3, payDelay: 1.3, startCash: 30_000_000, score: 1.3 },
  expert: { hazard: 2.1, volatility: 1.6, payDelay: 1.7, startCash: 22_000_000, score: 1.6 },
  hardcore: { hazard: 3, volatility: 2, payDelay: 2.2, startCash: 15_000_000, score: 2 },
} as const;
/** Hour-by-hour demand multipliers (0..1) for customer types and the region. */
export const LOAD_SHAPES: Record<string, number[]> = {
  flat: Array(24).fill(0.97),
  steel: [0.93, 0.93, 0.93, 0.93, 0.93, 0.95, 0.98, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.98, 0.96, 0.95, 0.94, 0.93, 0.93],
  shift: [0.45, 0.45, 0.45, 0.45, 0.45, 0.5, 0.75, 0.95, 1, 1, 1, 1, 0.9, 1, 1, 1, 1, 0.9, 0.75, 0.6, 0.5, 0.45, 0.45, 0.45],
  datacenter: [0.88, 0.87, 0.86, 0.86, 0.87, 0.89, 0.92, 0.95, 0.98, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.99, 0.98, 0.96, 0.94, 0.92, 0.9],
  residential: [0.55, 0.5, 0.47, 0.46, 0.48, 0.58, 0.75, 0.9, 0.85, 0.75, 0.7, 0.7, 0.72, 0.72, 0.74, 0.78, 0.88, 1, 1, 0.98, 0.92, 0.82, 0.7, 0.6],
  government: [0.55, 0.5, 0.5, 0.5, 0.5, 0.55, 0.7, 0.9, 1, 1, 1, 1, 1, 1, 1, 1, 0.95, 0.85, 0.75, 0.7, 0.65, 0.6, 0.58, 0.56],
};
export const REGION_SHAPE = LOAD_SHAPES.residential.map((r, i) => 0.55 * r + 0.45 * LOAD_SHAPES.shift[i]);
export const WEATHER_KINDS = ["sunny", "cloudy", "rain", "thunderstorm", "heatwave", "cold wave", "strong wind"] as const;
