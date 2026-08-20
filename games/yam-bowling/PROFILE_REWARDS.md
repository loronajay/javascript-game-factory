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
- Badges are receipts for feats. Player and bowler levels may award titles,
  cards, profile art, effects, and skins, but never badges merely for levelling.

## First production collection

| Reward | Kind | Source | Requirement | Visual story |
| --- | --- | --- | --- | --- |
| Pin Chaser | Title | Player Level | Reach Player Level 19 | A red ball pursuing a pin across a target crest |
| Pocket Hunter | Title | Player Level | Reach Player Level 13 | A ball curving into the pocket inside a hunter's reticle |
| Lane Reader | Title | Player Level | Reach Player Level 22 | An oil pattern rendered as a topographic lane map |
| Shotmaker | Title | Player Level | Reach Player Level 28 | A perfect strike inside a laurel of pins |
| Laser Focus | Badge | Achievement | Bowl a game with no shot outside the pocket | A pin held in a cool-blue precision sight |
| Precision Bowler | Badge | Achievement | Convert twenty spares without missing one | A measured pocket line inside mechanical calipers |
| Lane Legend | Badge | Achievement | Win a sanctioned match on every lane | A luminous lane passing through a monumental pin arch |
| Perfect Game | Badge | Achievement | Bowl a 300 | A black-diamond and gold perfect-rack medallion |
| Split Decision | Badge | Achievement | Convert the 7-10 split | Two fractured halves joined by the impossible line |
| Comeback Kid | Title | Behavior achievement | Win after trailing by 30 entering the final frame | A bowling-ball phoenix climbing back from the embers |
| Yam Champion | Title | Tournament | Win the Yam Championship | A pin crown, jewel ball, championship lane, and laurels |

## Second production collection

| Reward | Kind | Source | Requirement | Visual story |
| --- | --- | --- | --- | --- |
| Ice in the Tenth | Title | Achievement | Strike in the tenth when only a strike preserves the win | An ice ball shattering a red pressure ring |
| Spare Architect | Title | Career achievement | Convert 100 sanctioned career spares | Blueprint geometry, compass, pins, and a measured ball path |
| Bracket Breaker | Title | Tournament | Win a first sanctioned tournament | A cobalt ball breaking a steel tournament bracket |
| Undisputed | Title | Tournament | Win every major tournament in one season | A black-platinum grand-slam seal with four event jewels |
| Clean Card | Badge | Achievement | Finish regulation play without an open frame | An emerald ten-cell scorecard sealed with a perfect check |
| Turkey Club | Badge | Achievement | Roll three consecutive strikes | Three linked copper impact chevrons; deliberately no cartoon turkey |
| Road Tested | Badge | Career achievement | Complete a sanctioned match at every venue | A travel-case shield, destination panels, pins, and a winding lane route |
| Deep Bench | Badge | Career achievement | Win with every unlocked bowler | Five distinct balls on a legendary locker-room champion bench |

The optimized transparent WebP crests live in `assets/profile-rewards/`. Clean
Card and Turkey Club are detected from completed sanctioned matches, including
tenth-frame bonus balls. The career and tournament rewards have stable catalog
identities ready for their authoritative trackers.

Deployment note: the platform API mirrors the current Player Level and sparse
Bowler Mastery ladders. Migration `045` reconciles existing accounts that already
passed a moved threshold; it must run before the redesigned ladder is deployed.

## Strong next-wave candidates

### Skill and match feats

- **Rail Rider** badge — convert a spare after a legal gutter-edge recovery. Use
  a chrome rail and a ball balancing on a razor-thin line.

### Career and behavior

- **House Regular** title — finish 100 sanctioned games. Use a worn league patch
  with stitched lane boards.
- **Character Actor** title — win with ten different bowlers. Use ten spotlights
  converging on a player-card silhouette.
- **No Quit** badge — win three matches after losing the opening frames. Use a
  bent pin springing upright; track actual competitive recovery, not disconnects.

### Tournament prizes

- **Upset Artist** badge — defeat a higher-seeded player in an elimination match.
  Use a low seed punching upward through a gilded bracket.
- **Back-to-Back** title — defend a tournament title. Use two interlocked crowns,
  visually rarer than the first-win crest.
- **National Champion** badge — win the national event. Use an engraved silver
  eagle-lane medallion, keeping it below Yam Champion prestige.

## Prestige ladder

- Standard: simple patch or stamped enamel; one strong symbol.
- Rare: beveled metal, two-material contrast, more expressive silhouette.
- Legendary: jewelry-like materials, unique silhouette, layered depth, and a
  composition that still reads in the 46-by-52-pixel cabinet thumbnail.
