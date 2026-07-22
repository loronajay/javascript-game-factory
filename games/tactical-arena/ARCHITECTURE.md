# Tactical Arena architecture

This codebase is organized by game responsibility. New work should extend an existing
boundary instead of adding behavior to `src/main.js` or a catch-all stylesheet.
`tests/architecture.test.js` enforces the line caps and module boundaries named below —
update it deliberately when a boundary genuinely changes; never loosen it for convenience.

## Runtime boundaries

- `src/core/` owns deterministic state transitions, commands, turn flow, and unit data.
  - `reducer.js` is command dispatch plus the activation lifecycle (begin/move/cancel/
    defend/finish/concede) and the post-command reconciliation seam. The basic-attack
    pipeline (unit + wall strikes and every data-driven rider) lives in `basicAttack.js`;
    fresh-activation lifecycle passives (Soul Shuffle preview, Emergency Snacks, Riot Cop
    ability recharge) live in `activationPassives.js`.
  - `turnEngine.js` owns rollover/turn advance and victory; the independent end-of-turn
    hazard pulses (fire ticks, mission random-fire, weather cycle, Black Death,
    auto-strikes, time steal) live in `turnHazards.js`.
  - `unitCatalog.js` is the live-stat authority: `getEffectiveStats` folds statuses,
    auras, team composition, tiles, weather, and King commands. The unit-type registry
    and definition/identity accessors live in `unitRegistry.js`; weather-driven reads in
    `unitWeather.js`; King command buffs in `kingCommands.js`; the CPU-AI metadata
    schema/normalizers in `unitAiMetadata.js`. `unitCatalog.js` re-exports the public
    surface of all four, so consumers import from the catalog. Unit definitions live in
    `src/core/units/<name>.js`, one file per type, registered in `unitRegistry.js`.
  - `artResolvers.js` is a pure dispatcher; unit-family ART behavior lives under
    `src/core/artResolvers/` (one file per family, registered in the `ART_RESOLVERS`
    map). Add substantial new mechanics as a new resolver file, never as reducer branches.
- `src/rules/` owns pure legality, movement, targeting, statuses, and combat
  calculations. `combat.js` is the shared combat authority: forecasts, AI evaluation, and
  resolution reuse the same math.
- `src/match/` owns match construction, summaries, and lifecycle policy;
  `matchLifecycleController.js` coordinates start/reset/leave through injected adapters.
- `src/ai/` plans CPU turns without browser dependencies. `plans.js` generates and
  projects candidate plans, `evaluate.js` scores them through the shared combat rules,
  `cpuController.js` picks deterministically (state-seeded `cpuRng`; tie-breaking never
  uses `Math.random`), and `cpuTurnController.js` coordinates classic and Tempo CPU loops
  through injected presentation and command adapters.
- `src/campaign/` owns campaign content, progression, match preparation, and match-scoped
  campaign bookkeeping.
  - `campaignContent.js` defines missions and the trail; `campaignModel.js`,
    `campaignConstants.js`, and `campaignMap.js` carry the shared shapes.
  - `campaignMatch.js` keeps squad/restriction config rules and the
    `prepareCampaignMatchState` assembler; the per-mission spawn/board recipe table lives
    in `campaignLayouts.js`.
  - `src/campaign/missions/<slug>/` holds per-mission content: every mission has
    `dialogue.js`; missions with scripted boards/trials add their own modules
    (`monk-temple-trial/trial.js`, `void-ridden-castle/trial.js` + `ghosts.js`,
    `witch-doctor-swamp/layout.js`, `the-final-battle/stages.js`). Do not rename mission
    folders casually — tests import them by path.
  - `campaignEvaluation.js` owns objectives and star scoring; `campaignProgress.js` /
    `campaignProgressRuntime.js` own persistent progression; `campaignObservations.js`
    derives objective/dialogue facts from commands and events; `campaignMeta.js` is
    presentation/objective observation state, deliberately outside deterministic battle
    state; `campaignRuntime.js` is the barrel for the split runtimes.
  - `campaignPresentationController.js` owns map cutscenes, dialogue-driven board
    changes, and Final Battle blackout/stage presentation. `campaignMatchHooks.js` is the
    per-command in-match glue (progress recording, condition-triggered dialogue beats,
    the mission-scoped CPU ART denylist), wired by `main.js`.
