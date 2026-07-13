# Tactical Arena architecture

This codebase is organized by game responsibility. New release-polish work should extend
an existing boundary instead of adding behavior to `src/main.js` or a catch-all stylesheet.

## Runtime boundaries

- `src/core/` owns deterministic state transitions, commands, turn flow, and unit data.
- `src/rules/` owns pure legality and combat calculations.
- `src/ai/` plans CPU turns without browser dependencies.
- `src/campaign/` owns campaign content, progression, match preparation, and match-scoped
  campaign bookkeeping. `campaignMeta.js` is presentation/objective observation state;
  it is deliberately outside deterministic battle state. `campaignObservations.js` derives
  objective/dialogue facts from commands and reducer events without owning browser flow.
- `src/ui/` renders and presents state. UI modules may read rules but must not duplicate them.
  `effects.js` composes effect primitives; live token motion is isolated in
  `unitMotionEffects.js`, while DOM/timing and board geometry live in `effectDom.js` and
  `effectEnvironment.js`.
- `src/audio/`, `src/online/`, `src/tutorials/`, and `src/dev/` are isolated adapters/features.
- `src/main.js` is the browser composition root. It wires modules and coordinates presentation;
  new pure logic and reusable controllers should be extracted before this file grows further.

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

## Guardrails from the cleanup audit

- Keep deterministic mechanics out of `src/main.js`; cover extracted logic with `node:test`.
- Avoid new files above roughly 800 lines. Split by stable responsibility before polishing.
- Generated files such as `skinManifest.generated.js` are exceptions and should stay generated.
- Prefer feature-local CSS. Use `styles/responsive.css` only for cross-feature viewport rules.
- Run `npm test` after changes; architecture tests protect fresh campaign state and CSS entry points.

## Remaining hotspots

`src/core/artResolvers.js` remains the generic ART dispatcher, with unit-family resolvers moving
under `src/core/artResolvers/`. Riot Cop mechanics now live in `riotCopResolvers.js`; shared
commander/reactor actions live in `commandResolvers.js`. Continue this family-by-family pattern,
backed by the corresponding unit suites. The next candidates are weather and summoning resolvers,
followed by the command-presentation sections of `src/main.js`.
