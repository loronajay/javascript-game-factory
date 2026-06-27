# Questionable Decisions — Base Game Design Document

## 1. Overview

**Title:** Questionable Decisions  
**Genre:** Multiplayer trivia / party penalty game  
**Players:** 2–6  
**Modes:** Duel Mode, Party Mode  
**Platform Role:** Online multiplayer game for Jay's JavaScript Arcade / JavaScript Game Factory platform  
**Primary Hook:** Correct answers let a player keep control of the trivia board. Wrong answers trigger a penalty mini-game where the player can lose points while the rest of the lobby watches and reacts.

Questionable Decisions is a multiplayer trivia game built around public pressure, streaks, reversals, and spectator-friendly punishment moments. Players compete on a shared trivia board. On each turn, the active player chooses a category and question. Correct answers award points and allow the same player to keep control. Wrong answers trigger a randomly selected penalty mini-game. The penalty result determines how many points the player loses before control passes to the next player.

Core rule:

```text
Correct answer = gain points and keep control.
Wrong answer = penalty mini-game, lose points, then pass the turn.
```

The game should feel like a trivia game-show board crossed with a party-game penalty wheel. It supports focused head-to-head competition in Duel Mode and chaotic group play in Party Mode.

---

## 2. Product Positioning

Questionable Decisions adds a third major game shape to the platform lineup: a social trivia/party game built around spectatorship, reactions, and memory-worthy failure moments.

Its platform value comes from:

- challenge invites
- rematches
- group lobbies
- spectator reactions
- profile activity
- post-game highlights
- rivalry statistics
- party-session memories

The game is platform-integrated but game-owned. It publishes match results, activity payloads, and memory-worthy events through the platform game-integration seam. It must not directly own profiles, friends, notifications, thoughts, badges, memories, or long-term social state.

---

## 3. Design Goals

1. **Make trivia socially tense.**  
   The pressure should come from public consequences, not only right-or-wrong scoring.

2. **Reward streaks without letting one player dominate forever.**  
   Correct answers keep control, but fixed match length and penalty risk prevent runaway pacing from becoming stale.

3. **Make wrong answers entertaining for everyone.**  
   Penalty mini-games should be readable, watchable, and reaction-friendly.

4. **Support both competitive and party sessions.**  
   Duel Mode should feel fast and personal. Party Mode should feel chaotic and social.

5. **Keep moderation risk contained in v1.**  
   Curated trivia, preset reactions, and no freeform chat in v1 reduce abuse and implementation complexity.

6. **Use server-owned authority for game-critical state.**  
   Clients render and collect input, but the server owns correctness, scoring, turn order, penalty selection, and final results.

---

## 4. Player Count and Modes

## 4.1 Player Count

- **Minimum:** 2 players
- **Maximum:** 6 players

## 4.2 Duel Mode

Duel Mode supports 2 players.

This mode is for head-to-head competition. It should feel fast, personal, and replayable. The opponent watches every penalty and can react while the penalized player loses points.

Best use cases:

- direct challenges
- rematches
- rivalries
- quick sessions
- profile activity posts

## 4.3 Party Mode

Party Mode supports 3–6 players.

This mode is for group play. Players rotate turns, watch penalties, react, vote on trivia themes, and eventually use room chat in later versions.

Best use cases:

- friend groups
- party lobbies
- future events
- social moments
- platform memory cards

---

## 5. Core Game Loop

1. Players join a private room.
2. Players vote on the trivia theme.
3. The winning theme determines the trivia board.
4. The server builds a board from curated questions.
5. Players take turns choosing category/question tiles.
6. Correct answers award points and allow the same player to keep control.
7. Wrong answers trigger a random eligible penalty mini-game.
8. Penalty results subtract points from the active player.
9. After a penalty, the turn passes to the next player.
10. The match ends after the configured turn count or future board-clear rules.
11. Final results publish through the platform game-integration seam.

## 5.1 Turn Flow

```text
BOARD_VIEW
→ ACTIVE_PLAYER_SELECTS_TILE
→ QUESTION_ACTIVE
→ ANSWER_REVEAL
→ IF CORRECT: AWARD POINTS + SAME PLAYER CONTINUES
→ IF WRONG: RANDOM PENALTY MINI-GAME
→ PENALTY_RESULT
→ TURN PASSES
```

## 5.2 Control Rule

```text
Correct answer = keep going.
Wrong answer = penalty + pass the turn.
```

This creates streaks, pressure, jealousy, reversals, and comedy.

