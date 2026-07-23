# Online Login Gate — Cross-Game Rollout Plan

## Goal

Tactical Arena gates its **Ranked mode** behind a real, signed-in Javascript Game
Factory account (not just the local factory `playerId`). We want to repeat that gate
on the **online multiplayer mode** of every other game that also ships a genuine
solo/single-player mode, so a player can always play solo without an account, but
needs a real account to play online.

This doc is the implementation plan for an agent to execute at a higher effort
level. It is scoped, not exploratory — read it fully before writing code.

## Why this is scoped to games with a solo mode

Per explicit product direction: only gate games where an ungated solo path still
exists. A game with online-only value would have no fallback if login-gated, so it's
out of scope here.

## Current state (updated 2026-07-23 — Phase 0 done + TA gap closed)

**Phase 0 is complete and Tactical Arena's own gap is closed.** The shared modules
now exist and both TA gates (Ranked + casual Online Versus) consume them:

- `js/platform/api/factory-account-gate.mts` (compiled `.mjs`) — shared session
  helpers (`normalizeFactoryAccountSession`, `isFactoryAccountLoggedIn`,
  `readFactoryAccountSession`, `createFactoryAccountSignInUrl`,
  `redirectToFactoryAccountSignIn`) plus the generic `getOnlineAccountGate(account)`
  returning `{ eligible, errorCode, message }`. Reads the token via the shared
  `auth-token.mjs` `getStoredAuthToken()` — no direct `localStorage` re-read.
  Unit-tested in `factory-account-gate.test.mjs`.
- `js/platform/ui/online-account-feature-gate.mts` (compiled `.mjs`) — generic DOM
  gate: `syncOnlineAccountFeatureControls(root, { account, selector, message })`
  toggles `disabled`, `.is-locked`, `title`/`aria-disabled` on any
  `[data-online-account-feature]` control (default) or a caller-supplied selector.
  Unit-tested in `online-account-feature-gate.test.mjs`.
- Tactical Arena retrofit (its full suite stays green, 1487 tests):
  - `games/tactical-arena/src/platform/factoryAccount.js` — now a thin re-export shim
    over the shared module (keeps the `readStoredFactoryAccountSession` alias +
    `SHOP_LOGIN_REQUIRED_ERROR`); its ~15 consumers were untouched.
  - `src/online/rankedAccountGate.js` — `getRankedAccountGate()` wraps
    `getOnlineAccountGate()`, keeping the ranked-specific error code/copy.
  - `src/ui/rankedFeatureGate.js` — thin ranked-flavored wrapper around the shared DOM
    helper (`[data-ranked-account-feature]` selector, ranked copy). No behavior change.
  - **Casual gap closed:** the `Online Versus` main-menu button carries
    `data-online-account-feature`, and `menuFlow.js`'s `mainMenu` onEnter now syncs
    both the casual online gate and the ranked gate. Verified in-browser (Chrome/
    puppeteer): logged out → button disabled with the sign-in tooltip; logged in →
    enabled.

Remaining work is Phases 1–2 below: roll the same gate out to the other seven target
games. No other game yet checks platform auth before online play (they rely solely on
the local factory `playerId`).

## Target games (have both a solo mode and an online mode)

1. `mini-tactics` — solo: CPU opponent. Online: `src/online/onlineClient.js`,
   `onlineSession.js`, `screens/onlineSetupScreen.js`.
2. `battleshits` — solo: Solo Bot Battle. Online: network-callbacks / online wiring
   (see `games/battleshits/CLAUDE.md` for current module split).
3. `echo-duel` — solo: solo survival mode (`scripts/single-player-setup.js`). Online:
   `scripts/init-game.js` + online session controller.
4. `illuminauts` — solo: solo mode. Online: `scripts/online.js`.
5. `cockpit-swarm` — solo: 5-stage campaign + 3 bosses. Online: 1v1 Dodgeball.
6. `creature-battler` — solo: Training mode vs AI
   (`games/creature-battle/creature-battler`). Online: blind-pick 1v1
   (`screen-online-lobby.js`, `screen-blind-pick.js`).
7. `sumorai` — solo: vs CPU (Easy/Medium/Hard, `scripts/bot.js`). Online: ranked ELO
   queue (`scripts/online-callbacks.js`, `online-match-start.js`).
8. `lovers-lost` — solo: single player controls both sides locally (WASD + arrows).
   Online: `scripts/online-wiring.js`.

**Explicitly out of scope:** `circuit-siege` (no solo/AI mode — out of scope for its
own v1 by its own `CLAUDE.md`), `last-bastion` (no online mode to gate),
`tactical-arena` (fully done — both Ranked and casual Online Versus now gated via the
shared module; see Current state above).

## Phase 0 — Extract the shared module — ✅ DONE (see Current state above)

Do not duplicate `factoryAccount.js` + `rankedAccountGate.js` + `rankedFeatureGate.js`
into eight more games. Extract them into shared platform code first, then have every
game (including tactical-arena) consume the shared version.

