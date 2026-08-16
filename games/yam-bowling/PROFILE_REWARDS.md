# Yam Bowling titles and badges

Titles and badges are public proof of a story: what a player mastered, survived,
or won. They never change scoring, physics, timing, or matchmaking.

## Collection rules

- Keep reward names as live UI text. Crest art is text-free so it stays crisp at
  small sizes, remains localizable, and can appear in celebrations or cards.
- Give each earning channel its own visual language:
  - Mastery: technical enamel, measured geometry, metals that grow more precious.
  - Skill achievements: unusual silhouettes that depict the exact bowling feat.
  - Career and behavior: heraldic symbols with more personality than machinery.
  - Tournaments: engraved gold, ribbons, crowns, laurels, and event jewels.
- A legendary reward needs a distinct silhouette and richer material treatment,
  not merely a gold recolor of a rare reward.
- Locked rewards stay visible in the cabinet with their exact earning condition.
- Prefer feats a player can intentionally pursue. Hidden surprises are welcome,
  but opaque chores and pure luck should not dominate the collection.

## First production collection

| Reward | Kind | Source | Requirement | Visual story |
| --- | --- | --- | --- | --- |
| Pin Chaser | Title | Mastery | Reach bowler mastery 19 | A red ball pursuing a pin across a target crest |
| Laser Focus | Badge | Mastery | Reach bowler mastery 13 | A pin held in a cool-blue precision sight |
| Precision Bowler | Badge | Mastery | Reach bowler mastery 21 | A measured pocket line inside mechanical calipers |
| Lane Legend | Badge | Mastery | Reach bowler mastery 28 | A luminous lane passing through a monumental pin arch |
| Perfect Game | Badge | Achievement | Bowl a 300 | A black-diamond and gold perfect-rack medallion |
| Split Decision | Badge | Achievement | Convert the 7-10 split | Two fractured halves joined by the impossible line |
| Comeback Kid | Title | Behavior achievement | Win after trailing by 30 entering the final frame | A bowling-ball phoenix climbing back from the embers |
| Yam Champion | Title | Tournament | Win the Yam Championship | A pin crown, jewel ball, championship lane, and laurels |

The optimized transparent WebP crests live in `assets/profile-rewards/`. Mastery
rewards resolve through their levels, the three shipped match achievements claim
their fixed catalog ids, and a replay-safe rotating CPU tournament grants Yam
Champion alongside its server-selected cosmetic prize.

## Strong next-wave candidates

### Skill and match feats

- **Clean Card** badge — complete a ten-frame game without an open frame. Use an
  immaculate ivory scorecard seal, not another pin rack.
- **Ice in the Tenth** title — strike when only a strike can win in the tenth.
  Use a frozen ball cracking a red pressure ring.
- **Spare Architect** title — convert 100 career spares. Use blueprint geometry
  assembling two pin groups into one frame.
- **Turkey Club** badge — roll three consecutive strikes. Use three linked
  impact chevrons; avoid literal cartoon poultry.
- **Rail Rider** badge — convert a spare after a legal gutter-edge recovery. Use
  a chrome rail and a ball balancing on a razor-thin line.

### Career and behavior

- **House Regular** title — finish 100 sanctioned games. Use a worn league patch
  with stitched lane boards.
- **Road Tested** badge — complete a match at every venue. Use a travel-case
  shield assembled from venue color chips.
- **Character Actor** title — win with ten different bowlers. Use ten spotlights
  converging on a player-card silhouette.
- **Deep Bench** badge — record a win with every unlocked bowler. Use a panoramic
  locker-room crest; this should be legendary and visibly dense.
- **No Quit** badge — win three matches after losing the opening frames. Use a
  bent pin springing upright; track actual competitive recovery, not disconnects.

### Tournament prizes

- **Bracket Breaker** title — win a first sanctioned tournament. Use a steel
  bracket physically split by a bowling ball.
- **Upset Artist** badge — defeat a higher-seeded player in an elimination match.
  Use a low seed punching upward through a gilded bracket.
- **Back-to-Back** title — defend a tournament title. Use two interlocked crowns,
  visually rarer than the first-win crest.
- **National Champion** badge — win the national event. Use an engraved silver
  eagle-lane medallion, keeping it below Yam Champion prestige.
- **Undisputed** title — win every major tournament in one season. Use a black
  platinum grand-slam seal with the major event jewels around its rim.

## Prestige ladder

- Standard: simple patch or stamped enamel; one strong symbol.
- Rare: beveled metal, two-material contrast, more expressive silhouette.
- Legendary: jewelry-like materials, unique silhouette, layered depth, and a
  composition that still reads in the 46-by-52-pixel cabinet thumbnail.