---

## 6. Trivia Board

## 6.1 V1 Board Size

Recommended v1 board:

- 4 categories
- 4 difficulty tiers
- 16 total tiles

## 6.2 Point Values

```text
100
200
300
400
```

## 6.3 Rationale

A 4×4 board is the correct v1 scope. Penalty mini-games add time to each wrong answer, so a larger board is unnecessary for the first playable version. A 5×5 board can be added later after pacing is validated.

## 6.4 Future Board Expansion

Later versions may add:

- 5×5 boards
- 500-point questions
- cursed tiles
- final wager
- seasonal boards
- special event boards
- theme mashups
- board-clear mode

---

## 7. Theme Voting

Before the match starts, players vote on the overall trivia theme.

Theme voting prevents the game from being locked into one trivia category and makes each lobby feel different.

## 7.1 Lobby Theme Flow

1. Players join room.
2. Each player votes for one theme.
3. Theme with most votes wins.
4. Ties are resolved randomly among tied themes.
5. Server builds the board from the winning theme.

## 7.2 V1 Theme Rule

Do not allow custom user-made themes in v1. Use curated packs only.

User-generated trivia creates moderation, quality-control, and answer-validation problems. It should not be added until the core game is stable and moderation tools exist.

## 7.3 Recommended V1 Themes

Initial candidate themes:

- Video Games
- Pop Culture
- General Knowledge
- 2000s / 2010s Nostalgia
- Movies & TV
- Weird Science
- Internet Brain
- Food & Drink
- Sports

## 7.4 Initial Content Target

Recommended starting content:

- 5 themes
- 4 categories per theme
- 4 questions per category
- 16 questions per board
- 80 total questions

This is enough to test game structure without creating a large content workload.

---

## 8. Question Formats

V1 supports multiple question formats, but not every possible trivia type.

## 8.1 V1 Formats

- True / False
- Multiple Choice
- Fill in the Blank
- Typed Answer

## 8.2 Later Formats

- Numeric Answer
- Order / Sequence
- Odd One Out
- Image Question
- Audio Question
- Speed Buzz Question
- Group Wager
- Final Question

## 8.3 Question Object

```js
{
  id: "q_001",
  themeId: "theme_pop_culture",
  categoryId: "cat_movie_tv",
  pointValue: 200,
  format: "multiple-choice",
  prompt: "Which actor played Jack Sparrow?",
  choices: ["Johnny Depp", "Orlando Bloom", "Brad Pitt", "Keanu Reeves"],
  correctAnswer: "Johnny Depp",
  acceptedAnswers: ["johnny depp", "depp"],
  timeLimitSeconds: 15
}
```

## 8.4 True / False Example

```js
{
  id: "q_002",
  themeId: "theme_science",
  categoryId: "cat_space",
  pointValue: 100,
  format: "true-false",
  prompt: "Venus is hotter than Mercury.",
  correctAnswer: true,
  timeLimitSeconds: 10
}
```

## 8.5 Fill-in-the-Blank Example

```js
{
  id: "q_003",
  themeId: "theme_2000s",
  categoryId: "cat_old_internet",
  pointValue: 300,
  format: "fill-blank",
  prompt: "The Nintendo Wii launched in the year ____.",
  correctAnswer: "2006",
  acceptedAnswers: ["2006"],
  timeLimitSeconds: 15
}
```

## 8.6 Typed Answer Example

```js
{
  id: "q_004",
  themeId: "theme_general",
  categoryId: "cat_geography",
  pointValue: 400,
  format: "typed-answer",
  prompt: "What is the capital city of Australia?",
  correctAnswer: "Canberra",
  acceptedAnswers: ["canberra"],
  timeLimitSeconds: 15
}
```

---

## 9. Answer Validation

Answer validation must feel fair. The validator should be strict enough to avoid arguments and predictable enough that players understand why an answer passed or failed.

Normalize typed answers by:

- lowercasing
- trimming whitespace
- collapsing repeated spaces
- stripping trailing punctuation
- checking accepted aliases
- supporting numeric equivalents where obvious

Avoid broad fuzzy matching in v1. Bad fuzzy matching will cause more complaints than it solves.

Accept examples:

```text
canberra
Canberra
canberra.
```

Do not automatically accept examples:

```text
canbera
canada
that one city
```

If players lose points because the validator is sloppy, the game will feel rigged.

---

## 10. Scoring

## 10.1 Correct Answer

A correct answer awards the tile value and allows the player to keep control.

