# Yam Bowling — Metagame Scope

This document is the checkable backlog for character identity, cosmetics, progression, and Yam-specific player profiles. `GDD.md` remains the source of truth for the playable bowling game; this file owns the metagame roadmap.

## How to use this document

- `[x]` means the capability exists in the current game or the slice is shipped.
- `[ ]` means it is approved scope but not yet complete.
- Keep completed items checked until the whole milestone ships. Move shipped implementation detail to release notes instead of letting this become a second architecture document.
- Implement one milestone slice at a time and add tests before production code.

## Product rules

- Player Level represents overall Yam Bowling participation.
- Bowler Level represents mastery of one character. Launch cap: level 30.
- Progression rewards are cosmetic or presentational. No reward changes ball or bowler performance.
- CPU, local hotseat, practice, and tutorial play award no Player XP or Bowler XP.
- Online and campaign are the only XP-eligible mode families. Campaign rewards are primarily first-clear rewards.
- Match completion is the main XP source; winning is a modest bonus so a close loss still feels worthwhile.
- The authoritative server grants online XP once per match session. A client never declares its own XP, unlocks, or stats.
- Character levels cannot be purchased. A maximum-mastery reward must always signify play with that bowler.
- A Featured Bowler/Featured Skin on the player profile is independent of the skin equipped for gameplay.
- New progression systems must migrate safely from existing local cosmetic selections.

## Current foundation

- [x] 30-character canon roster with stable slugs.
- [x] Front-facing canon selection portraits and rear-facing throw animation frames.
- [x] Per-character skin selection stored on the device and propagated into local and online matches.
- [x] Classic and Swimsuit skin packages; Maid Café package rollout is present in the current working tree.
- [x] Outcome-specific victory and defeat artwork.
- [x] Selectable menu-splash artwork stored on the device.
- [x] Factory identity is used for online display names and account IDs.
- [x] Signed-in online results can update wins, losses, draws, and ELO.
- [x] Quick Bowl and Classic Ten exist for hotseat, CPU, and online play.
- [x] Complete the character-bio set. It covers all 30 canon bowlers.
  - [x] Kevya Desai
  - [x] Lillie Chen
  - [x] Marisol Cruz
  - [x] Rei Nakamura
  - [x] Simone Carter
  - [x] Talia Dodson

## Delivery order

| Order | Milestone | Size | Why it comes here |
|---:|---|---|---|
| 0 | Content and data foundation | Small | Completes source material and establishes stable IDs/schemas. |
| 1 | Read-only character inspector | Small | Makes bios and existing skins valuable immediately. |
| 2 | Cosmetic catalog and presentation loadout | Small–medium | Gives every present and future reward one inventory/equipment contract. |
| 3 | Ball trails and strike bursts | Medium | Adds visible rewards without touching scoring or authority. |
| 4 | Progression domain and server persistence | Large | Makes XP and unlocks trustworthy and non-farmable. |
| 5 | Bowler unlock tree and progression UI | Medium | Exposes the authoritative data in a motivating form. |
| 6 | Yam player profiles and match presentation | Large | Makes mastery socially visible. |
| 7 | Campaign progression and achievements | Large | Adds another legitimate progression route after the economy is stable. |

Milestones 0–3 are the easy-win track. Milestones 4–7 require cross-repository/server work and should not block the inspector or visual-cosmetic work.

## Milestone 0 — Content and data foundation

### Character content

- [x] Write and review the six missing bios listed under Current foundation.
- [x] Verify every bio has name, age, hometown, occupation, bowling style, favorite ball, personality, and biography.
- [x] Reconcile `assets/characters/character-bios/README.md` with the 30-character canon roster.

### Runtime character catalog

- [x] Keep the Markdown bios as the editorial source.
- [x] Add a tested build step that validates the Markdown and produces dependency-free runtime character data.
- [x] Key all runtime records by the stable slug already owned by `animation-core.js`.
- [x] Reject duplicate slugs, missing canon bowlers, unknown bowlers, missing required fields, and malformed content.
- [x] Include generated runtime character data in packaging checks without changing the image budget.
- [x] Document how to rebuild the catalog after editing a bio.

