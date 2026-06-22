# Isometric Squad Tactics

Modular extraction of the standalone SVG/CSS prototype.

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

The project has no runtime dependencies and no build step.

## Architecture

```text
index.html
styles/
  tokens.css
  layout.css
  board.css
  effects.css
  responsive.css
src/
  config.js
  main.js
  game/
    GameController.js
  core/                # deterministic, headless, DOM-free game engine
    rng.js             # seeded PRNG (replaces Math.random in authoritative play)
    state.js           # authoritative match state + clone/serialize/selectors
    commands.js        # command vocabulary + builders
    events.js          # event vocabulary emitted by accepted commands
    errors.js          # rejection codes
    reducer.js         # applyCommand(state, command) -> accepted/rejected
    state-hash.js      # stable hash for desync detection / replay verification
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
  ui/
    elements.js
    messageController.js
tests/
  rules.test.js        # original pure-rule tests
  reducer.test.js      # command/activation flow, cancel-move, targeting, victory
  determinism.test.js  # same seed+log => same hash; serialize/replay stability
```

## Responsibility boundaries

- `config.js`: balance values and explicit assumptions.
- `core/`: the authoritative, headless engine. `reducer.js` is the single
  validator/mutator every mode submits commands to; it owns dice via the seeded
  `rng.js` and returns events. No DOM, no `Math.random` in authoritative play.
- `state/gameState.js`: initial unit placement and lookup helpers shared by the
  rule modules.
- `geometry/isometric.js`: projection, range metric, tile keys, and line tracing.
- `rules/`: renderer-independent movement, combat, healing, and turn rules,
  reused by the reducer so the encoded rules stay identical to the prototype.
- `render/`: SVG/DOM generation and animation.
- `ui/`: DOM lookup and message presentation.
- `game/GameController.js`: owns local UI state (selection, action mode,
  highlights, animation lock) separately from authoritative match state,
  submits commands to the reducer, and animates the returned events.

## Current rules encoded

- 10×10 or 13×13 board.
- Four pieces per player: warrior, tank, ranger, medic.
- Every piece starts at 10 HP.
- Warrior movement 3; all others movement 2.
- Movement is orthogonal.
- Attacks include diagonals without range penalty.
- Warrior/tank range 1; medic range 3; ranger range 4.
- Ranger shots are blocked by intermediate pieces.
- Roll 1 misses. Roll 6 crits.
- Critical attacks add 1 damage.
- Normal heal restores 3; critical heal restores 4; healing may miss.
- Defense reduces damage by 1, including to zero.
- Defense expires when that unit begins its next activation.
- Each living unit activates once before the squad turn changes.
- Move-only activation is prohibited.
- Attack/heal may occur before or after movement.
- An uncommitted move can be undone with `Cancel Move` before the piece
  attacks, heals, or defends; it returns the piece to its activation origin and
  leaves it selected and unspent. Cancellation is impossible once any primary
  action has resolved.
- Medic may heal itself.
- Eliminate the opposing squad to win.

## Explicit assumption

`MEDIC_HEAL_RANGE` is currently `3` in `src/config.js`. Change that value when the final heal range is decided.

## Integration direction

The `rules/` and `state/` folders are intentionally independent of SVG. They can later be reused by:

- CPU decision logic
- online/server-authoritative validation
- replay recording
- alternate renderers
- automated balance simulations

For online play, do not send rendered positions or animation state over the network. Send commands such as:

```js
{
  type: "ATTACK",
  actorId: "p1-ranger",
  targetId: "p2-medic"
}
```

The authoritative side should validate the command through the same rule modules and emit the resulting state transition.