Example:

```text
200-point question correct = +200 points
```

## 10.2 Wrong Answer

A wrong answer gives no trivia points. Instead, a random eligible penalty mini-game triggers. The resulting penalty subtracts points from the active player. After the penalty, the turn passes.

## 10.3 Penalty Loss Scaling

Penalty loss should scale with the missed question value:

- 100-point miss = light penalty range
- 200-point miss = moderate penalty range
- 300-point miss = high penalty range
- 400-point miss = severe penalty range

Use per-mini-game scoring. Do not force one universal miss rule onto every penalty module.

## 10.4 Global Penalty Loss Cap

Maximum penalty loss:

```text
source question value × 1.5
```

Examples:

```text
100-point miss → max loss 150
200-point miss → max loss 300
300-point miss → max loss 450
400-point miss → max loss 600
```

The cap prevents one penalty from making the rest of the match pointless.

---

## 11. Penalty Mini-Game System

Penalty mini-games are separate modules with their own GDD documents. The base Questionable Decisions GDD does not define each penalty's internal mechanics.

This document only defines how the host game selects, launches, receives results from, and scores penalty modules.

## 11.1 Penalty Selection Rule

When a player answers wrong:

1. Server checks eligible penalty mini-games.
2. Server filters by player count, room settings, and version availability.
3. Server selects one penalty using weighted random selection.
4. Selected penalty runs.
5. Penalty returns a normalized result object.
6. Host game applies score loss within the global cap.
7. Turn passes to the next player.

## 11.2 Locked Penalty Registry

The current planned penalty modules are:

| Penalty ID | Display Name | Player Eligibility | Status |
|---|---:|---:|---|
| `pressure-typer` | Pressure Typer | 2–6 | Separate GDD |
| `cabinet-says` | Cabinet Says | 2–6 | Separate GDD |
| `pattern-panic` | Pattern Panic | 2–6 | Separate GDD |
| `bomb-diffuser` | Bomb Diffuser | 2–6 | Separate GDD |
| `memory-sketch` | Memory Sketch | 3–6 recommended | Separate GDD |
| `brainscrambler` | BrainScrambler | 2–6 | Separate GDD |
| `stack-overflow` | Stack Overflow | 2–6 | Separate GDD |
| `through-the-fire` | Through the Fire | 4–6 | Separate GDD |

The planned lineup now targets at least 8 penalty modules. This is the right direction for freshness, but v1 should still launch with a smaller subset. Eight modules is a content and QA target, not a first-build requirement.

## 11.3 Penalty Module Summaries

These summaries are host-facing only. Full rules remain in each penalty module's own GDD.

| Penalty | Core Pressure | Host Notes |
|---|---|---|
| Pressure Typer | Type under time pressure while mistakes increase point loss. | Good baseline execution penalty. Works in all room sizes. |
| Cabinet Says | Repeat an input pattern correctly as the sequence grows. | Strong v1 candidate because it is clear, fast, and easy to watch. |
| Pattern Panic | Read and respond to fast visual/input patterns. | Strong v1 candidate. Keep presentation readable for spectators. |
| Bomb Diffuser | Enter bomb codes while controls remap after each digit. Failed bombs lose points, then the next bomb begins. | Strong v1 candidate. Ten bombs is the current default target. |
| Memory Sketch | View an image briefly, redraw it from memory, then other players grade the drawing by percentage. | High spectator value, but requires drawing, reveal, and voting UX. Better after the host loop is stable. |
| BrainScrambler | Answer deliberately hard-to-parse true/false statements under inversion pressure. | Strong comedy value comes from watching players fail, not from joke prompts. Good v1.5 candidate unless content is ready early. |
| Stack Overflow | Drag falling items into correct containers before they hit the bottom. Missed items and wrong sorts cost points. | Strong arcade penalty. Good v1 candidate if drag/input handling is ready. |
| Through the Fire | Player-submission/social-pressure penalty built around public roasting/fire survival. | Keep out of v1. Requires 4–6 players and stronger moderation boundaries. |

## 11.4 Recommended Random Weights

```js
{
  "pressure-typer": 2,
  "cabinet-says": 3,
  "pattern-panic": 3,
  "bomb-diffuser": 3,
  "memory-sketch": 1,
  "brainscrambler": 2,
  "stack-overflow": 3,
  "through-the-fire": 1
}
```

Stack Overflow, Cabinet Says, Pattern Panic, and Bomb Diffuser should have higher default weight because they are fast, readable, and do not require player-submitted content.

