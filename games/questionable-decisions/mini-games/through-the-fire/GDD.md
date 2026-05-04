# Through the Fire — Game Design Document

## 1. Overview

**Through the Fire** is a multiplayer penalty event used after a player answers a source question incorrectly. The target player must survive anonymous roast rounds by predicting which roast the rest of the lobby will vote as the best.

The design goal is to turn a wrong answer into a social prediction challenge instead of a flat punishment. The target is still under pressure, but they have a skill-based escape route: read the room, predict the winning roast, and block the penalty.

## 2. Core Concept

Through the Fire is a social prediction penalty.

One player becomes the target. The other players submit anonymous roasts about the failed answer or the moment. The target reviews the submitted roasts and predicts which one will win the group vote. The non-target players then vote for the best roast, but they cannot vote for their own submission.

If the target predicts the winning roast, they block that round's penalty. If the target predicts incorrectly, that round counts as a miss and applies a point loss.

## 3. Player Eligibility

Through the Fire requires **4–6 players**.

It is disabled in:

- 2-player Duel Mode
- 3-player Party Mode

### 3.1 Eligibility Rationale

The mode breaks at 3 players.

With 3 players, there is 1 target and 2 roasters. Since roasters cannot vote for their own roast, each roaster is forced to vote for the other roast. This creates a guaranteed 1–1 tie every time, which removes meaningful voting.

### 3.2 Locked Eligibility Rule

Through the Fire requires 4–6 players.

There is no house vote, NPC vote, bot vote, or 3-player exception in the initial implementation.

## 4. Match Flow

Through the Fire runs for **3 rounds**.

Each round follows this sequence:

1. The non-target players submit roasts.
2. The target waits while submissions are collected.
3. Submitted roasts are shown anonymously to the target.
4. The target predicts which roast will win the group vote.
5. The roasters vote on the best roast.
6. Roasters cannot vote for their own roast.
7. Votes are revealed.
8. If the target predicted the winning roast, the target blocks that round.
9. If the target predicted incorrectly, that round counts as a miss.

## 5. Scoring

Each failed prediction equals **1 miss**.

Recommended point loss scales with the source question value:

| Source Question Value | Loss Per Failed Prediction |
|---:|---:|
| 100 points | -25 points |
| 200 points | -50 points |
| 300 points | -75 points |
| 400 points | -100 points |

The global penalty cap should still apply.

## 6. Tie Rule

If the target predicted any roast tied for first place, the prediction counts as correct.

The target should not be punished when the lobby fails to produce a clear winner and the target selected one of the tied winning roasts.

## 7. Timers

Recommended timing values:

| Phase | Recommended Duration |
|---|---:|
| Roast submission | 20–30 seconds |
| Target prediction | 15–20 seconds |
| Roaster vote | 10–15 seconds |
| Reveal | 7–10 seconds |
| Total rounds | 3 |

Through the Fire is longer than other penalties, so it should appear less frequently in the penalty rotation.

## 8. Auto-Submit Roast System

If a roaster times out, the server automatically submits a weak roast on that player's behalf.

This prevents the event from stalling and keeps the target prediction phase functional even when a player does not submit manually.

### 8.1 Default Auto-Submit Lines

- “Bro answered like his brain got repo’d.”
- “That answer was hot dog water with confidence.”
- “Somewhere out there, a loading screen is smarter than this.”
- “That response had expired milk energy.”
- “You picked the question and still got jumped by it.”
- “Your trivia game is built like a gas station sandwich.”
- “That answer was so bad the scoreboard asked for space.”
- “You missed so hard the room got secondhand embarrassment.”
- “Your brain clocked out and left a sticky note.”
- “That was not an answer. That was a system error with shoes.”

### 8.2 Optional Cruder Auto-Submit Lines

These lines are stronger and should be gated behind the game's tone settings or content rules if used.

- “That answer was pure ass with a username attached.”
- “You ate shit on your own question.”
- “Bro got folded by basic information.”
- “That was a certified dumbass speedrun.”
- “You fumbled so hard the floor filed a complaint.”
- “You answered like Google blocked you personally.”
- “Your brain pulled the fire alarm and left.”
- “That answer came straight from the toilet bowl.”
- “You got cooked, plated, and served with a side of shame.”
- “Congratulations, you made guessing look difficult.”

## 9. Content Safety Rules

Roasts should target:

- The failed answer
- The current game moment
- Fake game-show incompetence
- The player's in-game performance during the round

Roasts must not target:

- Protected traits
- Real-world appearance
- Family members
- Trauma
- Personal identity
- Sensitive real-life circumstances

## 10. Storage and Memory Rules

Raw roast text should not be published to public platform memories in version 1.

Roast text should be treated as temporary match data unless moderation, reporting, and review tools are implemented.

### 10.1 Safe Memory Cards

The platform may store general event summaries such as:

- “Jay failed Through the Fire twice.”
- “Leo predicted the winning roast all 3 rounds.”
- “Rosanna’s roast won the lobby vote.”
- “Jay got cooked in Through the Fire after missing a 400-point question.”

### 10.2 Risky Memory Cards

The platform should not store memory cards that quote submitted roast text.

Any memory that preserves a player's submitted roast creates moderation, privacy, and harassment risk.

## 11. Data Model

```js
const throughTheFirePenalty = {
  penaltyId: "through-the-fire",
  targetPlayerId: "player_1",
  sourceQuestionValue: 300,
  roundIndex: 1,
  totalRounds: 3,
  status: "submitting",
  submissions: [
    {
      id: "roast_1",
      authorPlayerId: "player_2",
      text: "That answer had expired milk energy.",
      submittedAt: ""
    }
  ],
  targetPredictionRoastId: "",
  votes: [
    {
      voterPlayerId: "player_3",
      roastId: "roast_1"
    }
  ],
  winningRoastId: "",
  targetSucceeded: false
};
```

## 12. Implementation Notes

The server should own all authoritative state for this penalty event.

Required server responsibilities:

- Track target player and eligible roasters.
- Enforce player-count eligibility.
- Enforce submission timers.
- Auto-submit fallback roast text when needed.
- Hide author identity from the target during prediction.
- Prevent roasters from voting for their own roast.
- Resolve ties using the target-friendly tie rule.
- Apply score loss only after final round resolution.
- Avoid publishing raw roast text outside temporary match state.

Client responsibilities:

- Show waiting UI for the target during submission.
- Show anonymous roast options during prediction.
- Show voting UI for roasters.
- Disable self-voting options.
- Show vote reveal and round outcome.
- Show total misses and final point loss after the event ends.

## 13. Design Constraints

Through the Fire should remain a limited-use penalty because it takes longer than a normal penalty event.

The mode should not be forced into unsupported lobby sizes. Adding bot votes or house votes would create fake social outcomes and weaken the core premise.

The first implementation should prioritize clean rule enforcement, stable timers, anonymous presentation, and safe temporary storage over advanced moderation or public memory features.
