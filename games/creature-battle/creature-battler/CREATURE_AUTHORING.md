# Creature Authoring Guide

End-to-end checklist for adding a new creature to Creature Battler.
Follow every step in order. Each step has an exact file path and the minimum code shape required.

---

## Step 0 — Read first

- `creature-battler/CLAUDE.md` — implementation overview, engine contracts, load order
- `docs/combat-system/RENTAL_ROSTER_AND_DRAFT.md` — full 12-creature roster and roles
- `docs/creatures/<existing>/` — Salamander and Flor scope docs are the canonical format reference
- `shared/creature-sheets/original-12.png` — canonical sprite sheet; creatures are in roster order (row-major, 4 columns)

Creature positions in `original-12.png`:

```
Row 0: Flor | Salamander | Aquaphant | Pengun
Row 1: Clod | Galeon     | Voltwing  | Lumora
Row 2: Nocthorn | Emberjaw | Tidecalf | Gravemoss
```

---

## Step 1 — Write the scope document

Create: `docs/creatures/<name>/CREATURE_NAME_SCOPE.md`

Required sections (match the Salamander or Flor scope docs exactly):

```
Creature Identity        — id, name, element, primary/secondary role, roster type
Design Intent            — one paragraph on feel and mechanical niche
Element                  — what this element means for this creature
Natural Stat Growth Bias — qualitative table: HP / MP / STR / DEF / INT / SPI / SPD
Canonical Simulator Stat Package
  Canon Base Stats and Growth   — numeric table
  Canon Elemental Resistance Multipliers — numeric table
Stat Package Summary     — High / Medium / Low-Medium / Weakness stats named
Rental Level-Cap Rule    — boilerplate (copy from any scope doc)
Arts vs Skills and Passives — boilerplate
Natural Art Pool and Learning Schedule — 15 arts minimum; each has full art block
Example Art Access By Level Cap — table
Class-Tree Skill and Passive Access — boilerplate + 3 rental build profiles
Combo Tags               — list
Combo Direction          — element synergy notes
Draft Strength           — when to pick this creature
Draft Weakness           — what counters it
AI Behavior Notes        — priority list
Rental Version           — boilerplate
Raised / RPG Version Direction
Balance Risks            — at least 3 risks with mitigations
Implementation Notes     — config entry snippet (see Step 3)
One-Line Summary
```

### HP convention

The scope doc lists the "Level 1 simulator" HP base and growth.
`config.js` doubles both values: `config.hp = scope.hp × 2`, `config.growth.hp = scope.growth.hp × 2`.
All other stats are identical between scope and config.

### Physical vs Magic damage

All starter creatures (Salamander, Aquaphant, Pengun, Flor) use `damageClass: 'magic'` (INT vs SPI).
Clod is the first `damageClass: 'physical'` creature (STR vs DEF).
Choose explicitly — it is the biggest mechanical differentiator.

---

## Step 2 — Extract the sprite

The slicer script handles all sheets in `shared/creature-sheets/`:

```bash
cd "games/creature-battle/shared/creature-sheets"
python slice_sheets.py
```

Output goes to `shared/creature-sheets/sliced/`.
Files are named `<sheet-name>-<index>.png`, numbered left-to-right, top-to-bottom.

For `original-12.png`, creature positions map to these indices:

| Index | Creature  |
|------:|-----------|
| 1     | Flor      |
| 2     | Salamander|
| 3     | Aquaphant |
| 4     | Pengun    |
| 5     | Clod      |
| 6     | Galeon    |
| 7     | Voltwing  |
| 8     | Lumora    |
| 9     | Nocthorn  |
| 10    | Emberjaw  |
| 11    | Tidecalf  |
| 12    | Gravemoss |

Copy the sliced image to the canonical sprite location:

```
shared/creatures/<name>/<name>.png
```

Example: `shared/creatures/clod/clod.png`

---

## Step 3 — Register in config.js

File: `creature-battler/scripts/config.js`

### 3a — RENTAL_ROSTER entry

Add to the `RENTAL_ROSTER` array after the last existing creature:

