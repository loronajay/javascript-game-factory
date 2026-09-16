# Build Buddy

Build Buddy is a co-op platformer built around two asymmetric roles: the Runner crosses momentum-heavy stages while the Builder places platforms, springs, and checkpoints to keep the route alive. The cabinet is registered on the arcade grid and supports shared-screen local co-op, practice, and public/private online lobby flows across two ten-stage packs.

## Current status

- Pack 01 is ten courses that are each a *problem set* rather than a walk plus one bridge. Every course has at least four build moments and a distinct co-op identity: the recycle bridge (more platforms than the cap, so the Builder pulls tools from behind the Runner), hanging masts caught off a spring, a spring elevator up a slot too narrow for a platform, junk tools that eat the cap and must be cleared, a descent where each shaft is two catches placed in turn because the Builder cannot see the mouth from the top, a double-back that punishes a missing checkpoint, one-of-each-spring lifts decided by height, and low spiked corridors crossed on a flush platform in tap-hops. Solution signs and the HUD route overlay remain removed.
- Pack 02 (harbor biome) is ten more courses in `js/stages/packs/pack-02/` built around the **spike ball**: a floating hazard that rides a cable between two points (vertical, horizontal or diagonal) and back, easing at each end. Its position is a pure function of stage time (`js/hazards.js`), so online clients draw it off the timer already in every snapshot. The rectangle it sweeps is a no-build lane, which is what lets a lane on the deck line force a bridge to go under it. Every ball in the pack is proven to threaten the intended route at the wrong moment, and the Runner is proven to have a safe spot to wait on every deck.
- Courses are authored per pack with the shared vocabulary in `js/stages/course-helpers.js`: `deck`, `gantry`, `climb`, `slab`, `spikes`, `spikeCeiling`, `spikeWall`, `girder`, `lock`, `spikeBall`, and `preplacedTools`. A pack-02 course passes `packId: 'pack_02'`; the registry refuses duplicate or mis-packed stage ids. A route beat may carry `via`, the Builder placements that solve the leg arriving at it. `via` never reaches the runtime stage or the HUD; it is recorded in `courseNotes` for the tests. Every course authors a `kit` — the exact toolbox the Builder brings, e.g. `kit: { platform: 2, springBlue: 1 }`: a type left out is locked for the course, each count is that type's cap, and the shared cap is the sum. Kits replaced the old `rulePreset` table, under which most courses handed out 24 platforms and no tool choice ever mattered.
- Generated sky, city, crane layers and spring sprites replace the old procedural backdrop and spring drawings. See [art files and generation prompts](assets/art/README.md).
- `tests/teamwork.test.mjs` plays every authored `via` through the real Runner physics (run-up jumps, spring bounces — a bounce off the *target* spring, not just the launch — mid-air wall catches, drop-throughs, tap-hops under low ceilings, junk cleanup), with moving hazards running and the Runner free to pick their moment from two dozen start times, proves no build moment can be bypassed by terrain alone (with spiked surfaces, covered floors and low ceilings modelled), checks each placement sits inside the Builder's camera from where the Runner waits, and gates course quality mechanically (at least four build moments, five placements, more than one tool type or a cap that forces recycling, hazards beyond the yard floor). It also holds every kit tight against the course's own `via`: tools are recalled between legs, so the need is the most of a type any one leg places at once; a kit must cover that, may carry at most two spare tools in total, may include an unused type only as a single spare, and must lock or exactly ration at least one tool. These checks complement human two-player playtesting; they do not measure pacing or difficulty.

- Packs 01 and 02 are complete 10-stage packs registered through `js/stages/stage-registry.js`; the pack is picked on Mode Select and drives local runs, practice and online matchmaking (pools are split by `packId`). Each pack's first stage is unlocked from the start.
- Local co-op is one shared screen: the Runner on the keyboard, the Builder on the mouse, both HUDs shown. Online sessions show the assigned role's view only. The prototype's Debug Lab and manual view switching are gone.
- Online play assigns role-specific Runner and Builder clients, exchanges commands/snapshots through `js/online-client.js`, and supports both client-host and server-authoritative match payloads.
- Progression, stage results, run completion, disconnect handling, and online message contracts have Node regression coverage.

The durable stage identifiers use pack/stage coordinates:

```text
Folder:      js/stages/packs/pack-##/
Stage file:  pack-##-stage-##.js
Manifest:    pack-##-manifest.js
Stage ID:    pack_##_stage_##
Display:     Pack ## — Stage ##
```

Add stages through a pack manifest and `stage-registry.js`; do not hardcode stage imports into the browser entry point.

## Run locally

The cabinet uses ES modules, so serve it over HTTP from this folder:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

Runner:

```text
A/D or Left/Right  Move
Space              Jump / wall-jump
W/Up               Climb
S/Down             Descend / drop through one-way platforms
R                  Reposition
```

Builder:

```text
1–5                 Select platform, spring, or checkpoint tool
Left click          Place
Right click         Delete
Q/E                 Nudge builder camera
```


## Structure

- `js/app-controller.js`: browser loop, screen orchestration, and online command routing
- `js/app-shell.js`: pure menu/lobby/session state transitions
- `js/game.js`: fixed-step cabinet simulation
- `js/online-client.js`: WebSocket transport
- `js/online-gameplay.js`: online messages, authority checks, results, and disconnect state
- `js/stages/`: stage authoring helpers, registry, manifests, and content
- `js/render/`: focused rendering modules
- `tests/`: Node coverage for stages, progression, sessions, online contracts, and visual structure

## Tests

From `games/build-buddy/`:

```bash
node --test
```

Build Buddy owns cabinet-local rules and presentation. Durable factory identity remains owned by the shared platform.
