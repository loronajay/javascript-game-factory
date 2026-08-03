# Mini-Tactics (Isometric Squad Tactics)

A turn-based isometric SVG squad-tactics game on a fantasy war-table. Each player commands a
warrior, tank, ranger, and medic across a diamond board; move, line up attacks, and brace for
the dice. It began as a modular extraction of a standalone SVG/CSS prototype and is now a
registered arcade cabinet.

This file is the rules reference. For as-built implementation state see `CLAUDE.md`.

## Modes

- **Local hot-seat**, 2–4 players: 2P duel, 3–4P free-for-all, or 4P 2v2 teams.
- **Single player vs CPU** on Easy, Normal, or Hard.
- **Online**, 2–4 players (FFA + 2v2 teams) over deterministic lockstep.
- **Custom squads**: pick your four units and which 2×2 spawn slot each fills, in every mode.
  "Standard" stays the one-click classic one-of-each squad.
- **Settings**: audio mix, animation speed, reduce motion, colorblind palette, and a light theme,
  persisted to `localStorage["mini-tactics.settings"]`.

Board sizes are 10×10 (2P) or 13×13 (forced for 3–4P). Online supports both.

## Run locally

ES modules should be served over HTTP instead of opening `index.html` directly.

From the project root:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Test

Requires a current Node.js installation:

```bash
npm test
```

The project has no runtime dependencies and no build step. The suite covers rules, deterministic reducers, multiplayer, CPU play, composition, mobile structure, tutorials, and the simulated-latency online lockstep contract.

## Architecture

```text
index.html
sounds/                # .wav clips (root + universal/ ranger/ medic/) + battle.mp3
styles/
  tokens.css           # the fantasy war-table design system (values changed, names kept)
  layout.css
  board.css
  menus.css
  effects.css
  responsive.css
src/
  config.js
  main.js
  app.js               # browser boot path (the only importer of the audio manager)
  game/
    GameController.js
  core/                # deterministic, headless, DOM-free game engine
    rng.js             # seeded PRNG (replaces Math.random in authoritative play)
    roster.js          # playerCount/format/teams/colors -> players[] (1-4)
    state.js           # authoritative match state + clone/serialize/selectors
    composition.js     # custom squad compositions + normalization
    commands.js        # command vocabulary + builders
    events.js          # event vocabulary emitted by accepted commands
    errors.js          # rejection codes
    reducer.js         # applyCommand(state, command) -> accepted/rejected
    state-hash.js      # stable hash for desync detection / replay verification
  ai/                  # deterministic, headless CPU driving the same command API
    evaluate.js        # expected-value combat math (rolls no dice)
    plans.js           # every legal activation plan per unit
    cpuController.js   # chooseActivation(state, opts) -> command[]
  online/
    onlineClient.js    # the ONLY WebSocket caller
    onlineSession.js   # lockstep bridge: broadcast/replay, hash verify, disconnect concede
  tutorials/
    basics.js          # single tutorial + progress payload (no menu entry point yet)
  geometry/
    isometric.js
  state/
    gameState.js
  rules/
    movement.js
    combat.js
    turns.js
  render/
    svg.js
    boardRenderer.js
    unitRenderer.js
    overlayRenderer.js
    hudRenderer.js
    effectsRenderer.js
    labels.js          # teamLabel/unitLabel — single source of truth for naming
    hp.js              # hpClass thresholds shared by every HP surface
    timing.js          # scale() lever behind the animation-speed setting
    motion.js
  audio/
    sounds.js          # AudioManager: logical key -> file, overlap-safe play()
  ui/
    elements.js
    messageController.js
    rulesModal.js      # 3-tab How to Play: Basics / Units / Advanced
    settingsModal.js
    settings.js
    screens/           # title, mainMenu, setup screens, squadBuilder, match,
                       # results, tutorialComplete, screenManager
tests/
  rules.test.js            # original pure-rule tests
  reducer.test.js          # command/activation flow, cancel-move, targeting, victory
  determinism.test.js      # same seed+log => same hash; serialize/replay stability
  multiplayer.test.js      # roster, teams, turn order, concede-as-dropout
  composition.test.js      # custom squads + duplicate-type id suffixing
  cpu.test.js              # two-CPU full-match termination, legality, determinism
  online-lockstep.test.js  # N-client hash equality under jittered latency + disconnect
  main-menu.test.js        # menu markup contract (incl. the deliberately-absent Tutorials button)
  mobile-playability.test.js
  tutorial-basics.test.js
```

