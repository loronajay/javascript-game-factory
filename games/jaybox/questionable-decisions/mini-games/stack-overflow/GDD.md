# Stack Overflow — Game Design Document

## 1. Game Overview

**Game Title:** Stack Overflow  
**Parent Game:** Questionable Decisions  
**Game Type:** Penalty mini-game / rapid sorting challenge  
**Input Style:** Mouse drag / touch drag  
**Round Length:** Approximately 30 seconds  
**Player Role:** The penalized player  
**Audience Role:** Other players watch the penalized player panic, misread, and lose points under pressure.

Stack Overflow is a fast-paced sorting mini-game used as a penalty event inside Questionable Decisions. The penalized player must drag falling items into the correct container before the items reach the bottom of the screen. Items begin falling slowly so the player can understand the rules within the first few seconds, then the speed ramps aggressively until the screen becomes difficult to manage.

The game is designed around damage reduction. The player is not expected to gain points. The ideal outcome is losing fewer points than expected. A perfect run is theoretically possible, but it should be difficult enough that most players lose points.

The name Stack Overflow is intentional. It functions as a programming easter egg while also describing the gameplay: too many items are entering the system faster than the player can process them.

---

## 2. Design Purpose Inside Questionable Decisions

Stack Overflow exists to convert a missed question into an active penalty challenge.

In Questionable Decisions, players answer prompts or questions. When a player fails, they are sent into a mini-game where they have a chance to reduce or avoid the point loss. Stack Overflow should feel fair, readable, and funny to watch, but it should not be easy to escape without damage.

The player should feel:

- “I understand what to do.”
- “I can save some of these.”
- “This is getting out of control.”
- “I lost points, but some of that was my fault.”

The audience should see the player rapidly triaging items, making snap decisions, and occasionally throwing something into the wrong container under pressure.

---

## 3. Core Gameplay Loop

1. Five containers appear on screen.
2. Each container represents one category.
3. Items begin falling from the top of the screen.
4. The player drags each item into the matching container.
5. Correctly sorted items are cleared safely.
6. Items that reach the bottom cause a small point penalty.
7. Items placed into the wrong container cause a larger point penalty.
8. Fall speed and item pressure ramp up over the 30-second round.
9. When the timer expires, the total point loss is applied to the penalized player.

The game should not pause after mistakes. The penalty is immediate, and the round continues.

---

## 4. Win / Loss Philosophy

Stack Overflow does not use a traditional win/loss state.

The player always completes the 30-second challenge unless the parent game rules interrupt it. The result is measured by total points lost.

### Desired Outcome Range

- **Excellent run:** Very low point loss
- **Good run:** Below expected point loss
- **Average run:** Around the intended target loss
- **Bad run:** High loss from many missed items or wrong sorts
- **Disaster run:** The player panics, mis-sorts repeatedly, and the stack fully overwhelms them

A perfect run should be possible but rare. The game should not be tuned around perfect play. It should be tuned around the average player losing points while still feeling that better execution would have reduced the damage.

---

## 5. Round Length and Pacing

**Target round length:** 30 seconds

The round should ramp quickly because Questionable Decisions needs penalty mini-games to resolve fast and keep the larger party game moving.

### Recommended Pacing Curve

| Time Range | Gameplay Feel | Purpose |
|---|---|---|
| 0–3 seconds | Slow and obvious | Teach the rules without a tutorial |
| 4–10 seconds | Manageable pressure | Player starts sorting confidently |
| 11–20 seconds | Multiple active items | Mistakes and missed items become likely |
| 21–30 seconds | Overflow phase | The screen becomes chaotic and difficult to perfect |

The first 2–3 seconds are effectively the tutorial. The player should immediately understand the mechanic by seeing an obvious item fall and dragging it into the matching container.

---

## 6. Categories and Container Themes

Each round uses exactly five containers.

Five categories provide enough cognitive load without making the screen unreadable. Fewer categories may feel too easy. More categories may create visual clutter, especially when the item speed increases.