Memory Sketch and Through the Fire should have lower default weight because they require more audience participation and more UI/state handling.

BrainScrambler can sit in the middle. It is fast and spectator-friendly, but it needs a curated statement bank to avoid becoming sloppy or unfair.

## 11.5 Penalty Module Contract

Every penalty module should expose the same host-facing interface, even if the internal game is different.

```js
{
  penaltyId: "bomb-diffuser",
  displayName: "Bomb Diffuser",
  minPlayers: 2,
  maxPlayers: 6,
  estimatedDurationSeconds: 30,
  requiresPlayerSubmissions: false,
  version: 1
}
```

## 11.6 Penalty Start Payload

```js
{
  roomId: "room_123",
  matchId: "match_123",
  penaltyId: "bomb-diffuser",
  activePlayerId: "player_1",
  spectatorPlayerIds: ["player_2", "player_3"],
  sourceQuestionId: "q_001",
  sourceQuestionValue: 300,
  maxPointLoss: 450,
  seed: "seed_abc123",
  createdAt: ""
}
```

## 11.7 Penalty Result Payload

```js
{
  roomId: "room_123",
  matchId: "match_123",
  penaltyId: "bomb-diffuser",
  playerId: "player_1",
  sourceQuestionValue: 300,
  rawPointsLost: 210,
  cappedPointsLost: 210,
  completed: true,
  timedOut: false,
  summary: {},
  createdAt: ""
}
```

The host game should treat `summary` as penalty-owned metadata. It can be used for post-game highlights, but the base game should not depend on penalty-specific fields for core scoring.

## 11.8 Penalty Folder Convention

Recommended folder layout:

```text
games/questionable-decisions/
  index.html
  js/
  css/
  data/
  mini-games/
    pressure-typer/
    cabinet-says/
    pattern-panic/
    bomb-diffuser/
    memory-sketch/
    brainscrambler/
    stack-overflow/
    through-the-fire/
```

Each mini-game folder may include its own implementation files and its own GDD document.

---

## 12. Match Length

Use fixed turn count by default.

Recommended match lengths:

| Player Count | Total Turns |
|---:|---:|
| 2 | 12 |
| 3 | 12 |
| 4 | 16 |
| 5 | 15 |
| 6 | 18 |

Board-clear mode can come later.

Reason: correct answers let players keep control. A strong player could run too much of the board while others wait. Fixed turns give better pacing during testing.

---

## 13. Lobby Flow

1. Room created.
2. Players join by room code.
3. Players vote on theme.
4. Players ready up.
5. Host starts match.
6. Server builds board from winning theme.
7. Match starts.

## 13.1 Lobby Object

```js
{
  roomId: "room_123",
  roomCode: "8392",
  hostPlayerId: "player_1",
  status: "lobby",
  minPlayers: 2,
  maxPlayers: 6,
  players: [
    {
      playerId: "player_1",
      displayName: "Jay",
      ready: true,
      connected: true,
      themeVote: "theme_pop_culture"
    }
  ],
  themeVotes: {
    "theme_pop_culture": 2,
    "theme_video_games": 1
  }
}
```

---

## 14. Server-Owned State Machine

This game needs a server-owned state machine.

Clients should not decide:

- correctness
- scoring
- turn order
- penalty selection
- penalty eligibility
- final results

## 14.1 Main States

```text
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
```

## 14.2 Server Owns

- room membership
- theme voting
- board generation
- turn order
- current player
- question selection
- answer validation
- score changes
- penalty randomizer
- penalty eligibility
- penalty results
- match end
- platform result payload

## 14.3 Client Owns

- rendering
- animations
- input collection
- local mini-game controls
- sound effects
- visual feedback

Full anti-cheat is not required for v1, but authoritative scoring should be server-owned from the beginning.

---

## 15. Audience Layer

While a player is in a penalty, other players should watch.

## 15.1 V1 Audience Features

- live penalty display
- timer
- miss counter, if exposed by the penalty module
- score loss counter
- preset reactions
- round result reveal

## 15.2 Preset Reactions

```text
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
```

Do not add freeform chat in v1. Preset reactions are enough to prove the spectator loop.

---

## 16. Chat Roadmap

Chat would make the game stronger, but it is not v1.

Recommended roadmap:

- **V1:** preset reactions only
- **V1.5:** room text chat
- **V2:** mute, block, and report tools
- **V2+:** moderation logs and safer public matchmaking
- **Much later:** voice chat, if ever

