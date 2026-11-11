import type { Competitor, MapNode, RegionId, Supplier } from "./types.js";

export const REGIONS: { id: RegionId; cx: number; cy: number; weight: number; industrialShare: number; tieCapMW: number; pop: number }[] = [
  { id: "North", cx: 550, cy: 130, weight: 0.2, industrialShare: 0.55, tieCapMW: 190, pop: 1.0 },
  { id: "West", cx: 180, cy: 450, weight: 0.19, industrialShare: 0.45, tieCapMW: 150, pop: 1.0 },
  { id: "East", cx: 800, cy: 450, weight: 0.18, industrialShare: 0.5, tieCapMW: 150, pop: 1.0 },
  { id: "South", cx: 500, cy: 850, weight: 0.15, industrialShare: 0.5, tieCapMW: 130, pop: 1.0 },
  { id: "Central", cx: 500, cy: 470, weight: 0.28, industrialShare: 0.3, tieCapMW: 330, pop: 1.0 },
];
export const OUR_PLANT = { id: "our-plant", x: 480, y: 560 };
export const regionOf = (x: number, y: number): RegionId => {
  let best: RegionId = "Central", d = 1e12;
  for (const r of REGIONS) { const k = (r.cx - x) ** 2 + (r.cy - y) ** 2; if (k < d) { d = k; best = r.id; } }
  return best;
};
/** Voronoi cell of each region, clipped to the 1000x1000 map. Used for drawing borders and terrain. */
export function regionPolygons(): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {};
  for (const r of REGIONS) {
    let poly: [number, number][] = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
    for (const o of REGIONS) {
      if (o === r) continue;
      const mx = (r.cx + o.cx) / 2, my = (r.cy + o.cy) / 2, nx = o.cx - r.cx, ny = o.cy - r.cy;
      const inside = (p: [number, number]) => (p[0] - mx) * nx + (p[1] - my) * ny <= 0;
      const next: [number, number][] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
        if (ia) next.push(a);
        if (ia !== ib) { const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny, k = da / (da - db); next.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
      }
      poly = next;
    }
    out[r.id] = poly;
  }
  return out;
}
export const RIVERS: [number, number][][] = [
  [[300, 0], [330, 140], [400, 250], [440, 380], [470, 480], [520, 600], [600, 700], [640, 820], [700, 1000]],
  [[0, 640], [150, 600], [260, 640], [380, 620], [470, 600]],
];
export const ROADS: [number, number][][] = [
  [[180, 330], [350, 400], [430, 430], [560, 330], [640, 230], [760, 140]],
  [[430, 430], [480, 560], [520, 760]], [[480, 560], [700, 540], [820, 420]], [[480, 560], [230, 560]], [[350, 120], [430, 430]],
];
export const RAILWAYS: [number, number][][] = [[[100, 780], [300, 700], [480, 570], [700, 480], [900, 420]], [[550, 80], [560, 330], [480, 560]]];

export const SUBSTATIONS: MapNode[] = [
  { id: "sub-c", kind: "substation", name: "Central Hub Substation", region: "Central", x: 500, y: 500, owner: "public" },
  { id: "sub-n", kind: "substation", name: "North Substation", region: "North", x: 560, y: 220, owner: "public" },
  { id: "sub-e", kind: "substation", name: "East Substation", region: "East", x: 740, y: 470, owner: "public" },
  { id: "sub-s", kind: "substation", name: "South Substation", region: "South", x: 500, y: 700, owner: "public" },
  { id: "sub-w", kind: "substation", name: "West Substation", region: "West", x: 280, y: 450, owner: "public" },
];
export const REGION_SUB: Record<RegionId, string> = { North: "sub-n", East: "sub-e", South: "sub-s", West: "sub-w", Central: "sub-c" };

