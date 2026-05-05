# Build Buddy — Game Design Document

## 1. High-Level Concept

**Build Buddy** is a two-player online cooperative platformer built around asymmetric real-time roles.

Each stage assigns one player as the **Runner** and the other as the **Builder**. The Runner physically traverses the stage using fast momentum platforming. The Builder edits the support layer of the stage in real time by placing, moving, and deleting traversal tools that help the Runner reach the goal before the timer expires.

The core hook is simultaneous co-op execution. The Runner watches the Builder's cursor and ghost previews while running. The Builder watches the Runner's movement while placing tools. Both players solve the route together in real time from different control layers.

A full match is a **10-stage run**. Roles swap after every stage, whether the stage is cleared or failed. At the end of the run, the game displays a 10-card results screen showing the outcome and key metrics for each stage.

---

## 2. Platform Fit

Build Buddy is intended for the JavaScript Game Factory platform as an online two-player game.

The game is valuable to the platform because it exercises reusable systems that will matter across future projects:

- Online two-player matchmaking
- Private lobbies
- Role-based control routing
- Real-time shared state sync
- Runner-follow camera
- Builder-only camera nudge
- Grid-based placement
- Runtime collision objects
- Tool placement validation
- Shared ghost preview visibility
- Sonic-inspired movement controller
- Checkpoint/respawn system
- Stuck-state recovery
- Stage-authored timers
- End-of-run results cards

Build Buddy should be treated as a real co-op platformer, not a small party-game penalty mode.

---

## 3. Match Structure

A match is a **10-stage run**.

Each stage has:

- One Runner
- One Builder
- One authored stage layout
- One stage-specific timer
- One Builder checkpoint placement
- Shared real-time play
- Clear or fail outcome

After every stage, roles swap.

Role swapping happens regardless of whether the stage was cleared or failed.

Example role order:

| Stage | Runner | Builder |
|---|---|---|
| 1 | Player A | Player B |
| 2 | Player B | Player A |
| 3 | Player A | Player B |
| 4 | Player B | Player A |
| 5 | Player A | Player B |
| 6 | Player B | Player A |
| 7 | Player A | Player B |
| 8 | Player B | Player A |
| 9 | Player A | Player B |
| 10 | Player B | Player A |

In a 10-stage run, each player gets exactly 5 Runner stages and 5 Builder stages.

---

## 4. Matchmaking

Build Buddy follows the same online two-player structure as the other Jay Arcade online games.

Supported matchmaking modes:

- Public search
- Private lobby

### 4.1 Public Search

Public search pairs two available players into a Build Buddy match.

Expected flow:

1. Player selects public search.
2. Client connects to the online matchmaking layer.
3. Server places player into the Build Buddy queue.
4. When another player is found, both players enter the same room.
5. Both clients load the match lobby.
6. Match starts after ready/start conditions are satisfied.

Public search should clearly communicate when a match is found and when the game is preparing to start.

### 4.2 Private Lobby

Private lobby allows one player to host and another player to join through a lobby code or invite flow.

Expected flow:

1. Host creates private lobby.
2. Game generates lobby code.
3. Second player joins with code.
4. Both players enter lobby.
5. Host starts the match when ready.

Private lobbies are important because Build Buddy depends heavily on communication and co-op timing.

---

## 5. Stage Structure

Stages are side-view platforming stages.

Stages are not locked to left-to-right traversal. Stage routes may move:

- Left to right
- Right to left
- Bottom to top
- Top to bottom
- Diagonally through the map
- Through mixed ascending and descending routes

Stages are authored with their own terrain, hazards, climbable surfaces, blocked placement zones, no-build zones, and goal zones.

Stages may be authored in a tool such as Tiled.

Each stage defines its own timer based on:

- Route length
- Difficulty
- Hazard density
- Intended traversal strategy
- Expected Builder support requirements

There is no global fixed timer shared by all stages.

Stages should include moments where players naturally slow down, pause briefly, plan, refactor tools, and then continue. Build Buddy is not intended to be nonstop sprinting from start to finish. The intended rhythm is fast movement interrupted by route problems that require Builder support and co-op adjustment.

---