```js
{
  id: '<name>',
  name: '<Display Name>',
  element: '<element>',
  role: '<Primary role>',
  baseStats: { hp: <scopeHP*2>, mp: <mp>, strength: <str>, defense: <def>, intelligence: <int>, spirit: <spi>, speed: <spd> },
  growth:    { hp: <scopeGrowthHP*2>, mp: <mp>, strength: <str>, defense: <def>, intelligence: <int>, spirit: <spi>, speed: <spd> },
  resistances: {},
  sprite: 'shared/creatures/<name>/<name>.png',
},
```

`resistances: {}` is always empty — the engine handles element logic centrally via `ELEMENT_OPPOSITES`.

### 3b — MOVES_DATA entries

Add a comment block `// ── <Name> ───` then one entry per art.

Required fields on every move:

```js
{
  id: '<move_id>',
  name: '<Display Name>',
  targeting: 'single' | 'all_enemies' | 'all_allies' | 'single_ally' | 'self',
  desc: '<one sentence>',
  owner: '<creature_id>',
  learnedAt: <number>,
  category: 'art' | 'heal' | 'utility' | 'basic',
  damageClass: 'physical' | 'magic' | 'heal' | 'utility',
  element: '<element>' | 'neutral',
  basePower: <number>,         // 0 for utility moves
  offensiveScaling: <0.0–1.0>, // 0 for utility moves
  mpCost: <number>,
  accuracy: <number>,          // 100 for guaranteed
  canCrit: true | false,
  movePowerModifier: 0,
}
```

Optional fields:

```js
applyStatus: { id: 'poison'|'burn'|'stun'|'blind'|'slow'|'silence', duration: <n>, permanent: true }
hitCount: <n>           // multi-hit moves
lifeSteal: <0.0–1.0>   // lifedrain on damaging arts
healAllAllies: true     // used with allyHealBasePower / allyHealScaling
```

**learnedAt conventions** (match existing creatures):
- Starter arts (2 per creature): `learnedAt: 1`
- Early arts: `8`, `10`, `12`
- Mid arts: `18`, `20`, `22`
- Upper arts: `25`, `27`, `28`, `30`
- Advanced: `32`, `35`, `38`, `42`
- High-tier: `45`, `50`, `55`, `58`
- Ultimate: `65`

**Targeting rules**:
- `all_allies` and `all_enemies` → AoE; `targetSlot` is null in the animation engine
- `single_ally` → single target on own side
- `self` → actor only

---

## Step 4 — Register utility move effects in battle-engine.js

File: `creature-battler/scripts/battle-engine.js`

Only needed for moves with `damageClass: 'utility'` that apply **stat stage changes**.
Moves that use `applyStatus` (poison, burn, stun, blind, slow, silence) are handled automatically from the move data — no engine change needed for those.

Find the `switch (moveId)` block inside `applyUtilityEffect` (search for `case 'boulder_wall'` to find the right location).

```js
case '<move_id>': {
  applyStatModifier(target, '<stat>', 1);   // +1 stage; call twice for +2
  text = applyStatModifier(target, '<stat>', 1);
  break;
}
```

**Important**: `applyStatModifier` normalizes any direction value to `±1` per call.
To apply +2 stages to a single stat, call it **twice**:

```js
case 'boulder_wall': {
  applyStatModifier(target, 'defense', 1);
  text = applyStatModifier(target, 'defense', 1);
  break;
}
```

Stats: `'hp'`, `'mp'`, `'strength'`, `'defense'`, `'intelligence'`, `'spirit'`, `'speed'`, `'evasion'`, `'accuracy'`

---

## Step 5 — Write the animation JS file

File: `creature-battler/scripts/animations/anim-<name>.js`

Shape:

```js
registerMoveAnimations({

  move_id: {
    timeline: [
      { at: <ms>, type: '<event_type>', ...fields },
      ...
    ],
  },

  // next move...
});
```

Every move **must** have exactly one `{ type: 'impact' }` event — this triggers damage resolution and float texts.

### Event types

