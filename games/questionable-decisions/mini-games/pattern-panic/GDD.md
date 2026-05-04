# Pattern Panic — Game Design Document

## 1. Game Overview

**Game Title:** Pattern Panic  
**Genre:** Memory / Reaction / Party Challenge  
**Format:** Competitive lobby minigame  
**Core Reference:** Simon-style memory pattern game

Pattern Panic is a timed memory challenge where the active player watches a flashing sequence of colored buttons and must repeat the pattern correctly. Other players in the lobby watch the attempt in real time, creating pressure, tension, and comedy around mistakes.

The game is designed as a short, readable challenge that can scale difficulty based on the value or tier of the question or challenge that triggered it.

---

## 2. Design Goals

Pattern Panic should be fast, readable, and stressful without becoming mechanically confusing.

Primary goals:

- Create a clear memory-based pressure test.
- Make mistakes obvious and fair.
- Let spectators understand what happened without needing explanation.
- Keep the game short enough to fit inside a larger lobby or party-game structure.
- Allow the parent game mode to control scoring, punishment, and reward logic.

Pattern Panic should not become a standalone rules-heavy game unless it is intentionally expanded later.

---

## 3. Core Gameplay Loop

1. The game starts with a generated button/color sequence.
2. The sequence is shown to the active player through flashing buttons.
3. The player must repeat the sequence in the exact same order.
4. If the player succeeds, the next sequence becomes harder.
5. If the player makes a mistake, inputs too early, or runs out of time, the attempt counts as a miss.
6. The game continues until the round timer expires or the parent game mode resolves the challenge.

---

## 4. Round Duration

**Round Duration:** 30 seconds

The player has 30 seconds to complete as many correct sequences as possible or survive the assigned challenge conditions, depending on the parent game mode.

Timeouts during individual sequence input count as misses.

---

## 5. Player Objective

The active player’s objective is to correctly repeat each displayed sequence without making mistakes.

The player must:

- Watch the full playback sequence.
- Wait until playback is complete.
- Input the sequence in the correct order.
- Avoid wrong button presses.
- Complete the sequence before timeout.

---

## 6. Controls

The player interacts with a set of colored buttons.

Input may be handled through:

- Mouse buttons
- Touch buttons
- Keyboard
- Gamepad
- Platform-standard input layer, if available

Exact input mapping should follow the host platform’s control standards.

The MVP should use four buttons unless the parent game mode requires a larger pattern set.

---

## 7. Core Rules

### 7.1 Sequence Playback

At the beginning of each attempt, the game displays a flashing sequence of buttons or colors.

During playback:

- The player should not be allowed to enter the sequence.
- The UI must clearly show that playback is active.
- Any attempted input during playback may count as a miss if the parent game mode uses strict rules.

The recommended MVP behavior is to lock player input during playback and show a warning if the player attempts to act early. Counting early input as an automatic miss is harsher and should only be used if the parent game mode explicitly wants that punishment.

### 7.2 Sequence Repeat Phase

After playback ends, the player enters the repeat phase.

During this phase:

- The player must press the buttons in the same order shown.
- Each correct input advances the current sequence index.
- Completing the full sequence successfully advances the game.
- A wrong input immediately counts as a miss.

### 7.3 Difficulty Increase

Each successful sequence increases the difficulty by extending the next pattern.

Recommended behavior:

- Add one new step after each successful sequence.
- Keep playback speed readable early.
- Avoid aggressive speed scaling until the base version is proven fun.

---

## 8. Difficulty Scaling

Pattern Panic difficulty is tied to the triggering question or challenge value.

| Challenge Value | Starting Sequence Length |
| ---: | ---: |
| 100 points | 3 steps |
| 200 points | 4 steps |
| 300 points | 5 steps |
| 400 points | 6 steps |

As the player succeeds, the sequence should continue increasing in length or complexity.

Recommended MVP scaling:

- Start with the sequence length assigned by challenge value.
- Add one step after each successful sequence.
- Keep the button count fixed at four.
- Do not increase visual speed until the normal version is playable and readable.

---

## 9. Miss Conditions

A miss occurs when the player fails the sequence rules.

Miss conditions include:

- Pressing the wrong button.
- Pressing any button during playback, if strict early-input punishment is enabled.
- Failing to complete the sequence before timeout.
- Failing the sequence in any validation step.

When a miss occurs, the game should immediately register the failure and trigger the appropriate score or penalty logic from the parent game mode.

---

## 10. Scoring and Penalty Hooks

Pattern Panic should expose simple result data to the parent game mode.

Recommended result object fields:

    completedSequences: number
    misses: number
    highestSequenceLength: number
    survivedFullTimer: boolean
    failedBy: wrong_input | early_input | timeout | sequence_failure | null

The parent mode can decide whether the player loses points, gives another player a bonus, fails a question, or triggers another consequence.

Pattern Panic itself should not hardcode global scoring unless it is being built as a standalone game.

---

## 11. Spectator Experience

Other players in the lobby should be able to watch the active player’s attempt in real time.

Spectators should see:

- The sequence playback.
- The player’s attempted inputs.
- Successful sequence completions.
- Mistakes.
- Failure messages.

The spectator view should emphasize pressure and comedy without interfering with the active player’s readability.

Spectators do not need frame-perfect synchronization. They need clear event feedback.

Recommended approach:

- Broadcast state changes.
- Broadcast player input attempts.
- Let each client animate locally.
- Avoid requiring exact animation timing across all clients.

---

## 12. UI Requirements

The game screen should include:

- A clearly visible set of colored buttons.
- A playback state indicator.
- An input state indicator.
- A round timer.
- Current sequence length.
- Miss or failure feedback.
- Optional spectator-facing message area.

Recommended state labels:

- WATCH
- REPEAT
- CORRECT
- MISS
- TIMEOUT

The UI must clearly distinguish between playback and input phases. This is critical because input during playback can be a fail condition.

---

## 13. Feedback Requirements

### 13.1 Correct Input Feedback

When the player presses the correct button:

- The button should flash or pulse.
- A short positive sound may play.
- The sequence index should advance.

### 13.2 Wrong Input Feedback

When the player presses the wrong button:

- The button should flash red, glitch, or visibly reject the input.
- A failure sound should play.
- The game should immediately register a miss.

### 13.3 Timeout Feedback

When the player times out:

- The timer should visually expire.
- The game should show a failure state.
- The timeout should count as a miss.

---

## 14. Failure Messages

Failure messages should be short, mocking, and readable during fast lobby play.

Approved failure messages:

- “You had one job: remember colors.”
- “The pattern was short. Your panic was not.”
- “Memory has left the lobby.”
- “That was not the sequence. That was a cry for help.”
- “Your brain saw four colors and filed for divorce.”

Failure messages should be randomly selected after a miss or failed attempt.

---

## 15. Game States

Recommended state machine:

    IDLE
      ↓
    START_ROUND
      ↓
    PLAYBACK_SEQUENCE
      ↓
    PLAYER_INPUT
      ↓
    SEQUENCE_SUCCESS ──→ PLAYBACK_SEQUENCE
      ↓
    MISS
      ↓
    ROUND_END

### 15.1 IDLE

Waiting for the parent game mode to start the challenge.

### 15.2 START_ROUND

Initializes timer, starting sequence length, miss count, and first sequence.

### 15.3 PLAYBACK_SEQUENCE

Displays the current pattern to the player.

### 15.4 PLAYER_INPUT

Accepts player input and validates it against the sequence.

### 15.5 SEQUENCE_SUCCESS

Registers a completed sequence and increases difficulty.

### 15.6 MISS

Registers failure and applies the appropriate penalty or miss result.

### 15.7 ROUND_END

Sends final result data back to the parent game mode.

---

## 16. Configuration Requirements

Pattern Panic should be implemented as a self-contained minigame module that can be launched by a parent lobby or challenge system.

The game should support:

- Configurable starting sequence length.
- Configurable round duration.
- Configurable input timeout.
- Configurable button count.
- Result reporting to the parent game mode.
- Spectator-safe event broadcasting.

Recommended config fields:

    durationSeconds: 30
    startingSequenceLength: 3
    maxSequenceLength: none
    buttonCount: 4
    allowInputDuringPlayback: false
    timeoutCountsAsMiss: true

---

## 17. Network and Multiplayer Considerations

For online lobby play, the active player should be the only player allowed to submit inputs.

Spectators should receive broadcast events for playback, player input, success, miss, timeout, and final results.

Recommended event types:

    pattern_playback
    player_pattern_input
    pattern_sequence_success
    pattern_panic_miss
    pattern_panic_result

Recommended playback event fields:

    type: pattern_playback
    sequenceLength: number

Recommended player input event fields:

    type: player_pattern_input
    buttonId: string
    inputIndex: number
    correct: boolean

Recommended result event fields:

    type: pattern_panic_result
    completedSequences: number
    misses: number
    failedBy: wrong_input | early_input | timeout | sequence_failure | null

The server should validate only high-level game state if needed. The client can handle fast visual playback locally, but final results should be reported in a structured way to avoid desync.

---

## 18. Design Risks

### 18.1 Input During Playback May Feel Unfair

Because input during playback can count as a miss, the game must make playback state obvious.

Recommended mitigation:

- Disable input during playback by default.
- Show a clear “Wait for playback” warning if the player tries to act early.
- Only count early input as a miss if strict mode is enabled.

### 18.2 Spectator View May Desync

Spectators do not need frame-perfect playback. They need readable event feedback.

Recommended mitigation:

- Broadcast state changes and input attempts.
- Let each client animate locally.
- Avoid exact animation sync requirements across all clients.

### 18.3 Difficulty May Become Unreadable Too Quickly

If the sequence grows every success, the game may become chaotic within a 30-second round.

Recommended mitigation:

- Increase sequence length by one after each success.
- Avoid speed scaling in the MVP.
- Test whether the player can still read the pattern under lobby pressure.

---

## 19. MVP Scope

The minimum viable version should include:

- Four colored buttons.
- 30-second round timer.
- Starting sequence length based on challenge value.
- Sequence playback.
- Player repeat phase.
- Correct input validation.
- Miss detection.
- Timeout detection.
- Failure messages.
- Final result object.

Spectator broadcasting can be added after the local version works reliably.

---

## 20. Out of Scope for MVP

The following should not be included in the first implementation pass:

- Complex animations.
- Custom button skins.
- Advanced spectator effects.
- Global leaderboards.
- Player cosmetics.
- Multiple simultaneous active players.
- Anti-cheat beyond basic result validation.

These can be added after the base game loop is stable.

---

## 21. Success Criteria

Pattern Panic is successful if:

- The player instantly understands when to watch and when to input.
- Mistakes feel like the player’s fault, not unclear UI.
- A full round resolves quickly.
- Spectators can understand what happened.
- The game creates pressure without requiring complex rules.
- The parent game mode can easily consume the final result.