## 6. Stage Success and Failure

A stage is cleared when the Runner reaches the goal before the timer expires.

A stage fails when the timer reaches zero.

On stage failure:

- The match does not end.
- The game records the stage as failed.
- The game advances to the next stage.
- Roles swap.

There is no lives system in the current canon.

There is no death-based time penalty in the current canon.

The timer itself is the stage pressure.

---

## 7. Moment-to-Moment Gameplay

Build Buddy is fully real-time.

During each stage, the Runner and Builder act simultaneously.

The Runner moves through the stage using platforming mechanics while the Builder edits the support layer of the stage in real time.

The Builder's cursor, selected tool, grid hover position, and ghost preview are visible to the Runner as live visual information.

The Runner can see where the Builder is aiming, what tool is being considered, and which grid position the Builder is hovering over.

This is not an approval system.

The Runner does not confirm, reject, or authorize Builder placements.

The Builder places valid tools directly when they choose to place them.

The Builder watches the Runner's movement in real time and reacts to jumps, deaths, missed routes, recovery needs, and upcoming obstacles.

The Runner watches Builder previews in real time and can adjust movement based on where support tools are about to appear.

The core co-op loop is simultaneous execution:

- Runner executes movement.
- Builder edits the route.
- Runner reacts to Builder support.
- Builder reacts to Runner movement.

There is no separate planning phase during active stage play.

---

## 8. Runner Role

The Runner is the active platforming player.

The Runner does not place tools.

The Runner's job is to traverse the stage using:

- Movement skill
- Route reading
- Builder-created tools
- Stage terrain
- Timing
- Recovery after deaths or stuck states

The Runner is not passive. If the Builder can solve the entire stage alone, the design has failed.

---

## 9. Runner Movement Canon

The Runner uses Sonic-inspired momentum platforming.

The target is fast, smooth, acceleration-based platforming without requiring full Sonic slope physics for v1.

### 9.1 Required Movement Features

The Runner has:

- Left/right movement
- Acceleration-based running
- High top speed
- Gradual slowdown when movement input is released
- Braking/skid behavior when reversing direction at high speed
- Jump
- Variable first-jump height based on button hold
- Fixed-height double jump
- Momentum preservation while airborne
- Knuckles-style terrain-limited climbing

### 9.2 Not Required for V1

The following are not required for v1:

- Slope physics
- Loop-de-loops
- Curved terrain acceleration
- Roll
- Spindash
- Dash
- Wall jump

These can be scoped later if needed.

---

## 10. Running and Braking

The Runner does not instantly reach top speed.

Holding a movement direction accelerates the Runner toward top speed.

Releasing movement input causes gradual slowdown.

Pressing the opposite direction while moving quickly causes braking/skid behavior before the Runner reverses direction.

The Runner should feel fast and momentum-heavy, but still controllable.

---

## 11. Jumping

The Runner's first jump has variable height.

A short button press creates a shorter jump.

A longer button hold creates a higher jump up to the jump-height cap.

Horizontal momentum is preserved during jumps.

---

## 12. Double Jump

The Runner has one double jump while airborne.

The double jump has fixed height.

The double jump preserves current horizontal momentum.

The double jump does not have variable height.

The double jump does not restore after bouncing on a spring/trampoline.

The double jump restores only when the Runner touches valid grounded terrain or another explicitly approved reset surface.

---

## 13. Climbing

The Runner has a Knuckles-style climb mechanic.

Climbing is limited to terrain tagged as climbable.

The Runner cannot climb every wall.

When the Runner contacts climbable terrain from the side, the Runner immediately stops horizontal momentum and enters climb state.

This applies even at high speed.

While climbing, the Runner may move along the climbable surface.

The Runner may jump off a climbable surface.

Climb jump has minimal height gain.

The climb jump exists mainly to exit or reposition from a climb, not to skip climb-route design.

The Runner exits climb state when:

- Jumping off
- Reaching valid standing terrain
- Falling off the climbable surface
- Losing contact with climbable terrain

---

## 14. Hazards and Respawn

Lethal hazards instantly kill the Runner.

Examples include:

- Spikes
- Fire
- Lava
- Electricity
- Crushers
- Other explicitly lethal stage hazards

