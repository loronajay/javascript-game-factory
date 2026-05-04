# Bomb Diffuser — Game Design Document

## 1. Document Purpose

This document defines the v1 design scope for **Bomb Diffuser**, a penalty mini-game used inside the larger party/trivia game structure. The goal is to provide an implementation-ready reference for gameplay rules, input handling, scoring, UI requirements, and data structures.

This GDD covers Bomb Diffuser only. It does not define the surrounding host game, question system, player lobby, matchmaking, or other penalty mini-games.

## 2. High-Level Summary

**Bomb Diffuser** is a timed input-decoding penalty challenge. The penalized player must resolve 10 bombs by entering visual input codes before each bomb timer expires.

The core twist is that the physical key mapping changes after every accepted input. The player is not simply reacting to a displayed sequence; they must constantly re-read the current control mapping, translate the next visual label into the correct physical key, and execute quickly under timer pressure.

Other players may observe the penalty in real time.

## 3. Core Design Pillars

### 3.1 Read, Translate, Execute

The challenge is not raw memorization. The player must read the current visual code, inspect the active mapping, identify the correct physical key, and press it before the timer expires.

### 3.2 Controlled Chaos

The mapping shuffle creates pressure, but it must remain fair. The mapping changes only after player input. It must not shuffle passively while the player is thinking.

### 3.3 Penalty, Not Elimination

Bomb Diffuser is a punishment event, not a full game-over condition. Exploding a bomb causes point loss and advances to the next bomb. The penalty ends only after all 10 bombs are resolved.

### 3.4 Spectator Shame

The mini-game should be understandable and entertaining to spectators. Observers should be able to see the target player’s progress, mistakes, explosions, and point loss.

## 4. Game Flow

1. A player triggers Bomb Diffuser as a penalty.
2. The system initializes a 10-bomb sequence.
3. Each bomb receives a generated visual code.
4. The active bomb timer starts.
5. The player attempts to enter the full visual code by pressing the currently mapped physical keys.
6. After every accepted physical input, the mapping reshuffles.
7. A bomb is resolved in one of two ways:
   - **Diffused:** the player enters the full code before the timer expires.
   - **Exploded:** the timer expires before the player completes the code.
8. The system applies point penalties as needed.
9. The next bomb starts.
10. The penalty ends after 10 bombs have been diffused or exploded.
11. The host game receives the penalty result object.

## 5. Core Rules

### 5.1 Bomb Count

Bomb Diffuser always runs for **10 bombs** in v1.

The penalty does not end early when a bomb explodes. Each bomb is resolved independently, and the sequence continues until all 10 bombs are complete.

### 5.2 Bomb Resolution States

Each bomb may end with one of the following states:

| State | Meaning |
| --- | --- |
| `diffused` | The player completed the full code before the timer expired. |
| `exploded` | The bomb timer expired before the code was completed. |

A bomb cannot be both diffused and exploded.

### 5.3 Success Rule

A bomb is diffused when the player correctly enters every visual label in the bomb code before the timer reaches zero.

### 5.4 Mistake Rule

When the player presses the wrong physical key:

- point loss is applied,
- current bomb progress resets to the first input,
- the bomb timer continues running,
- the mapping reshuffles.

Mistakes do not end the bomb by themselves.

Example:

```text
Code: X → Up → B → Left

Player correctly enters:
X → Up

Player then misses B.

Result:
- wrong-input penalty is applied,
- progress resets to X,
- timer continues,
- mapping reshuffles.
```

### 5.5 Timer Expiration Rule

When the active bomb timer reaches zero:

- the bomb explodes,
- explosion point loss is applied,
- the system advances to the next bomb.

The overall penalty continues unless the exploded bomb was bomb 10.

## 6. Input Model

### 6.1 Physical Inputs

The physical keys are:

| Physical Key | Keyboard Code |
| --- | --- |
| W | `KeyW` |
| A | `KeyA` |
| S | `KeyS` |
| D | `KeyD` |
| Arrow Up | `ArrowUp` |
| Arrow Down | `ArrowDown` |
| Arrow Left | `ArrowLeft` |
| Arrow Right | `ArrowRight` |

