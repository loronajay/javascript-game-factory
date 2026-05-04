# Questionable Decisions — Online-First Implementation Plan

## 1. Purpose

This document defines the implementation plan for **Questionable Decisions**, an online multiplayer trivia / party penalty game for Jay’s JavaScript Arcade.

The core requirement is that this game is **online-first from the beginning**. It should not be built as a local trivia game that later becomes multiplayer. Local/dev adapters may exist, but only as test harnesses that submit the same commands real clients submit.

The authoritative game engine must own:

- room membership
- theme voting
- board generation
- turn order
- current active player
- tile selection validation
- answer validation
- scoring
- penalty selection
- penalty eligibility
- penalty results
- match end
- final result payload

The browser client renders authoritative snapshots and submits player commands. The browser client must not directly mutate match state.

This matches the GDD’s core server-owned requirement: clients should not decide correctness, scoring, turn order, penalty selection, penalty eligibility, or final results. :contentReference[oaicite:0]{index=0}

---

## 2. Core Architecture Rule

Questionable Decisions is an online-authoritative party game.

The architecture should be shaped around three layers:

```text
1. Authoritative Match Engine
   Owns rooms, players, theme votes, board state, turns, scoring,
   answer validation, penalty selection, penalty results, and match end.

2. Transport / Room Adapter
   Sends commands into the authoritative engine and broadcasts snapshots/events.
   Dev adapters are allowed only as harnesses.

3. Browser Client
   Renders snapshots, collects input, plays animations, and submits commands.
   It does not own scoring, correctness, turn order, or final results.

The game may use a dev-room adapter for early testing, but that adapter must follow the same command/snapshot contract as the eventual online adapter.

Hard rule:

No local-first gameplay ownership.
No browser-owned scoring.
No browser-owned answer validation.
No browser-owned penalty selection.
No browser-owned final results.
3. Repo Discipline

Follow the project rules from AGENTS.md and CLAUDE.md.

Required implementation constraints:

TDD first.
Prefer small modules with clear ownership.
Do not pile behavior into one large mixed-purpose file.
Use fixed timestep for real-time mini-game logic.
Keep game state updates separate from rendering.
Keep each game self-contained under games/<game-name>/.
Do not add external dependencies without explicit approval.
Platform-owned identity remains platform-owned.
The game may read player identity/session names, but it must not become the long-term owner of profiles, friends, feed state, memories, badges, or notifications.

The repo rules explicitly require fixed timestep logic for games and warn against large mixed-purpose files.

4. Recommended Folder Structure
games/questionable-decisions/
  index.html
  GDD.md
  AGENTS.md

  css/
    questionable-decisions.css

  js/
    client/
      main.js
      renderer.js
      input.js
      snapshot-view-model.js
      reaction-ui.js
      screen-router.js

    shared/
      commands.js
      snapshots.js
      state-machine.js
      board.js
      themes.js
      questions.js
      answer-validator.js
      scoring.js
      turns.js
      penalty-registry.js
      penalty-runner-contract.js
      result-builder.js
      rng.js
      ids.js

    adapters/
      dev-room-adapter.js
      remote-room-adapter.js

  server/
    questionable-decisions-room-engine.js
    questionable-decisions-room-store.js
    questionable-decisions-routes.js
    questionable-decisions-ws.js

  data/
    themes.v1.js

  mini-games/
    cabinet-says/
      GDD.md
      cabinet-says.js
      cabinet-says-state.js
      cabinet-says-scoring.js
      cabinet-says-renderer.js
      cabinet-says-input.js
      tests/

    pattern-panic/
      GDD.md

    bomb-diffuser/
      GDD.md

    stack-overflow/
      GDD.md

  tests/
    shared/
      board.test.js
      answer-validator.test.js
      scoring.test.js
      turns.test.js
      penalty-registry.test.js
      state-machine.test.js
      result-builder.test.js

    server/
      room-engine.test.js
      room-store.test.js
      command-rejection.test.js

    client/
      snapshot-view-model.test.js

Do not create a single game.js that owns everything. This game has too many concerns: room state, trivia state, penalty state, scoring, networking, rendering, reactions, and result publishing. A monolith will become a problem immediately.

5. Command / Snapshot Model

The client sends commands. The authoritative room engine validates commands and emits snapshots/events.

5.1 Example Commands
{
  type: "CREATE_ROOM",
  playerId: "player_1",
  displayName: "Jay"
}
{
  type: "JOIN_ROOM",
  roomCode: "8392",
  playerId: "player_2",
  displayName: "Leo"
}
{
  type: "VOTE_THEME",
  roomId: "room_123",
  playerId: "player_1",
  themeId: "theme_pop_culture"
}
{
  type: "SET_READY",
  roomId: "room_123",
  playerId: "player_1",
  ready: true
}
{
  type: "START_MATCH",
  roomId: "room_123",
  playerId: "player_1"
}
{
  type: "SELECT_TILE",
  roomId: "room_123",
  playerId: "player_1",
  tileId: "tile_001"
}
{
  type: "SUBMIT_ANSWER",
  roomId: "room_123",
  playerId: "player_1",
  answer: "Canberra"
}
{
  type: "PENALTY_INPUT",
  roomId: "room_123",
  playerId: "player_1",
  penaltyId: "cabinet-says",
  input: {
    button: "A"
  }
}
{
  type: "SEND_REACTION",
  roomId: "room_123",
  playerId: "player_2",
  reactionId: "skill-issue"
}
5.2 Example Snapshot
{
  type: "ROOM_SNAPSHOT",
  roomId: "room_123",
  roomCode: "8392",
  status: "QUESTION_ACTIVE",
  hostPlayerId: "player_1",
  currentTurnPlayerId: "player_1",
  turnIndex: 3,
  maxTurns: 12,

  players: [
    {
      playerId: "player_1",
      displayName: "Jay",
      ready: true,
      connected: true,
      themeVote: "theme_pop_culture"
    },
    {
      playerId: "player_2",
      displayName: "Leo",
      ready: true,
      connected: true,
      themeVote: "theme_video_games"
    }
  ],

  selectedThemeId: "theme_pop_culture",

  board: {
    categories: [],
    tiles: []
  },

  scoresByPlayerId: {
    player_1: 300,
    player_2: 100
  },

  activeQuestion: {
    questionId: "q_001",
    tileId: "tile_001",
    pointValue: 200,
    format: "multiple-choice",
    prompt: "Which actor played Jack Sparrow?",
    choices: ["Johnny Depp", "Orlando Bloom", "Brad Pitt", "Keanu Reeves"],
    timeRemainingMs: 12000
  },

  activePenalty: null,

  lastAnswerReveal: null,
  lastPenaltyResult: null,
  reactions: []
}

The client can render this. It cannot decide the outcome.

6. Authoritative State Machine

Use the GDD’s server-owned state list as the base.

LOBBY
THEME_VOTE
MATCH_START
BOARD_VIEW
PLAYER_SELECTING_TILE
QUESTION_ACTIVE
ANSWER_REVEAL
PENALTY_SELECT
PENALTY_INTRO
PENALTY_ACTIVE
PENALTY_RESULTS
SCOREBOARD
NEXT_TURN
MATCH_END

The state machine should reject invalid commands.

Examples:

A non-active player cannot select a tile.
A player cannot select an already-used tile.
A player cannot submit an answer outside QUESTION_ACTIVE.
A spectator cannot submit the active answer.
A player cannot start the match unless they are host.
The match cannot start until player count and ready state are valid.
A penalty result cannot apply twice.
A match cannot continue past its configured turn count.
7. Milestone 1 — Online-Shaped Room Engine
Goal

Build the authoritative room/match engine first.

This is not the polished online experience yet, but it must be architecturally online from day one.

Scope

Implement:

create room
join room
room code generation
lobby player list
connected/disconnected player state
host player ownership
theme voting
ready state
host start
selected theme resolution
board generation
initial scores
turn order
active player tracking
tile selection validation
question activation
answer submission
answer validation
correct answer scoring
correct answer keeps control
wrong answer enters penalty flow
penalty eligibility
stub penalty selection
stub penalty completion
capped score loss
turn pass after penalty
match end by configured turn count
final result payload
Tests Required First
room can be created
player can join by room code
room rejects join above max player count
host can start when valid
non-host cannot start
theme votes are counted
theme vote ties resolve deterministically with seeded RNG
board is generated from selected theme
board has 4 categories and 16 tiles
only active player can select tile
used tile cannot be selected again
answer validation happens in engine
correct answer adds points
correct answer keeps control
wrong answer selects penalty
penalty loss is capped at source question value × 1.5
wrong answer advances turn after penalty
match ends at max turn count
final result payload includes all participants and final scores
Definition of Done
Engine tests pass.
Two simulated clients can submit commands into the same room engine.
The room engine emits snapshots after accepted commands.
Rejected commands return explicit errors.
The browser has not been given authority over scoring, answers, turn order, or results.
8. Milestone 2 — Minimal Browser Client
Goal

Build a minimal client that proves the online-shaped loop.

The UI can be rough. The architecture cannot be fake.

Scope

Implement screens:

Create / Join Room
Lobby
Theme Vote
Ready State
Board
Question
Answer Reveal
Penalty Intro
Penalty Active
Penalty Result
Scoreboard
Final Results

The browser client should:

connect to a room adapter
render snapshots
submit commands
disable invalid controls based on snapshot state
show current player
show current scores
show active question
show used board tiles
show penalty result
show final ranking
Do Not Build Yet
polished animations
full CRT/game-show presentation
real penalty modules
chat
public matchmaking
profile result publishing
memory cards
Definition of Done
Two tabs or two simulated clients can use the same command/snapshot path.
One player can create a room.
Another player can join.
Theme voting works.
Ready/start works.
Board displays.
Active player selects a tile.
Active player submits an answer.
Correct answer updates score and keeps turn.
Wrong answer triggers stub penalty and advances turn.
Match can end and show final results.
9. Milestone 3 — Real Transport Adapter
Goal

Move from dev-room adapter to real private-room transport.

Because this is an online party game, room events should use WebSocket or the existing Factory Network path if it is stable enough.

Polling is not ideal for live questions and penalty viewing.

Minimum Server Events
room_created
player_joined
player_left
player_ready_updated
theme_vote_updated
match_started
tile_selected
question_started
answer_revealed
penalty_selected
penalty_started
penalty_updated
penalty_finished
scoreboard_updated
reaction_sent
match_ended
room_snapshot
command_rejected
Client Responsibility

The client sends commands and receives snapshots/events.

The client does not decide:

whether a command is valid
whether an answer is correct
how many points are awarded
which penalty is selected
whether the match is over
Server Responsibility

The server validates commands, applies state transitions, stores room state, and broadcasts snapshots.

Definition of Done
Two real browser clients can play in the same private room.
Room state remains consistent across clients.
Invalid commands are rejected server-side.
Refresh/reconnect behavior is at least minimally survivable.
Disconnect behavior is defined, even if advanced reconnect polish comes later.
10. Milestone 4 — First Real Penalty: Cabinet Says
Goal

Replace the stub penalty path with one real, fast, watchable penalty.

Use Cabinet Says first because it is clearer than Bomb Diffuser, lighter than Stack Overflow, and does not require drawing/voting like Memory Sketch.

Scope

Implement:

sequence generation from seed
active player input
spectator display
mistake tracking
timer
score loss calculation
normalized penalty result payload
Penalty Input Command
{
  type: "PENALTY_INPUT",
  roomId: "room_123",
  playerId: "player_1",
  penaltyId: "cabinet-says",
  input: {
    button: "A"
  }
}
Penalty Result Payload
{
  roomId: "room_123",
  matchId: "match_123",
  penaltyId: "cabinet-says",
  playerId: "player_1",
  sourceQuestionValue: 300,
  rawPointsLost: 180,
  cappedPointsLost: 180,
  completed: true,
  timedOut: false,
  summary: {
    roundsCleared: 4,
    mistakes: 2
  },
  createdAt: ""
}
Authority Rule

The client may render immediate button feedback, but the authoritative result must come from the penalty runner/state machine.

Definition of Done
Wrong answer can launch Cabinet Says.
Active player can play it.
Spectators can watch it.
Penalty result returns through the shared host contract.
Host applies capped score loss.
Turn advances after result.
11. Milestone 5 — Audience Reactions
Goal

Add the spectator loop early.

For this game, reactions are not decorative. The game’s hook depends on other players watching the penalty and reacting.

The GDD defines preset reactions as part of the V1 audience layer and explicitly defers freeform chat.

Scope

Implement preset reactions:

😂
💀
😬
🔥
👏
Cooked
Skill Issue
No Pressure
Boooo
Respect
Folded
Fraud Watch
Brain Offline
Absolutely Tragic
Let Him Cook
Never Mind, He Burned It
Rules
Reactions are room-local.
Reactions are preset only.
No freeform chat in v1.
Reactions can appear during penalty and answer reveal.
Reactions should not publish to platform activity directly.
Definition of Done
Spectators can send reactions.
Active player can see reactions.
Reactions broadcast to all clients in room.
Reaction spam is lightly rate-limited.
12. Milestone 6 — Remaining V1 Penalties
Recommended Order
1. Cabinet Says
2. Pattern Panic
3. Bomb Diffuser
4. Stack Overflow
Rationale

Cabinet Says is the best first real penalty because it proves the contract cleanly.

Pattern Panic should come second because it keeps the same basic input/spectator shape.

Bomb Diffuser should come third because it introduces control remapping and per-bomb progression.

Stack Overflow should come fourth because drag sorting introduces more input and collision complexity.

Do Not Build Yet
Memory Sketch
Through the Fire
Pressure Typer, unless typing comparison is already cheap
BrainScrambler, unless curated statement content is ready

Memory Sketch is high value but heavy: drawing capture, source-image reveal, spectator grading, averaging, and multi-round progression.

Through the Fire is also high risk for v1 because it is submission/social-pressure heavy and needs moderation boundaries.

The GDD already marks Memory Sketch and Through the Fire as heavier than the fast non-submission penalties.

13. Milestone 7 — Content Expansion
Goal

Expand trivia only after the loop works.

Initial content should not block architecture.

Target
5 themes
4 categories per theme
4 questions per category
16 questions per board
80 total questions

This matches the GDD’s initial content target.

Add Content Validation Script
scripts/validate-questionable-decisions-content.js

Validation should catch:

duplicate question IDs
missing theme IDs
missing category IDs
invalid point values
invalid question formats
missing correct answers
missing accepted answers for typed/fill-blank questions
categories without 4 questions
themes without 4 categories
questions with invalid time limits
board generation failures
14. Milestone 8 — Platform Result Publishing
Goal

Publish match results through the platform game-integration seam.

The game must not directly mutate:

profiles
friend records
notifications
thoughts
memories
badges
activity feeds

The platform receives the result and decides how to display it.

This matches the platform ownership rules in the implementation plan: games may publish approved results/activity payloads, but platform identity and social state remain platform-owned.

Match Result Payload
{
  type: "game-result",
  gameSlug: "questionable-decisions",
  mode: "duel-or-party",
  themeId: "theme_pop_culture",
  roomId: "room_123",
  participantIds: ["player_1", "player_2"],
  winnerPlayerId: "player_2",
  finalScoresByPlayerId: {
    player_1: 900,
    player_2: 1400
  },
  stats: {
    mostCorrectPlayerId: "player_2",
    mostPenalizedPlayerId: "player_1",
    biggestPointLossPlayerId: "player_1",
    biggestPointLossAmount: 400,
    longestStreakPlayerId: "player_2",
    selectedThemeTitle: "Pop Culture",
    worstPenaltyId: "bomb-diffuser"
  },
  createdAt: ""
}
Definition of Done
Final result builder is tested.
Result payload is generated at match end.
Platform publishing uses the shared seam.
No direct profile/social mutations happen inside the game.
15. Milestone 9 — Grid Integration
Scope

Add:

games/questionable-decisions/
grid preview image/video
arcade catalog entry
game card
platform launch path

Verify:

game launches from grid
game reads platform identity safely
game does not overwrite platform profile identity
game can publish final result through platform seam

The repo rule is explicit: canonical player identity belongs to the Factory shell, not individual games.

16. Deferred Scope

Do not build in the first implementation pass:

Memory Sketch
Through the Fire
freeform room chat
voice chat
public matchmaking
ranked ladder
custom user question packs
AI-generated trivia
spectator join from outside room
profile memory cards
full moderation/report tools
seasonal event mode
groups integration

These are valid future features, but they are not foundation work.

17. Testing Strategy
Shared Logic Tests
board generation
theme vote resolution
answer validation
scoring
turn order
state transitions
penalty eligibility
weighted penalty selection
penalty loss cap
match end detection
result payload generation
Server Tests
room creation
join by room code
host-only start
max player count rejection
invalid command rejection
snapshot generation
disconnect handling
reconnect handling, later
Client Tests
snapshot-to-view-model shaping
active player affordance
spectator affordance
used tile rendering state
scoreboard rendering state
reaction rendering state
Penalty Tests

Each penalty gets its own tests for:

seeded setup
input handling
mistake tracking
timer behavior
score loss calculation
normalized result payload
18. Build Order Summary
1. Authoritative room/match engine
2. Command/snapshot contracts
3. Minimal browser client
4. Dev adapter using same command/snapshot path
5. Real private-room transport
6. Stub penalty path
7. Cabinet Says
8. Spectator reactions
9. Pattern Panic
10. Bomb Diffuser
11. Stack Overflow
12. Content expansion
13. Platform result publishing
14. Grid integration
15. Later modules and polish
19. Codex Implementation Prompt
Implement Questionable Decisions as an online-first authoritative party game.

Use games/questionable-decisions/GDD.md as the source of truth. Follow AGENTS.md and CLAUDE.md repo rules: TDD first, vanilla JS, no external dependencies unless explicitly approved, fixed timestep for real-time game loops, small modules, and platform-owned identity boundaries.

Core architecture requirement:
- The browser client must not own correctness, scoring, turn order, penalty selection, penalty eligibility, or final results.
- Build a server-shaped authoritative room engine from the first pass.
- Dev/local adapters are allowed only as test harnesses that submit the same commands real clients submit.
- The client renders authoritative snapshots and sends commands.

Scope for this pass:
1. Create games/questionable-decisions/ structure with client, shared, adapters, server, data, mini-games, css, and tests folders.
2. Implement the authoritative room/match engine:
   - create room
   - join room
   - room code generation
   - lobby player list
   - connected/disconnected player state
   - theme voting
   - ready state
   - host start
   - selected theme resolution
   - board generation from selected theme
   - turn order
   - tile selection validation
   - question activation
   - answer submission
   - answer validation
   - correct answer scoring and same-player control
   - wrong answer penalty selection
   - stub penalty result
   - capped penalty point loss using sourceQuestionValue * 1.5
   - turn pass after penalty
   - match end by turn count
   - final result payload
3. Implement command objects and snapshot objects.
4. Implement a minimal browser client that renders snapshots and submits commands.
5. Implement a dev-room adapter only if needed for manual testing, but it must use the same command/snapshot path as the remote adapter.
6. Add tests before implementation for:
   - board generation
   - theme vote resolution
   - answer validation
   - scoring
   - turn order
   - penalty eligibility
   - state transitions
   - command rejection
   - result building
7. Add stub penalty support only. Do not build full Cabinet Says, Bomb Diffuser, Pattern Panic, Stack Overflow, Memory Sketch, Through the Fire, chat, public matchmaking, ranked ladder, AI trivia, custom question packs, or platform memory cards in this pass.
8. Keep UI minimal: enough for two clients or two simulated clients to create/join a room, vote on theme, ready/start, select tiles, answer questions, trigger a stub penalty, update scores, and finish a match.
9. Game logic must be separated from rendering. Rendering reads snapshots only.
10. Use requestAnimationFrame with a fixed timestep accumulator for any real-time mini-game loop. Do not advance authoritative match state from render.

Definition of done:
- tests pass
- two clients or simulated clients can join the same room path
- theme voting works
- ready/start works
- board is generated by the authoritative engine
- active player can select a tile
- non-active player cannot select a tile
- answer validation happens in the authoritative engine
- correct answer awards points and keeps control
- wrong answer selects a stub penalty
- stub penalty applies capped score loss
- turn advances after penalty
- match ends at turn limit
- final result payload is generated
- browser client never directly mutates match state
20. Hard Boundary

The game’s point is online party pressure.

Do not let implementation drift into a standalone local trivia game.

The correct foundation is:

online-shaped authoritative room engine first,
minimal client second,
real transport third,
real penalties fourth.

Everything else is expansion.