There is no health meter.

There is no stun state.

There is no knockback recovery.

There are no lives.

When the Runner dies, they respawn at the activated Builder checkpoint if available.

If no Builder checkpoint has been activated, the Runner respawns at the stage start or a stage-authored fallback checkpoint.

Runner death does not remove, reset, refund, or alter Builder tools.

All placed tools remain in the stage after Runner death.

There is no time penalty on death.

---

## 15. Runner Reposition

Runner Reposition exists only as a stuck-state recovery action.

It is not a movement ability, shortcut, dodge, teleport, or route-optimization mechanic.

Runner Reposition rolls the Runner back through recent progress/time using a stored safe-state buffer. It does not search for the nearest floor by geometry and it does not move the Runner forward in route progress.

### 15.1 Safe Grounded State Buffer

The game tracks the Runner's last **3 valid safe grounded states**.

Stored states must be separated by a minimum time interval so the buffer does not fill with nearly identical frames.

Recommended interval: **1.0 to 1.5 seconds** between stored states.

A safe grounded state should record:

```js
{
  x,
  y,
  facingDirection,
  stageRegionId,
  timestamp,
  sourceType // "stageFloor" | "builderPlatform" | "checkpoint"
}
```

### 15.2 Safe State Requirements

A grounded state can be stored only if:

- The Runner is grounded.
- The Runner is not touching a lethal hazard.
- The Runner is not overlapping a Builder ghost preview.
- The Runner is not inside a no-build safety zone conflict with a placed object.
- The Runner has enough headroom to stand.
- The floor beneath the Runner is stable.
- The Runner is not currently being bounced.
- The Runner is not climbing.
- The Runner is not dying.
- The Runner is not respawning.
- The Runner is not inside a forced movement transition.
- The position is not inside a blocked/no-reset zone.

Safe states on stage-authored floors should be preferred over safe states on Builder tools when possible, because Builder tools may later move.

### 15.3 Reposition Behavior

When Runner Reposition is used:

1. The game checks the second most recent valid safe grounded state.
2. If that state is still valid, the Runner is moved there.
3. If that state is no longer valid, the game checks the third most recent valid safe grounded state.
4. If no buffered safe state is valid, the Runner respawns at the activated Builder checkpoint.
5. If no Builder checkpoint is active, the Runner respawns at the stage start or stage-authored fallback checkpoint.

Runner Reposition uses the second most recent safe grounded state instead of the most recent one because the newest state may be part of the stuck setup.

### 15.4 Reposition Restrictions

Runner Reposition:

- Does not count as a death.
- Does not remove Builder tools.
- Does not reset Builder tools.
- Does not restore the Builder checkpoint.
- Does not alter the timer.
- Cannot move the Runner forward through the stage.
- Cannot place the Runner inside the goal zone.
- Cannot place the Runner beyond locked progression gates.
- Cannot place the Runner inside blocked/no-reset zones.

After using Runner Reposition, the Runner cannot use it again until they reach a new valid safe grounded state.

This prevents reposition from becoming a spammable movement tool.

### 15.5 Reposition Tracking

The game should track Runner Reposition usage internally.

Suggested metric:

```js
runnerRepositions: 1
```

This metric does not need to appear on the results cards in the current canon.

---

## 16. Builder Role

The Builder uses an editor-style interface to place traversal tools into the stage.

The Builder does not control a physical character.

The Builder supports the Runner by placing, moving, and deleting tools in real time.

The Builder is not asking the Runner for approval. The Builder acts directly.

The Builder must read the route, watch the Runner, and make quick placement decisions under timer pressure.

---

## 17. Builder Toolkit

All canon tools are available on every stage.

There are no stage-specific toolkit restrictions.

Stages are balanced around the full toolkit being available.

The Builder's toolkit is displayed in a HUD element.

Each tool has its own toolkit entry and label.

The current canon toolkit includes:

- Standard one-way platform
- Yellow low-bounce spring
- Green medium-bounce spring
- Blue high-bounce spring
- Builder checkpoint

Additional tools may be scoped later.

---

## 18. Builder Tool Caps

There is no Build Energy budget.

