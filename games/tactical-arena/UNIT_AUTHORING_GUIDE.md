# Tactical Arena Unit Authoring Guide

This guide is for agents adding new units to the modular Tactical Arena
codebase. Keep it current as new engine seams land. The goal is not just "make
a unit appear"; the goal is a unit that is rules-correct, preview-correct,
animation-backed, documented, and tested.

## Read first

- `CLAUDE.md` - as-built architecture and current implementation status.
- `GDD.md` - rebuild design canon for implemented rules.
- `LEGACY_TURBOWARP_REFERENCE.md` - recovered legacy stats and ability notes.
- `src/core/units/*.js` - one immutable definition file per implemented unit.
- `src/core/reducer.js` - the only authoritative state mutator.
- `src/ui/effects.js` and `src/ui/vfxCatalog.js` - animation/VFX presentation.

When legacy reference and implemented rebuild behavior disagree, prefer `GDD.md`
and current code unless the user explicitly asks for a new balance decision.

## Current unit definition shape

Create `src/core/units/<unit-name>.js` and export one frozen object:

```js
export const MYSTIC = Object.freeze({
  id: "mystic",
  name: "Mystic",
  glyph: "?",
  stats: Object.freeze({
    moveRange: 2,
    attackRange: 5,
    strength: 5,
    defense: 3,
    maxHp: 23,
    maxMp: 38
  }),
  passive: Object.freeze({
    id: "anointed",
    name: "Anointed",
    description: "...",
    implemented: false
  }),
  arts: Object.freeze([
    Object.freeze({
      id: "pray",
      name: "Pray",
      kind: "active",
      mpCost: 0,
      description: "...",
      implemented: false
    })
  ]),
  rageArt: Object.freeze({
    id: "mystic-rage",
    name: "RAGE Passive",
    kind: "passive",
    mpCost: 0,
    effect: Object.freeze({ type: "statModifiers", stats: Object.freeze({ moveRange: 6 }) }),
    description: "At 5 HP or lower, gain +6 MOVE and always defend.",
    implemented: false
  })
});
```

Then import and register it in `src/core/unitCatalog.js`:

```js
import { MYSTIC } from "./units/mystic.js";

export const UNIT_TYPES = Object.freeze({
  swordsman: SWORDSMAN,
  archer: ARCHER,
  mystic: MYSTIC
});
```

Use lowercase kebab-case ids for ARTS and passives. Runtime unit instances store
`type`, `hp`, `mp`, `statuses`, `statModifiers`, `defending`, and `spent`; do
not put per-match mutable state on the catalog object.

## Stats and effective stats

Base stats live in the unit file:

- `moveRange`
- `attackRange`
- `strength`
- `defense`
- `maxHp`
- `maxMp`

Live stats are resolved only through `getEffectiveStats(unit)` in
`src/core/unitCatalog.js`. That function folds together:

- catalog base stats
- `unit.statModifiers`
- implemented passive stat changes
- RAGE stat changes
- status stat changes

If a new passive modifies stats, prefer expressing it as data and adding one
general resolver path in `getEffectiveStats`. Avoid hard-coding new unit names.
There is currently one legacy wart: Swordsman's Last Stand is hard-coded as
`hp < 3 => +3 strength`. A future cleanup should convert it to data before more
threshold passives are added.

## Passives

Passives should be data-first. Existing effect types:

- `statModifiers` - additive stat changes, currently used by RAGE passives. May
  carry a nested `enemyAura` block for a RAGE-only aura amplification (Necromancer).
- `immunity` - status immunity, centrally read by `rules/statuses.js`.
- `proximityDamage` - Archer Close Shot, read by `rules/combat.js`.
- `teamAura` - additive stat buff to the host's living team (Mystic Guardian),
  folded by `getEffectiveStats`.
- `enemyAura` - additive stat DEBUFF to enemies within a Chebyshev `radius`
  (Necromancer Deathly Aura, carried by the Ghoul), folded by `getEffectiveStats`.
- `teamDamageReduction` - flat reduction (`amount`) to a `damageType` the host's
  living team takes (Necromancer Dead Zone: -1 magic), applied wherever magic damage
  is finalized via `getTeamDamageReduction` in `rules/combat.js`.
- `physicalDamageHealAura` - Paladin Hand of Life, resolved in the reducer.

Add a new passive effect type only when the behavior is reusable or cannot be
described by existing data. When adding one, wire it into the shared rule layer
that owns the behavior:

- stat changes: `core/unitCatalog.js`
- status immunity or cleanse: `rules/statuses.js`
- strike damage: `rules/combat.js` or `rules/damage.js`
- team/global auras: likely a new helper used by `getEffectiveStats`,
  `resolveDamage`, or both

Do not hide passive behavior in UI code. The UI should read the result of rules,
not create rules.

## RAGE