1. Add `js/platform/api/factory-account-gate.mjs` (exact name flexible, but keep it
   in `js/platform/api/` next to `auth-token.mjs`):
   - Wrap `getStoredAuthToken()` from `auth-token.mjs` — do not re-read
     `localStorage` directly.
   - Export `isFactoryAccountLoggedIn()` and `readFactoryAccountSession()`
     (mirrors `factoryAccount.js`'s `normalizeFactoryAccountSession` /
     `readStoredFactoryAccountSession`, but sourced from the shared token helper).
   - Export `createFactoryAccountSignInUrl({ currentHref, signInPath })` and
     `redirectToFactoryAccountSignIn(options)`. Keep the `?next=` redirect-back
     behavior tactical-arena already has — it's a good UX and should be preserved.
   - Export a generic `getOnlineAccountGate(account)` — same shape as
     `rankedAccountGate.js`'s `getRankedAccountGate` (`{ eligible, errorCode,
     message }`), but named generically since it will gate plain online play, not
     just ranked.
   - Write focused unit tests colocated the way the rest of `js/platform/api/`
     does (see `platform-api.test.mjs` for the pattern).
2. Add a shared DOM-gate helper, e.g. `js/platform/ui/online-account-feature-gate.mjs`
   (or alongside wherever other tiny shared UI helpers live — check for an existing
   `js/platform/ui/` convention before creating a new folder). Port
   `rankedFeatureGate.js`'s logic generically:
   - Attribute convention: `[data-online-account-feature]` (keep
     `[data-ranked-account-feature]` working too, or migrate tactical-arena's ranked
     UI onto the new generic attribute plus a `data-online-account-feature="ranked"`
     variant if per-mode messaging is needed later — decide based on whether ranked
     and plain-online ever need different copy).
   - `syncOnlineAccountFeatureControls(root, { account })` toggles `disabled`,
     `.is-locked`, and `title`/`aria-disabled`, exactly like today.
   - Default message: something like "Sign in to your Javascript Game Factory
     account to play online." (Ranked keeps its existing, more specific copy.)
3. Retrofit tactical-arena onto the shared module:
   - `rankedAccountGate.js` calls the new shared `getOnlineAccountGate` (or keeps a
     thin ranked-specific wrapper around it) instead of hand-rolling its own account
     normalization.
   - `factoryAccount.js` becomes a thin re-export of the shared module, or is deleted
     with its ~5 call sites updated to import from `js/platform/api/` directly.
   - `rankedFeatureGate.js` becomes a thin ranked-flavored wrapper around the shared
     DOM-gate helper.
   - Run tactical-arena's full test suite (`npm test` inside `games/tactical-arena`)
     after this refactor — it must stay green with no behavior change to Ranked.

## Phase 1 — Pilot on one game

Pick one game from the target list (recommend `mini-tactics` — its online module
boundaries are already clean per its `CLAUDE.md`, and it has no monetization
entanglement to worry about, unlike tactical-arena). For the pilot game:

1. Import the shared `getOnlineAccountGate` / `isFactoryAccountLoggedIn` into the
   game's online entry point (its lobby/setup screen, wherever "Play Online" /
   "Find Match" is triggered).
2. Before starting matchmaking or opening the online lobby, check the gate. If not
   eligible:
   - Mark the "Play Online" control(s) with `data-online-account-feature` and call
     `syncOnlineAccountFeatureControls()` on menu render so the button is disabled
     with a tooltip, matching tactical-arena's Ranked UX.
   - Optionally (match tactical-arena's pattern if it has one for redirect-on-click
     vs disabled-button — check `onlineFlow.js` for how Ranked handles a click while
     ineligible) show a small inline message or redirect to sign-in via
     `redirectToFactoryAccountSignIn()` if the user clicks anyway.
3. Do **not** touch the game's solo/CPU/campaign entry points. Local hot-seat, if
   any, is also unaffected — the gate only applies to the online matchmaking path.
4. Add/adjust tests: a unit test for the gate check at the online entry point
   (eligible vs not-eligible), and confirm existing online/lockstep tests are
   unaffected (they should be, since the gate sits in front of connection, not
   inside the protocol).
5. Browser-playtest: with no stored auth token, confirm the online button is visibly
   disabled with the tooltip; with a valid token (or session mocked in dev), confirm
   online play still starts normally. Per existing repo guidance, do not claim this
   works without an actual browser check at the relevant viewport.

## Phase 2 — Roll out to the remaining seven games

Repeat the Phase 1 integration per game, one at a time, in this order (roughly
simplest/least-coupled first): `illuminauts`, `echo-duel`, `sumorai`,
`cockpit-swarm`, `battleshits`, `creature-battler`, `lovers-lost`.

For each game:
- Locate the actual "start online" trigger (button click, menu transition) — do not
  guess; read the game's own `CLAUDE.md` and online controller file before editing.
- Apply the same three-part change: gate check → disabled/tooltip UI → optional
  sign-in redirect on click.
- Do not restructure the game's existing online architecture beyond what's needed to
  insert the gate. If a game's online entry point is tangled across multiple files
  (a controller doing too much), that's a pre-existing hotspot issue — flag it,
  don't fix it in this pass, unless it's a one-line change to slot the gate in
  cleanly.
- Keep each game's change to its own commit/PR so a regression in one doesn't block
  the others.

## Non-goals

- Do not gate any solo/CPU/campaign/practice/training mode. Ever.
- Do not build a new sign-up/sign-in flow. Reuse the existing `sign-in/index.html`
  and its `?next=` redirect-back convention.
- Do not add server-side enforcement of this gate (unlike Ranked's ELO, plain online
  play has no server-authoritative economy on the line — this is a client-side UX
  gate only, matching the scope of the ask).
- Do not touch `circuit-siege` or `last-bastion`.
- Do not silently expand tactical-arena's existing Ranked gate scope while doing the
  Phase 0 extraction — behavior must stay identical, just de-duplicated.

## Definition of done

- Shared gate + DOM-helper modules exist under `js/platform/`, covered by unit
  tests, and tactical-arena's Ranked gate consumes them with no behavior change
  (its own test suite stays green).
- All eight target games disable their "Play Online" entry point with a
  sign-in tooltip when logged out, and allow normal online play when logged in,
  verified in-browser per game.
- No solo/CPU/campaign mode in any game was touched.
- Each game's own test suite still passes after its integration.
