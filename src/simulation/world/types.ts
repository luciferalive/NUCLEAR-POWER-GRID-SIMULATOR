/** V2 "Living World" state. Lives inside GameState.world and is saved with it. */
export type RegionId = "North" | "East" | "South" | "West" | "Central";
export type WxKind = "sunny" | "cloudy" | "rain" | "thunderstorm" | "heatwave" | "cold wave" | "strong wind" | "flooding" | "drought";

export interface Region {
  id: RegionId; name: string; cx: number; cy: number; popIdx: number; weight: number; industrialShare: number;
  tieCapMW: number;                  // substation / interconnector capacity into the region (limits deliveries)
  demandMW: number; industrialMW: number; residentialMW: number; genMW: number; capMW: number; importMW: number; exportMW: number;
  lossMW: number; shortageMW: number; priceMul: number; deliveredByUsMW: number;
}
export interface WxRegion { kind: WxKind; temp: number; wind: number; sun: number; rain: number; since: number; until: number; forecast: WxKind[] }

export type NodeKind = "nuclear" | "coal" | "gas" | "wind" | "solar" | "hydro" | "substation" | "factory" | "steel" | "aluminium" | "cement" | "chemical" | "refinery" | "mine" | "datacenter" | "city" | "residential" | "commercial" | "hospital" | "airport" | "port" | "railstation" | "government" | "water" | "battery" | "warehouse" | "workshop" | "admin" | "plot" | "external";
export interface MapNode { id: string; kind: NodeKind; name: string; region: RegionId; x: number; y: number; owner: string; ref?: string; pop?: number; baseMW?: number }

export interface Line {
  id: string; kind: "supply" | "import" | "export" | "backbone"; from: string; to: string; via?: string; customerId?: string;
  capMW: number; flowMW: number; lossMW: number; status: "ok" | "fault" | "planned" | "inactive"; faultUntil: number; reliability: number; lengthKm: number;
  contractedMW: number; lastFaultT: number; condition: number;
}
export interface Competitor {
  id: string; name: string; tech: "coal" | "gas" | "hydro" | "wind" | "solar" | "nuclear"; region: RegionId; capMW: number; outMW: number; cash: number;
  bidPrice: number; share: number; status: "online" | "outage" | "maintenance" | "building"; statusUntil: number; marginalCost: number;
  building?: { addMW: number; doneT: number }; profitDay: number; node: string;
}
export interface Econ {
  phase: "expansion" | "boom" | "slowdown" | "recession" | "recovery"; phaseUntil: number; growth: number; inflation: number; cpi: number; interest: number;
  fuelIdx: number; fx: number; construction: number; manufacturing: number; popIdx: number; waterIdx: number; demandIdx: number; lastDay: number;
}
export interface Supplier {
  id: string; name: string; country: string; categories: string[]; priceMul: number; leadDays: number; reliability: number; terms: number; stock: Record<string, number>; relation: number; ordersTotal: number; lateCount: number;
}
export type Item = "spares" | "supplies" | "components" | "materials";
export interface Quote { id: string; supplierId: string; item: Item; qty: number; unitPrice: number; leadDays: number; terms: number; expiresT: number; ordered: boolean }
export interface Order { id: string; supplierId: string; item: Item; qty: number; unitPrice: number; placedT: number; dueT: number; eta: number; status: "transit" | "delivered" | "cancelled"; terms: number; delayed: boolean; invoiceId: string; deliveredT?: number }
export interface Payable { id: string; supplierId: string; amount: number; dueT: number; paid: boolean; note: string; paidT?: number }
export interface Project {
  id: string; kind: string; name: string; region: RegionId; x: number; y: number; cost: number; paid: number; days: number; progress: number; materials: number; materialsUsed: number;
  status: "permit" | "building" | "paused" | "done" | "cancelled"; permitT: number; startT: number; lineId?: string; targetId?: string; upkeep: number; stalled: string;
}
export interface Battery { id: string; name: string; region: RegionId; powerMW: number; capMWh: number; energyMWh: number; effIn: number; effOut: number; mode: "auto" | "charge" | "discharge" | "idle"; flowMW: number; lossMWh: number; chargedMWh: number; dischargedMWh: number; x: number; y: number; wear: number }
export interface OwnGen { id: string; name: string; kind: "gas" | "solar" | "wind"; region: RegionId; mw: number; outMW: number; costPerMWh: number; x: number; y: number; online: boolean }
export interface News { id: number; t: number; cat: "ENERGY MARKET" | "INDUSTRY" | "COMPETITION" | "WEATHER" | "FINANCE" | "INFRASTRUCTURE" | "REGULATION" | "ECONOMY"; headline: string; body: string; sev: "info" | "notice" | "warning" }
export interface CustIntel { state: "normal" | "expanding" | "shutdown" | "switching" | "recession"; mult: number; until: number; plan: string; payScore: number; growthPending: number }
export interface Regulator {
  env: number; reporting: number; waste: number; inspections: number; approvals: number; wasteStored: number; wasteCap: number; nextAuditT: number; reportDueT: number; reportFiled: boolean;
  findings: { t: number; text: string; fine: number }[]; lastInspectionT: number;
}
export interface WorldState {
  regions: Region[]; weather: Record<string, WxRegion>; nodes: MapNode[]; lines: Line[]; competitors: Competitor[]; econ: Econ;
  suppliers: Supplier[]; quotes: Quote[]; orders: Order[]; payables: Payable[]; projects: Project[]; batteries: Battery[]; ownGen: OwnGen[];
  intel: Record<string, CustIntel>; news: News[]; newsId: number; timeline: { t: number; cat: string; text: string }[];
  achievements: Record<string, number>; reg: Regulator; compSupplyMW: number; marketShare: number; records: Record<string, number>;
  plots: { id: string; region: RegionId; x: number; y: number; used: boolean }[]; extraCap: Record<string, number>; flags: Record<string, number>;
  buildings: Record<string, number>; expense: { facilityDay: number };
}

export type WorldCmd =
  | { c: "quote"; supplierId: string; item: Item; qty: number } | { c: "order"; quoteId: string } | { c: "cancelOrder"; id: string }
  | { c: "pay"; id: string } | { c: "negotiate"; supplierId: string }
  | { c: "project"; kind: string; region?: RegionId; targetId?: string } | { c: "projectCtl"; id: string; what: "pause" | "resume" | "cancel" }
  | { c: "battery"; id: string; mode: Battery["mode"] } | { c: "gen"; id: string; online: boolean }
  | { c: "repairLine"; id: string } | { c: "maintainLine"; id: string }
  | { c: "budget"; maint: number } | { c: "admin"; level: number } | { c: "contractor"; n: number }
  | { c: "fileReport" } | { c: "shipWaste"; units: number } | { c: "refinance" };
