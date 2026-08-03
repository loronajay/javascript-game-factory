# Tactical Arena

Tactical Arena is the flagship isometric tactics cabinet and successor to Mini-Tactics. It combines a deterministic headless rules engine with a 30-unit roster, ARTS and passives, statuses, summons, weather, terrain, skins, progression, and multiple local and online match formats.

## Current product

- Local hot-seat play for 2–4 players, including FFA and 2v2 Teams
- Single-player CPU matches and the separate real-time Tempo Battle mode
- Online Versus with Classic/Draft 1v1, 4-player FFA, and 2v2 Teams
- Server-authoritative Ranked 1v1 matchmaking and results
- A complete 22-mission campaign with progression, objectives, stars, reward choices, and formation editing
- Five learn-to-play tutorials
- Tactical Arena-scoped friends, profiles, and badges
- Valor progression and a Shop for units, skins, and consumables, with server authority for signed-in balances and entitlements
- A packaged Android build under `mobile/tactical-arena/` with Google Play Billing support

Online features require a signed-in factory account. Casual lockstep, ranked authority, account identity, and durable progression have distinct ownership seams; consult the architecture documents before changing their contracts.

## Start here

- `CLAUDE.md`: current product snapshot, invariants, ownership, and change checklist
- `ARCHITECTURE.md`: runtime/module boundaries and remaining hotspots
- `GDD.md`: game-design source of truth
- `SECURITY.md`: trust model, payment/progression authority, and known limits
- `UNIT_AUTHORING_GUIDE.md`: adding or changing units
- `SOCIAL_FEATURES_PLAN.md`: shipped Tactical Arena social layer and remaining chat scope
- `RANKED_FEATURE_PLAN.md`: ranked mode design/history

Proposals such as `RELAY_BATTLE.md` are not automatically shipped scope; check `CLAUDE.md` before treating a planning document as current implementation.

## Architecture

- `src/core/`: deterministic state, commands, reducers, events, and serialization
- `src/rules/`: movement, combat, targeting, status, terrain, and unit rules
- `src/ai/`: CPU planning through the same legal command surface as players
- `src/online/`: transport, lockstep/state hashing, remote command presentation, and ranked flow
- `src/campaign/`: campaign content, match setup, evaluation, progression, and presentation
- `src/tutorials/`: tutorial definitions, validation, scripted CPU, and completion state
- `src/progression/`: ownership, Valor rewards, marketplace, consumables, and sync
- `src/ui/`: screen controllers and match/menu presentation
- `tests/`: Node regression coverage, including architecture and deterministic online contracts

Entry-point and barrel files compose these modules; new business rules should stay in the owning subsystem rather than returning to a large controller.

## Run locally

Serve the repository over HTTP and open `games/tactical-arena/index.html`. The cabinet has no runtime build step, but generated skin and badge manifests are committed and refreshed by the test command.

## Commands

From `games/tactical-arena/`:

```bash
npm test                 # regenerate manifests, then run the full suite
npm run release:audit    # release-readiness checks
npm run release:audit:strict
```

Run a focused test while iterating, then the full suite before handoff. Do not add runtime dependencies or bypass deterministic reducer validation for local, CPU, campaign, tutorial, or online modes.
