<div align="center">

# ☢️ NUCLEAR POWER GRID SIMULATOR.

### Run a power company. Keep the lights on. Don't melt down the profits.

*A free, no-install, browser-based management game about running a (fictional) nuclear plant, selling electricity, and surviving the grid.*

![status](https://img.shields.io/badge/status-V1%20%2B%20V2%20playable-f0b43c?style=for-the-badge)
![stack](https://img.shields.io/badge/TypeScript-no%20install-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![tests](https://img.shields.io/badge/engine%20tests-31%20passing-2fe0c4?style=for-the-badge)
![cost](https://img.shields.io/badge/price-free%20%26%20open%20source-3fd0a0?style=for-the-badge)

**[▶ PLAY IN YOUR BROWSER](https://luciferalive.github.io/NUCLEAR-POWER-GRID-SIMULATOR/)** &nbsp;·&nbsp; [How to play](#-how-to-play) &nbsp;·&nbsp; [Features](#-features) &nbsp;·&nbsp; [Roadmap](#-roadmap-and-honest-status)

</div>

---

> ⚠️ **Everything here is fictional and simplified.** The physics, numbers and "procedures" are game abstractions for fun and learning. They are **not** real engineering data or operating guidance.

## 🎮 What is this?

You are the director of a nuclear power company. Your reactor makes heat, the turbine turns heat into electricity, and you sell that electricity to steel mills, data centers, cities and the spot market. Every system is connected: change one slider and reactor power, heat, generation, sales, revenue and wear all move together. **No fake numbers, no decorative buttons.**

## ✨ Features

| 🏭 Plant | 💰 Business | 🛠️ Management |
|---|---|---|
| Reactor with rods, xenon, feedback and decay heat | 10 industrial customers with daily load shapes | 14 equipment items that wear and fail |
| Turbine, generator and cooling tower | Contract offers and price negotiation (3 rounds) | Inspections, repairs, overhauls, replacements |
| Auto SCRAM protection + manual SCRAM | Priority supply and shortfall penalties | Staff with roles, fatigue, training, shifts |
| Electrical grid, losses, frequency | Spot market driven by supply and demand | 10 research projects and 4 hardware upgrades |
| Live 15-building facility map | Invoices, receivables, loans, monthly accounts | Random events with real decisions to make |

**Also included:** 28 screens · procedural industrial soundscape · guided tutorial · 5 game modes (Career, Sandbox, Challenge, Crisis, Realistic) · 5 difficulties · save slots, autosave, export/import · CSV reports.

## 🌍 V2 "Living World" (new)

| 🗺️ World | 📈 Economy | 🏗️ Build & buy |
|---|---|---|
| Zoomable map of 5 regions, 6 competitors, cities, ports, airports and your customers | Boom, slowdown, recession and recovery phases change demand, inflation, interest and fuel prices | Procurement with quotes, lead times, delays and payment terms |
| **Animated transmission lines**: arrows move only when power really flows | Competitors bid, break down and build new plants | Construction: permits, land, materials, staged payments |
| Lines and substations **limit deliveries**; storms cause faults | Regional weather, forecasts, floods, droughts, heatwaves | Batteries, gas peakers, solar and wind |
| Command Center that lists what needs you now | News and timeline generated from real events | Expenses department, regulator audits, 16 achievements |

Old V1 saves load automatically and are upgraded to V2.

## 🕹️ How to play

### 1️⃣ Open the game (pick one)
**🌐 Online (easiest)** — turn on GitHub Pages once: repo → **Settings → Pages → Deploy from a branch → `main` / `/docs` → Save**. After about a minute play at  
👉 https://luciferalive.github.io/NUCLEAR-POWER-GRID-SIMULATOR/

**💻 On your laptop** — download the repo (Code → Download ZIP), unzip, open a terminal inside the `docs` folder, run `python -m http.server 8000`, then open <http://localhost:8000> in Chrome. *(Double-clicking `index.html` will not work: browsers block it.)*

### 2️⃣ Your first 10 minutes
1. Click **New game** → Career + Beginner → **Start**. The game starts **paused**.
2. Press **1x** at the top to start the clock (10x is fastest). Pause any time.
3. Follow the **Tutorial box** (bottom left). It has 10 steps and checks that you did each one. *Hide tutorial* closes it, and the Tutorial & Manual page has the full guide.
4. Open **Industrial Customers** and accept an offer. Try proposing a higher price first!
5. Watch the **Overview**: 🟢 fine, 🔴 act now.
6. Every few game days, inspect worn equipment in **Maintenance** and check **Personnel** has enough crew.
7. **Settings → Save Manager** to save (it also autosaves every minute while the game is running).
8. Open **World Map** and **Command Center** (Living World section in the menu) to see the whole network and what needs attention. If a customer is short of power, check its line on the map: a faulty or full line blocks supply even when the plant has spare power.

### 3️⃣ Rules of thumb
- 🎚️ The **set point** (Turbine Hall) is how much electricity you want. The reactor follows automatically.
- 🚨 If temperature, pressure or coolant flow leave their limits, the reactor **SCRAMs** itself. Restart takes hours. The manual SCRAM button is on the **Reactor Room** page.
- 🧾 Parts and materials must be ordered in **Procurement**; construction stalls without materials.
- 📜 Contracts pay steadily but punish shortages. The spot market pays today's price.
- 🔧 Skipping maintenance saves money now and costs far more when things break.
- 🏆 **Career goals:** 3 profitable months, supply 7 customers, reputation 85.

## 🗺️ Roadmap and honest status

| Stage | What | Status |
|---|---|---|
| **V1** | Full base game, 18 screens, tutorial, saves | ✅ Playable, tested |
| **V2 "Living World"** | World map, transmission network, regions, competitors, economy, weather, procurement, construction, batteries, news, achievements, expenses, regulator, command center | ✅ Playable. Engine covered by 16 automated tests; every screen smoke-tested in a browser |

Known gaps: the map shows a stylised fictional country, not real geography. Competitors and the wider economy are simplified models. Maps and screens have been tested only in Chromium at desktop size, not on phones. Sound has not been listened to by me. Charts are empty for the first simulated hour of a new game. News is generated from real simulation events but the wording is templated.

## 🧰 For developers
```bash
npm test      # compiles TypeScript (tsc) and runs the engine tests (node:test)
```
`src/simulation/` – the engine (pure TypeScript, deterministic seeded RNG) · `src/ui/` – pages and charts · `src/store/` – state and saves · `docs/` – built site served by GitHub Pages.

<div align="center">

**Made for fun and learning. Build it, break it, fork it.** ⚡

</div>