| type | key fields |
|---|---|
| `sound` | `id: 'fire'|'hit-light'|'hit-heavy'|'charge-light'|'beam-light'` |
| `creature_anim` | `target: 'actor'|'target'`, `class: '<css-class>'`, `lunge: true` (optional) |
| `preset` | `id: '<preset_name>'` + any preset field overrides |
| `projectile` | `from: 'actor'|'target'`, `to: 'actor'|'target'`, `color`, `size`, `shape: 'oval'|'round'`, `arc`, `duration` |
| `particle_burst` | `origin: 'actor'|'target'`, `color`, `count`, `spread`, `direction: 'up'|'all'`, `duration`, `glow` |
| `field_flash` | `color`, `opacity`, `duration` |
| `screen_shake` | `intensity`, `duration`, `style: 'smooth'|'stutter'` |
| `creature_shake` | `target: 'actor'|'target'`, `intensity`, `duration` |
| `impact` | (no extra fields) |

### Available presets (animation-presets.js)

Each element has 9 presets: `<element>_cast_aura`, `<element>_projectile_light`, `<element>_projectile_heavy`, `<element>_particle_light`, `<element>_particle_heavy`, `<element>_beam`, `<element>_hit_flash_light`, `<element>_hit_flash_heavy`, `<element>_field_effect`

Elements: `fire`, `water`, `ice`, `gaia`, `earth`, `wind`, `light`, `dark`

Preset field overrides: pass any field after `id` to override the preset default, e.g.:
```js
{ at: 120, type: 'preset', id: 'fire_projectile_light', size: 18, color: '#ff4400', duration: 350 }
```

### Lunge moves

When `lunge: true` is on a `creature_anim`, the engine injects `--anim-dx` and `--anim-dy` CSS vars computed from actor→target distance. The CSS keyframe must use these vars:

```css
transform: translate(calc(-50% + var(--anim-dx, 0px)), calc(-50% + var(--anim-dy, 0px)));
```

### Multi-hit moves (hitCount > 1)

Fire one `impact` for the first hit. Subsequent hits use `creature_shake` (not `creature_anim`) to avoid class conflicts:

```js
// Hit 1
{ at: 280, type: 'impact' },
{ at: 280, type: 'creature_anim', target: 'target', class: 'anim-hit-earth-light' },
// Hit 2 — visual only
{ at: 500, type: 'creature_shake', target: 'target', intensity: 4, duration: 180 },
```

### AoE moves (all_enemies / all_allies)

`targetSlot` is null for AoE. Particle presets must use `origin: 'actor'` override:

```js
{ at: 400, type: 'preset', id: 'earth_particle_heavy', origin: 'actor' }
```

All-ally heals have no `creature_anim target: 'target'`.

---

## Step 6 — Write the animation CSS file

File: `creature-battler/styles/animations/anim-<name>.css`

### Required rules

For each `class` name referenced in the JS animation file, write a corresponding CSS rule.

**Cast animation pattern:**

```css
@keyframes cast-<move> {
  0%   { transform: translate(-50%, -50%) scale(1);    filter: none; }
  40%  { transform: translate(-50%, calc(-50% - 5px)) scale(1.07); filter: drop-shadow(0 0 18px <color>); }
  100% { transform: translate(-50%, -50%) scale(1);    filter: none; }
}
.anim-cast-<move> { animation: cast-<move> 450ms ease-in-out; }
```

**Lunge animation pattern** (must use `--anim-dx` / `--anim-dy`):

```css
@keyframes cast-<move>-lunge {
  0%   { transform: translate(-50%, -50%); filter: none; }
  40%  { transform: translate(calc(-50% + var(--anim-dx, 0px)), calc(-50% + var(--anim-dy, 0px))); filter: drop-shadow(0 0 24px <color>); }
  60%  { transform: translate(calc(-50% + var(--anim-dx, 0px)), calc(-50% + var(--anim-dy, 0px))); }
  100% { transform: translate(-50%, -50%); filter: none; }
}
.anim-cast-<move>-lunge { animation: cast-<move>-lunge 480ms cubic-bezier(0.2, 0, 0.4, 1); }
```

**Hit animation pattern** (player-side and opponent-side variants):

```css
@keyframes hit-<element>-light-right {
  0%   { transform: translate(-50%, -50%);                          filter: brightness(1); }
  18%  { transform: translate(calc(-50% + 9px), calc(-50% - 3px)); filter: brightness(2.6) sepia(1) saturate(4); }
  50%  { transform: translate(calc(-50% - 3px), -50%);             filter: brightness(1.4) sepia(0.5); }
  100% { transform: translate(-50%, -50%);                         filter: brightness(1); }
}
@keyframes hit-<element>-light-left {
  /* mirror of above — flip the x offsets */
}
[data-creature^="player"].anim-hit-<element>-light   { animation: hit-<element>-light-left  340ms ease-out; }
[data-creature^="opponent"].anim-hit-<element>-light { animation: hit-<element>-light-right 340ms ease-out; }
```

