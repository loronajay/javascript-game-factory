# Questionable Decisions — Two-Surface Penalty Contract

When a player misses a trivia question they drop into a penalty mini-game. Every
penalty is rendered across **two surfaces** and scored by the server:

| Surface | Where | Who sees it | Owns |
|---|---|---|---|
| **Display half** | Shared screen (the TV) | everyone | the spectacle — sequence, bomb, falling junk, hit/miss, point loss |
| **Controller half** | The penalized player's phone | that one player | the **gamepad** (input) + a thin penalty-specific overlay (prompt / what's lit) |

Everyone else stays on the spectator screen and fires reactions. The server is the
single authority for penalty state and scoring; clients render and collect input.

## The gamepad is the controller canon

The controller half is **one shared landscape gamepad** for every penalty (ported
from `penalty-game-controller-reference.html`). A penalty never invents its own
button layout — it lights up and listens to the standard inputs:

```
Up  Down  Left  Right        (d-pad)
A   B     X     Y            (face buttons, colored: A green, B red, X blue, Y yellow)
L   R                        (shoulders)
Start  Select               (system)
```

The gamepad emits an input token (one of the names above) on each press. The phone
sends it to the server as a `lobby_message`:

```
qd_penalty_input { input: "A" }
```

A penalty's controller overlay may highlight which input is currently live
(`litButtons`) and show a short prompt; the pad itself is identical everywhere.

## Server-side penalty module interface

Penalty modules live in `factory-network-server/games/questionable-decisions/server/qd-penalties/`
and are pure. The match engine picks one (weighted) on a wrong answer, drives it
through the `penalty_active` phase, and resolves a capped point loss.

```js
{
  penaltyId, displayName, weight, promptText,
  init({ sourceValue, maxLoss, seed }) -> state,   // build authoritative penalty state
  input(state, inputToken) -> state,               // apply one gamepad press (pure)
  status(state) -> "short status string",          // live status line for the display
  resolve(state, { maxLoss }) -> { pointsLost, statusText },
  serializePublic(state)  -> { ...display spectacle fields },
  serializePrivate(state) -> { litButtons?: string[], ...controller hint fields },
}
```

Scoring stays uniform at the envelope: `maxLoss = round(sourceValue * 1.5)` (the
GDD §10.4 cap), `pointsLost` is clamped to `[0, maxLoss]`, and the player's score
floors at 0. How `pointsLost` is earned is the module's business.

## Client-side penalty view interface

Penalty views live in `games/jaybox/cabinets/qd-penalties/` and split the same two
surfaces. The QD cabinet renders the display half on the shared screen and, for the
penalized player only, the gamepad + the controller overlay.

```js
{
  penaltyId,
  renderDisplay(publicPenalty) -> html,                 // spectacle on the TV
  renderControllerOverlay(privatePenalty) -> html,      // prompt above the gamepad
  litButtons(privatePenalty) -> string[],               // gamepad buttons to highlight
}
```

The shared gamepad (`cabinets/qd-penalties/gamepad.mjs`) renders the pad and calls
back on every press; the QD cabinet forwards that press as `qd_penalty_input`.

## Adding a penalty

1. Server: add `qd-penalties/<id>.mjs` implementing the module interface; register it
   in `qd-penalties/registry.mjs`.
2. Client: add `cabinets/qd-penalties/<id>.mjs` implementing the view interface;
   register it in `cabinets/qd-penalties/registry.mjs`.
3. Test the server module's `input`/`resolve` and the client view's `litButtons`
   mapping. The host trivia loop never changes.

## Status

- Contract + shared gamepad: shipped.
- `pattern-panic`: first real two-surface penalty (react to the lit face button).
- `default`: uniform "mash to survive" fallback used by the not-yet-bespoke
  penalties (`cabinet-says`, `bomb-diffuser`, `stack-overflow`) until each gets its
  own module.