Builder freedom is constrained by active tool caps, placement rules, no-build zones, camera limits, and tool-specific validation.

### 18.1 Total Active Tool Cap

The Builder may have up to **20 active placed tools** at once.

The checkpoint does not count against the 20-tool cap.

This cap exists to prevent:

- Tool flooding
- Rendering overload
- Collision overload
- Abuse cases
- Stage readability collapse

Stages should be scoped so that 20 active tools is enough to solve the route when used well.

### 18.2 Per-Tool Active Caps

Each individual tool type is capped at **5 active uses at a time**.

Current per-tool caps:

| Tool | Active Cap |
|---|---:|
| Standard one-way platform | 5 |
| Yellow low-bounce spring | 5 |
| Green medium-bounce spring | 5 |
| Blue high-bounce spring | 5 |
| Builder checkpoint | 1 per stage |

The checkpoint is separate from the 20-tool cap and cannot be moved, deleted, or re-placed after placement.

Per-tool caps prevent the Builder from solving every stage by flooding one tool type, such as placing 20 platforms.

---

## 19. Builder Placement Interface

The Builder selects tools from the HUD toolkit.

When a tool is selected and the Builder hovers over the placement grid, a ghost preview is displayed.

The ghost preview is visible to both players.

The ghost preview communicates the Builder's current intent in real time.

If the placement is valid, the Builder may place the tool.

If the placement is invalid, the preview shows a clear invalid marker, such as an X.

The invalid marker communicates that the tool cannot be placed at the current location.

The Runner can see the Builder preview, but this is informational only. It is not an approval request.

### 19.1 Grid Visibility

The Builder sees the placement grid behind gameplay elements.

The Runner does not need to see the full grid.

The Runner sees the Builder cursor/tool hover as a ghosted preview snapped to the grid position.

The ghost preview should be simple, semi-transparent, and readable without blocking hazards or Runner movement.

---

## 20. Builder Placement Rules

Builder tools use grid placement.

The grid should support clean, readable placement without making the world feel overly restrictive.

Tools must pass placement validation before being placed.

General placement restrictions:

- Tools cannot be placed on top of the Runner.
- Tools cannot be placed inside the Runner safety no-build zone.
- Tools cannot be moved into the Runner safety no-build zone.
- Tools cannot overlap invalid terrain.
- Tools cannot overlap blocked placement zones.
- Tools cannot be placed outside stage bounds.
- Tools cannot violate tool-specific placement rules.
- Tools cannot exceed the 20 active tool cap.
- Tools cannot exceed their per-tool active cap.
- Tools cannot be moved or deleted while in use.

Stages may include no-build zones and restricted placement zones where needed.

No-build zones may be used near starts, goals, hazard layouts, tight challenge sections, or areas where Builder placement would break the intended route.

---

## 21. Runner Safety No-Build Zone

The Runner has an invisible safety no-build zone around them.

This safety zone follows the Runner during active gameplay.

The Builder cannot place tools inside this zone.

The Builder cannot move tools into this zone.

The safety zone must be larger than the Runner's collision box so tools cannot be placed close enough to crush, pin, trap, or seal the Runner.

The safety zone exists to prevent stuck states and collision bugs.

The safety zone is not intended to prevent every bad Builder decision. It is specifically an anti-break and anti-trap system.

---

## 22. Moving and Deleting Tools

Builder tools are not permanent, except for the checkpoint.

Placed tools remain static until the Builder interacts with them.

The Builder can delete a hovered placed tool instantly.

The Builder can move a hovered placed tool, subject to placement validation.

Tools cannot be moved or deleted while they are in use.

A tool counts as in use if the Runner is:

- Standing on it
- Touching it
- Climbing it
- Bouncing from it
- Overlapping it
- Otherwise actively interacting with it

The checkpoint is the only placed object that cannot be moved or deleted after placement.

Mistakes, bad placements, and accidental deletions are acceptable parts of the game. The design should prevent technical breakage and hard stuck states, not prevent every poor decision.

---

## 23. Builder Camera

The Runner has the primary gameplay camera.

The Builder sees the Runner's general active play area.