**Preserve the base translate**: every keyframe must keep `translate(-50%, -50%)` as the baseline. Omitting it breaks field creature positioning.

Multiple CSS classes can share one keyframe:
```css
.anim-cast-stone-strike-lunge,
.anim-cast-stone-strike-2-lunge { animation: cast-earth-lunge-light 400ms cubic-bezier(0.2, 0, 0.4, 1); }
```

---

## Step 7 — Wire both index.html files

There are **two** HTML files that must both be updated. Omitting either breaks one entry point.

**`creature-battler/index.html`** (standalone dev entry):

```html
<!-- After the last anim-*.css link -->
<link rel="stylesheet" href="styles/animations/anim-<name>.css">

<!-- After the last anim-*.js script -->
<script src="scripts/animations/anim-<name>.js"></script>
```

**`index.html`** (platform cabinet entry, at `games/creature-battle/index.html`):

```html
<!-- After the last anim-*.css link -->
<link rel="stylesheet" href="creature-battler/styles/animations/anim-<name>.css">

<!-- After the last anim-*.js script -->
<script src="creature-battler/scripts/animations/anim-<name>.js"></script>
```

**Load order contract** (both files must maintain this order):

```
animation-components.js
animation-presets.js
animation-engine.js
animation-state.js
battle-animations.js
anim-universal.js
anim-<creature-1>.js
anim-<creature-2>.js
...
anim-<new-creature>.js   ← append here
battle-input.js
battle-round.js
```

---

## Step 8 — Verify ROSTER_COLS

File: `creature-battler/scripts/config.js` (top, line 3)

```js
const ROSTER_COLS = 3;
```

This constant drives the team-select and blind-pick keyboard navigation (`moveGridCursor` in `screen-team-select.js`). No change needed when adding creatures — the grid automatically adapts. Only change `ROSTER_COLS` if the CSS `grid-template-columns` in `team-select.css` changes.

---

## Step 9 — Smoke test

1. Open `games/creature-battle/index.html` in a browser (serve via `python -m http.server` from the `creature-battle/` folder, **not** from `creature-battler/`).
2. Training Battle → any level → team select: new creature appears in the grid, all 5 current creatures visible, keyboard navigation reaches it.
3. Select the new creature in your team.
4. Start battle. In the battle:
   - New creature's sprite renders correctly at its field position.
   - Press the Arts command and confirm the correct move list appears.
   - Use each art tier: basic, a mid art, and the ultimate (at Lv.30 standard cap).
   - Confirm animations play (cast → impact → hit reaction).
   - Confirm no JS console errors.
5. Let the AI control the new creature as opponent: confirm AI uses moves without errors.

---

## Pitfalls to avoid

**Sprite path**: config `sprite` field is relative to `games/creature-battle/` (the outer folder). Always `shared/creatures/<name>/<name>.png` — never prefix with `creature-battler/`.

**HP doubling**: config `baseStats.hp` = scope HP × 2, config `growth.hp` = scope growth HP × 2. All other stats are 1:1.

**`resistances: {}`**: always empty. Do not populate per-creature resistances — the engine handles element logic centrally.

**`applyStatModifier` takes ±1 only**: passing `2` normalizes to `1`. Call twice for +2 stages.

**`impact` must appear exactly once per move**: it triggers damage, float texts, and sound. Missing it silences the hit. Duplicate it breaks multi-hit sync.

**AoE origin**: for `all_enemies`/`all_allies` moves, particle presets must use `origin: 'actor'` override — the engine sets `targetSlot: null` for AoE and `origin: 'target'` would resolve to nothing.

**Lunge CSS vars**: the keyframe must spell `var(--anim-dx, 0px)` exactly. The engine sets these vars on the element before adding the animation class. Missing them causes the creature to stay in place.

**Both HTML files**: forgetting to update `index.html` (outer) means the game works in standalone dev mode but breaks when launched from the platform arcade.