### Example Theme Sets

#### Simple / Highly Readable Themes

- Red / Blue / Green / Yellow / Purple
- Fruit / Meat / Dessert / Drink / Vegetable
- Fire / Water / Electric / Ice / Poison
- Animal / Vehicle / Tool / Food / Trash
- Recycle / Compost / Hazard / Paper / Landfill

#### Strong Party-Game Themes

- Horror / Comedy / Action / Sci-Fi / Romance
- Hero / Villain / Sidekick / Monster / Civilian
- Breakfast / Lunch / Dinner / Snack / Dessert
- School / Office / Gym / Kitchen / Garage
- Arcade / Casino / Carnival / Theater / Stadium

#### Programming / Computer-Themed Sets

- Bugs / Features / Errors / Data / Tools
- Images / Audio / Video / Code / Documents
- HTML / CSS / JavaScript / JSON / Assets
- Input / Output / Memory / Network / Storage

#### Brand or Pop-Culture-Style Themes

Examples like car manufacturers or movie titles can work as internal prototype themes, but public-facing builds should avoid direct logo usage or protected visual assets. If used, they should rely on text labels and original iconography, or be converted into parody/generic equivalents.

---

## 7. Item Design

Each falling item belongs to one of the five active categories.

Items must be readable at a glance. The challenge should come from speed, volume, and category recognition, not from unclear art.

### Item Requirements

Each item should have:

- A visible icon or label
- A category assignment
- A falling speed
- A draggable hitbox
- A state: falling, dragged, sorted, missed, or destroyed

### Item Readability Rules

Items should be visually distinct enough to identify quickly. Similar-looking items can be used later for difficulty, but the game should not rely on cheap ambiguity.

Good confusion is acceptable:
- Tomato vs. tomato-shaped bomb
- Full battery vs. leaking battery
- Clean wrench vs. broken wrench
- Normal file vs. corrupted file

Bad confusion should be avoided:
- Tiny icons that are hard to see
- Nearly identical silhouettes with no clear difference
- Color-only distinction if the theme is not color-based
- Text labels too small to read under pressure

---

## 8. Scoring and Penalties

Stack Overflow is balanced around expected point loss.

Correct sorts should primarily prevent damage. They do not need to award points. The player’s reward is avoiding penalties.

### Baseline Scoring Model

| Event | Suggested Penalty |
|---|---:|
| Correct sort | 0 |
| Missed item reaches bottom | -5 |
| Wrong container | -15 |

Wrong sorts should hurt more than missed items. This discourages panic-dragging and forces the player to choose between saving an item and risking a worse penalty.

### Target Average Loss

At standard difficulty, the average player should lose approximately **150 points**.

Example standard outcome:

| Mistake Type | Count | Penalty | Total |
|---|---:|---:|---:|
| Missed items | 14 | -5 | -70 |
| Wrong sorts | 5 | -15 | -75 |
| **Total Loss** |  |  | **-145** |

This lands close to the intended average and leaves room for better or worse performance.

---

## 9. Difficulty Scaling

Difficulty should scale based on the difficulty of the missed Questionable Decisions question.

The harder the missed question, the more punishing Stack Overflow becomes.

Difficulty should not only increase penalty values. It should also increase gameplay pressure.

### Difficulty Variables

- Spawn rate
- Fall speed
- Speed ramp curve
- Number of simultaneous active items
- Penalty values
- Item ambiguity
- Container placement complexity
- Late-round overload intensity

### Suggested Difficulty Tiers

| Parent Question Difficulty | Expected Average Loss | Gameplay Pressure |
|---|---:|---|
| Easy | 75–100 points | Slow ramp, fewer items |
| Medium | 125–150 points | Standard ramp and penalties |
| Hard | 175–225 points | Faster ramp, more items |
| Brutal | 250+ points | Heavy overload, higher penalties |

### Suggested Spawn Counts

