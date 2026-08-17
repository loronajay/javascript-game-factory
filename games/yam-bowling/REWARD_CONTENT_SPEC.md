# Reward Content Spec — art the ladders are waiting on

Generated content this pass needs, with the exact slugs the catalogs will reference.
**Filenames are contracts**: `room-core.js` and `cosmetics-core.js` derive every path
from the slug, so a misnamed file is a broken node, not a cosmetic issue.

Everything not listed here is being built in code and needs no art.

---

## 0. Status — what has landed

**Done and wired:** the 3 rooms (`fireside-lodge`, `desert-vista`, `deep-sea-suite`)
are in the catalog on mastery 7/15/25. The 8 new crests are wired to achievements
and tournaments. The emote pool, voucher picker and online match reactions are live.
All player and mastery ladder nodes now resolve to wearable content.

**Naming note:** rooms and crests came back with different slugs than section 1 and 2
below requested. That was fine — the catalog now follows the delivered filenames
rather than the other way round. Sections 1 and 2 are kept as a record of the
convention, not as outstanding work.

## 1b. Mastery titles — 3 needed (crest art optional)

Mastery 13/21/28 used to pay badges. Badges are achievement rewards now, so those
rungs pay titles. **They already work** — a title is live text and needs no image —
so this art is an enhancement, not a blocker.

| Slug | Name | Tier | Mastery level |
|---|---|---|---|
| `pocket-hunter` | Pocket Hunter | rare | 13 |
| `lane-reader` | Lane Reader | rare | 21 |
| `shotmaker` | Shotmaker | legendary | 28 |

Same crest spec as section 2. Suggested subjects:

- `pocket-hunter` — a ball's path curving into the 1-3 pocket inside a hunter's
  reticle, warm amber on gunmetal.
- `lane-reader` — an oil pattern rendered as a topographic map with a read line
  across it, deep teal and brass.
- `shotmaker` — a single perfect shot frozen mid-strike inside a laurel of pins,
  legendary treatment: obsidian, mirror gold, white fire.

## 1. Player rooms — 3 new (done)

Drop PNG masters at `assets/menu-splashes/player-rooms/<slug>.png`, then run
`python tools/optimize_runtime_assets.py` to produce the `.webp` the game loads.
Full-screen backdrops, **no thumbnail** — the optimizer deliberately generates none
for this collection.

Match the existing 13: a personal space seen from inside, no characters, no text,
horizontal, readable behind UI panels (avoid busy detail in the upper-left third,
where the profile card sits).

| Slug | Name | Tier | Mastery level | Description (catalog copy) |
|---|---|---|---|---|
| `practice-garage` | Practice Garage | standard | 7 | Oil, rubber, and a lane you taped out yourself. |
| `trophy-loft` | Trophy Loft | rare | 15 | Warm wood and glass cases, filling one shelf at a time. |
| `midnight-observatory` | Midnight Observatory | legendary | 25 | A brass telescope, a domed roof cranked open, and the whole sky. |

## 2. Player ladder titles — 4 live-text rewards (done)

Drop at `assets/profile-rewards/<slug>.webp`, 512px, alpha, following the crest
style in `assets/profile-rewards/PROMPTS.md` — centered, text-free, bold silhouette
readable at 48px, generous padding, no cast shadow. Reward names stay live UI text,
so **do not render the name into the image**.

These fill the player ladder's four identity nodes. Titles are live text, so the
rewards are complete without crest art; matching crests remain an optional visual
enhancement. The other former identity nodes at 7/16/22/30 now pay Emote Vouchers,
not badges.

| Slug | Name | Type | Tier | Player level | Node key |
|---|---|---|---|---|---|
| `lane-regular` | Lane Regular | title | rare | 4 | `title-i` |
| `house-favourite` | House Favourite | title | rare | 13 | `title-ii` |
| `lane-veteran` | Lane Veteran | title | rare | 19 | `title-iii` |
| `yam-legend` | Yam Legend | title | legendary | 30 | `title-master` |

Suggested subjects, in the voice of the existing eight:

- `lane-regular` — a worn house ball resting in a return rack with a lane stretching
  behind it; approachable bronze and warm oak, nothing gilded.
- `house-favourite` — a pin wearing a small laurel with a crowd silhouette behind,
  amber stage light, ruby enamel and warm gold.
- `lane-veteran` — a chevron rank insignia built from stacked lane arrows over
  crossed pins; gunmetal, olive enamel, aged silver.
- `yam-legend` — a monumental engraved emblem: a yam-red ball at the centre of a
  radiant sunburst crowned with pins, obsidian foundation, mirror gold, amethyst.

## 3. Emotes — done

Thirty stickers, renamed by gesture, optimized from 56 MB of PNG masters to
**847 KB** of WebP (320px, quality 86, via `tools/optimize_runtime_assets.py`,
which now globs `assets/emotes/`). PNG masters stay as the editable source.

The pool is **global**: any bowler wears any emote, so a slug names the gesture
and never whoever is drawn making it. A test asserts no slug contains a roster
name.

| Earned by | Count | Which |
|---|---|---|
| founding | 6 | `wave`, `thumbs-up`, `good-luck`, `nice-one`, `lets-go`, `oh-no` |
| mastery level 17 | 1 | `game-face` |
| Emote Voucher | 23 | everything else |

The founding six are deliberately warm or neutral — they are shown to an
opponent, and nothing in the starter set reads as taunting when it lands after
their gutter ball. The sharper ones (`cheeky`, `you-next`, `brush-it-off`,
`number-one`) are bought.

**Emote Vouchers** are the currency, mirroring Skin Vouchers: player ladder
levels 7, 16, 22 and 30, plus the tournament prize pool at a high weight (it is
the repeatable source — the ladder pays only four across all thirty levels). A
voucher buys any of the 23; it can never be spent on a founding emote or on
`game-face`, since both would burn it for something already owned or granted.

Adding an emote later is: one PNG in `assets/emotes/`, one row in
`emote-core.js`, one slug in `EMOTE_SLUGS` in `yam-bowling-loadout-catalog.mts`,
and one in `EMOTE_VOUCHER_SLUGS` in `yam-bowling-reward-catalog.mts`.

## Not needed this pass

Deliberately **not** being generated, so nobody spends a Codex run on them:

- **Per-bowler skins.** Mastery no longer grants skins at any level. `swimsuit` and
  `maid` stay voucher-only, and vouchers come from the player ladder (L10, L25) and
  tournaments — never from mastery.
- **Character banners, alt menu splashes, rare splashes.** Deferred; those nodes are
  now rooms.
- **Player card artwork.** L9/L12/L24 are drawn frames over the portrait that already
  ships. No new per-bowler images.
- **Trails and bursts.** Palette data written in code, not assets.
- **More emotes.** Thirty is a deep pool; the voucher economy is tuned to it.
- **Profile icons.** Cropped from the canon portrait already on disk.
- **Entrances.** CSS — confetti, neon spotlight, pyro.
