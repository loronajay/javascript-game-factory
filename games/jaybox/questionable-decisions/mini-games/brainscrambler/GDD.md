# Brainscrambler — Game Design Document

## 1. Overview

**Brainscrambler** is a penalty mini-game for *Questionable Decisions* built around fast true/false judgment under semantic pressure.

The player is shown a short statement and must decide whether it is **TRUE** or **FALSE** before the timer expires. The statements use obvious facts, category relationships, opposites, negation, and double-negation traps. The challenge is not knowledge. The challenge is correctly parsing the sentence while under pressure.

The humor comes from the watching players seeing the trap clearly while the active player misreads or overthinks an obvious statement.

## 2. Design Pillars

### 2.1 Inversion Pressure

The core pressure comes from statements that look simple but require careful parsing.

Example:

```text
Red is not blue.
Answer: TRUE
```

```text
Red is not not blue.
Answer: FALSE
```

The player must process the actual logical meaning, not react to the keywords.

### 2.2 Obvious Facts Only

Brainscrambler must not become a trivia game. Every statement should be based on facts that are immediately knowable by almost all players.

Allowed content categories:

- Colors
- Shapes
- Basic numbers
- Simple arithmetic
- Common animals
- Common objects
- Basic categories
- Opposites
- Simple physical properties

Avoid:

- Trivia
- Debatable statements
- Technical classifications
- Cultural knowledge
- Trick facts
- Subjective claims
- Metaphorical or joke phrasing

Bad example:

```text
Tomatoes are fruits.
```

This may be technically true, but it invites argument and feels like trivia.

Good example:

```text
Blue is a color.
```

### 2.3 Dry Statements, Funny Failures

The statements themselves should not be written as jokes. The comedy should come from the active player failing an obvious logic parse while the other players watch.

Bad direction:

```text
A duck is a bread loaf with feet.
```

This pushes the game toward joke-card humor and creates literal-versus-metaphorical disputes.

Correct direction:

```text
A duck is an animal.
A duck is not a plant.
A duck is not not an animal.
```

## 3. Core Gameplay Loop

1. A statement appears on screen.
2. The player chooses **TRUE** or **FALSE**.
3. The game immediately validates the answer.
4. Correct answers continue the streak.
5. Wrong answers or timeouts apply a score penalty.
6. The next statement appears with escalating pressure.
7. The mini-game ends after a fixed number of statements or when the timer expires, depending on the larger *Questionable Decisions* round structure.

## 4. Controls

The game should support simple binary input.

Recommended controls:

- Keyboard:
  - Left / A = FALSE
  - Right / D = TRUE
- Gamepad:
  - Left direction / left button = FALSE
  - Right direction / right button = TRUE
- Mouse/touch:
  - On-screen TRUE and FALSE buttons

The active player should never need to move a cursor during gameplay. This game is about reading and reacting, not navigation.

## 5. Failure Conditions

The player fails an individual prompt if:

- They select the wrong answer.
- They fail to answer before the prompt timer expires.

Failure does not need to end the mini-game immediately. The preferred structure is cumulative penalty scoring across a fixed number of prompts.

## 6. Score Impact

Brainscrambler is a penalty mini-game, so scoring should affect how much damage the penalized player takes.

Recommended scoring model:

- Correct answer: no added penalty
- Wrong answer: increase penalty
- Timeout: increase penalty, equal to or worse than a wrong answer
- Correct streak: reduce future penalty or soften final damage

Example model:

```text
Wrong answer: +1 penalty
Timeout: +1 penalty
3-answer streak: -1 penalty reduction
Perfect run: bonus penalty reduction
```

The exact numbers can be tuned later against the full *Questionable Decisions* economy.

## 7. Difficulty Progression

Difficulty should increase through sentence structure, not obscure knowledge.

### Tier 1: Direct Statements

Basic true/false facts with no negation.

```text
Cats are animals.                  TRUE
Cats are plants.                   FALSE
Blue is a color.                   TRUE
Blue is a number.                  FALSE
Four is a number.                  TRUE
Four is a color.                   FALSE
A square is a shape.               TRUE
A square is an animal.             FALSE
```