RAGE is automatic at `hp <= 5` via `isRaging(unit)`. A unit's `rageArt` is shown
as an available passive while raging and may include:

- `effect: { type: "statModifiers", stats: { ... } }`
- `combat: { neverMiss: true, criticalChance: 0.5 }`
- future passive fields if the engine supports them

RAGE should not be implemented as an active button. If a legacy RAGE says
"always defending" or "aura gets stronger," add a passive engine seam and test
that seam. Do not fake it by setting `unit.defending = true` in the UI.

## Active ARTS

The reducer is authoritative. `src/core/reducer.js` routes `USE_ART` like this:

- `ART_RESOLVERS` handles special mechanics by art id.
- Everything else falls back to `resolveTargetedArt`, which is a normal attack
  plus optional status/heal effect.

The default targeted ART supports:

- enemy target in current `attackRange`
- normal attack roll and crit roll
- physical strike through `resolvePhysicalStrike`
- optional `effect.type === "status"`
- optional `effect.type === "heal"` with `halfDamageDealtRounded`

If an ART is just "attack and maybe apply status," data is enough. If it targets
allies, affects an area, summons a unit, creates terrain, cleanses, shields,
heals without attacking, or changes team stats, add a resolver and tests.

Current special resolvers:

- `footwork` - path validation, pass-through true damage, movement.
- `volley-shot` - cone targeting, true damage to every enemy in cone.

## Targeting and board modes

The browser controller in `src/main.js` owns transient UI modes:

- `move`
- `attack`
- `footwork`
- `art:<id>`

`src/ui/boardRenderer.js` highlights legal tiles and range wash. The current
generic `art:<id>` mode assumes a targeted enemy attack, except `volley-shot`
and `footwork`, which have custom paths. New targeting shapes need both rules
helpers and UI handling.

Potential reusable targeting helpers to add as needed:

- ally target within range
- self target
- empty tile target
- orthogonal line
- radius/area target
- cone with variable range
- board placement for terrain/summons

Keep targeting validation in `rules/` or `core/reducer.js`; UI highlights are
only affordances.

## Statuses

Statuses are plain objects in `unit.statuses`. Existing statuses:

- `poison` - permanent by default, deals turn-start damage.
- `slow` - timed, carries `statModifiers: { moveRange: -1 }`.
- `blind` - timed, makes attacks miss unless a combat override says otherwise.
- `silence` - timed, blocks active ART usage.

Use `resolveStatusEffect`, `applyStatus`, `tickStatuses`, and
`resolveTurnStartStatuses` in `src/rules/statuses.js`. Status immunities are
centralized through passives/arts/rageArt with `effect.type === "immunity"`.

If adding stun, cleanse, regeneration, shields, or mark-style debuffs, implement
the lifecycle centrally and add tests around start-of-activation, end-of-
activation, immunity, refresh/replace behavior, and death/victory interactions.

## Damage types

`src/rules/damage.js` supports:

- `physical` - `max(1, strength - defense)`, can crit, can be defended.
- `magic` - ignores defense, can be defended.
- `true` - ignores defense and defend.

Basic attacks and targeted attack ARTS use `resolvePhysicalStrike` in
`src/rules/combat.js`, which is also used by the forecast renderer. If a new
ability previews damage, reuse the same resolver path the reducer uses.

## Animations and VFX

Gameplay produces reducer events. Presentation listens to those events and plays
animations; animations must never mutate authoritative state.

For each implemented active ART:

1. Add or reuse a template in `src/ui/vfxCatalog.js`.
2. Make sure `getAbilityVfx(artId)` returns a recipe for that ART.
3. Route the effect in `src/ui/effects.js` if it needs a new VFX type.
4. Route resolved events in `src/main.js` if the ART is not covered by
   `resolveCombat` or the current instant-art paths.
5. Add or update `tests/vfx.test.js`.

Current VFX recipe types:

- `dashTrail`
- `projectileFan`
- `drain`
- `statusStrike`

Persistent status badges are two layers: the **color/glow** comes from
`STATUS_VFX` in `vfxCatalog.js` (keyed by status type), and the **icon shape** is
drawn by a matching entry in `STATUS_ICON_BUILDERS` in `unitRenderer.js`
(`createStatusBadges`). Current icons: poison = bubble cluster, silence = "..."
chat box, stun = lightning bolt, blind = sunglasses, slow = boot + down arrow.
Adding a new status means a `STATUS_VFX` entry (for the disc color/glow) **and** a
`STATUS_ICON_BUILDERS` entry (the ±8 box icon), plus per-icon CSS in `style.css`
under the `.status-icon` block. `stun` is already wired in both even though no
ability applies it yet.

## Board figurine (the carved-miniature model)

