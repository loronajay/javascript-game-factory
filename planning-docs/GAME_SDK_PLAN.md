# Game SDK Plan — Shared Cabinet Toolkit

**Status:** Scoped, not started. Deferred — captured so the design isn't lost.
**Date:** 2026-05-30
**First intended use case:** `games/cockpit-swarm` (cleanest modular cabinet; ideal donor).

---

## Problem

Every new cabinet re-derives the same scaffolding from scratch. Working with agents
has drifted into reinventing the wheel per game: the fixed-timestep loop, canvas boot,
input handling, the menu/state machine, and the neon draw vocabulary get rewritten each
time, slightly differently. The games don't even share a file convention
(`cockpit-swarm` is clean `js/**/*.mjs`; older ports are `scripts/*.js`).

Goal: a cohesive game-dev ecosystem — a shared kit so a new cabinet starts from proven,
documented parts instead of a blank `main.mjs`. This is a **game SDK**, not just an art
engine; procedural art/styling is one module inside it.

## Non-goals

- Not a framework every game must adopt. Old shipped cabinets are **not** retrofitted.
- Not an SVG-source asset pipeline. Source of truth is **data** (tokens + descriptors)
  that can render to canvas (gameplay) or SVG string (UI/badges) — but gameplay stays
  canvas. (See "Art/styling module" below.)
- Grid previews stay hand-made (ChatGPT-authored PNGs in `grid-previews/`). Not generated.

---

## Consumption model: HYBRID (decided)

Two cooperating layers, chosen to fit a heterogeneous, stability-first, solo+agents repo
where old cabinets have no test net and must never silently regress:

```
games/_kit/        <- IMPORTED, versioned, generic, low-churn, unit-tested
  math.mjs           clamp / lerp / rand
  input.mjs          edge-triggered press + touch + mouse normalization
  loop.mjs           dt-clamp + fixed-timestep accumulator (repo-mandated; one blessed impl)
  canvas.mjs         context boot, roundRect polyfill, toCanvasPos (logical-space) normalizer, scaleFactor/resize
  audio-pool.mjs     sound-pool primitive only (NOT any game's sound list)

games/_template/   <- SCAFFOLDED (copied at new-game time), owned per game, expected to diverge
  state.mjs          state-machine skeleton + "clear flashes/presses on menu entry" invariant pre-solved
  menu.mjs           button-rect + hit-test + hover + draw kit
  draw/tokens.mjs    neon palette as SEMANTIC ROLES + glow/bevel/gauge/LED primitives (the art module)
  main.mjs           pre-wired: imports _kit, uses local state/menu/draw
  game.json, index.html, css skeleton

js/platform/       <- STAYS IMPORTED (identity / activity / results / storage already live here)
```

**Boundary test** for every candidate: *"Generic and stable, or opinionated and expected
to diverge per game?"* Generic+stable+testable → `_kit` (imported). Opinionated, customized
per game → `_template` (scaffolded copy).

### Why hybrid over the alternatives

- **Live shared lib (everything imported):** one fix propagates everywhere — but one bad
  change regresses every shipped game, and `scripts/*.js` TurboWarp ports can't cleanly
  consume ESM. Rejected: too much coupling for an untested old-game surface.
- **Scaffold/vendor only (no live lib):** zero coupling, nothing regresses — but bugfixes
  to genuinely-generic code (e.g. the timestep) must be hand-applied to N copies. Rejected:
  loses propagation on the parts that are objectively shared.
- **Hybrid:** import only the small, stable, generic core; scaffold the opinionated rest.
  Best of both for this repo.

---

## What's already extractable from cockpit-swarm

These are near-verbatim donors today:

- `js/systems/input.mjs` — ~90% game-agnostic already (press/edge/touch/mouse + the
  `clearMenuPresses()` drain). → `_kit/input.mjs`.
- `js/main.mjs` — `roundRect` polyfill, `toCanvasPos` 1280×720 normalizer, dt-clamped loop,
  first-gesture audio unlock. → split across `_kit/canvas.mjs` + `_kit/loop.mjs`.
- `js/core/math.mjs` — `clamp`/`lerp`/`rand`. → `_kit/math.mjs` verbatim.
- `js/render/scene.mjs` draw helpers (`drawMenuButton`, glow strokes, gauge/LED/bevel) and
  the hardcoded palette (`#34f7ff` cyan, `#ff8a26` orange, `#78ff9d` green, `#ff365d`
  danger). → `_template/menu.mjs` + `_template/draw/tokens.mjs`.
- The MENU/PLAYING/STAGE_CLEAR/GAME_OVER machine + the **flash/shake invariant**
  (zero `hurtFlash`/`muzzleFlash`/`shake` + `clearMenuPresses()` on every menu entry).
  → `_template/state.mjs`, with the footgun pre-solved.

## Art / styling module (the `draw/tokens.mjs` slice)

- **Theme tokens (data):** palette as semantic roles — `hull`, `core`, `glow`, `telegraph`,
  `hit`, `danger`, `accent` — plus glow radii and line weights. One file to retheme a game
  or spin a new sci-fi look. ~80% shared across cockpit-swarm / circuit-siege / echo-duel /
  illuminauts.
- **Shape descriptors (data):** enemy silhouettes are already point-arrays buried in
  `drawEnemyShape`; promote to `{ points, fill, stroke, glow, core }`.
- **Two backends over one descriptor:** `paintToCanvas(ctx, descriptor, theme, state)` for
  gameplay (full per-frame hit/telegraph state via tokens); `descriptorToSVG(descriptor,
  theme)` → string for DOM UI/badges. Note: CSS animation does NOT survive rasterization,
  so canvas runtime state (hit-flash etc.) is driven by tokens in the canvas backend, not
  by baked SVG.

---

## The three things that make hybrid hold

1. **Versioning:** keep `_kit` small/generic so breaking changes are rare; prefer additive.
   If a frozen old game can't migrate, vendor-freeze (copy the kit into that one game).
   A `KIT_VERSION` constant + one-line changelog is enough governance — no package registry.
2. **Discoverability beats the library.** A lib only stops reinvention if agents find it.
   Add `games/_kit/README.md` AND a hard pointer in root `AGENTS.md`/`CLAUDE.md`:
   *"New game? Start from `_template`, import from `_kit`. Do not re-derive
   loop/input/timestep/menu."* Best: a scaffold step (`/new-game` skill or node script) so
   starting a cabinet is one command from a proven base. The scaffold is what actually
   changes agent behavior.
3. **Typed from day one.** The non-game TS migration is complete; games migrate last,
   per-cabinet. The kit is brand-new code — author it as `.mts` under `strict` now. It
   becomes the first typed game code and sets the per-cabinet pattern.

---

## Sequencing

1. Extract `_kit/{math,input,loop,canvas}.mjs` from cockpit-swarm; point cockpit-swarm at
   them. Pure refactor — the game must play byte-identically. Validates the seam at zero
   gameplay risk.
2. Reshape menu/state/draw-tokens into the `_template` layout, with cockpit-swarm as the
   live reference consumer (not yet a literal copy).
3. Write the scaffold + the `AGENTS.md` pointer + `_kit/README.md`.
4. **Game #2 is the real proof** — does the kit hold when the gameplay isn't a fixed-shooter?

## Risks

- Over-sharing → coupling. Mitigated by the boundary test and keeping `_kit` tiny.
- Old `scripts/*.js` ports can't consume `_kit` — by design; they stay frozen.
- Kit churn breaking a frozen game — mitigated by additive-first + vendor-freeze escape hatch.
