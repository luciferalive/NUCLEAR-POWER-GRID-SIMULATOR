# Nuclear Power Grid Simulator

A free, open-source browser game where you run a **fictional** nuclear power company: keep the plant safe, keep customers supplied, and keep the company profitable.

**Everything is a simplified, made-up model for fun and learning. It is not engineering guidance, and none of the numbers or procedures are real operating data.**

## Play it
Open `docs/index.html` through any web server, or enable GitHub Pages (Settings → Pages → branch `main`, folder `/docs`) and open the page link.

No installation is needed to play. Progress is saved in your browser (IndexedDB); you can also export and import save files.

## What is in the game (Stage 1 = "Version 1")
18 screens, all driven by one shared simulation: Overview, Facility Map, Reactor Room, Control Room, Turbine Hall, Cooling, Electrical Grid, Electricity Market, Industrial Customers (contracts, negotiation, priorities, invoices), Finance, Maintenance, Personnel, Research, Safety & Emergency, Reports (CSV export), Upgrades, Settings & Save Manager, Tutorial & Manual.

Linked on purpose: changing the turbine set point moves reactor power, heat, generation, sales and revenue; a failed pump cuts coolant flow; understaffing raises wear; late deliveries cost penalties and reputation.

Five modes (Career, Sandbox, Challenge, Crisis, Realistic) and five difficulty levels.

## Honest status
Done and tested: simulation engine (15 automated tests), all 18 screens (browser smoke-tested for errors, set points, offers, SCRAM, save and load), procedural sound.

Known gaps:
- The **V2 "Living World" expansion** (world map, regions, transmission, competitors, construction, batteries, news, achievements) is **not built yet**.
- Buying supplies is not used in this version.
- Charts are empty during the first simulated hours of a new game while history builds up.
- Not yet tested on phones or in browsers other than Chromium.

## Develop
```
npm test      # compiles TypeScript (global tsc) and runs the engine tests
```
Source is in `src/`, compiled output in `docs/js/` (committed so GitHub Pages can serve it).