Every unit on the board is a small standing **carved figurine**, not a flat coin
emblem. Builders live in `src/ui/unitRenderer.js` — register one per unit type in
`FIGURE_BUILDERS`. The builder receives an empty `<g class="figure">` and appends
layered SVG paths in back-to-front order.

**Figure space.** Draw in the figure's local coordinates: `(0,0)` is the standing
spot on the plinth, the piece rises into **negative y** (head around `y = -45`,
tall headgear to about `-60`), and everything stays within `x = ±22`. No transform
is needed — `createUnitFigure` places the figure on the plinth for you.

**Light is from the upper-left.** So highlights (`.fig-light`) go on the upper-left
of each form and shadows (`.fig-shade`) go on the lower-right. Keeping this
consistent is what makes the pieces read as sculpted instead of flat.

**Use the shared material classes, never inline colors** (so each path recolors
per team automatically — team color comes from `--team` on the unit group):

| class           | material / use                                              |
|-----------------|-------------------------------------------------------------|
| `.fig-body`     | ivory/bone gradient + dark outline — the carved body        |
| `.fig-shade`    | translucent dark overlay — the shadowed (lower-right) side  |
| `.fig-light`    | translucent light overlay — the lit (upper-left) edge       |
| `.fig-cloak`    | **team color** — cloak / tabard / sash / hat band / crest   |
| `.fig-cloak-dk` | shaded fold of the team cloth                               |
| `.fig-steel`    | polished steel gradient — blades, shields, mace heads       |
| `.fig-gold`     | brass / wood gradient — hilts, staves, bow limbs, halos     |
| `.fig-dark`     | deep recess — visor slits, hood hollows, grips, eyes        |
| `.fig-line`     | thin engraved seam line (no fill)                           |
| `.fig-glow`     | team-tinted magical glow (orbs / sparks) — uses `#softGlow` |
| `.fig-halo`     | gold glowing ring (clerics / holy units)                    |

**Recipe to follow** (back to front): team cloak/cape → ivory body silhouette →
`.fig-shade` on the right + `.fig-light` on the left → team tabard/sash → shoulders
→ head/helmet/hood/hat → weapon or implement (`.fig-steel`/`.fig-gold`, with a
`.fig-glow` for casters). Give every class a **distinct silhouette and a
class-defining prop** — the existing five are the worked examples: Swordsman
(plumed helm + planted greatsword), Archer (hood + drawn recurve bow), Mystic
(cowl + halo + glowing staff), Magician (pointed hat + wand spark), Paladin (tower
shield + cross + mace + haloed winged helm). Avoid two units sharing a silhouette.

The materials are defined as gradients in `index.html` (`#ivory`, `#figSteel`,
`#figGold`) and as `.fig-*` rules in `style.css`. The HP bar, spent/defend marks,
status badges, target reticle, plinth, and all combat FX are added by
`createUnitFigure` around your figure — you only draw the miniature itself.

## Sounds

Sounds are presentation-only. Existing routing lives in `src/main.js` and
`src/audio/sounds.js`. Add sounds only after the rules event exists, and keep
the sound keyed to the resolved event outcome. Misses, defended hits, critical
hits, heals, ranged launch, and ranged impact already have routes.

## Codex and squad picker

`RulesModal` builds the Codex from `UNIT_TYPES`; a registered unit appears
there automatically. The squad picker cycles through `UNIT_TYPES`, so adding a
unit to the catalog makes it selectable unless further filtering is introduced.

Only mark an ART/passive `implemented: true` when all of this is true:

- reducer behavior exists
- targeting UI exists
- animation/VFX exists or intentionally reuses a generic one
- tests cover the behavior
- descriptions match actual behavior

Leaving a catalog entry as `implemented: false` is acceptable for staged unit
work, but inactive buttons will not show for active ARTS.

## Tests to add for a unit

Use Node's built-in test runner. `npm test` runs `node --test tests/*.test.js`.

Minimum coverage for a new unit:

- catalog stats and registration
- passive behavior
- RAGE behavior at 5 HP or lower and non-RAGE behavior above 5 HP
- each active ART's validation, MP spend, spent/activation behavior
- hit, miss, crit, and effect roll behavior for attack ARTS
- status duration/immunity interactions
- forecast parity for damage-dealing targeted effects
- VFX catalog coverage for implemented active ARTS

For deterministic combat tests, pin rolls:

```js
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
```

## Engine changes for legacy abilities

Legacy units include abilities that the current engine does not fully support.
Prefer small reusable seams over one-off hacks.

Already landed (reuse these rather than reinventing them):

