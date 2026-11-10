/** Central, serialisable game state. Everything the UI shows is read from here; everything that changes it goes through engine.ts. */

export type Difficulty = "beginner" | "normal" | "advanced" | "expert" | "hardcore";
export type GameMode = "career" | "sandbox" | "challenge" | "crisis" | "realistic";
export type Severity = "info" | "notice" | "warning" | "alarm" | "critical";

export interface LogEntry { t: number; sev: Severity; cat: string; msg: string }

export interface Pump { id: string; on: boolean; speed: number; flow: number }

export interface ReactorState {
  rod: number;            // control rod withdrawal 0..1 (1 = fully out = most reactivity)
  rodTarget: number;
  autoRods: boolean;      // true: rods follow the turbine load setpoint
  n: number;              // relative neutron population / fission power, 1 = rated
  xenon: number;          // fission-product poison 0..1 (game abstraction)
  tFuel: number;          // fuel temperature, degC (game units)
  tCool: number;          // coolant temperature, degC
  pressure: number;       // primary pressure, bar (game units)
  flowFrac: number;       // total coolant flow, fraction of rated
  pumps: Pump[];
  scram: boolean;
  scramReason: string;
  scramSince: number;
  burnup: number;         // fuel burn-up 0..1
  containment: number;    // integrity 0..100
  protection: boolean;    // reactor protection system armed
  heatRemoved: number;    // MWt delivered to the steam side
  iodine: number;         // fission-product precursor 0..1 (game abstraction)
  outageLeftMin: number;  // refuelling outage countdown
  decayHeat: number;      // MWt
}

export interface TurbineState {
  setpointMW: number;     // requested gross electrical output
  tripped: boolean;
  grossMW: number;
  steamMWt: number;
  efficiency: number;     // thermal -> electrical
  rpm: number;
  vibration: number;      // 0..10
  online: boolean;        // synchronised with grid
}

export interface CoolingState {
  fans: number;           // 0..1 tower fan speed
  basinTemp: number;      // degC
  condenserTemp: number;  // degC
  waterUseM3h: number;
  condenserFactor: number;
  intakeOpen: boolean;
}

export interface Equipment {
  id: string; name: string; building: string; maker: string; installed: number; // sim day installed (can be negative)
  condition: number;      // 0..100
  status: "ok" | "degraded" | "failed" | "maintenance" | "offline";
  failureProb: number;    // per day, computed
  maintCost: number; replaceCost: number;
  history: { t: number; what: string }[];
  maintLeftMin: number; maintTotalMin: number; maintKind: "" | "inspection" | "repair" | "overhaul" | "replace";
  stress: number;         // last computed load stress 0..1
}

export interface Employee {
  id: number; name: string; role: Role; exp: number; salary: number; shift: 0 | 1 | 2; training: number;
  perf: number; fatigue: number; cert: boolean; hiredT: number;
}
export type Role = "operator" | "engineer" | "electrician" | "mechanic" | "safety" | "maintenance" | "security" | "finance" | "manager";

export interface CustomerProfile {
  id: string; name: string; industry: string; region: string;
  peakMW: number;         // maximum possible demand
  loadShape: string;      // key into load-shape table
  credit: number;         // 0..1 financial health (affects payment)
  reservation: number;    // $/MWh the customer is willing to pay at most (hidden base)
  x: number; y: number;   // map position 0..1000
}

export interface Contract {
  id: string; customerId: string; capacityMW: number; price: number; startT: number; endT: number;
  priority: 1 | 2 | 3 | 4 | 5; penalty: number; active: boolean; terminated: boolean;
  demandMW: number; deliveredMW: number; shortfallMW: number;
  monthMWh: number; totalMWh: number; totalRevenue: number; accruedUnbilled: number;
  lateCount: number;
}

export interface Offer {
  id: string; customerId: string; capacityMW: number; days: number; asking: number; reservation: number;
  priority: 1 | 2 | 3 | 4 | 5; rounds: number; expiresT: number; status: "open" | "accepted" | "rejected" | "withdrawn";
  lastCounter?: number; note: string;
}

export interface Invoice { id: string; customerId: string; contractId: string; issuedT: number; dueT: number; amount: number; paid: boolean; paidT?: number; overdue: boolean }

export interface MarketState {
  spotPrice: number; spotSoldMW: number; spotBoughtMW: number; regionalDemand: number; competitorSupply: number;
  exportCapMW: number; priceHistory: number[]; forecast: number[];
  autoBuy: boolean;       // buy power on the spot market to cover contracts when generation is short
  sellSurplus: boolean;
  reserveMW: number;      // MW the player wants kept as reserve (not sold)
  basePrice: number;
}

export interface LedgerEntry { t: number; cat: string; amount: number; note: string }

export interface FinanceState {
  cash: number; debt: number; interestRate: number; loans: { id: number; principal: number; rate: number }[];
  ledger: LedgerEntry[]; // recent entries only (trimmed), aggregated into `totals`
  totals: Record<string, number>;            // all-time by category (+ income, - expense)
  day: Record<string, number>;               // today by category
  month: Record<string, number>;
  year: Record<string, number>;
  prevDay: Record<string, number>; prevMonth: Record<string, number>;
  dailyHistory: { t: number; revenue: number; expenses: number; net: number }[];
  assets: number;
  invoices: Invoice[];
  reputation: number;     // 0..100
}

