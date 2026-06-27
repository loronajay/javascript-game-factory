# Questionable Decisions - Gameshow UI/UX Direction

## Design Intent

Questionable Decisions should feel like a hostile live gameshow, not a trivia webpage. The core fantasy is:

```text
A player makes a confident choice.
The room watches.
The answer lands.
The scoreboard reacts.
A wrong answer throws the player into public damage control.
```

The host layer should create anticipation, spectacle, and social pressure around simple rules. The mini-games should feel like distinct arcade penalty events, but the main game should remain the broadcast frame that stitches everything together.

## Experience Pillars

### Big Public Consequences

Every major action should feel visible to the room:

- selecting a tile
- locking an answer
- revealing correctness
- triggering the penalty selector
- losing points
- passing control

The UI should avoid quiet state changes. Score changes need physicality: counters roll, names flash, lights change, and the room sees why the number moved.

### Stage, Not Page

The game should be composed like a show set:

- full-screen stage background
- central board or active event
- persistent scoreboard rail
- host/status marquee
- player podiums
- reaction layer

Avoid document-like vertical scrolling, generic centered forms, plain rectangles, default browser controls, and large empty panels.

### Readability Under Pressure

The game can be loud, but the interaction surface must stay clean. Players should never lose because a button looked disabled, a timer was hidden, or the current turn state was unclear.

Use motion, lighting, and audio-style visual cues for drama, but keep answer choices, timers, point values, player names, and prompts sharp.

### Spectator Fuel

Non-active players should always have something to watch or do:

- see active player's risk
- send preset reactions
- track score swings
- watch penalty attempts
- anticipate control passing

The spectator layer is not decoration. It is part of the game's hook.

## Visual Identity

### Theme

Use a modern game-show set crossed with a slightly mean arcade cabinet:

- glossy black glass
- saturated stage lighting
- brass/gold point accents
- red danger states
- cyan/teal active-player highlights
- magenta reaction energy
- off-white prompt text
- hard shadows and bevels used sparingly

This should not become a single blue/purple sci-fi dashboard. The palette needs contrast between game-show warmth, arcade danger, and clean readable controls.

### Suggested Palette

```text
Stage black:      #08090d
Panel black:      #11131a
Deep red:         #b71934
Warning red:      #ff335f
Prize gold:       #f7c548
Warm amber:       #ff9f1c
Active cyan:      #2ee6d6
Reaction magenta: #e845b5
Prompt white:     #f7f2e8
Muted text:       #a9b0bd
Success green:    #30d158
```

Use gold for value and score, cyan for current control, red for danger/penalty, magenta for social reactions, and white for core readable text.

### Type Direction

Use display type only where it earns the space:

- game title
- board point values
- answer reveal
- penalty selector
- score swings

Use compact, highly readable UI text elsewhere. Do not scale typography with viewport width. Long labels must wrap cleanly rather than shrinking into mush.

### Motion Direction

Motion should feel like stage machinery:

- lights sweep when control changes
- tile lifts/locks when selected
- answer reveal punches in quickly
- wrong-answer state drops the stage into red
- penalty selector spins or cycles like a rigged wheel
- score loss ticks down with visible damage

Keep motion short. The game has many turns, so transitions should feel flavorful without making players wait.

## Core Screen Flow

```text
ROOM_GATE
-> LOBBY_STAGE
-> THEME_VOTE
-> READY_CHECK
-> MATCH_INTRO
-> BOARD_STAGE
-> TILE_SELECT
-> QUESTION_STAGE
-> ANSWER_REVEAL
-> if correct: SCORE_AWARD -> BOARD_STAGE
-> if wrong: PENALTY_SELECTOR -> PENALTY_INTRO -> PENALTY_ACTIVE -> PENALTY_RESULTS -> CONTROL_PASS
-> SCOREBOARD_BREAK
-> MATCH_RESULTS
```

The game can map several of these to the same technical screen, but the player-facing beats should be distinct.

## Shell Layout

### Desktop Stage