- `src/progression/` owns persisted meta-progression outside deterministic battle state.
  `unlocks.js` is the single read/write/normalize authority for the progress payload
  (unlocked units/skins, campaign reward picks, Valor balance); `valorRewards.js` grants
  Valor from campaign/online/tutorial results; `marketplace.js` owns Shop catalog,
  pricing, and purchase transactions; `inventory.js` owns consumables (grants,
  activation, timed boost effects); `announcements.js`, `draftAvailability.js`, and
  `cheatCodes.js` handle the unlock announcement feed, draft-mode gating, and cheats.
  Route all progress mutations through `unlocks.js`; keep economy math out of `src/ui/`.
- `src/ui/` renders and presents state. UI modules may read rules but must not duplicate
  them.
  - Shared DOM builders (`el`, `escapeHtml`) live in `domHelpers.js` — never redeclare
    them per file.
  - `commandResolutionController.js` is the shared resolve loop (validate/prepare a
    command, apply it through the reducer, present the accepted result). `main.js`, the
    CPU driver, the online bridge, AND the dev sandbox all construct it — the sandbox may
    never fork its own copy (architecture-test enforced).
  - `matchOutcomeController.js` owns turn/results announcement and everything between
    the final blow and the results screen (online Valor claim, campaign completion,
    reward-pack gating, defeat/loss dialogue beats).
  - `menuFlow.js` is the menu ROUTER only. Screens live in `campaignMapScreen.js`,
    `resultsScreen.js`, `tutorialMenuScreens.js`, `settingsScreen.js`, and
    `matchSetupScreens.js`, with pure campaign view-model helpers in
    `campaignMenuModel.js` and the menu seat palette in `teamDisplay.js`
    (`MENU_TEAM_COLORS`).
  - `onlineFlow.js` is the online lobby controller: transport wiring, the lobby state
    machine, and the match handoff. Its rendering and pure logic are extracted —
    `onlineLobbyView.js` builds the roster + draft/ban board (from an injected context),
    `onlineFlowColors.js` holds the seat/team palette, `onlineMatchTypes.js` the
    match-type catalog + lookups, `onlineProfiles.js` the lobby profile/identity shaping,
    and `onlineLobbyStatus.js` the Start-button/status-hint derivation. Each extracted
    piece has its own `node:test` because `onlineFlow.js` itself constructs a real
    WebSocket client and cannot load headless. The ranked matchmaking state machine still
    lives inline (see Remaining hotspots).
  - Shop, ranked-profile, and results surfaces are split from their controllers. `shop.js`
    is the modal controller over `shop/shopTabs.js` (per-tab renderers), `shop/shopCheckout.js`
    (Valor-confirm + embedded Stripe layers), and `shop/shopWidgets.js` (pure widgets +
    status/format helpers). `rankedProfile.js` is the profile overlay over
    `rankedProfileIdentity.js` (tagline/avatar editor + owned-avatar options) and
    `rankedProfileNameplate.js` (standing nameplate fill). `resultsOpponentCard.js` renders
    the post-match opponent card; its record/view-model math is `resultsOpponentCardModel.js`.
  - `boardRenderer.js` owns the targeting/highlight render contract (see below);
    scene decoration (weather overlay, wall/fire figures, the dais) lives in
    `boardAtmosphere.js`. `unitRenderer.js` + `boardSprites.js` draw tokens.
  - `effects.js` composes effect primitives; live token motion is isolated in
    `unitMotionEffects.js`, DOM/timing and board geometry in `effectDom.js` and
    `effectEnvironment.js`, the to-hit die reveal in `diceRollReveal.js`, and recipes in
    `vfxCatalog.js`. Battle event reactions and animation routing live in
    `battleEventPresenter.js`, `rolledCombatPresenter.js`, and `instantArtPresenter.js`;
    tile and action-button routing in `battleInputController.js`; queued tutorial
    dialogue/prompts/spotlights plus the built-in scripted state mutations and completion
    presentation in `tutorialPresentationController.js`. `tempoLoopController.js` owns
    real-time frame scheduling and lightweight gauge updates.
