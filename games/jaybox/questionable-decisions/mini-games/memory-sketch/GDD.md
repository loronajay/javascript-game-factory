# Memory Sketch — Game Design Document

## 1. Overview

**Memory Sketch** is a penalty mini-game for **Questionable Decisions**.

The penalized player is briefly shown a source image, then must recreate it from memory using a mouse-based drawing canvas. After the drawing phase, the other players are shown the original source image and the player’s drawing side by side. Each judge submits a percentage score based on how closely the drawing matches the source image.

The submitted judge scores are averaged. A round score of **70% or higher** counts as a pass and avoids that round’s penalty. A round score below **70%** counts as a fail and applies a point penalty.

The mini-game lasts **3 rounds**, with each round using a more complex source image than the previous round.

---

## 2. Design Goals

### Primary Goals

- Create a memory-based penalty game that feels different from reflex, timing, or button-input penalties.
- Use social judgment as the scoring mechanism.
- Make the penalized player perform under pressure without requiring advanced drawing skill.
- Produce funny, readable results that other players can quickly evaluate.
- Keep the game short enough to function as a penalty interlude inside the larger game loop.

### Secondary Goals

- Support a folder-based source image library.
- Allow difficulty scaling through image complexity rather than excessive timer starvation.
- Keep drawing tools minimal so the challenge remains memory recall, not art production.
- Make the judging phase fast, clear, and hard to stall.

---

## 3. Core Game Loop

1. Select a source image based on the current round difficulty.
2. Show the image to the penalized player for a short memorization window.
3. Hide the image.
4. Open the drawing canvas.
5. The penalized player draws the image from memory.
6. Drawing ends when the timer expires or the player submits early.
7. Other players enter the judging phase.
8. Judges see the source image and submitted drawing side by side.
9. Each judge submits a percentage score from 0% to 100%.
10. Judge scores are averaged.
11. If the average is 70% or higher, the round is passed.
12. If the average is below 70%, the round is failed and the penalty is applied.
13. Continue until all 3 rounds are complete.

---

## 4. Player Roles

### Penalized Player

The penalized player is the artist.

Responsibilities:

- Memorize the source image.
- Recreate the image from memory using the drawing canvas.
- Submit the drawing before time expires, or allow the timer to auto-submit.

The penalized player does not grade their own drawing.

### Judging Players

All non-penalized players are judges.

Responsibilities:

- Compare the original source image against the submitted drawing.
- Submit a percentage score representing how close the drawing is to the original.
- Submit before the judging timer expires.

Judges are not guessing what the image was. They are grading the drawing against the visible source image.

---

## 5. Round Structure

Memory Sketch contains **3 rounds**.

Each round uses a higher difficulty tier:

| Round | Difficulty | Purpose |
|---|---:|---|
| Round 1 | Easy | Introduce the mechanic with a simple image |
| Round 2 | Medium | Add more details and spatial memory pressure |
| Round 3 | Hard | Test recall of a more complex image |

Each round is scored independently.

A passed round avoids that round’s penalty.  
A failed round applies that round’s penalty.

---

## 6. Suggested Timing

Initial timing values:

| Round | View Time | Draw Time | Judge Time |
|---|---:|---:|---:|
| Round 1 | 5 seconds | 25 seconds | 15 seconds |
| Round 2 | 6 seconds | 30 seconds | 15 seconds |
| Round 3 | 7 seconds | 35 seconds | 15 seconds |

The harder images receive slightly more view and draw time because difficulty should come primarily from image complexity, not from making the game unreadable.

These values should be treated as first-pass tuning values and adjusted during playtesting.

---

## 7. Source Image Requirements

Source images should be clear, readable, and designed for quick memory recall.

### Good Source Image Traits

- Strong silhouette.
- Clear subject.
- High contrast.
- Limited clutter.
- Recognizable shapes.
- Memorable visual details.
- Readable at the intended display size.

### Bad Source Image Traits

- Photorealistic clutter.
- Tiny text.
- Dense patterns.
- Low contrast.
- Too many similar small parts.
- Details that are impossible to judge quickly.

### Difficulty Guidelines

#### Easy Images

Easy images should contain one simple subject with a small number of memorable details.

Examples:

- Simple object.
- Basic icon.
- Single symbol.
- Simple face-like shape.
- Basic silhouette.
- Cartoon item with 2–4 major features.

#### Medium Images

Medium images should add more structure, detail, or spatial relationships.

Examples:

- One object with 5–8 recognizable features.
- Two simple objects.
- Object with internal details.
- Simple character or creature.
- Small layout with clear composition.

#### Hard Images

Hard images should be more complex, but still drawable in a funny and readable way.

Examples:

- Small scene.
- Character with multiple details.
- Creature with specific markings.
- Object with several important features.
- Composition with 8–12 recognizable details.

Hard images should not become so complex that every drawing predictably receives a low score.

---

## 8. Recommended Asset Structure

Recommended folder layout:

```text
memory-sketch/
  images/
    easy/
    medium/
    hard/
```

Each round pulls from the matching difficulty folder:

```text
Round 1 -> images/easy/
Round 2 -> images/medium/
Round 3 -> images/hard/
```

Alternative folder layout:

```text
memory-sketch/
  images/
    round-1/
    round-2/
    round-3/
```

The `easy / medium / hard` structure is preferred because it is reusable if the number of rounds changes later.

---

## 9. Drawing System

The drawing system should be intentionally minimal.

### Required Drawing Tools

- Draw.
- Erase.
- Undo.
- Clear canvas.
- Submit.

### Recommended Controls

| Action | Input |
|---|---|
| Draw | Left mouse drag |
| Erase | Eraser toggle or right mouse drag |
| Undo | Button or Ctrl+Z |
| Clear | Button |
| Submit | Button |

### Drawing Constraints

The player should not have access to advanced drawing tools.

Do not include:

- Color palettes.
- Layers.
- Shape tools.
- Fill tools.
- Brush libraries.
- Image tracing.
- Zoom-dependent precision tools.

The challenge is memory recall under pressure, not polished art production.

---

## 10. Judging System

After the drawing phase, judges are shown:

```text
SOURCE IMAGE        PLAYER DRAWING
```

Judges submit a score from **0% to 100%**.

Recommended input:

- Slider from 0 to 100.
- Visible numeric percentage.
- Submit button.

Avoid manual number entry as the primary input. It adds friction and increases the chance of bad input.

### Judge Score Rules

- Each judge may submit one score per round.
- Judges cannot change their score after submission.
- Judges cannot see other judge scores before submitting.
- The penalized player cannot judge their own drawing.
- Only submitted judge scores count toward the average.
- If no judges submit before time expires, use a fallback score.

### Fallback Rule

If no judges submit a score before the timer expires:

```text
Fallback score = 50%
```

This prevents the game from stalling.

### Competitive Safeguards

For casual play, the social judgment and possible bias are part of the comedy.

For competitive or ranked modes, additional safeguards may be needed:

- Require at least 2 submitted judge scores.
- Hide judge identities during scoring.
- Discard the highest and lowest score if there are 4 or more judges.
- Track suspicious judge behavior over time.
- Disable this mini-game in strict competitive playlists if fairness cannot be guaranteed.

---

## 11. Scoring

Each judge submits a percentage score.

Example:

```text
Judge A: 80%
Judge B: 65%
Judge C: 75%

Average Score: 73.3%
Result: Pass
```

### Pass / Fail Threshold

```text
Average score >= 70% = Pass
Average score < 70% = Fail
```

### Recommended Penalty Model

Each round is scored independently.

Suggested point penalties:

| Round | Difficulty | Failed Round Penalty |
|---|---:|---:|
| Round 1 | Easy | -5 points |
| Round 2 | Medium | -7 points |
| Round 3 | Hard | -10 points |

This makes later rounds more dangerous without allowing one bad round to invalidate the entire mini-game.

### Rejected Scoring Model

Do not average all 3 round scores into one final pass/fail result.

Reason:

- It creates dead rounds.
- A terrible early score can make later effort feel pointless.
- Independent round scoring creates clearer stakes.

---

## 12. UI States

### State 1: Intro

Purpose:

- Tell the penalized player they are about to memorize an image.
- Show round number and difficulty.

Displayed information:

- Mini-game name.
- Round number.
- Difficulty label.
- Brief instruction.

Example:

```text
Memory Sketch
Round 1 of 3 — Easy

Memorize the image.
You will need to draw it from memory.
```

### State 2: Memorization

Purpose:

- Show the source image to the penalized player only.
- Run the view timer.

Displayed information:

- Source image.
- Countdown timer.
- “Memorize this” instruction.

### State 3: Drawing

Purpose:

- Hide the source image.
- Let the penalized player draw from memory.

Displayed information:

- Drawing canvas.
- Draw timer.
- Tool controls.
- Submit button.

### State 4: Judge Review

Purpose:

- Show judges the source image and drawing side by side.
- Collect percentage scores.

Displayed information:

- Source image.
- Player drawing.
- Percentage slider.
- Submit button.
- Judge timer.

### State 5: Round Result

Purpose:

- Show the average score and pass/fail result.

Displayed information:

- Average percentage.
- Pass or fail label.
- Penalty applied, if any.
- Next round prompt, unless the mini-game is complete.

### State 6: Final Summary

Purpose:

- Summarize the 3-round outcome.

Displayed information:

- Round-by-round scores.
- Passed rounds.
- Failed rounds.
- Total penalty applied.

---

## 13. Data Model

Suggested round result object:

```js
{
  roundIndex: 0,
  difficulty: "easy",
  sourceImageId: "easy_001",
  drawingDataUrl: "data:image/png;base64,...",
  judgeScores: [
    {
      playerId: "player_2",
      score: 80
    },
    {
      playerId: "player_3",
      score: 65
    }
  ],
  averageScore: 72.5,
  passed: true,
  penaltyApplied: 0
}
```

Suggested mini-game result object:

```js
{
  gameId: "memory-sketch",
  penalizedPlayerId: "player_1",
  rounds: [],
  totalPenaltyApplied: 0,
  completed: true
}
```

---

## 14. Multiplayer / Network Considerations

Memory Sketch requires clear separation between what the artist sees and what the judges see.

### Artist Visibility

During memorization:

- The penalized player sees the source image.
- Judges should not need to see the image yet.

During drawing:

- The penalized player sees only the drawing canvas.
- The source image must remain hidden from the penalized player.

During judging:

- Judges see the source image and drawing.
- The penalized player may see the result screen, but should not submit a score.

### Required Network Events

Possible event list:

```text
memory_sketch_start
memory_sketch_round_start
memory_sketch_show_image
memory_sketch_begin_drawing
memory_sketch_stroke_update
memory_sketch_submit_drawing
memory_sketch_begin_judging
memory_sketch_submit_score
memory_sketch_round_result
memory_sketch_complete
```

### Anti-Stall Rules

- Drawing auto-submits when the timer expires.
- Judging ends when all judges submit or when the judge timer expires.
- If no judge scores exist, apply fallback score.
- If a judge disconnects, remove that judge from the required submission list.
- If the penalized player disconnects, the round fails by default unless the larger game has a different disconnect policy.

---

## 15. Implementation Notes

### Canvas Capture

The submitted drawing can be captured as:

```js
canvas.toDataURL("image/png")
```

For storage or network transmission, avoid sending stroke updates if not needed. A simple implementation can let the artist draw locally, then submit the final image data at the end.

For live spectator drawing, transmit strokes instead of full image data every frame.

### Stroke-Based Undo

Undo is easier if strokes are stored as separate entries.

Example:

```js
const strokes = [
  {
    tool: "pen",
    points: [
      { x: 10, y: 20 },
      { x: 12, y: 22 }
    ],
    width: 4
  }
];
```

On undo:

1. Remove the last stroke.
2. Clear the canvas.
3. Replay remaining strokes.

### Recommended First Implementation

Start simple:

- Local canvas drawing.
- Store strokes.
- Submit final canvas image.
- Judges score from final image.
- No live stroke streaming.

Live drawing can be added later if needed.

---

## 16. Audio / Feedback

Recommended feedback:

- Soft countdown tick during memorization.
- Faster ticking during final 3 seconds of drawing.
- Submit sound when drawing is locked.
- Slider confirm sound when judge submits.
- Pass sting.
- Fail sting.

Avoid overlong result animations. This mini-game should resolve quickly.

---

## 17. Tuning Variables

Expose these as configurable constants:

```js
const MEMORY_SKETCH_CONFIG = {
  rounds: [
    {
      difficulty: "easy",
      viewTimeMs: 5000,
      drawTimeMs: 25000,
      judgeTimeMs: 15000,
      failPenalty: 5
    },
    {
      difficulty: "medium",
      viewTimeMs: 6000,
      drawTimeMs: 30000,
      judgeTimeMs: 15000,
      failPenalty: 7
    },
    {
      difficulty: "hard",
      viewTimeMs: 7000,
      drawTimeMs: 35000,
      judgeTimeMs: 15000,
      failPenalty: 10
    }
  ],
  passThreshold: 70,
  fallbackJudgeScore: 50
};
```

---

## 18. Out of Scope for First Build

The first build should not include:

- AI-based drawing recognition.
- Automatic similarity scoring.
- Complex drawing tools.
- Color tools.
- Layer systems.
- Ranked fairness systems.
- Judge reputation systems.
- Replay gallery.
- Persistent drawing archive.
- Public sharing.
- Mobile-specific drawing UI polish.

These can be considered later if the base version proves fun.

---

## 19. Open Questions

These need to be resolved during implementation or playtesting:

1. Should the artist see their final score immediately after each round, or only at the end?
2. Should the penalized player see judge score breakdowns or only the average?
3. Should high and low judge scores be discarded when there are enough players?
4. Should images be allowed to repeat across sessions?
5. Should source images be preloaded before the mini-game starts?
6. Should the drawing canvas size match the source image aspect ratio exactly?
7. Should judges be required to submit before the result can appear, or should the timer always run its full duration?
8. Should the penalized player be allowed to submit early?
9. Should there be a minimum drawing time to prevent instant throwaway submissions?
10. Should failed rounds apply fixed penalties or scale based on how far below 70% the score was?

---

## 20. Current Canon Decisions

- The game is currently called **Memory Sketch**.
- The mini-game belongs to **Questionable Decisions**.
- It is a penalty mini-game.
- The penalized player draws from memory.
- The source image comes from a prepared image folder.
- Other players act as judges.
- Judges see the source image and drawing side by side.
- Judges submit percentage scores.
- Judges do not guess what the image was.
- Scores are averaged.
- 70% or higher is a pass.
- Below 70% is a fail.
- Failed rounds apply point penalties.
- The mini-game lasts 3 rounds.
- Image difficulty increases each round.
- Drawing should use mouse-first canvas controls.
- Drawing tools should remain minimal.