### 6.2 Visual Labels

The visual labels are:

```text
Up
Down
Left
Right
X
Y
A
B
```

These are the labels shown in bomb codes and mapping displays.

### 6.3 Mapping Model

The player sees a mapping from physical keys to visual labels.

Example:

```json
{
  "KeyW": "X",
  "KeyA": "Down",
  "KeyS": "B",
  "KeyD": "Left",
  "ArrowUp": "A",
  "ArrowDown": "Right",
  "ArrowLeft": "Y",
  "ArrowRight": "Up"
}
```

If the current code asks for `X`, the player must press whichever physical key currently maps to `X`. In the example above, the correct physical key would be `KeyW`.

### 6.4 Mapping Validity Rules

Every mapping must satisfy these constraints:

- each physical key maps to exactly one visual label,
- each visual label appears exactly once,
- duplicates are not allowed,
- unmapped physical keys are not allowed,
- unmapped visual labels are not allowed.

This creates a strict one-to-one mapping between the eight physical keys and eight visual labels.

### 6.5 Mapping Shuffle Rule

The mapping changes after every accepted physical input.

This includes:

- correct inputs,
- wrong inputs.

The mapping must not shuffle while the player is idle. Passive shuffling would make the challenge feel arbitrary instead of difficult.

## 7. Code Generation

### 7.1 Code Source Labels

Bomb codes are generated from the visual label list:

```json
["Up", "Down", "Left", "Right", "X", "Y", "A", "B"]
```

### 7.2 Repeated Labels

Repeats are allowed.

Example:

```text
X → X → Down → A
```

Repeats are valid because the physical mapping changes after every accepted input. The same visual label may require a different physical key later in the same code.

### 7.3 Code Length

Bomb codes start at **4 inputs** and may increase up to **6 inputs** based on player performance.

| Difficulty State | Code Length |
| --- | ---: |
| Starting state | 4 inputs |
| Threat level 1 | 5 inputs |
| Threat level 2 | 6 inputs |

## 8. Difficulty Progression

### 8.1 Per-Player Difficulty State

Bomb Diffuser difficulty is tracked per player for the duration of the match.

Each player has:

- current Bomb Diffuser code length,
- perfect bomb streak.

### 8.2 Perfect Bomb Definition

A perfect bomb requires all of the following:

- bomb was diffused,
- zero wrong inputs occurred,
- timer did not expire.

### 8.3 Progression Rule

Each player starts with 4-input bomb codes.

Every 3 perfect bomb diffuses by that player increases their Bomb Diffuser code length by 1.

Rules:

- threat level may increase during the same penalty,
- difficulty progression persists for the match,
- max code length is 6,
- mistakes do not lower code length,
- explosions do not lower code length,
- when the perfect bomb streak reaches 3, increase code length by 1 and reset the streak to 0.

### 8.4 Progression Example

```text
Player starts at 4-input codes.
Player diffuses 3 bombs perfectly.
Future bombs become 5-input codes.
Player later diffuses 3 more bombs perfectly.
Future bombs become 6-input codes.
Max difficulty is reached.
```

## 9. Timers

### 9.1 Recommended Timer Values

| Code Length | Timer |
| ---: | ---: |
| 4 inputs | 6.0 seconds |
| 5 inputs | 7.5 seconds |
| 6 inputs | 9.0 seconds |

These are v1 tuning values. They should be exposed as constants so they can be adjusted after playtesting.

### 9.2 Timer Behavior

Each bomb has its own timer. The timer starts when the bomb becomes active and stops only when the bomb is diffused or explodes.

Wrong inputs do not reset the timer.

## 10. Scoring

### 10.1 Wrong Input Point Loss

Wrong input penalties scale based on the source question value.