## Responsibility boundaries

- `config.js`: balance values.
- `core/`: the authoritative, headless engine. `reducer.js` is the single
  validator/mutator every mode submits commands to; it owns dice via the seeded
  `rng.js` and returns events. No DOM, no `Math.random` in authoritative play.
- `state/gameState.js`: initial unit placement and lookup helpers shared by the
  rule modules.
- `geometry/isometric.js`: projection, range metric, tile keys, and line tracing.
- `rules/`: renderer-independent movement, combat, healing, and turn rules,
  reused by the reducer so the encoded rules stay identical to the prototype.
- `ai/`: the CPU. Pure and headless — it produces commands and goes through the same
  `applyCommand` reducer a human's clicks do, so it cannot cheat or inspect a die before it
  is rolled. It scores against expected value and never consumes the authoritative RNG.
- `online/`: transport and lockstep. Only `onlineClient.js` constructs a `WebSocket`.
- `render/`: SVG/DOM generation and animation.
- `audio/`: presentation only — fire-and-forget, silent on failure, never gates rules.
- `ui/`: DOM lookup, message presentation, modals, and the screen router.
- `game/GameController.js`: owns local UI state (selection, action mode,
  highlights, animation lock) separately from authoritative match state,
  submits commands to the reducer, and animates the returned events.

## Current rules encoded

- 10×10 or 13×13 board.
- Four pieces per player: warrior, tank, ranger, medic.
- Every piece starts at 10 HP.
- Warrior and tank movement 3; ranger and medic movement 2.
- Movement is orthogonal.
- Attacks include diagonals without range penalty.
- Warrior/tank range 1; medic range 3; ranger range 4.
- Ranger shots are blocked by intermediate pieces.
- Roll 1 misses. Roll 6 crits.
- Critical attacks add 1 damage.
- Normal heal restores 3; critical heal restores 4; healing may miss.
- Defense reduces damage by 1, including to zero, for warriors, rangers, and medics.
- Tanks use Guard instead of Defend: self-Guard behaves like Defend; external
  Guard protects one adjacent ally and redirects the first attack on that ally to
  the Tank with a 1-point reduction.
- Defense and Guard expire when that unit begins its next activation.
- Each living unit activates once before the squad turn changes.
- Move-only activation is prohibited.
- Attack/heal may occur before or after movement.
- An uncommitted move can be undone with `Cancel Move` before the piece
  uses its primary action; it returns the piece to its activation origin and
  leaves it selected and unspent. Cancellation is impossible once any primary
  action has resolved.
- Medic may heal itself.
- Eliminate the opposing squad to win.

## Heal range

Medic heal range is `3` (canonical), defined as `MEDIC_HEAL_RANGE` in `src/config.js`.

## Integration direction

The `core/`, `rules/`, and `state/` folders are intentionally independent of SVG. That
separation has since paid off — the CPU (`src/ai/`) and online lockstep (`src/online/`) both
reuse them unchanged, and replay determinism is covered by `tests/determinism.test.js`.
Remaining reuse targets: alternate renderers and automated balance simulations.

For online play, do not send rendered positions or animation state over the network. Send commands such as:

```js
{
  type: "ATTACK",
  actorId: "p1-ranger",
  targetId: "p2-medic"
}
```

The authoritative side should validate the command through the same rule modules and emit the resulting state transition.