- team aura modifiers while a host is alive (`teamAura` — Mystic Guardian)
- always-defending or passive damage reduction (`isDefending`; `teamDamageReduction` — Dead Zone)
- ally/self-targeted healing (`healAllies` — Pray/Wish)
- magic attack ART resolution (`damageType: "magic"` — Spark/Banish/Wither)
- empty-tile targeting (Flee `getLegalFleeTiles`; Summon placement `getSummonPlacementTiles`)
- summons as real units with special turn rules (`summon: true` + `takesTurns`; Ghoul)
- area targeting (self-centered AoE — Nuke/Dark Bomb `resolveNuke`; cone — Volley Shot)
- aura-based enemy debuffs (`enemyAura` — Deathly Aura)

Likely needed soon:

- cleanse and status prevention
- terrain placement such as fire/walls/cover (Sniper Build Cover / Smoke Bomb)
- arbitrary line targeting
- minimum damage and range-specific sniper rules (Sniper `Rifle Powered`)

When adding one, document the new effect shape in this guide and add a test that
uses a minimal fixture instead of relying on default spawns.

## Mystic implementation notes

Implemented recovered data:

- HP 23, Move 2, Range 5, STR 5, DEF 3, MP 38.
- **Anointed:** Mystic is immune to silence.
- **Pray, 4 MP:** heal the Mystic and friendly units within 3 tiles for 3 HP.
- **Wish, 2 MP:** heal every living friendly unit for 1 HP.
- **Silence, 3 MP:** range-5 status cast with a 70% silence check. It deals no
  damage and respects status immunity.
- **Guardian:** while the Mystic is alive, friendly units including the Mystic
  gain +1 DEF.
- RAGE: +6 Move and always defending.

Mystic added these reusable engine seams:

- `teamAura` passive effects, applied by `getEffectiveStats(unit, state)`.
- `isDefending(unit)`, so RAGE/passives can count as defending without setting
  `unit.defending` in UI code.
- `healAllies` instant ART resolution for self-aura and global team healing.
- `statusCast` ART resolution for no-damage status spells.
- `healPulse` VFX recipes for friendly healing ARTS.

## Necromancer implementation notes

The Necromancer is the worked example for **debuff auras and summons**. Implemented
recovered data:

- HP 23, Move 3, Range 5, STR 6, DEF 3, MP 36.
- **Deathly Aura:** enemies within 2 tiles take -1 DEF (an `enemyAura` passive).
- **Dead Zone:** the Necromancer's team takes 1 less magic damage while it lives
  (a `teamDamageReduction` passive).
- **Wither, 4 MP:** magic-damage attack plus a 70% Slow (-1 MOVE, 3 turns) check.
  Routes through the default `resolveTargetedArt`; immunity is central, so Paladin
  resists but Mystic no longer does.
- **Dark Bomb, 10 MP:** self-centered 5-magic AoE within 2 tiles. Reuses the
  Magician's `resolveNuke` resolver (registered by id) — both AoE-magic arts respect
  Dead Zone.
- **Summon Ghoul, 8 MP:** places a 10 HP Ghoul on an empty tile within 2, one per
  Necromancer. The Ghoul (`src/core/units/ghoul.js`, `summon: true`) carries the
  same `enemyAura`.
- RAGE: +1 MOVE and an amplified aura (-2 DEF, -1 STR, -1 MOVE) via the nested
  `effect.enemyAura` on the statModifiers `ragePassive`.

Necromancer added these reusable engine seams:

- `enemyAura` debuffs, folded by `enemyAuraStats` inside `getEffectiveStats`
  (gated on Chebyshev range, amplified while the *source* rages).
- `teamDamageReduction`, applied via `getTeamDamageReduction` in every magic path
  (`resolveBaseStrike` magic branch + `resolveNuke`).
- **Summons:** `takesTurns(unit)` (false for `summon: true` defs). Summons spawn
  `spent`, are skipped by the turn loop (`spendAndAdvance`) and the squad picker /
  match summary, and `resolveVictory` is decided by living *commanders* so a
  turn-less summon can't keep a defeated player alive. New summon arts use the
  `summon` resolution + a `targeting.shape: "placement"` empty-tile selection
  (`getSummonPlacementTiles`), mirrored in `main.js` like Flee.

When you add a unit whose RAGE both changes its own stats *and* projects an aura,
keep the self-stat change as a `statModifiers` rage source — the rage self-stat
loop in `getEffectiveStats` deliberately ignores non-`statModifiers` sources so a
nested `enemyAura` never leaks onto the raging unit.

## Done checklist

Before calling a unit complete:

- Unit file added under `src/core/units/`.
- Unit registered in `src/core/unitCatalog.js`.
- Figurine builder added to `FIGURE_BUILDERS` in `src/ui/unitRenderer.js`
  (distinct silhouette + class-defining prop, shared `.fig-*` materials).
- Every implemented active ART has reducer behavior.
- Every implemented active ART has targeting UI.
- Every implemented active ART has VFX coverage.
- Passives and RAGE are real rules, not UI-only behavior.
- Codex descriptions are accurate.
- Tests pass with `npm test`.