Voice chat is not a casual add-on. It requires WebRTC, mobile permissions, moderation, muting, reporting, abuse handling, echo/noise handling, and safety controls.

Text chat should come before voice.

---

## 17. Platform Integration

At match end, the game publishes one result payload through the platform game-integration seam.

The game should not directly mutate:

- profiles
- friend records
- notifications
- thoughts
- memories
- badges
- activity feeds

The platform receives the match result and decides what to show.

## 17.1 Match Result Payload

```js
{
  type: "game-result",
  gameSlug: "questionable-decisions",
  mode: "duel-or-party",
  themeId: "theme_pop_culture",
  roomId: "room_123",
  participantIds: ["player_1", "player_2"],
  winnerPlayerId: "player_2",
  finalScoresByPlayerId: {
    "player_1": 900,
    "player_2": 1400
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
```

## 17.2 Memory Card Opportunities

The platform may render memory cards such as:

- “Jay beat Leo in Pop Culture.”
- “Leo survived a penalty with zero mistakes.”
- “Jay lost 400 points after missing a 300-point question.”
- “Rosanna ran the board for 4 straight questions.”
- “Leo won a 1v1 duel by 100 points.”
- “Jay ate a 600-point penalty and still won.”

Do not publish raw player-submitted penalty text to public platform activity or memory cards in v1.

---

## 18. Core Data Objects

## 18.1 Theme Pack

```js
{
  id: "theme_pop_culture",
  title: "Pop Culture",
  description: "Movies, TV, music, celebrities, memes, and viral moments.",
  categories: [
    {
      id: "cat_movie_tv",
      title: "Movies & TV"
    }
  ]
}
```

## 18.2 Question

```js
{
  id: "q_001",
  themeId: "theme_pop_culture",
  categoryId: "cat_movie_tv",
  pointValue: 200,
  format: "multiple-choice",
  prompt: "Which actor played Jack Sparrow?",
  choices: ["Johnny Depp", "Orlando Bloom", "Brad Pitt", "Keanu Reeves"],
  correctAnswer: "Johnny Depp",
  acceptedAnswers: ["johnny depp", "depp"],
  timeLimitSeconds: 15
}
```

## 18.3 Board Tile

```js
{
  id: "tile_001",
  categoryId: "cat_movie_tv",
  questionId: "q_001",
  pointValue: 200,
  used: false
}
```

## 18.4 Match Room

```js
{
  roomId: "room_123",
  roomCode: "8392",
  status: "lobby",
  hostPlayerId: "player_1",
  players: [],
  currentTurnPlayerId: "",
  turnIndex: 0,
  selectedThemeId: "",
  boardId: "",
  scoresByPlayerId: {},
  createdAt: ""
}
```

## 18.5 Generic Penalty Result

```js
{
  playerId: "player_1",
  penaltyId: "bomb-diffuser",
  sourceQuestionValue: 300,
  pointsLost: 210,
  summary: {},
  createdAt: ""
}
```

## 18.6 Match Result

```js
{
  roomId: "room_123",
  gameSlug: "questionable-decisions",
  mode: "party",
  themeId: "theme_pop_culture",
  participantIds: [],
  winnerPlayerId: "",
  finalScoresByPlayerId: {},
  penaltyStatsByPlayerId: {},
  correctAnswersByPlayerId: {},
  longestStreakPlayerId: "",
  biggestPenaltyLoss: null,
  createdAt: ""
}
```

---

## 19. Minimal V1 Scope

Build this first:

- 2–6 player private rooms
- theme voting
- 4×4 trivia board
- question formats: true/false, multiple choice, fill-in-the-blank, typed answer
- turn-based category/question selection
- correct answer awards points
- correct answer keeps control
- wrong answer triggers random eligible penalty
- penalty result subtracts points
- turn passes after penalty
- final ranking screen
- platform activity result
- preset spectator reactions

## 19.1 V1 Penalty Modules

Recommended v1 penalty modules:

- Cabinet Says
- Pattern Panic
- Bomb Diffuser
- Stack Overflow

Pressure Typer can be v1 if the added typing/comparison complexity is acceptable. Otherwise, push it to v1.5.

BrainScrambler can also move into v1 if the curated statement bank is ready. Do not ship it with weak prompts. If the statements are too easy, the game has no pressure. If they are ambiguous, the game feels unfair.

Memory Sketch should not be treated as a first implementation dependency. It is a strong module, but drawing capture, image reveal, spectator grading, averaging, and round progression make it heavier than the pure reflex/input penalties.