### Tier 2: Single Negation

The statement introduces one negation.

```text
Cats are not plants.               TRUE
Cats are not animals.              FALSE
Blue is not a number.              TRUE
Blue is not a color.               FALSE
Four is not a color.               TRUE
Four is not a number.              FALSE
A square is not an animal.         TRUE
A square is not a shape.           FALSE
```

### Tier 3: Double Negation

The statement uses double negation. These should still be short and readable.

```text
Cats are not not animals.          TRUE
Cats are not not plants.           FALSE
Blue is not not a color.           TRUE
Blue is not not a number.          FALSE
Four is not not a number.          TRUE
Four is not not a color.           FALSE
A square is not not a shape.       TRUE
A square is not not an animal.     FALSE
```

### Tier 4: Opposite Traps

Opposite concepts are used to create fast misread pressure.

```text
Hot is not cold.                   TRUE
Hot is not not cold.               FALSE
Cold is not hot.                   TRUE
Cold is not not hot.               FALSE
Up is not down.                    TRUE
Up is not not down.                FALSE
Left is not right.                 TRUE
Left is not not right.             FALSE
Open is not closed.                TRUE
Open is not not closed.            FALSE
```

### Tier 5: Shape and Math Traps

These are highly deterministic and work well under pressure.

```text
A triangle has three sides.        TRUE
A triangle does not have four sides. TRUE
A triangle does not not have three sides. TRUE
A triangle does not not have four sides. FALSE
A circle has corners.              FALSE
A circle does not have corners.    TRUE
A circle does not not have corners. FALSE
A square has four sides.           TRUE
A square does not have three sides. TRUE
A square does not not have three sides. FALSE
```

```text
Two plus two is four.              TRUE
Two plus two is five.              FALSE
Two plus two is not five.          TRUE
Two plus two is not four.          FALSE
Two plus two is not not four.      TRUE
Two plus two is not not five.      FALSE
Three is greater than two.         TRUE
Three is less than two.            FALSE
Three is not less than two.        TRUE
Three is not not less than two.    FALSE
One is not greater than two.       TRUE
One is not not greater than two.   FALSE
```

### Tier 6: Mixed Pool

Late-game prompts should mix all previous types with shorter timers. This prevents players from settling into one parsing pattern.

Example late-game pool:

```text
Red is not blue.                   TRUE
Red is not not blue.               FALSE
Red is not not red.                TRUE
Red is not red.                    FALSE
A circle does not not have corners. FALSE
Two plus two is not not five.      FALSE
Three is not not less than two.    FALSE
A square is not not round.         FALSE
Cats are not not animals.          TRUE
Four is not a color.               TRUE
```

## 8. Statement Generation Model

Brainscrambler can be built from reusable fact pairs instead of manually writing every prompt.

Each entry can define:

```text
subject
true_property
false_property
```

Example:

```text
subject: Blue
true_property: a color
false_property: a number
```

Generated variants:

```text
Blue is a color.                   TRUE
Blue is a number.                  FALSE
Blue is not a number.              TRUE
Blue is not a color.               FALSE
Blue is not not a color.           TRUE
Blue is not not a number.          FALSE
```

This pattern creates many prompts while keeping logic deterministic.

## 9. Recommended Fact Pairs

```text
Blue / a color / a number
Red / a color / a shape
Four / a number / a color
Two / a number / an animal
Cats / animals / plants
Dogs / animals / rocks
Fish / animals / chairs
Trees / plants / animals
Cars / vehicles / vegetables
Spoons / utensils / planets
Squares / shapes / animals
Triangles / shapes / colors
Fire / hot / cold
Ice / cold / hot
Up / up / down
Left / left / right
Open / open / closed
Full / full / empty
Fast / fast / slow
Wet / wet / dry
```

Not every pair should use every template. For example, opposites may need cleaner phrasing than object categories.

## 10. Prompt Timing

Recommended timing model:

- Early prompts: 4.0 seconds
- Mid prompts: 3.0 seconds
- Late prompts: 2.0 seconds
- Final prompts: 1.5 seconds

The exact timing should be tuned after playtesting. The game should feel stressful, but not unreadable.

