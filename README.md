# Nuclear Power Grid Simulator

A free, open-source browser game where you run a **fictional** nuclear power company: keep the plant safe, keep customers supplied, and keep the company profitable.

**Everything is a simplified, made-up model for fun and learning. It is not engineering guidance, and none of the numbers or procedures are real operating data.**

## How to play

### Step A: open the game (pick one)
**Online (easiest):** turn on GitHub Pages once: repo → Settings → Pages → Source "Deploy from a branch" → branch `main`, folder `/docs` → Save. After about a minute the game is at:
https://luciferalive.github.io/NUCLEAR-POWER-GRID-SIMULATOR/

**On your laptop:** download the repo (green Code button → Download ZIP), unzip it, open a terminal inside the `docs` folder and run `python -m http.server 8000`, then open http://localhost:8000 in Chrome. (Double-clicking index.html will not work, browsers block it.)

### Step B: your first 10 minutes
1. Click **New game**. Choose Career + Beginner and press Start. The game starts PAUSED.
2. Press **1x** at the top to start the clock. 1x means 2 game minutes per real second; 10x is fastest. Pause any time.
3. Follow the yellow-green **Tutorial** box at the top right. It has 8 steps and checks that you did each one.
4. Open **Industrial Customers** and accept an offer. You can propose a higher price first.
5. Watch **Overview** for cash, output, alarms. Green = fine, red = act now.
6. Every few game days open **Maintenance** and inspect worn equipment, and check **Personnel** has enough staff.
7. Settings → **Save Manager** to save to a slot (autosave runs every minute).

### Rules of thumb
- Turbine Hall set point = how much electricity you want. The reactor follows it automatically.
- Keep temperature, pressure and coolant flow inside limits, or the reactor shuts down itself (SCRAM). After a SCRAM, wait: it takes hours to restart.
- Contracts pay steadily but punish shortages. Spot market pays the current price.
- Skipping maintenance saves money now and costs far more when things break.
- Goal in Career mode: 3 profitable months, supply 7 customers, reputation 85.

## About playing it
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