```text
+-------------------------------------------------------------+
| Top marquee: room code / turn / timer / status              |
+---------------+-----------------------------+---------------+
| Player rail   | Main stage                  | Reaction rail |
| scores        | board/question/penalty      | spectator UI  |
| podiums       |                             |               |
+---------------+-----------------------------+---------------+
| Host ticker: outcome text, control changes, penalty flavor   |
+-------------------------------------------------------------+
```

The main stage should dominate. Side rails are persistent but compact.

### Mobile Stage

```text
+-------------------------------+
| Compact marquee               |
+-------------------------------+
| Main stage                    |
| board/question/penalty        |
+-------------------------------+
| Horizontal player strip       |
+-------------------------------+
| Reactions / active controls   |
+-------------------------------+
```

Do not force a desktop board into mobile by shrinking everything. Mobile should use larger tap targets, tighter category labels, and horizontal scrolling only where it feels intentionally cabinet-like.

## Screen Designs

### Room Gate

Purpose: create or join a private room quickly.

Feel: backstage entrance to the show.

Required elements:

- title lockup
- create room command
- join room code input
- player display name
- compact mode hint: Duel / Party based on player count later

Avoid a marketing landing page. The first screen should be functional.

### Lobby Stage

Purpose: let players gather, vote, ready up, and see the room become a show.

Layout:

- center: empty stage with player podiums filling in
- top: room code as a large broadcast code
- side or bottom: player cards with ready state
- lower action bar: ready toggle, host start button

Player cards should look like podium nameplates, not profile cards. Show:

- display name
- ready light
- theme vote chip
- host badge
- connection indicator

### Theme Vote

Purpose: make choosing a question pack feel like picking tonight's episode.

Presentation:

- theme tiles as episode cards or marquee panels
- vote counts as bulbs or meters
- player's selected vote gets an active cyan rim
- leading theme gets gold light sweep

Theme cards should be visual and punchy, not paragraphs. Use short descriptions and category hints.

### Match Intro

Purpose: transition from lobby into competition.

Beat sequence:

1. winning theme reveal
2. player order reveal
3. board lights on
4. first player spotlight

This can be a short 2-3 second sequence. It should make the board feel generated for this room.

### Board Stage

Purpose: main game state.

Board requirements:

- 4 category headers
- 4 point tiers
- used tiles visibly dead/dimmed
- active player spotlight
- score rail always visible
- turn count visible
- current streak visible when relevant

Tile design:

- point value large and gold
- hover/focus lift with cyan edge
- selected tile clamps shut, then expands into the question stage
- used tile becomes dark glass with a faint stamped mark

The board should not look like an HTML table. It should feel like a wall of physical prize tiles.

### Question Stage

Purpose: give active player a clear, tense answer moment.

Layout:

- top: category, point value, timer
- center: prompt
- bottom: answer controls
- side: spectators dimmed but visible

Answer controls:

- multiple choice: large cabinet buttons in a 2x2 grid
- true/false: two oversized opposing buttons
- typed/fill blank: single focused input with submit command

The active player gets interactive controls. Spectators see the locked prompt and a "watching" state with reaction access.

### Answer Reveal

Purpose: make correctness a shared event.

Correct reveal:

- green/gold flash
- score rolls up
- "keeps control" message
- active player's podium stays lit
- board returns quickly

Wrong reveal:

- red stage drop
- incorrect answer marked
- correct answer exposed
- score does not change yet
- penalty selector begins

The wrong-answer beat should feel like the floor opening under the player.

### Penalty Selector

Purpose: turn a wrong answer into anticipation.

Presentation:

- center-stage penalty wheel, slot machine, or rotating cabinet cartridge selector
- eligible mini-games cycle with icons and short names
- source question value and max loss visible
- selected penalty slams into place

The selector should feel slightly theatrical and unfair, but the data must be clear:

- who is punished
- which mini-game
- maximum possible point loss
- who is watching

### Penalty Intro

Purpose: explain the upcoming penalty without slowing down the match.

