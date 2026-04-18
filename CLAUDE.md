# Project Orchestrator: HTML/JS Games

## 🛠 Project Standards
Refer to **AGENTS.md** for the "Laws of the Repo" (TDD, File Structure, Discipline).
Refer to **SKILLS.md** for technical "How-To" (Scaling, Sprite Logic, Hitbox Math).

## 🧠 Strategic Intent
- **Asset Continuity**: If an asset is missing, use the `PlaceholderGenerator` pattern from SKILLS.md. Do not halt development for missing art; use CSS/Canvas.
- **Scaling First**: Every new game must implement a `scaleFactor` immediately to ensure it fits the browser window without blurring pixel art.
- **UI & HUD**: Always render UI last, on top of the game world, with a reset coordinate system.

## 🏭 Factory Launcher
- **Shell**: `index.html` (home) + `grid.html` (game grid)
- **Launcher Status**: Visual polish complete
  - [x] Arcade aesthetic — scanlines, CRT overlay, amber/teal neons, monospace
  - [x] CSS Grid responsive layout (`auto-fill, minmax(300px, 1fr)`)
  - [x] Horizontal game cards — 88px tall, canvas thumbnail, hover description overlay
  - [x] Featured card treatment — amber top bar + glow
  - [x] Mode card top bars — teal (Factory Floor), amber (Current Cabinet)
  - [x] Zoom-launch transition (280ms scale) + hover SFX (Web Audio API)
  - [x] `game.json` drives all card data — `accentColor` field powers canvas thumbnail
- **Pending**:
  - [ ] Real preview GIFs — canvas placeholder active until art is ready
  - [ ] Register new cabinets in `arcade-catalog.mjs` as games are added

## 🕹 Current Focus: "Lovers Lost"
- **Active Cabinet**: `games/lovers-lost/`
- **Current Objective**: Polish and feel — reunion animation done, holdable crouch added, two-phase goblin removed.
- **Locked Obstacles** (all validated):
  - [x] Spikes
  - [x] Bird
  - [x] Arrow Wall
  - [x] Goblin (single-phase attack only)

## 🚦 Operational Workflow
1. **Sync**: Read `games/<game-name>/GDD.md` before any feature work.
2. **Test**: Create `game.test.js` cases for logic/collision.
3. **Build**: Implement feature using `SKILLS.md` patterns.
4. **Debug**: Use the in-game debug mode to verify hitboxes against the visible sprite pixels.