export const STATIC_NODES: MapNode[] = [
  { id: "city-capital", kind: "city", name: "Meridian City", region: "Central", x: 440, y: 400, owner: "public", pop: 2400000 },
  { id: "city-n", kind: "city", name: "Northport", region: "North", x: 600, y: 110, owner: "public", pop: 900000 },
  { id: "city-w", kind: "city", name: "Westfield", region: "West", x: 130, y: 470, owner: "public", pop: 700000 },
  { id: "city-e", kind: "city", name: "Eastgate", region: "East", x: 860, y: 480, owner: "public", pop: 650000 },
  { id: "city-s", kind: "city", name: "Southmere", region: "South", x: 430, y: 880, owner: "public", pop: 800000 },
  { id: "res-1", kind: "residential", name: "Oakline Residential District", region: "Central", x: 380, y: 450, owner: "public", pop: 210000 },
  { id: "res-2", kind: "residential", name: "Highfield Residential District", region: "East", x: 780, y: 390, owner: "public", pop: 150000 },
  { id: "com-1", kind: "commercial", name: "Harbour Commercial District", region: "Central", x: 470, y: 360, owner: "public" },
  { id: "com-2", kind: "commercial", name: "Westfield Business Park", region: "West", x: 170, y: 410, owner: "public" },
  { id: "hosp-1", kind: "hospital", name: "Meridian General Hospital", region: "Central", x: 455, y: 435, owner: "public" },
  { id: "hosp-2", kind: "hospital", name: "Northport Medical Centre", region: "North", x: 640, y: 150, owner: "public" },
  { id: "air-1", kind: "airport", name: "Meridian International Airport", region: "Central", x: 580, y: 420, owner: "public" },
  { id: "port-1", kind: "port", name: "Southmere Port", region: "South", x: 380, y: 930, owner: "public" },
  { id: "port-2", kind: "port", name: "Eastgate Harbour", region: "East", x: 940, y: 540, owner: "public" },
  { id: "rail-1", kind: "railstation", name: "Central Railway Terminal", region: "Central", x: 455, y: 380, owner: "public" },
  { id: "gov-1", kind: "government", name: "Ministry of Energy", region: "Central", x: 400, y: 380, owner: "public" },
  { id: "wat-1", kind: "water", name: "Riverside Water Treatment", region: "Central", x: 460, y: 620, owner: "public" },
  { id: "wat-2", kind: "water", name: "Southmere Water Works", region: "South", x: 560, y: 790, owner: "public" },
  { id: "ref-1", kind: "refinery", name: "Tidewater Oil Refinery", region: "South", x: 590, y: 880, owner: "public" },
  { id: "fac-1", kind: "factory", name: "Lakeside Assembly Works", region: "West", x: 100, y: 610, owner: "public" },
  { id: "fac-2", kind: "factory", name: "Eastgate Textile Mills", region: "East", x: 900, y: 360, owner: "public" },
];

export const COMPETITORS: (Omit<Competitor, "outMW" | "share" | "status" | "statusUntil" | "profitDay" | "bidPrice"> & { x: number; y: number })[] = [
  { id: "coal", name: "Ashfield Coal Power", tech: "coal", region: "North", capMW: 520, cash: 90e6, marginalCost: 34, node: "comp-coal", x: 700, y: 100 },
  { id: "gas", name: "BlueFlame Gas Energy", tech: "gas", region: "East", capMW: 430, cash: 70e6, marginalCost: 46, node: "comp-gas", x: 760, y: 560 },
  { id: "hydro", name: "RiverCrest Hydro", tech: "hydro", region: "West", capMW: 210, cash: 40e6, marginalCost: 8, node: "comp-hydro", x: 300, y: 250 },
  { id: "wind", name: "Skyline Wind Co.", tech: "wind", region: "South", capMW: 280, cash: 45e6, marginalCost: 4, node: "comp-wind", x: 330, y: 760 },
  { id: "solar", name: "Sunplain Solar Ltd.", tech: "solar", region: "West", capMW: 200, cash: 30e6, marginalCost: 3, node: "comp-solar", x: 90, y: 350 },
  { id: "nuclear-b", name: "Northgate Nuclear B", tech: "nuclear", region: "North", capMW: 380, cash: 120e6, marginalCost: 18, node: "comp-nuc", x: 450, y: 60 },
];

export const SUPPLIERS: Supplier[] = [
  { id: "sup-1", name: "Kestrel Industrial Parts", country: "Norvania", categories: ["spares", "components"], priceMul: 1.0, leadDays: 6, reliability: 0.9, terms: 30, stock: { spares: 400, components: 30 }, relation: 70, ordersTotal: 0, lateCount: 0 },
  { id: "sup-2", name: "Baltic Heavy Machinery", country: "Estavia", categories: ["components", "materials"], priceMul: 0.9, leadDays: 14, reliability: 0.72, terms: 45, stock: { components: 20, materials: 4000 }, relation: 60, ordersTotal: 0, lateCount: 0 },
  { id: "sup-3", name: "QuickShip Maintenance Supply", country: "Meridia", categories: ["spares", "supplies"], priceMul: 1.25, leadDays: 2, reliability: 0.97, terms: 7, stock: { spares: 120, supplies: 800 }, relation: 70, ordersTotal: 0, lateCount: 0 },
  { id: "sup-4", name: "Tessaly Chemicals & Consumables", country: "Valdora", categories: ["supplies"], priceMul: 0.85, leadDays: 9, reliability: 0.8, terms: 30, stock: { supplies: 2500 }, relation: 60, ordersTotal: 0, lateCount: 0 },
  { id: "sup-5", name: "Granite & Steel Construction Supply", country: "Meridia", categories: ["materials"], priceMul: 1.0, leadDays: 7, reliability: 0.88, terms: 30, stock: { materials: 9000 }, relation: 65, ordersTotal: 0, lateCount: 0 },
  { id: "sup-6", name: "Orion Precision Systems", country: "Helvara", categories: ["spares", "components", "materials"], priceMul: 1.35, leadDays: 10, reliability: 0.95, terms: 60, stock: { spares: 90, components: 25, materials: 2500 }, relation: 75, ordersTotal: 0, lateCount: 0 },
];
/** Base unit prices (fictional $). */
export const ITEM_PRICE: Record<string, number> = { spares: 14_000, supplies: 900, components: 420_000, materials: 2_200 };
export const ITEM_LABEL: Record<string, string> = { spares: "Spare-part kit", supplies: "Maintenance supplies (batch)", components: "Replacement component", materials: "Construction materials (tonne)" };