The Builder is locked to the Runner's view area but may nudge their own camera slightly ahead, behind, above, or below the Runner.

This limited Builder camera nudge allows light scouting and placement planning.

The Builder cannot detach from the Runner or inspect large future sections of the stage.

The Builder's camera nudge affects only the Builder's view.

The Runner's camera does not shift when the Builder looks around.

The Runner keeps a normal Runner-follow view.

---

## 24. Respawn Placement Lock

When the Runner dies and is in the respawn state, Builder placement is paused.

The Builder remains locked to the Runner-follow context during respawn.

The Builder cannot continue building ahead while the Runner is dead.

After the Runner respawns and progress resumes, both players continue solving and refactoring the route together from the current visible area.

---

## 25. Builder Checkpoint

Each stage gives the Builder exactly one checkpoint placement.

The checkpoint is available as a Builder tool.

Once placed, the checkpoint cannot be moved, deleted, refunded, or placed again.

The checkpoint activates only after the Runner touches it.

After activation, Runner deaths respawn at that checkpoint.

If the checkpoint is placed poorly, that is part of the stage outcome.

The Builder must place it carefully.

### 25.1 Checkpoint Restrictions

The checkpoint must follow placement validation.

Checkpoint restrictions:

- Cannot be placed on top of the Runner.
- Cannot be placed inside the Runner safety no-build zone.
- Cannot overlap terrain.
- Cannot overlap hazards.
- Cannot be placed outside stage bounds.
- Cannot be placed inside the goal zone.
- Cannot be moved after placement.
- Cannot be deleted after placement.
- Cannot be re-placed after placement.

For v1, the checkpoint should require valid floor or platform support.

Floating checkpoints are not part of the current canon.

### 25.2 Strict Checkpoint Used Flag

`checkpointUsed` is flagged strictly by whether the Runner respawned from the Builder checkpoint at least once.

The checkpoint is considered **not used** if:

- It was never placed.
- It was placed but never activated.
- It was placed and activated, but the Runner never respawned from it.

Only actual respawn from the Builder checkpoint counts as checkpoint use.

### 25.3 Checkpoint Reward

If players clear a stage without using the Builder checkpoint as a respawn point, they receive a **-10 second result reward** for that stage.

This reward is displayed on the results screen.

The reward applies only to cleared stages.

The reward does not mutate the live gameplay timer during the stage.

The reward modifies the final displayed stage result time.

Example:

- Actual clear time: `01:12:40`
- Checkpoint unused reward: `-00:10:00`
- Final stage time: `01:02:40`

The display format should include:

- `Checkpoint used: Yes`
- `Checkpoint used: No -00:10:00`

When the checkpoint is not used, the `-00:10:00` reward text should display in green.

---

## 26. Standard Builder Platform Tool

The Builder has one standard platform size.

Builder platforms are one-way platforms.

Platform behavior:

- Runner can land on them from above.
- Runner can jump through them from below.
- Runner can intentionally drop through them by pressing down while idle or grounded on the platform.
- Platforms do not block horizontal movement like solid walls.
- Platforms can be moved or deleted when not in use.
- Platforms cannot be moved or deleted while the Runner is standing on them or otherwise interacting with them.

Stages still contain their own hard-mapped solid terrain and platforms.

Builder platforms are support tools, not replacements for authored level geometry.

---

## 27. Spring / Trampoline Tools

The Builder has three separate spring/trampoline tools.

Each spring has its own toolkit entry and label.

Spring color coding:

- Yellow = low bounce
- Green = medium bounce
- Blue = high bounce

Each spring has a fixed bounce height.

Bounce height does not depend on:

- Fall speed
- Horizontal speed
- Incoming velocity
- Button hold
- Runner momentum

Springs can be placed in open air.

Springs have collision.

The Runner cannot pass freely through springs.

The Runner must land on the active top surface to bounce.

Spring bounce does not restore double jump.

Springs can be moved or deleted only when not in use.

Tool-specific placement and collision rules must prevent springs from being moved into the Runner or placed inside the Runner safety no-build zone.

---

## 28. Tool Interaction Rules

Each Builder tool defines its own interaction behavior.

Some tools are one-way.

Some tools are solid.