### Definition of done

- [x] A test proves there is exactly one valid runtime bio for every canon bowler.
- [x] The browser can load the catalog without parsing Markdown or adding a runtime dependency.
- [x] No biography text is duplicated in hand-maintained JavaScript.

## Milestone 1 — Read-only character inspector

### Entry and navigation

- [x] Add an `Inspect` action from character selection without changing the current selected bowler.
- [x] Allow next/previous bowler navigation inside the inspector.
- [x] Support mouse, keyboard, touch, and the existing mobile-landscape constraints.
- [x] Restore focus to the control that opened the inspector when it closes.

### Inspector presentation

- [x] Show front-view art only; no 360-degree or rear-view inspector is in scope.
- [x] Show name, age, hometown, occupation, bowling style, favorite ball, personality, and full bio.
- [x] Add a Skins section using existing front-facing skin portraits.
- [x] Clearly distinguish `Previewing` and `Equipped`. `Locked` belongs to the server-backed unlock milestone.
- [x] Let the player preview a skin without equipping it.
- [x] Continue to use the existing equipment control as the only action that changes the gameplay skin.

### Definition of done

- [x] All 30 bowlers can be inspected with no missing text or art.
- [x] Previewing and closing the inspector does not mutate match setup or stored equipment.
- [x] Inspector layout is usable at supported desktop and mobile-landscape sizes.
- [x] Structure, interaction, and catalog behavior have automated coverage.

## Milestone 2 — Cosmetic catalog and presentation loadout

### Catalog model

- [x] Define one catalog contract with stable IDs for these reward types:
  - [x] Skin
  - [x] Victory pose
  - [x] Defeat pose
  - [x] Player card
  - [x] Menu splash
  - [x] Profile art
  - [x] Ball trail
  - [x] Strike burst
  - [x] Profile title
  - [x] Badge
  - [x] Player room
- [x] Each item declares display name, reward type, character/global ownership, asset references, rarity/presentation tier, and unlock source.
- [x] Separate item ownership from item equipment.
- [x] Treat existing Classic/Swimsuit/Maid Café content and existing menu splashes as migration inputs, not hard-coded exceptions.

Player rooms (`room-core.js`) are the eleventh reward type and the first added
after this scope was written. They are the proof the contract works: because they
are **new** content, they ship mostly **locked** without taking anything from
anyone — the starter room is the only `founding` entry and the other twelve are
`campaign` or `achievement`. Retro-fitting locks onto content that already shipped
is the case this cabinet still refuses. Rooms also own no persistence and carry no
legacy key: the loadout has been their only owner from the first line.

### Presentation loadout

- [x] Add per-bowler Skin, Victory Pose, Defeat Pose, Player Card, Menu Splash, and Profile Art slots.
- [x] Add global Ball Trail, Strike Burst, Title, Badge, Profile Frame, and Profile Background slots where appropriate.
- [x] Preserve graceful canon/default fallbacks when optional art is missing.
- [x] Store a schema version and migrate existing `equipped-skins` and `menu-splash` local preferences.
- [x] Keep Featured Bowler and Featured Skin separate from the gameplay loadout.

### Pre-progression behavior

- [x] During development, expose catalog items through a deliberate debug/dev entitlement rather than pretending local ownership is authoritative.
- [x] Do not show XP prices or unlock claims until server-backed ownership exists.

### Not yet surfaced

The data layer is shipped and the two existing preferences read and write through
it. These slots exist and are tested but have no player-facing control yet,
because the content that would fill them belongs to later milestones:

- [ ] A loadout screen for the victory/defeat pose, player card, and profile art slots (milestone 5's unlock tree is their natural home).
- [ ] Featured Bowler / Featured Skin selection UI (milestone 6 owns the profile that displays them).
- [ ] Ball trail and strike burst equipping become visible when milestone 3 renders them.

## Milestone 3 — Equippable visual effects

### Ball trails

- [x] Add a render-only trail emitter driven by the displayed ball transform, reading the equipped `ball-trail` item from the loadout.
- [x] Ship a no-trail/default option and at least one equipped example such as `Red Neon Ball Trail`.
- [x] Ensure trails never alter trajectory, collision, timing, or server shot inputs.
- [x] Bound particle count and object lifetime for desktop and mobile.

### Strike bursts

- [x] Add a render-only burst triggered by the authoritative strike outcome, reading the equipped `strike-burst` item from the loadout.
- [x] Support unique equipped palettes/shapes while keeping the strike readable.
- [x] Ship a default burst and at least one alternate effect.
- [x] Avoid double-triggering when an online snapshot is replayed or resumed.

### Accessibility and performance

- [x] Respect reduced-motion preferences with a subdued replacement effect.
- [x] Keep effects inside the lane/cabinet presentation and clear of critical score/input UI.
- [x] Add deterministic emitter tests and a particle-budget regression test.
- [x] Verify no measurable change to physics outcomes or fixed-timestep behavior.

### Not yet surfaced

- [ ] A player-facing control for equipping a trail or a burst. Both slots are
      live and equippable through the loadout, but the only unlockable options
      are milestone-5 rewards, so the picker arrives with the unlock tree that
      gives it something to show. Until then the shipped defaults are what a
      player sees, and the dev entitlement is how the alternates are exercised.

## Milestone 4 — Progression domain and authoritative persistence

### Data model

- [x] Define versioned Player Progress, Bowler Progress, Match Grant, Inventory, and Equipment records.
- [x] Store per-bowler level, XP, eligible match count, wins, strikes, high game, and unlocked reward IDs.
- [x] Define XP curves centrally and test every level boundary through level 30.
- [x] Make every grant idempotent by authoritative match/campaign-clear ID.
- [x] Define migration, offline/error behavior, and recovery before enabling grants.

Level is **derived from XP, never stored**: a stored level disagrees with the
curve the moment the curve is retuned. Unlocked reward IDs stay in the milestone-2
loadout ledger rather than being copied into progress, so ownership keeps one owner.

### Launch XP proposal

These numbers are starting values for playtesting, not immutable economy promises.

| Source | Player XP | Active Bowler XP | Notes |
|---|---:|---:|---|
| Online Quick Bowl completion | 100 | 100 | Renewable. |
| Online Quick Bowl win | +25 | +25 | Modest result bonus. |
| Online Classic Ten completion | 300 | 300 | Longer-match reward. |
| Online Classic Ten win | +75 | +75 | Modest result bonus. |
| Strike/performance bonus | 0–20 | 0–20 | Capped; optional after telemetry. |
| Campaign first clear | 300 | 300 | One grant per encounter/difficulty contract. |
| Campaign boss first clear | 600 | 600 | One grant per boss/difficulty contract. |
| Campaign replay | 0 or 25 | 0 or 25 | Decide after playtesting; never a better farm than online. |
| CPU / Hotseat / Practice / Tutorial | 0 | 0 | Always ineligible. |

### Match eligibility and anti-farming

- [x] Grant only after the authoritative match reaches a qualifying terminal state.
- [x] A player who deliberately leaves early receives no completion or win XP.
- [x] Define the non-leaving player's forfeit reward separately from ordinary wins.
- [x] Reject duplicate, stale, client-authored, and mode-ineligible grants.
- [x] Do not let rematches reuse a grant ID.
- [ ] Add abuse telemetry before adding completion streaks, sportsmanship bonuses, or uncapped performance XP.

### Definition of done

- [x] Unit tests cover eligibility, level boundaries, duplicate grants, forfeits, reconnects, and every mode family.
- [x] Integration tests prove the same match cannot grant twice across retry/reconnect.
- [x] The client can display a pending/retry state without inventing a balance.
- [x] Existing wins/losses/ELO remain intact.

### Shipped: the progression domain

`progression-core.js` owns the XP curves, the grant table, eligibility, forfeits,
and the device-local cache of an authoritative balance. Two rules make the rest of
the milestone safe to build on top:

- **The client never awards itself XP.** `computeMatchGrant` says what a finished
  match is *worth*; only `applySnapshot` — the server's answer — moves a balance.
  An unconfirmed grant sits in a pending queue that survives a reload, so a result
  bowled offline is neither lost nor spent.
- **The same pure grant function is what the server evaluates.** Porting it is how
  the two stay in agreement without the client ever naming a number on the wire.

### Shipped: authoritative persistence

Migration `038` adds `game_xp_profiles`, `game_xp_tracks`, and `game_xp_grants` —
generic on `game_slug` like loadouts (035) and run records (036), so a cabinet
onboards through `services/progression-catalog.mts` without touching schema or
route code. A track is a bowler here and a car or a unit elsewhere, which is why
the column is `track_id`. **No level is stored anywhere**; it is derived from the
catalog's curve.

The award is folded into the existing `recordMatchRating` transaction, keyed by
the same session id `game_rating_sessions` already dedups on — so a rematch is
automatically a new grant and a reconnect is not. Two asymmetries make that work:

- **The rating settles once; XP settles per player.** An ELO update grades both
  sides in one transaction, so only the first reporter runs it. XP is earned
  individually from an individual bowler, so `game_xp_grants` is keyed by
  `(player, game, grant)` and the second reporter is still paid.
- **A disputed mode is clamped, not refused.** The first reporter stamps
  `mode_id` on the rating session; a later reporter naming a different mode causes
  both to be paid the *lesser* payout. Refusing instead would have handed a
  griefer a way to deny an honest opponent's XP by reporting an inflated mode
  first.

Reads go through a public `GET /progression/:gameSlug/:playerId` — public for the
reason a driver profile is, since milestone 6 renders an opponent's mastery on a
Match Found card. There is deliberately **no write route**: a second endpoint that
could grant would be a second key, free to disagree with the first.

Residual trust, recorded in the migration rather than left implicit: the reporter
still self-reports that a match happened at all, exactly as the ELO report already
does. Closing that needs `factory-network-server` to attest results over a shared
secret — a scoped upgrade this schema does not have to change for, since the
attester would write these same rows under the same grant ids.

### Shipped: the cabinet reports

`online/progression-reporter.mjs` builds the block a finished online match
carries. It opens no connection of its own — the block rides the existing rating
report, so one request, one session id, and one thing for a dropped connection to
lose. Strikes are counted from the scorecard, and a disconnect forfeit is read
from the server's own `result.reason`, so the leaver earns nothing and the player
left standing files a forfeit rather than a win.

The pending/retry state is honest by construction. Preparing a report queues the
grant *before* the network call; only an accepted response settles it, because a
network failure is not a ruling. Until then the results screen says the XP has not
synced rather than showing a total the server has not agreed to. A lost *response*
recovers on its own: the next sync sees the grant in the server's own list and
clears it.

### Still to come

- [ ] Re-send a grant whose request never reached the server. The queue survives a
      reload and a lost response self-heals, but a request that never landed waits
      for the next match to be noticed.
- [ ] Abuse telemetry, before any streak, sportsmanship, or uncapped bonus.
- [ ] A campaign grant path (milestone 7), which reuses the same ledger under its
      own `source` value.

Not yet browser-verified end to end: that needs `factory-network-server`, the API,
and two signed-in clients running together.

## Milestone 5 — Bowler unlock tree and progression UI

### Level 1–30 reward plan

- [ ] Create one reusable 30-level reward cadence before writing character-specific flavor.
- [ ] Preserve competitive equality at every level.
- [ ] Give every node a tempting, specific label even when locked, for example:
  - [ ] `Gym Day Skin`
  - [ ] `Alt Menu Splash`
  - [ ] `Red Neon Ball Trail`
- [ ] Reserve level 30 for a mastery skin plus an exclusive character title.
- [ ] Ensure the tree supports future levels 31–40 without changing existing reward IDs.

Suggested cadence to validate in a prototype:

| Level | Reward family |
|---:|---|
| 1 | Default bowler |
| 3 | Profile icon |
| 5 | Alternate victory pose |
| 7 | Character banner |
| 10 | Named skin, e.g. Gym Day |
| 12 | Player-card artwork |
| 15 | Alternate menu splash |
| 18 | Alternate victory pose II |
| 20 | Special skin |
| 25 | Rare splash/card |
| 30 | Mastery skin + exclusive title |

### UI

- [ ] Put the unlock tree in the character inspector.
- [ ] Show current level, XP progress, next reward, owned/equipped state, and the full locked path.
- [ ] Celebrate newly earned items once, then leave them discoverable in inventory.
- [ ] Make level-up presentation skippable and safe across reconnect/reload.

## Milestone 6 — Yam player profiles and online presentation

### Yam-specific profile layer

- [ ] Extend the existing Factory identity/profile model rather than replacing it.
- [ ] Add Player Level, rank/ELO, wins/losses, high game, strikes, spare rate, and character mastery summary.
- [ ] Add Featured Bowler, Featured Skin, Profile Background, Profile Frame, Title, and Badges.
- [ ] Make the featured bowler the visual centerpiece, occupying roughly 30–40% of the profile composition on desktop.
- [ ] Define stat denominators and eligible modes so numbers cannot mix practice/local games with progression records.
- [ ] Provide safe fallback presentation for old profiles and unavailable cosmetics.

### Per-character history

- [ ] In the inspector, add a `Your <Bowler>` section with level, matches, wins, strikes, high game, and collection completion.
- [ ] Keep fictional biography data separate from player-owned/statistical data even when presented together.

### Social visibility

- [ ] Add Match Found cards with player name, equipped bowler/skin, Bowler Level, rank, and ELO.
- [ ] Use the actual gameplay skin in match presentation; use Featured Skin only on the profile.
- [ ] Verify privacy, moderation, and missing-profile behavior for public inspection.

## Milestone 7 — Campaign progression and achievements

### Lightweight campaign

- [x] Scope a bowling circuit: Local Alley → City League → Regional → Nationals → Yam Championship.
- [x] Define named CPU rivals and first-clear IDs before authoring rewards.
- [ ] Award Player XP + active Bowler XP on first clear only, with a small or zero replay reward.
- [x] Keep ordinary Vs CPU as zero-XP practice.
- [ ] Add campaign-only cosmetics/titles without creating gameplay advantages.

`campaign-core.js` ships the five divisions, their sanctioned matches, the rival each
unlocks and the per-match achievement. Two things are built but not yet joined:
`progression-core.js` already computes campaign grants (`encounter`/`boss`,
first-clear only, replay refused) and the `game_xp_grants` ledger already accepts a
`source` other than `online-match`, but nothing calls that path yet — a circuit
clear currently awards a bowler and no XP.

Player rooms are the first campaign-sourced cosmetics, catalogued and gated but not
yet grantable: circuit unlocks are device-local, so the grant that would award a
room has nowhere authoritative to land until the entitlement validator exists.

### Achievements

- [ ] `The Roster` — get every bowler to level 5.
- [ ] `Dedicated` — reach level 20 with one bowler.
- [ ] Character mastery achievements such as `Reina Master`.
- [ ] `Yam Connoisseur` — reach maximum mastery with five bowlers.
- [ ] Decide whether achievements award badges/titles only after the inventory contract exists.

## Explicitly deferred

- Paid cosmetics, storefront, currencies, and pricing.
- Buying Player XP, Bowler XP, levels, or mastery rewards.
- Gameplay-stat upgrades tied to characters or cosmetics.
- A level cap above 30.
- A story-heavy RPG campaign.
- Rear-view/rotatable character inspection.
- Intro poses and strike-celebration animations beyond the loadout hooks needed for shipped assets.
- Sportsmanship streaks, daily tasks, battle passes, seasons, or prestige resets.

## Recommended first implementation slice

Start with Milestones 0 and 1 as one vertical slice:

1. [x] Complete and validate all 30 bios.
2. [x] Generate tested runtime character data from the Markdown sources.
3. [x] Add a read-only, front-view inspector reachable from character selection.
4. [x] Show biography fields and preview existing skin portraits without changing equipment.

This immediately uses content and assets that already exist, creates the natural home for the future unlock tree, and does not depend on new server APIs, XP balancing, or particle work.