## 19.2 Explicitly Out of V1

Do not build first:

- Through the Fire
- Memory Sketch, unless the drawing and grading flow is already stable
- freeform room chat
- voice chat
- public matchmaking
- user-generated question packs
- custom themes
- AI-generated live trivia
- ranked ladder
- spectator join
- full moderation/report tools

---

## 20. V1.5 Scope

Add:

- Pressure Typer, if not in v1
- BrainScrambler, if not in v1
- Memory Sketch
- Through the Fire
- room text chat
- more themes
- more question packs
- rematch button
- challenge/invite flow
- better post-game highlights
- theme-specific penalty flavor text
- better spectator reactions

---

## 21. V2 Scope

Add:

- public matchmaking
- seasonal boards
- event mode
- custom room settings
- profile memory cards
- player stats
- daily featured theme
- group/lobby integration
- moderation/reporting tools
- possible voice chat much later

---

## 22. Moderation Rules

This game can support crude jokes and player-written content later, but boundaries are required.

## 22.1 Allowed Humor Direction

- bad answers
- overconfidence
- panic
- skill issue
- fake game-show shame
- gross but non-targeted jokes
- light profanity
- self-roasting
- lobby-safe trash talk

## 22.2 Disallowed Direction

- slurs
- identity attacks
- sexual harassment
- real-world threats
- targeted harassment based on appearance, disability, race, religion, gender, sexuality, family, trauma, or personal life
- doxxing
- encouragement of self-harm

The crude style should punch at the player’s gameplay failure, not at who they are.

---

## 23. Recommended Build Order

Best order:

1. Local board prototype
2. Static theme pack
3. Turn order and scoring
4. Question formats
5. Correct/wrong validation
6. Penalty module loader contract
7. First non-submission penalty module
8. Second non-submission penalty module
9. Third non-submission penalty module
10. Stack Overflow, if drag sorting is already clean
11. Final result screen
12. Private-room multiplayer
13. Server-owned state machine
14. Platform result publishing
15. Preset spectator reactions
16. Pressure Typer
17. BrainScrambler
18. Memory Sketch
19. Through the Fire
20. Room text chat
21. Challenge/rematch hooks

Hard truth: the submission-heavy and spectator-graded penalty modules are some of the funniest ideas, but they are also the easiest way to overload the first implementation. Build the host game and at least one non-submission penalty path first.

---

## 24. Locked Decisions

- Game title: Questionable Decisions.
- Game supports 2–6 players.
- 1v1 Duel Mode is supported.
- Party Mode supports 3–6 players.
- Players vote on the trivia theme before the match.
- Themes are curated and not limited to video games.
- Question formats include true/false, multiple choice, fill-in-the-blank, and typed answer.
- Players choose a category/question on their turn.
- Correct answers award points and allow continued control.
- Wrong answers trigger a random penalty mini-game.
- Penalty games are selected randomly like a party-game punishment wheel.
- Penalty results subtract points based on the source question value and penalty module rules.
- Global penalty loss cap is source question value × 1.5.
- After a wrong-answer penalty, the turn passes.
- Memory Sketch is part of the planned penalty lineup.
- BrainScrambler is part of the planned penalty lineup.
- Stack Overflow is part of the planned penalty lineup.
- Memory Sketch is spectator-graded and should be 3–6 players by default.
- BrainScrambler uses hard-to-parse true/false statements where the comedy comes from player failure under pressure, not joke writing.
- Stack Overflow uses falling sortable items and category containers, with point loss for missed items and wrong sorts.
- Through the Fire requires 4–6 players.
- Through the Fire is disabled in 2-player and 3-player matches.
- Raw player-submitted penalty text should not publish publicly to platform activity/memories in v1.
- Preset reactions come before chat.
- Text chat comes before voice.
- Voice is not part of v1.

---

## 25. Short Product Summary

Questionable Decisions is a 2–6 player multiplayer trivia penalty game. Players vote on a theme, take turns choosing trivia questions, and score points for correct answers. Correct answers let players keep control. Wrong answers trigger random penalty mini-games where players lose points while the rest of the lobby watches. The planned penalty lineup includes input-memory games, control-swap games, typing pressure, drawing memory, statement parsing, falling-item sorting, and larger social-pressure modules. The game supports direct 1v1 competition and larger party lobbies. Its strongest platform value is in rematches, challenge invites, reactions, activity posts, and memory-worthy failure moments.