Some tools may be climbable.

Some tools may trigger bounce.

Some tools may catch, redirect, or support the Runner.

Tool behavior must be explicit per tool.

Avoid vague depth-lane language unless a real depth system is implemented.

For current canon, describe these as tool-specific collision and pass-through rules.

---

## 29. Results Screen

At the end of the 10-stage run, the game displays the results of each stage.

Results are shown as **10 stage cards**.

Each card represents one stage.

Each card uses a blurred background tile/image from that stage.

The blur exists so result text remains readable over the stage image.

Each stage card displays:

- Stage number
- Clear or Fail
- Runner
- Builder
- Time cleared, if cleared
- Runner deaths
- Tool use count
- Checkpoint used result
- Final stage time, if cleared

If a stage failed, time cleared and final stage time are omitted or shown as not applicable.

The results screen does not currently calculate score.

Scoring may be scoped later.

For now, rewards and progression should be results-based rather than score-based.

### 29.1 Locked Result Metrics

The locked per-stage result metrics are:

- Clear/fail outcome
- Runner player
- Builder player
- Time cleared, if cleared
- Runner deaths
- Tool use count
- Checkpoint used: Yes/No
- Checkpoint unused reward: `-00:10:00` in green when applicable
- Final stage time after checkpoint reward, if cleared

No score is required for the current canon.

### 29.2 Checkpoint Result Display

The checkpoint result line should display one of the following:

`Checkpoint used: Yes`

or

`Checkpoint used: No -00:10:00`

When displaying `Checkpoint used: No -00:10:00`, the `-00:10:00` reward value should be green.

This communicates that avoiding checkpoint respawn usage is a positive result-based reward.

### 29.3 Time Display

For cleared stages, the results card should show the actual clear time and the final stage time if a checkpoint reward was applied.

Recommended format when checkpoint was used:

- `Time cleared: 01:12:40`
- `Checkpoint used: Yes`
- `Final stage time: 01:12:40`

Recommended format when checkpoint was not used:

- `Time cleared: 01:12:40`
- `Checkpoint used: No -00:10:00`
- `Final stage time: 01:02:40`

The checkpoint reward should be reflected in the final stage time.

---

## 30. Tool Use Count

The results card tracks `toolUseCount`.

For current canon, `toolUseCount` means successful tool placements.

Moving or deleting a tool should not increase `toolUseCount`.

Tool moves and deletes may be tracked internally later, but they are not part of the locked results card metrics.

---

## 31. Suggested Stage Result Data

Each stage should produce a result object that supports the final 10-card results screen.

Suggested shape:

```js
{
  stageIndex: 1,
  stageId: "gap_intro_01",

  runnerPlayerId: "playerA",
  builderPlayerId: "playerB",

  outcome: "clear", // "clear" | "fail"
  failReason: null, // null | "timer" | "disconnect" | "softlock"

  timeLimitMs: 90000,
  timeClearedMs: 72400,
  checkpointUnusedRewardMs: 10000,
  finalStageTimeMs: 62400,

  runnerDeaths: 2,
  runnerRepositions: 1,

  toolUseCount: 18,

  checkpointPlaced: true,
  checkpointActivated: true,
  checkpointUsedForRespawn: false
}
```

The UI can derive the result line from `checkpointUsedForRespawn`.

If `checkpointUsedForRespawn` is true, display:

`Checkpoint used: Yes`

If `checkpointUsedForRespawn` is false and the stage was cleared, display:

`Checkpoint used: No -00:10:00`

The reward display should be green.

Runner Reposition usage is tracked internally but does not need to be shown on the results card in the current canon.

---

## 32. Online Sync Requirements

Build Buddy requires real-time state sync because both players affect the active stage at the same time.

Authoritative state should include:

- Match ID
- Stage ID
- Stage timer
- Role assignment
- Runner position
- Runner velocity
- Runner grounded/climbing/dead/respawning state
- Runner safe grounded state buffer
- Runner reposition events
- Builder selected tool
- Builder cursor position
- Builder grid hover position
- Builder ghost preview state
- Builder camera nudge state
- Placed tools
- Tool placement events
- Tool move events
- Tool delete events
- Tool in-use state
- Tool cap state
- Checkpoint placed state
- Checkpoint activated state
- Checkpoint used-for-respawn state
- Runner death count
- Stage clear/fail event
- Stage result object