| Difficulty | Approximate Items Spawned |
|---|---:|
| Easy | 25–35 |
| Medium | 35–45 |
| Hard | 45–60 |
| Brutal | 60–75 |

Not every spawned item is expected to be saved. Some items should be sacrificed during high-pressure moments. The player’s job is to limit the damage.

---

## 10. Controls

### Primary Controls

- Mouse: click and drag item
- Touch: press and drag item

### Drag Behavior

- Player presses on a falling item.
- Item attaches to cursor/finger.
- Item follows drag position.
- Releasing over the correct container clears the item.
- Releasing over the wrong container triggers a wrong-sort penalty.
- Releasing outside a container returns the item to falling behavior or drops it from that position.

### Recommended Release Behavior

If the player releases outside any container, the item should resume falling rather than immediately count as missed. This is more readable and less frustrating.

### Controller Support

Controller support is not a priority for the first version. This game is naturally mouse/touch-first. A future controller version would require a cursor system, but forcing controller support early would likely produce a worse version of the game.

---

## 11. Screen Layout

### Core Layout

- Top: spawn area
- Center: falling item field
- Bottom: danger line / overflow zone
- Edges or bottom row: five category containers
- HUD: timer and current point loss

### Container Placement

Containers should be large enough to target quickly but not so large that sorting becomes trivial.

Recommended layouts:

1. Five containers along the bottom, above the danger line.
2. Two containers on the left, two on the right, one at the bottom center.
3. Five containers arranged in a slight arc at the bottom.

The cleanest first version is five containers along the bottom. It is easiest to understand and tune.

### Danger Line

The bottom of the screen should clearly communicate that items crossing it are lost. This could be a glowing red line, trash chute, overflow stack, pit, or corrupted memory zone.

---

## 12. Feedback and Game Feel

Feedback must be fast and readable. The screen will already be busy, so effects should be short and clear.

### Correct Sort Feedback

- Quick snap or suction animation into container
- Small positive sound
- Brief container flash
- Optional small “SAFE” or checkmark indicator

### Wrong Sort Feedback

- Red flash on container
- Harsh buzz sound
- Penalty popup near the item or container
- Item disappears, breaks, or gets rejected

### Missed Item Feedback

- Item hits bottom and breaks, splats, glitches, or falls into overflow
- Small penalty popup at bottom
- Overflow meter or stack briefly pulses

### Timer Feedback

The final 5 seconds should feel urgent. Add subtle warning effects, but avoid making the screen unreadable.

Possible final-phase effects:

- Timer pulse
- Background warning glow
- Faster music layer
- Overflow warning sound
- “STACK OVERFLOW” warning text near the bottom

---

## 13. Audio Direction

Audio should support pressure without overwhelming the player.

### Audio Needs

- Item grab sound
- Correct sort sound
- Wrong sort sound
- Missed item sound
- Timer warning sound
- Final overload music or intensity layer

Correct sorting should sound clean and quick. Wrong sorting should sound noticeably harsher than missing an item, because it is the more expensive mistake.

---

## 14. Visual Theme

The name supports a computer-memory or warehouse-overload presentation.

### Recommended Theme Direction

A hybrid arcade/computer system theme:

- Falling objects resemble files, bugs, tools, icons, junk, or category objects.
- Containers resemble labeled system bins.
- The bottom area resembles an overflowing memory stack.
- Visual warnings use terminal/glitch language.

Possible UI labels:

- STACK LOAD
- OVERFLOW ZONE
- MEMORY PRESSURE
- SORT BUFFER
- DATA MISROUTED

The programming theme should remain light enough that non-programmers still understand the game instantly.

---

## 15. Balance Targets

### Standard Difficulty Target

- Round length: 30 seconds
- Containers: 5
- Average point loss: ~150
- Perfect play: possible but rare
- Player comprehension time: 2–3 seconds
- Main pressure source: speed ramp + simultaneous items
- Main mistake types: missed items and wrong containers

### Fairness Rules

The game should never feel like the UI cheated.

Avoid:

- Unreadable icons
- Containers moving too suddenly
- Labels swapping without clear warning
- Items spawning too close to the bottom
- Items falling behind UI elements
- Drag input failing under pressure

The player should lose because they could not keep up, not because the interface was unclear.

---

## 16. Optional Mechanics

These mechanics are not required for the first version but may be useful later.

### Overflow Meter

Missed items fill a visual stack at the bottom. The more it fills, the more chaotic the screen feels. This is mostly visual, but it can also increase tension.

### Priority Items

Some items have warning markers and cost more if missed. These should be introduced only after the base game works.

### Trap Items

Items that look similar to another category but belong somewhere else.

Example:
- Normal apple = Fruit
- Wormy apple = Trash
- Battery = Electric
- Leaking battery = Hazard

### Streak Recovery

A small recovery bonus after several correct sorts in a row. Use carefully. The game should not become score-positive too easily.

Example:
- 5 correct sorts in a row restores 5 points or cancels one missed-item penalty.

### Dynamic Themes

The parent game can choose category themes based on the missed question type, player profile, round type, or random selection.

---

## 17. MVP Scope

The first playable version should include only the systems required to prove the game works.

### MVP Features

- 30-second timer
- Five containers
- Falling items
- Mouse drag support
- Touch drag support if targeting mobile early
- Correct sort detection
- Wrong sort detection
- Missed item detection
- Point-loss tracking
- Speed ramp over time
- One or two category theme sets
- Basic visual and audio feedback
- End-of-round result summary

### MVP Non-Goals

- Controller support
- Moving containers
- Online multiplayer
- Complex item physics
- Advanced trap items
- Score-positive reward systems
- Large theme library
- Procedural category generation

The MVP should focus on feel and balance. If dragging feels bad, nothing else matters.

---

## 18. Implementation Notes

### Data Structure Concept

Each theme should define five categories and a pool of items.

Example structure:

```js
const theme = {
  id: "computer_files",
  name: "Computer Files",
  categories: [
    { id: "images", label: "Images" },
    { id: "audio", label: "Audio" },
    { id: "video", label: "Video" },
    { id: "code", label: "Code" },
    { id: "documents", label: "Documents" }
  ],
  items: [
    { id: "png_file", label: "PNG", category: "images" },
    { id: "mp3_file", label: "MP3", category: "audio" },
    { id: "mp4_file", label: "MP4", category: "video" },
    { id: "js_file", label: "JS", category: "code" },
    { id: "pdf_file", label: "PDF", category: "documents" }
  ]
};
```

### Spawn Logic

The spawner should use a difficulty profile that controls:

- Initial fall speed
- Maximum fall speed
- Spawn interval
- Spawn interval ramp
- Penalty values
- Total item density

### Drag Logic

Only one dragged item should be controlled at a time unless multi-touch is intentionally supported later. For MVP, single-item dragging is easier to balance and less error-prone.

---

## 19. Result Screen

At the end of the round, show a short summary.

Recommended fields:

- Total points lost
- Items sorted correctly
- Items missed
- Wrong sorts
- Optional rating label

Example rating labels:

- Clean Stack
- Minor Overflow
- System Strain
- Critical Overflow
- Total Crash

The result screen should resolve quickly so Questionable Decisions can continue to the next turn.

---

## 20. Final Design Summary

Stack Overflow is a 30-second sorting penalty game for Questionable Decisions. The penalized player must drag falling items into one of five themed containers before they hit the bottom. Items start slow enough for the player to learn the rule immediately, then speed ramps aggressively until the game becomes difficult to manage.

Missed items cause small point losses. Wrong sorts cause larger penalties. The average player should lose around 150 points at standard difficulty, with the loss scaling based on the difficulty of the question they missed. The game should feel fair, readable, and frantic, with perfect play possible but unlikely.

The ideal version creates a clear spectator moment: everyone understands what the player is trying to do, everyone can see the mistakes happening in real time, and the player feels responsible for how much damage they did or did not avoid.