Use a compact briefing card:

- penalty name
- one-sentence objective
- controls
- starting max loss
- 3, 2, 1 countdown

Keep it under 5 seconds. The active player should enter with confidence or dread, not confusion.

### Penalty Active Shell

Purpose: frame each mini-game as part of the show.

Persistent host overlay:

- penalized player name
- source question value
- live point loss
- timer
- spectator reactions

Mini-game content owns the center. The host shell should not crowd gameplay controls.

Spectator view:

- clear live view of the active player's attempt
- reactions available
- no gameplay controls
- score-loss counter visible

### Penalty Results

Purpose: resolve damage fast and publicly.

Required elements:

- penalty title
- player result summary
- raw points lost
- capped points lost if applicable
- player's score ticking down
- next player reveal

This should be quick and slightly brutal. Then the show moves on.

### Scoreboard Break

Purpose: give the room orientation between chunks of play.

Use sparingly:

- after every few turns
- after major score swing
- before final turn

Show rankings, streaks, most punished, and biggest swing. Keep it fast.

### Match Results

Purpose: make the end feel like a broadcast recap.

Required elements:

- winner reveal
- final ranking
- biggest penalty
- longest streak
- most correct
- most punished
- rematch command

This screen can be more celebratory, but still not a marketing page.

## Component Rules

### Buttons

Buttons should feel like game controls:

- bevel/glass edge
- active press state
- clear focus state
- icons for common commands where possible
- text only for answer choices and clear actions

Avoid default rectangular web buttons.

### Timers

Timers should be impossible to miss:

- circular fuse for question timers
- segmented bomb/arcade bars for penalties
- red pulse only in final warning range

Timer animation must not obscure text or controls.

### Score Changes

Score changes need two layers:

- immediate numeric delta near the player podium
- final score roll on the scoreboard

Point loss should feel more physical than point gain.

### Reactions

Reactions should appear as audience callouts:

- short-lived bubbles around the stage edge
- sender color/name optional
- rate-limited
- never covering active prompt or controls

Preset text reactions should be styled like heckle placards, not chat messages.

### Current Player Indicator

The current player needs unmistakable treatment:

- spotlight beam or cyan rim
- "in control" label
- podium lift/glow
- board cursor ownership

Control passing should be animated, because it is one of the core game rules.

## Mini-Game Handoff Rules

The gameshow shell should make every penalty feel connected:

1. wrong answer reveal names the missed value
2. penalty selector chooses the module
3. penalty intro explains objective and max loss
4. active shell tracks live loss and timer
5. result screen applies damage
6. control pass returns to board

Each mini-game can have its own visual theme, but the following should remain consistent:

- player identity location
- live loss location
- timer location
- spectator reactions
- result payload language

## V1 UI Priorities

Build polish where the game lives:

1. Board stage
2. Question stage
3. Answer reveal
4. Penalty selector
5. Penalty active shell
6. Penalty result
7. Lobby/theme vote
8. Final results

Do not overinvest in settings, account screens, custom rooms, or decorative onboarding before the main loop feels good.

## Anti-Webpage Checklist

Before shipping any screen, check:

- Does this look like a staged game moment rather than a form?
- Is the active player obvious within one second?
- Is the next action obvious within one second?
- Are score changes visible and motivated?
- Can spectators understand what happened?
- Are controls large enough and stable under pressure?
- Does mobile get a real layout rather than a shrunken desktop?
- Does the screen avoid generic cards, default inputs, and table-like boards?
- Does the UI support the joke without hiding the rules?

## First Implementation Target

When code starts, the first playable UI pass should prove this loop:

```text
Create room
Join lobby
Vote theme
Ready/start
Board appears
Active player selects tile
Question expands from tile
Answer locks in
Correct answer rolls score up and keeps spotlight
Wrong answer drops stage red
Penalty selector chooses stub penalty
Stub penalty result rolls score down
Spotlight passes to next player
```

If this loop feels like a show, the later real mini-games will have a strong frame to enter.