The Builder's cursor and ghost preview are part of the live co-op communication layer and should be synced clearly enough for the Runner to read.

### 32.1 Recommended Sync Model

Rollback netcode is not the first target for Build Buddy v1.

Build Buddy should use an authoritative room host/server model for gameplay-critical events.

Recommended split:

- Builder cursor and ghost preview: high-frequency, non-authoritative visual state.
- Tool placement/move/delete: reliable ordered events with authoritative validation.
- Placed tool collision: only active after confirmed authoritative spawn/update.
- Runner movement: client-predicted where needed, periodically reconciled.
- Hazards, death, checkpoint respawn, Runner Reposition, and goal clear: authority-confirmed.
- Stage timer and results: authority-owned.

The client may visually preview a placement immediately, but gameplay collision should not apply until confirmation.

Do not treat ghost previews and real collision tools as the same type of network state.

---

## 33. Implementation Risks

### 33.1 Runtime Collision Mutation

The Builder places collision objects during active gameplay.

This means the Runner's collision system must recognize new platforms, springs, and future tools immediately and reliably.

Runtime collision mutation is a core requirement, not optional polish.

### 33.2 No Budget Means Placement Validation Carries More Weight

There is no Build Energy budget.

Because of that, the following systems are mandatory:

- 20 active tool cap
- 5 active cap per tool type
- No-build zones
- Runner safety no-build zone
- Tool-specific placement validation
- Tool-specific collision rules
- Builder camera leash
- In-use lockout for moving/deleting tools
- Runner Reposition stuck recovery

Without these, the game will be easy to break.

### 33.3 Shared Preview Must Not Become Approval UI

The Runner seeing the Builder's ghost preview is only live information.

It must not become an approval, prompt, confirmation, or vote mechanic.

The Builder acts directly.

### 33.4 Sonic-Like Movement Without Slopes

The Sonic-inspired feel must come from acceleration, top speed, braking, air momentum, and jump handling.

Slope physics are not required for v1.

Trying to implement full Sonic terrain physics too early would add risk without being necessary for the core co-op loop.

### 33.5 Stuck Recovery Must Not Become Teleport Tech

Runner Reposition must roll back through recent safe grounded states in progress/time.

It must not choose the nearest floor by geometry.

It must not move the Runner forward.

It must not be reusable until the Runner reaches a new valid safe grounded state.

---

## 34. Current Canon Summary

Build Buddy is a two-player online co-op platformer where one player runs and the other builds.

A match is a 10-stage run.

Roles swap after every stage.

Stages are side-view but can route in any direction through the map.

The Runner uses Sonic-inspired momentum movement, braking, variable first jump, fixed double jump, and terrain-limited climbing.

The Builder places tools in real time using a grid-based editor HUD.

The Runner can see the Builder's cursor, selected tool, grid hover, and ghost preview live during gameplay.

There is no Runner approval phase.

All tools are available on every stage.

There is no build energy budget.

The Builder is limited to 20 active tools to prevent abuse and technical issues.

Each non-checkpoint tool type is capped at 5 active uses at a time.

The Runner has an invisible safety no-build zone to prevent tool placement traps and collision breakage.

The Runner has a Reposition action that rolls them back to the second most recent valid safe grounded state from a timed safe-state buffer.

The Builder has one checkpoint placement per stage.

The checkpoint is permanent once placed.

Checkpoint use is flagged only if the Runner respawns from it.

A cleared stage with no checkpoint respawn usage receives a -10 second result reward.

All other tools can be moved or deleted when not in use.

The Runner and Builder share the same gameplay context, but the Builder can slightly nudge their own camera for limited scouting.

The Runner's camera is not affected by Builder scouting.

Stage failure advances the run instead of ending the match.

Runner deaths do not remove Builder tools and do not apply a time penalty.

After 10 stages, the game displays 10 result cards showing clear/fail, roles, time cleared, Runner deaths, tool use count, checkpoint usage result, and final stage time.
