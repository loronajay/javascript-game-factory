# Pre-Release Architecture Cleanup Plan

Status tracking for the pre-release cleanup. One phase = one commit; `npm test` green
between phases. `tests/architecture.test.js` is updated deliberately each phase —
never loosened, only retargeted/tightened.

## Audit summary (2026-07-16)

**Genuinely monolithic (split):**
- `src/tutorials/basics.js` (1742) — content + match setup + 5-way state machine + bespoke scripted CPU + persistence
- `src/ui/menuFlow.js` (1246) — seven unrelated screens in one factory
- `src/main.js` (1308/1325 cap) — composition root carrying the shared resolve loop, turn/reward orchestration, tutorial state mutation
- `src/campaign/campaignMatch.js` (964) — ~280 lines of layout data + imperative mission scripting + assembler
- `src/ui/boardRenderer.js` (918) — ~400 lines of weather/scenery SVG unrelated to targeting render

**Cohesive but with mega-ladders (refactor within / extract seams):**
`battleInputController.js` (~455-line `handleTile`), `instantArtPresenter.js` (per-art if/else ladder),
`reducer.js` (basic-attack pipeline + activation passives), `turnEngine.js` (hazard ticks),
`unitCatalog.js` (weather folding, King commands, AI metadata sub-domains).

**Fine as-is (do not touch):** `shop.js`, `effects.js`, `rules/combat.js`, `soundCatalog.js`,
`hybridAudioEngine.js`, `campaignCutscenes.js`, `vfxCatalog.js`, `onlineFlow.js`.

**Cross-cutting:** `escapeHtml` duplicated in 5 files; `el()` DOM builder in ~12 files;
`chebyshev` reimplemented in tutorials; CPU AoE projection in `ai/plans.js` ignores DEF/Defend;
`cpuController.js` defaults `rng = Math.random`.

## Phases

- [x] **Phase 0 — Prep**: working branch off current state; record green `npm test` baseline.
- [x] **Phase 1 — Shared helper dedup**: new `src/ui/domHelpers.js` (`el`, `escapeHtml`); replaced
      the 12 `el()` and 5 `escapeHtml` local copies; replaced tutorials' `chebyshev` with
      `chebyshevDistance` from `src/rules/movement.js`; also extracted `diceRollReveal.js`
      from `effects.js`, clearing the pre-existing architecture-test cap failure.
- [x] **Phase 2 — main.js back to composition root** (1308 → 797 lines):
      resolve loop → `src/ui/commandResolutionController.js`;
      turn/results + Valor/reward orchestration → `src/ui/matchOutcomeController.js`;
      per-command campaign glue → `src/campaign/campaignMatchHooks.js`;
      tutorial state mutation + command recording → `src/ui/tutorialPresentationController.js`
      (as overridable built-ins so the existing test seams keep working);
      `src/dev/sandbox.js` (696 → 454 lines) now consumes the shared resolution controller —
      its resolve loop can no longer drift from production, enforced by architecture test.
- [x] **Phase 3 — Split menuFlow.js** (1246 → 164 lines): `createMenuFlow` is now a pure
      router; screens live in `campaignMapScreen.js`, `resultsScreen.js`,
      `tutorialMenuScreens.js`, `settingsScreen.js`, `matchSetupScreens.js`, with pure
      view-model helpers in `campaignMenuModel.js` and the menu seat palette
      (`MENU_TEAM_COLORS`) in `teamDisplay.js`; tests updated to import from the new homes;
      per-module caps added to the architecture test.
- [x] **Phase 4 — Split boardRenderer.js** (918 → 516 lines): weather overlay, wall/fire
      figures, and the stone dais → `src/ui/boardAtmosphere.js` (413 lines);
      boardRenderer keeps the targeting/highlight contract only; caps added.
- [x] **Phase 5 — Split campaignMatch.js** (975 → 289 lines): `CAMPAIGN_LAYOUTS` + spawn
      constants → `src/campaign/campaignLayouts.js`; Monk trial →
      `missions/monk-temple-trial/trial.js`; Void Castle split/heal/intro →
      `missions/void-ridden-castle/trial.js`; swamp lattice/fire/ghoul factory →
      `missions/witch-doctor-swamp/layout.js`; campaignMatch keeps config rules +
      `prepareCampaignMatchState` and re-exports the moved surface through the barrel;
      the 45-line teamNames ternary became a lookup table; dead imports dropped.
- [x] **Phase 6 — Split tutorials/basics.js** (1738 → 9-line barrel): `tutorialContent.js`
      (definitions/constants/scripts), `tutorialMatchSetup.js`, `tutorialValidation.js`
      (the 5-tutorial state machine), `tutorialCpu.js` (scripted CPU),
      `tutorialProgress.js` (persistence), `tutorialRuntimeHelpers.js` (shared
      setStage/predicates/pathing); `basics.js` is a pure barrel enforced by the
      architecture test, so all import paths survive.
- [ ] **Phase 7 — Within-file refactors**: `handleTile`/`handleActionClick` → per-mode handler maps;
      `instantArtPresenter` → presenter registry Map (mirrors `ART_RESOLVERS`);
      reducer → `src/core/basicAttack.js` + `src/core/activationPassives.js`;
      turnEngine hazard ticks → `src/core/turnHazards.js`;
      unitCatalog → extract weather folding, `kingCommands.js`, `unitAiMetadata.js`
      (`getEffectiveStats` stays in `unitCatalog.js`).
- [ ] **Phase 8 — CPU fixes (approved behavior change)**: AoE projection through
      `rules/combat.js` resolvers (respect DEF/Defend/team reduction); remove
      `rng = Math.random` default in `cpuController.js`.
- [ ] **Phase 9 — Docs + guardrails**: rewrite `ARCHITECTURE.md` for the new tree (document
      `missions/` subtree, `progression/inventory.js`, new modules; drop resolved hotspots);
      final architecture-test tightening; update CLAUDE.md pointers that moved.

## Verification per phase

- Focused suites while iterating; full `npm test` before each commit.
- After UI-touching phases: serve over local HTTP + headless Chrome boot smoke
  (puppeteer-core, repo-root devDep) — title screen renders, hot-seat match starts;
  campaign mission load after Phase 5; tutorial start after Phase 6.
- `npm run release:audit` at the end.
- Brittle test imports to watch: `tests/architecture.test.js` (hardcoded specifier lists);
  `tests/the-final-battle.test.js`, `tests/void-ridden-castle.test.js`,
  `tests/cpu-campaign-audit.test.js` (deep `missions/` paths — do not rename mission folders).
