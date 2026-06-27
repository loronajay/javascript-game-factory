# Cabinet Says — Game Design Document

## 1. Overview

**Cabinet Says** is a command-reaction arcade game based on the core structure of *Simon Says*. The player controls a pixelated on-screen character and must only obey commands that include the valid trigger phrase: **"Cabinet says"**.

The game is built around fast command recognition, input discipline, and public failure pressure. The player is not rewarded for reacting quickly by default; they are rewarded for reacting correctly. Invalid commands are traps, and obeying them counts as a mistake.

## 2. Game Identity

| Field | Specification |
|---|---|
| Game Title | Cabinet Says |
| Genre | Reaction / Memory / Input Discipline Arcade Game |
| Core Reference | Simon Says |
| Session Length | 30 seconds |
| Primary Challenge | Obey valid commands while ignoring invalid commands |
| Player View | Single-screen arcade view |
| Player Character | Pixelated character/avatar |
| Tone | Competitive, mocking, arcade-hostile |

## 3. Core Concept

The arcade cabinet issues rapid text commands. Some commands are valid and must be obeyed. Other commands are invalid and must be ignored.

A command is valid only when it includes the phrase **"Cabinet says"**.

Example valid command:

> Cabinet says jump.

Example invalid command:

> Jump.

If the player jumps after the invalid command, they are penalized because the cabinet did not authorize the action.

## 4. Design Pillars

### 4.1 Input Discipline Over Reflex Spam

The game should punish players who mash buttons or react automatically. The correct play pattern is to read, verify, then act.

### 4.2 Fast, Clear, Brutal Feedback

Every mistake should be immediately understandable. The player should know whether they obeyed an invalid command, missed a valid command, pressed the wrong input, acted too early, or acted too late.

### 4.3 Public Failure Pressure

The game is intended to be watchable. Other players should be able to see the active player lose points or fail commands in real time.

### 4.4 Arcade Hostility

The cabinet should feel like it is deliberately baiting the player. Fake commands, sarcastic failure messages, and speed escalation are part of the identity.

## 5. Gameplay Loop

1. The round begins with a 30-second timer.
2. The cabinet displays a command.
3. The player determines whether the command is valid.
4. If valid, the player must perform the requested action within the allowed timing window.
5. If invalid, the player must avoid performing the baited action.
6. The game scores the result as correct or missed.
7. The next command appears.
8. Command speed and fakeout pressure increase based on miss value tiers.
9. The round ends when the timer reaches zero.
10. Final score and failure stats are displayed.

## 6. Controls

The player controls a pixelated character using simple arcade actions.

Required actions:

| Action | Description |
|---|---|
| Jump | Character performs a jump animation/action |
| Walk Left | Character moves or leans left |
| Walk Right | Character moves or leans right |
| Duck | Character crouches |
| Stop | Character returns to neutral/no movement |

Additional actions may be added later, but the first implementation should stay limited. Too many inputs early will weaken the core readability test.

## 7. Command System

### 7.1 Valid Command Format

A command is valid if it begins with or clearly includes the phrase:

> Cabinet says

Examples:

- Cabinet says jump.
- Cabinet says hold left.
- Cabinet says stop.
- Cabinet says duck.

### 7.2 Invalid Command Format

A command is invalid if it does not include the valid trigger phrase.

Examples:

- Jump.
- Hold left.
- Duck.
- Panic and embarrass yourself.

### 7.3 Command Categories

| Command Type | Example | Expected Player Behavior |
|---|---|---|
| Valid Action | Cabinet says jump. | Press jump within the timing window |
| Valid Hold | Cabinet says hold left. | Hold left for the required duration |
| Valid Stop | Cabinet says stop. | Release movement/action inputs |
| Invalid Action | Jump. | Do nothing |
| Invalid Hold | Hold left. | Do nothing |
| Fakeout Text | Panic and embarrass yourself. | Do nothing |

## 8. Timing Rules

Each command has an active timing window. The timing window determines how long the player has to respond correctly.

A valid command requires the correct input during the active window.

An invalid command requires no matching input during the active window.

The game should track early, late, and wrong inputs separately where possible. This gives better failure feedback and makes the result screen more useful.

## 9. Miss Conditions

A miss occurs when the player fails the command test.

Miss conditions:

| Miss Type | Definition |
|---|---|
| Obeyed Invalid Command | Player performed the action from a command that did not include "Cabinet says" |
| Ignored Valid Command | Player failed to respond to a valid command |
| Wrong Input | Player pressed an input that does not match the valid command |
| Too Early | Player acted before the command was active |
| Too Late | Player acted after the command window closed |

Each miss subtracts points and may trigger a failure message.

## 10. Scoring

The game should use a score-loss model instead of only tracking successful commands. This supports the intended spectacle of players losing points in real time.

Recommended scoring model:

| Event | Score Change |
|---|---:|
| Correct valid command | +50 |
| Correctly ignored invalid command | +25 |
| Miss at 100-point tier | -100 |
| Miss at 200-point tier | -200 |
| Miss at 300-point tier | -300 |
| Miss at 400-point tier | -400 |

The exact values can be tuned later, but the miss tiers should remain highly visible. The game’s pressure comes from the player knowing that one bad reaction can hurt.

## 11. Difficulty Scaling

Difficulty scales through command speed and fakeout density.

| Miss Tier | Behavior |
|---|---|
| 100-point miss | Slower commands, fewer fakeouts |
| 200-point miss | Moderate command speed, more invalid commands |
| 300-point miss | Faster commands, tighter timing windows |
| 400-point miss | Fast commands with frequent fakeouts |

Implementation note: the original notes describe these as miss-value tiers. That means difficulty and penalty weight are connected. This can work, but it should be tested carefully. If it feels unfair, separate speed difficulty from point penalty.

## 12. Round Structure

| Field | Value |
|---|---|
| Round Duration | 30 seconds |
| End Condition | Timer reaches zero |
| Command Flow | Continuous rapid command prompts |
| Result Screen | Final score, total misses, correct commands, worst miss type |

The round should not require long setup. This is a short-session arcade game and should restart quickly.

## 13. Failure Messages

Failure messages should be short, readable, and hostile in a playful arcade tone.

Examples:

- "You obeyed without permission. Tragic."
- "The cabinet did not say that. You just folded."
- "Wrong button. Strong confidence, weak execution."
- "You panicked and the machine noticed."
- "Fake command. Real embarrassment."

Failure messages should not block gameplay for too long. They should appear as overlays, popups, or side-feed messages while the next command continues or prepares.

## 14. UI Requirements

The game screen should clearly show:

- Current command text
- Timer
- Score
- Current miss tier or penalty value
- Player character
- Input prompts or button references
- Recent failure message

The command text must be the most readable element on the screen. Visual style should not interfere with command recognition.

## 15. Visual Direction

The visual style should match the broader arcade platform without overcomplicating the game.

Recommended direction:

- Pixelated player character
- Arcade cabinet voice/personality represented through text prompts
- CRT-style effects allowed, but command readability must remain high
- Strong visual distinction between command area, player area, and score/miss feed
- Quick animations for correct input, wrong input, panic, and failure

## 16. Audio Direction

Audio should reinforce command pressure.

Recommended audio cues:

| Event | Audio Cue |
|---|---|
| New command | Short blip or cabinet chirp |
| Correct response | Clean positive beep |
| Miss | Harsh buzzer |
| Invalid command obeyed | Distinct shame/error sting |
| Final result | Short cabinet-style result fanfare or failure sting |

Audio must not obscure gameplay timing. Sounds should be short and functional.

## 17. Implementation Scope

### 17.1 MVP Scope

The first playable version should include:

- 30-second round timer
- Valid and invalid command generation
- Jump, left, right, duck, and stop commands
- Input validation
- Miss detection
- Score changes
- Failure messages
- Basic difficulty scaling
- Final results screen

### 17.2 Later Scope

Possible future additions:

- More command types
- Combo bonus for perfect streaks
- Audience/replay feed
- Platform leaderboard integration
- Difficulty modes
- Character skins
- Cabinet personality variants

These should remain out of the MVP unless the core command loop already feels stable.

## 18. Technical Notes

The command system should be data-driven. Each command should define:

| Field | Purpose |
|---|---|
| id | Unique command identifier |
| displayText | Text shown to the player |
| isValid | Whether the command requires obedience |
| expectedInput | Required action, if valid |
| timingWindow | Allowed response time |
| holdDuration | Required hold time, if applicable |
| missPenalty | Score penalty on failure |
| successReward | Score reward on success |

This avoids hardcoding every command and makes fakeouts easier to expand.

## 19. Open Design Questions

These should be resolved during prototype testing:

1. Should invalid commands reward the player for doing nothing, or only avoid penalty?
2. Should wrong inputs immediately fail the current command, or only fail if they match the baited command?
3. Should command speed be tied directly to miss penalty tier, or should those systems be separated?
4. Should "stop" require releasing all inputs instantly, or returning to neutral before the timing window closes?
5. Should the game allow negative scores?

## 20. Design Risks

The main risk is readability. If commands appear too quickly or use too much visual noise, the game becomes random instead of skill-based.

The second risk is unfair input detection. Pressing too early, too late, or pressing while releasing a prior command must be handled carefully. Bad input windows will make the game feel broken.

The third risk is over-expansion. The concept is strongest when it stays simple: read the command, verify the phrase, obey or ignore.

## 21. Success Criteria

The MVP is successful if:

- Players immediately understand the rule after one failed fakeout.
- Invalid commands reliably bait mistakes.
- Correct play feels disciplined, not random.
- Rounds are short enough to retry quickly.
- Spectators can understand why the player lost points.
- Failure messages add personality without slowing down the round.
