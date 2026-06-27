# Pressure Typer — Game Design Document

## 1. Overview

**Pressure Typer** is a multiplayer penalty minigame where non-penalized players submit short sentences for one penalized player to type exactly under time pressure.

The penalized player must type each sentence before its timer expires. If the timer runs out, the player loses points and advances to the next sentence. Other players observe the attempt in real time.

The mechanic replaces a fixed, canned apology-style penalty with a player-authored typing gauntlet.

## 2. Player Count

Pressure Typer supports **2–6 players**.

In **Duel Mode**, the opposing player submits the sentences.

## 3. Core Gameplay Loop

1. A player triggers or receives the Pressure Typer penalty.
2. All non-penalized players enter sentence submissions.
3. The server validates all submitted sentences.
4. Valid submissions are shuffled.
5. The server selects up to 8 active sentences.
6. If fewer than 8 valid sentences are available, fallback sentences fill the remaining slots.
7. The penalized player types each sentence exactly.
8. Each sentence resolves as either completed or failed.
9. Failed sentences deduct points based on the source question value.
10. The penalty ends after all active sentences resolve.

## 4. Submission Rules

Each non-penalized player may submit up to **5 sentences**.

Recommended v1 limits:

| Rule | Value |
|---|---:|
| Minimum sentence length | 8 characters |
| Maximum sentence length | 80 characters |
| Maximum submissions per player | 5 |
| Submission timer | 30 seconds |
| Duplicate sentence rejection | Yes |
| Blank or space-only rejection | Yes |

Invalid submissions must be rejected. The system should explain why the sentence was rejected.

Submitted sentences must not be silently rewritten. Because typing validation is exact, rewriting a sentence can create unfair input expectations.

## 5. Active Queue Rules

The penalized player should not be forced to type every valid submitted sentence.

With 6 players, the maximum raw submission count could reach 25 sentences, which is too long for a penalty sequence.

The locked v1 active queue cap is:

```txt
Maximum active sentences: 8
```

Server flow:

1. Collect submissions.
2. Reject invalid entries.
3. Shuffle valid submissions.
4. Select up to 8 sentences.
5. Fill missing slots with fallback sentences if needed.

## 6. Sentence Timer

Sentence timers scale by character count.

Recommended formula:

```js
sentenceTimerSeconds = clamp(4 + characterCount * 0.12, 5, 12);
```

Example timer values:

| Sentence Length | Timer |
|---:|---:|
| 20 characters | 6.4 seconds |
| 40 characters | 8.8 seconds |
| 60 characters | 11.2 seconds |
| 80 characters | 12 seconds |

Because typing is case-sensitive and exact, the timer should not be excessively punishing in v1.

## 7. Typing Validation

Typing requires an exact match.

```js
typedText === targetSentence
```

Validation rules:

- Case-sensitive.
- Punctuation-sensitive.
- Spacing-sensitive.
- Emoji-sensitive if emoji are allowed.
- No lowercasing.
- No trimming after typing starts.
- No autocorrect normalization.

Mobile input should disable autocorrect and related input transformations where possible.

```html
<textarea
  autocapitalize="off"
  autocomplete="off"
  autocorrect="off"
  spellcheck="false"
></textarea>
```

## 8. Scoring

Each failed sentence deducts points from the penalized player.

Because Pressure Typer can include up to 8 active sentences, each individual failure should have a relatively small penalty.

Recommended point loss table:

| Source Question Value | Point Loss Per Failed Sentence | Max Loss Across 8 Sentences |
|---:|---:|---:|
| 100 | -5 | -40 |
| 200 | -10 | -80 |
| 300 | -15 | -120 |
| 400 | -20 | -160 |

This penalty is intentionally lighter than harsher punishment mechanics because the time pressure, public visibility, and player-authored prompts already carry most of the punishment value.

## 9. Fallback Sentences

Fallback sentences are used when players do not submit enough valid entries to fill the active queue.

Recommended fallback pool:

```txt
Typing this is still easier than that question.
I picked the question and got bodied.
My answer was ass and I know it.
I folded under educational pressure.
The lobby watched me eat shit in real time.
I brought confidence and zero facts.
My brain left and took the good answers.
I am typing through the shame.
That question packed me up.
I got cooked by basic information.
I apologize to the scoreboard.
My thumbs are now on trial.
I answered like a haunted calculator.
I turned trivia into a crime scene.
I am the reason the timer exists.
```

Fallback sentence selection should avoid immediate duplicates within the same penalty instance.

## 10. Moderation Rules

The submission system must block abusive or unsafe input before sentence queue construction.