export interface BuildSpec { id: string; name: string; cost: number; days: number; materials: number; permitDays: number; minCompliance: number; upkeep: number; text: string; needsTech?: string; needsLine?: boolean }
export const BUILD_CATALOG: BuildSpec[] = [
  { id: "substation", name: "New regional substation", cost: 14e6, days: 90, materials: 900, permitDays: 20, minCompliance: 55, upkeep: 4200, text: "+120 MW delivery capacity into the chosen region." },
  { id: "transformer", name: "Transformer station", cost: 7e6, days: 55, materials: 450, permitDays: 12, minCompliance: 50, upkeep: 2200, text: "+60 MW delivery capacity into the chosen region and lower losses." },
  { id: "line-upgrade", name: "Transmission line upgrade", cost: 4.5e6, days: 45, materials: 350, permitDays: 10, minCompliance: 45, upkeep: 1100, text: "+40 MW capacity on one customer line.", needsLine: true },
  { id: "connection", name: "Industrial connection", cost: 6e6, days: 50, materials: 400, permitDays: 14, minCompliance: 50, upkeep: 1500, text: "Builds the grid connection for a new, not yet connected customer.", needsLine: true },
  { id: "gas-peaker", name: "Gas peaking plant (60 MW)", cost: 38e6, days: 150, materials: 2400, permitDays: 40, minCompliance: 65, upkeep: 9000, text: "Adds 60 MW of dispatchable generation, burns fuel when running." },
  { id: "solar", name: "Solar installation (40 MW)", cost: 32e6, days: 110, materials: 1500, permitDays: 25, minCompliance: 55, upkeep: 4500, text: "Adds up to 40 MW in daylight, no fuel.", needsTech: "renewable" },
  { id: "wind", name: "Wind installation (50 MW)", cost: 44e6, days: 130, materials: 2000, permitDays: 30, minCompliance: 55, upkeep: 6000, text: "Adds up to 50 MW depending on wind, no fuel.", needsTech: "renewable" },
  { id: "battery", name: "Battery energy storage (40 MW / 160 MWh)", cost: 28e6, days: 100, materials: 1100, permitDays: 20, minCompliance: 55, upkeep: 3800, text: "Stores surplus energy, supplies it at peak.", needsTech: "storage" },
  { id: "warehouse", name: "Warehouse extension", cost: 3.2e6, days: 40, materials: 300, permitDays: 8, minCompliance: 40, upkeep: 900, text: "Doubles stock room: spares and components stored." },
  { id: "workshop", name: "Maintenance workshop", cost: 5e6, days: 60, materials: 380, permitDays: 10, minCompliance: 45, upkeep: 1800, text: "One more maintenance job at a time and 10 % faster repairs." },
  { id: "admin", name: "Administrative building", cost: 4e6, days: 60, materials: 320, permitDays: 10, minCompliance: 45, upkeep: 1300, text: "-6 % administrative cost and better reporting." },
];
export const NEW_CUSTOMER_NAMES: { name: string; industry: string; shape: string; peak: number; res: number }[] = [
  { name: "Ferrovia Rail Steel", industry: "steel", shape: "steel", peak: 90, res: 55 }, { name: "Quantum Cloud Campus", industry: "data center", shape: "datacenter", peak: 110, res: 68 },
  { name: "Lumina Glass Works", industry: "manufacturing", shape: "shift", peak: 40, res: 61 }, { name: "Terracotta Brick & Cement", industry: "cement", shape: "shift", peak: 35, res: 57 },
  { name: "Aurelian Fertiliser", industry: "chemical", shape: "flat", peak: 60, res: 59 }, { name: "Silverlode Copper Mine", industry: "mining", shape: "shift", peak: 70, res: 55 },
];