A hard lower bound should exist. If the player cannot reasonably read the prompt, the game stops being skill-based.

## 11. Visual Design

The presentation should support quick parsing.

Recommended layout:

```text
[STATEMENT TEXT]

[FALSE]                         [TRUE]
```

Visual requirements:

- Large centered statement text
- High contrast
- No visual clutter around the sentence
- TRUE and FALSE buttons always in the same positions
- Strong feedback after selection
- Timer visible but not distracting

Avoid animated text effects that make reading harder. The game is already mentally hostile; the UI should not interfere with legibility.

## 12. Feedback Design

After each answer, show immediate result feedback.

Correct:

```text
CORRECT
```

Wrong:

```text
WRONG
Correct answer: TRUE
```

Timeout:

```text
TIMEOUT
Correct answer: FALSE
```

For spectators, quick answer reveal is important. The entertainment value improves when everyone immediately sees how the player got trapped.

## 13. Content Rules

Every statement must pass these checks:

1. The answer is objectively TRUE or FALSE.
2. The statement does not rely on trivia.
3. The statement does not rely on technical classification.
4. The statement does not rely on subjective interpretation.
5. The statement does not rely on metaphor.
6. The statement is short enough to parse under time pressure.
7. The statement has no accidental alternate reading.
8. The false version is clearly false.
9. The true version is clearly true.
10. The challenge comes from wording, not knowledge.

## 14. Example Approved Prompt Set

This is a strong starter set for implementation and testing.

```text
Cats are animals.                         TRUE
Cats are plants.                          FALSE
Cats are not plants.                      TRUE
Cats are not animals.                     FALSE
Cats are not not animals.                 TRUE
Cats are not not plants.                  FALSE

Blue is a color.                          TRUE
Blue is a number.                         FALSE
Blue is not a number.                     TRUE
Blue is not a color.                      FALSE
Blue is not not a color.                  TRUE
Blue is not not a number.                 FALSE

Hot is not cold.                          TRUE
Hot is not not cold.                      FALSE
Cold is not hot.                          TRUE
Cold is not not hot.                      FALSE
Left is not right.                        TRUE
Left is not not right.                    FALSE
Open is not closed.                       TRUE
Open is not not closed.                   FALSE

A triangle has three sides.               TRUE
A triangle does not have four sides.      TRUE
A triangle does not not have three sides. TRUE
A triangle does not not have four sides.  FALSE
A circle has corners.                     FALSE
A circle does not have corners.           TRUE
A circle does not not have corners.       FALSE
A square has four sides.                  TRUE
A square does not have three sides.       TRUE
A square does not not have three sides.   FALSE

Two plus two is four.                     TRUE
Two plus two is five.                     FALSE
Two plus two is not five.                 TRUE
Two plus two is not four.                 FALSE
Two plus two is not not four.             TRUE
Two plus two is not not five.             FALSE
Three is greater than two.                TRUE
Three is less than two.                   FALSE
Three is not less than two.               TRUE
Three is not not less than two.           FALSE
One is not greater than two.              TRUE
One is not not greater than two.          FALSE
```

## 15. Out of Scope

The following should not be included in the first implementation:

- Real trivia questions
- Player-submitted statements
- AI-generated statements without validation
- Joke/metaphor prompt writing
- Long paragraph prompts
- Multi-choice answers beyond TRUE/FALSE
- Explanations during active play
- Complex formal logic notation

## 16. Implementation Notes

A simple implementation can use a static prompt table first. Each prompt entry should include:

```json
{
  "text": "Blue is not not a number.",
  "answer": false,
  "tier": 3,
  "category": "color"
}
```

The game should shuffle prompts within the allowed difficulty band. Avoid showing too many prompts from the same pattern back-to-back unless intentionally ramping difficulty.

Later, the system can generate prompts from templates, but the first version should prioritize hand-approved statements so the game does not ship with ambiguous wording.

## 17. Design Summary

Brainscrambler is a fast true/false parsing game where obvious facts are wrapped in negation pressure. The best version is dry, clean, and strict. The player is not losing because they lack knowledge. They are losing because the sentence structure made them betray themselves under time pressure.