Reject sentences containing:

- Slurs.
- Threats.
- Sexual harassment.
- URLs.
- Doxxing or personal identifying information.
- Excessive repeated characters.
- Invisible or control characters.
- Line breaks.
- Extreme length abuse.

The system should reject invalid submissions directly rather than modifying them.

## 11. Spectator Display

Non-typing players should be able to watch the penalty resolve in real time.

Spectators see:

- Current target sentence.
- Typed progress.
- Sentence timer.
- Success or failure result.
- Points lost.
- Submitter reveal after each sentence resolves.

During active typing, the sentence submitter should remain anonymous. The submitter is revealed only after the sentence resolves.

## 12. UI Requirements

### Penalized Player View

The penalized player view should prioritize clarity and input focus.

Required elements:

- Current sentence.
- Text input field.
- Countdown timer.
- Current sentence index.
- Remaining sentence count.
- Points at risk or points lost.
- Success/failure feedback after each sentence.

### Spectator View

The spectator view should emphasize the live attempt.

Required elements:

- Current target sentence.
- Live typed progress.
- Timer.
- Result state.
- Submitter reveal after resolution.

### Submission View

The submission view should make limits clear.

Required elements:

- Sentence input field.
- Remaining submissions count.
- Character count.
- Submission timer.
- Validation error messages.
- Submitted sentence list for that player.

## 13. Server Authority

The server should be authoritative over:

- Submission validation.
- Duplicate rejection.
- Sentence queue construction.
- Sentence shuffle order.
- Timer duration.
- Timer start and expiration.
- Success/failure resolution.
- Point deduction.
- Submitter reveal timing.

Clients may display optimistic UI for submitted sentences, but the server result is final.

## 14. Data Model

Example penalty state object:

```js
{
  penaltyId: "pressure-typer",
  targetPlayerId: "player_1",
  sourceQuestionValue: 300,
  sentenceCount: 8,
  completedCount: 5,
  failedCount: 3,
  pointsLost: 45,
  sentences: [
    {
      id: "sentence_1",
      authorPlayerId: "player_2",
      text: "My answer was ass and I know it.",
      completed: true,
      timedOut: false,
      timerSeconds: 8.2
    }
  ]
}
```

Recommended additional implementation fields:

```js
{
  activeSentenceIndex: 0,
  phase: "submitting", // submitting | typing | resolving | complete
  submissionEndsAt: 0,
  sentenceStartedAt: 0,
  sentenceEndsAt: 0,
  typedText: "",
  revealedAuthorPlayerId: null
}
```

## 15. Game States

Recommended state flow:

```txt
idle
  -> submitting
  -> queue_building
  -> typing_sentence
  -> sentence_resolved
  -> typing_sentence
  -> complete
```

Failure cases should resolve cleanly:

- If no players submit valid sentences, use fallback sentences.
- If a player disconnects while submitting, use whatever valid submissions already exist.
- If the penalized player disconnects, resolve according to the parent game's disconnect/forfeit rules.
- If a timer desync is detected, server time wins.

## 16. Audio and Feedback

Recommended feedback events:

- Submission accepted.
- Submission rejected.
- Typing round begins.
- Timer warning.
- Sentence completed.
- Sentence failed.
- Points deducted.
- Penalty complete.

Audio should support tension without masking typing feedback.

## 17. v1 Scope

Pressure Typer v1 includes:

- 2–6 player support.
- Duel Mode support.
- Player-authored sentence submission.
- Up to 5 submissions per non-penalized player.
- 30-second submission timer.
- Server-side validation.
- Queue cap of 8 active sentences.
- Fallback sentences.
- Exact-match typing validation.
- Character-count-based sentence timers.
- Point loss based on source question value.
- Real-time spectator display.
- Anonymous submitter during typing.
- Submitter reveal after sentence resolution.

## 18. Out of Scope for v1

The following should not be included in v1 unless explicitly promoted later:

- Custom sentence packs.
- Player profile sentence history.
- Persistent authored sentence libraries.
- Ranking or achievements specific to Pressure Typer.
- AI-generated sentences.
- Voice input.
- Accessibility-specific alternate typing modes.
- Advanced moderation review queues.

## 19. Open Questions

These should be resolved before implementation lock:

1. Should emoji be allowed, or should emoji be rejected for input consistency?
2. Should punctuation-heavy sentences be allowed if they pass moderation?
3. Should the penalized player see total possible point loss before typing starts?
4. Should spectators see exact typed text or only progress highlighting?
5. Should fallback sentences be configurable per game mode?
