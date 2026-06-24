# Last Bastion

Last Bastion is a tactical defense game about turning a collapsing battlefield into a defensible frontline. Read the enemy approaches, choose the right counter units, and hold Blackglass Plateau long enough to secure the core.

## Current play loop

- Deploy Strikers, Guards, Breakers, and Marksmen inside the defensive territory.
- Read visible route scars, terrain chokepoints, enemy entry markers, and each unit's tactical silhouette.
- Use orders to reposition, focus-fire, hold a line, protect an ally, or retreat a damaged defender.
- Build a physical frontline: opposing units now keep space instead of visually passing through each other.
- Earn Gold from defeated enemies to reinforce the position between waves.

## Menu flow

- The title screen now leads into a dedicated mode selection menu.
- Campaign is the only available mode for this build; Endless and Skirmish are intentionally visible but disabled until their rules are scoped.
- Campaign selection, mission briefings, results, and the back action all keep the player inside the same clear navigation flow.

## Campaign content authoring

- `src/data/maps.js` holds authored battlefields. Use `defineBattlefield()` to add world bounds, terrain, deployment zone, enemy paths, labels, and palette; route traces are derived from the paths.
- `src/data/missions.js` holds campaign stages. Each stage selects a `mapId` and uses `defineWaves()` for its timed spawn groups.
- Campaign stage selection, unlocking, and saved progress are handled by the game layer, so a new stage is normally just data: add a map (or reuse one), add its waves, and append the stage to `CAMPAIGN`.

## Matchup model

- Strong matchup: 215% base damage.
- Neutral matchup: 100% base damage.
- Weak matchup: 48% base damage.
- Defender armor is subtracted after the multiplier.

Counter triangle:

- Striker beats Breaker and loses to Guard.
- Guard beats Striker and loses to Breaker.
- Breaker beats Guard and loses to Striker.
- Marksman has no bonus matchup and is weak to Striker.

## Run modular build

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Smoke test

```bash
node tests/smoke.mjs
node tests/campaign.mjs
node tests/menu-flow.mjs
```

The campaign test checks map resolution, wave-path references, route walkability, and linear campaign progression. The smoke test checks route walkability, stationary Hold behavior, manual movement, enemy advance, explicit Attack order completion, return to Hold after a target dies, Gold naming, and the revised mission budget.