| Source Question Value | Wrong Input Loss |
| ---: | ---: |
| 100 | -3 |
| 200 | -5 |
| 300 | -8 |
| 400 | -10 |

### 10.2 Explosion Point Loss

Explosion penalties also scale based on the source question value.

| Source Question Value | Explosion Loss |
| ---: | ---: |
| 100 | -10 |
| 200 | -20 |
| 300 | -30 |
| 400 | -40 |

### 10.3 Global Loss Cap

Total point loss from a Bomb Diffuser penalty is capped at:

```text
source question value × 1.5
```

Example:

```text
Source question value: 300
Max Bomb Diffuser loss: 450
```

The cap should be applied to the final point loss total. Individual penalties may still be tracked for feedback and telemetry.

## 11. UI Requirements

### 11.1 Target Player UI

The target player should see:

- bomb number,
- bomb timer,
- current code,
- current progress,
- control mapping grid,
- mistake count,
- points lost,
- diffused or exploded feedback.

### 11.2 Spectator UI

Spectators should see:

- bomb timer,
- target progress,
- current code,
- mistakes,
- explosions,
- points lost.

The mapping grid may be shown to spectators, but it is optional. Showing it increases readability for viewers; hiding it makes the target player’s struggle feel more chaotic from the outside.

### 11.3 Suggested Layout

```text
BOMB 2 / 10              TIMER: 04.8

CODE:    X → Up → B → Left
CURRENT: X → Up → [B]

W = X        ↑ = A
A = Down     ↓ = Right
S = B        ← = Y
D = Left     → = Up

Mistakes: 2
Points Lost: -60
```

### 11.4 UI State Feedback

The UI should clearly communicate:

- when an input is correct,
- when an input is wrong,
- when progress resets,
- when the mapping changes,
- when timer pressure increases,
- when a bomb is diffused,
- when a bomb explodes,
- when the penalty is complete.

Do not rely on text only. Use motion, flashes, sound, or layout changes where practical.

## 12. Feedback Text

The feedback tone should be hostile, arcade-like, and comedic. It should insult performance without creating ambiguity around gameplay state.

### 12.1 Diffused Feedback

```text
Bomb diffused. Barely looked competent.
Clean input. The machine is annoyed.
You survived that one. Don’t get proud.
```

### 12.2 Explosion Feedback

```text
Bomb exploded. So did your dignity.
You fumbled the code and the room felt it.
Detonation confirmed. Brain not found.
```

### 12.3 Wrong Input Feedback

```text
Wrong key. Start over.
That was not the button, genius.
Input failed. Confidence punished.
You had the code. You did not have the hands.
```

### 12.4 Timer Low Feedback

```text
Bomb is sweating.
Timer says hurry up, dumbass.
Three seconds from public shame.
```

## 13. Data Structures

### 13.1 Bomb Diffuser Runtime State

```js
const bombDiffuserState = {
  penaltyId: "bomb-diffuser",
  targetPlayerId: "player_1",
  sourceQuestionValue: 300,
  bombCount: 10,
  currentBombIndex: 0,
  codeLength: 4,
  bombs: [
    {
      id: "bomb_1",
      code: ["X", "Up", "B", "Left"],
      currentInputIndex: 0,
      timerSeconds: 6,
      status: "active", // "active" | "diffused" | "exploded"
      mistakeCount: 0,
      exploded: false,
      diffused: false,
      perfect: false
    }
  ],
  totalMistakes: 0,
  explodedCount: 0,
  diffusedCount: 0,
  pointsLost: 0,
  currentMapping: {
    KeyW: "X",
    KeyA: "Down",
    KeyS: "B",
    KeyD: "Left",
    ArrowUp: "A",
    ArrowDown: "Right",
    ArrowLeft: "Y",
    ArrowRight: "Up"
  }
};
```

### 13.2 Per-Player Bomb Difficulty State

```js
const playerBombDifficultyState = {
  playerId: "player_1",
  bombDiffuserCodeLength: 4,
  perfectBombStreak: 0
};
```

Rules:

- perfect bomb increments streak by 1,
- bomb with any mistake does not increment streak,
- exploded bomb does not increment streak,
- streak reaching 3 increases code length by 1,
- streak resets to 0 after a code length increase,
- max code length is 6,
- progression persists within the match.

### 13.3 Penalty Result Object

```js
const bombDiffuserResult = {
  penaltyId: "bomb-diffuser",
  playerId: "player_1",
  sourceQuestionValue: 300,
  bombCount: 10,
  diffusedCount: 7,
  explodedCount: 3,
  totalMistakes: 6,
  pointsLost: 210,
  codeLengthStarted: 4,
  codeLengthEnded: 5,
  perfectBombs: 3
};
```

## 14. Implementation Notes

### 14.1 Required Constants

Recommended constants:

```js
const BOMB_COUNT = 10;
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 6;
const PERFECT_BOMBS_PER_LEVEL = 3;

const VISUAL_LABELS = ["Up", "Down", "Left", "Right", "X", "Y", "A", "B"];
const PHYSICAL_KEYS = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight"
];

const TIMER_BY_CODE_LENGTH = {
  4: 6.0,
  5: 7.5,
  6: 9.0
};

const WRONG_INPUT_LOSS = {
  100: 3,
  200: 5,
  300: 8,
  400: 10
};

const EXPLOSION_LOSS = {
  100: 10,
  200: 20,
  300: 30,
  400: 40
};
```

### 14.2 Input Evaluation

At input time:

1. Ignore keys outside the physical key list.
2. Read the current required visual label from `bomb.code[bomb.currentInputIndex]`.
3. Look up the visual label mapped to the pressed physical key.
4. Compare the mapped label to the required label.
5. If correct, increment `currentInputIndex`.
6. If wrong, apply wrong-input penalty and reset `currentInputIndex` to 0.
7. Shuffle mapping after the accepted physical input.
8. If `currentInputIndex` reaches the code length, mark bomb as diffused.

### 14.3 Shuffle Algorithm Requirement

The shuffle should produce a random one-to-one pairing between physical keys and visual labels.

Pseudo-logic:

```text
copy visual labels
shuffle copied labels
assign shuffled labels to physical keys by index
validate no duplicates
return mapping
```

### 14.4 Recommended Event Hooks

The mini-game should expose hooks or events for:

- penalty started,
- bomb started,
- mapping shuffled,
- correct input,
- wrong input,
- progress reset,
- timer low,
- bomb diffused,
- bomb exploded,
- penalty completed.

## 15. Out of Scope for v1

The following are not part of Bomb Diffuser v1:

- online matchmaking implementation,
- account progression,
- permanent player skill ratings,
- alternate layouts,
- accessibility remapping,
- controller/gamepad input,
- AI players,
- ranked balance tuning,
- host-game question logic.

These can be added later, but they should not block the v1 implementation.

## 16. Open Tuning Questions

The design is mechanically locked enough to implement, but these values should be playtested:

- whether 10 bombs feels too long under real match pacing,
- whether 6 / 7.5 / 9 second timers are fair,
- whether wrong-input penalties are too soft or too punishing,
- whether the global loss cap should be applied live or only at result finalization,
- whether spectators should always see the mapping grid.

## 17. v1 Acceptance Criteria

Bomb Diffuser v1 is complete when:

- the penalty always runs exactly 10 bombs,
- each bomb has an independent timer,
- visual codes are generated from the approved label list,
- repeated labels are allowed,
- mappings are always valid one-to-one assignments,
- mapping shuffles after every correct or wrong physical input,
- mapping does not shuffle while idle,
- wrong inputs reset current bomb progress and apply point loss,
- timer expiration explodes only the active bomb and advances to the next bomb,
- the penalty continues after explosions,
- difficulty increases after 3 perfect bomb diffuses by the same player,
- code length caps at 6,
- final result object accurately reports diffused bombs, exploded bombs, mistakes, point loss, starting code length, ending code length, and perfect bombs.