- `src/online/` owns transport, lockstep, and remote command presentation;
  `onlineClient.js` constructs the only production WebSocket, `onlineSession.js` owns
  deterministic lockstep and state hashing, and `onlineCommandController.js` adapts
  session callbacks to the shared animated resolvers.
- `src/tutorials/` is the tutorial subsystem: `tutorialContent.js` (ids, catalog,
  authored constants, opening scripts), `tutorialMatchSetup.js` (board prep + forced
  rolls), `tutorialValidation.js` (the per-tutorial validate/record state machine),
  `tutorialCpu.js` (the scripted lesson CPU), `tutorialProgress.js` (completion grants +
  select-screen reads), and `tutorialRuntimeHelpers.js`. `basics.js` is a pure barrel —
  keep importing through it.
- `src/audio/` owns the sound catalog and playback engines.
- `src/dev/` (Scenario Sandbox, VFX Gallery) is dev tooling. NOTE: the repo-root
  `.gitignore`'s `dev/` pattern currently keeps this folder untracked.
- `src/main.js` is the browser composition root: DOM refs, view state, controller
  construction/wiring, the render trio, input entry, and boot — nothing else. Cross-
  controller calls flow through hoisted delegate functions so construction order stays
  flexible.

## Stylesheet boundaries

`styles/game.css` is the production entry point and preserves cascade order through imports:

- `styles/battle/board.css`: tokens, layout, board, HUD, units, and targeting surfaces.
- `styles/battle/overlays.css`: dialogue, blackout, Codex, choices, and status overlays.
- `styles/battle/effects.css`: animation, weather, forecasts, impacts, and turn presentation.
- `styles/battle/scene.css`: atmospheric backdrop and in-board environmental scenery.
- `styles/screens/shell.css`: shared menu/setup/results/settings shell.
- `styles/screens/features.css`: online, skins, progression, and tutorial screens.
- `styles/screens/campaign.css`: campaign map and formation editor.
- `styles/screens/polish.css`: shared visual-polish overrides for menu surfaces.
- `styles/responsive.css`: entry point for shell, touch sizing, battle layout, menu layout,
  and performance adaptations in `styles/responsive/`, loaded last.

`styles/dev.css` is the sandbox/gallery entry point and adds `styles/dev-tools.css` without
shipping menu screens. Asset URLs are relative to the stylesheet that declares them.

## Guardrails

- Keep deterministic mechanics out of `src/ui/` and `src/main.js`; cover extracted logic
  with `node:test`.
- Avoid new files above roughly 800 lines. Split by stable responsibility before polishing.
- Generated files such as `skinManifest.generated.js` are exceptions and should stay generated.
- Prefer feature-local CSS. Use `styles/responsive.css` only for cross-feature viewport rules.
- Run `npm test` after changes; `tests/architecture.test.js` protects fresh campaign
  state, CSS entry points, and the module boundaries/line caps above.
- This is unbundled browser ESM: `node --check` cannot prove a named import exists.
  After renames/moves, load the game in a browser (or the headless smoke) at least once.

## Remaining hotspots

- `src/ui/onlineFlow.js` — the remaining bulk is coupled lobby glue: the `wireLobby`
  client-callback handlers, the `tryStart` match handoff, and the ranked matchmaking
  state machine (`startRanked` / `endRankedSearch` / `syncRankedAvailability` /
  `setOnlineMode` / `hydrateRankedIdentityProfile` plus their `rankedMode` / `rankedInfo`
  / `rankedBanFirstSeat` / `rankedIdentityProfile` state). Extracting a ranked-search
  controller is the next planned split, but that state is threaded through
  `syncDraftMembership`, `wireLobby`, `tryStart`, and `onEnter`, so it wants a live
  two-tab playtest alongside the extraction — do not cut it blind.
- `src/ui/battleInputController.js` — `handleTile` / `handleActionClick` are long
  per-mode ladders; the comment-delimited mode blocks are the extraction seams if they
  grow further.
- `src/ui/instantArtPresenter.js` — a per-`artId` if/else ladder; a presenter registry
  (mirroring `ART_RESOLVERS`) is the natural next shape.
- `src/tutorials/tutorialValidation.js` — one cohesive but large state machine; split
  per-tutorial if another tutorial is added.
- Next ART-resolver extraction candidates remain the weather and summoning resolvers.