export interface ResearchState { done: string[]; current: string | null; progressDays: number; budgetPerDay: number }

export interface ActiveEvent {
  id: number; kind: string; title: string; text: string; sev: Severity; startT: number; endT: number;
  options?: { id: string; label: string; cost: number; hint: string }[]; resolved: boolean; choice?: string;
  effects: Record<string, number>;
}

export interface WeatherState { temp: number; wind: number; sun: number; rain: number; kind: string; changeT: number }

export interface SafetyState {
  compliance: number; safetyScore: number; incidents: { t: number; text: string; sev: Severity }[];
  nextInspectionT: number; fines: number; licenceOk: boolean; drillsDoneT: number; backupPowerReady: boolean;
}

export interface Objective { id: string; text: string; metric: string; target: number; deadlineT: number; done: boolean; failed: boolean }

export interface Settings {
  difficulty: Difficulty; mode: GameMode; speed: number; paused: boolean;
  volMaster: number; volAmbience: number; volEquipment: number; volAlarms: number; volUi: number; muted: boolean;
  autosave: boolean; tutorialStep: number; tutorialDone: boolean; tooltips: boolean; companyName: string; seed: number;
}

export interface Station { // per-hour aggregates for reports
  t: number; grossMW: number; netMW: number; demandMW: number; contractMW: number; spotMW: number; price: number; revenue: number; tCool: number; powerFrac: number;
}

export interface GameState {
  version: number;
  t: number;              // simulation minutes since start
  rngState: number;
  settings: Settings;
  reactor: ReactorState;
  turbine: TurbineState;
  cooling: CoolingState;
  grid: GridState;
  market: MarketState;
  finance: FinanceState;
  customers: CustomerProfile[];
  contracts: Contract[];
  offers: Offer[];
  equipment: Equipment[];
  staff: Employee[];
  nextEmployeeId: number;
  inventory: { spares: number; supplies: number };
  research: ResearchState;
  upgrades: string[];
  events: ActiveEvent[];
  nextEventId: number;
  eventHistory: { t: number; kind: string; title: string; sev: Severity }[];
  weather: WeatherState;
  safety: SafetyState;
  log: LogEntry[];
  alarms: Record<string, { since: number; sev: Severity; text: string; acked: boolean }>;
  hourly: Station[];
  objectives: Objective[];
  stats: Stats;
  flags: Record<string, number>;
}

export interface GridState {
  grossMW: number; auxMW: number; netMW: number; lossMW: number; contractedMW: number; spotMW: number;
  exportCapMW: number; reserveMW: number; unservedMW: number; boughtMW: number; frequency: number; breakerClosed: boolean;
  frequencyEventUntil: number; connectionOk: boolean; demandMW: number;
}

export interface Stats {
  totalMWh: number; todayMWh: number; monthMWh: number; yearMWh: number;
  contractMWh: number; spotMWh: number; unservedMWh: number; boughtMWh: number;
  scrams: number; uptimeMin: number; lastDay: number; lastMonth: number; lastYear: number; profitableMonths: number;
  peakNetMW: number;
}

export type Action =
  | { type: "setSpeed"; speed: number } | { type: "togglePause" }
  | { type: "setRod"; value: number } | { type: "setAutoRods"; on: boolean }
  | { type: "setPump"; id: string; on?: boolean; speed?: number }
  | { type: "setSetpoint"; mw: number } | { type: "setFans"; value: number }
  | { type: "scram"; reason?: string } | { type: "resetScram" } | { type: "setProtection"; on: boolean }
  | { type: "tripTurbine" } | { type: "resetTurbine" } | { type: "setBreaker"; closed: boolean }
  | { type: "setMarket"; autoBuy?: boolean; sellSurplus?: boolean; reserveMW?: number }
  | { type: "negotiate"; offerId: string; price: number } | { type: "acceptOffer"; offerId: string } | { type: "rejectOffer"; offerId: string }
  | { type: "terminateContract"; id: string } | { type: "setPriority"; id: string; priority: 1 | 2 | 3 | 4 | 5 }
  | { type: "chasePayment"; invoiceId: string }
  | { type: "scheduleMaintenance"; id: string; kind: "inspection" | "repair" | "overhaul" | "replace" }
  | { type: "hire"; role: Role } | { type: "fire"; id: number } | { type: "train"; id: number } | { type: "setShift"; id: number; shift: 0 | 1 | 2 }
  | { type: "buySpares"; qty: number } | { type: "buySupplies"; qty: number }
  | { type: "startResearch"; id: string } | { type: "buyUpgrade"; id: string }
  | { type: "takeLoan"; amount: number } | { type: "repayLoan"; id: number }
  | { type: "resolveEvent"; id: number; option: string } | { type: "ackAlarm"; key: string } | { type: "ackAll" }
  | { type: "refuel" } | { type: "drill" } | { type: "setSetting"; key: keyof Settings; value: unknown }
 ;
