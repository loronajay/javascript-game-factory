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

- [ ] Define one catalog contract with stable IDs for these reward types:
  - [ ] Skin
  - [ ] Victory pose
  - [ ] Defeat pose
  - [ ] Player card
  - [ ] Menu splash
  - [ ] Profile art
  - [ ] Ball trail
  - [ ] Strike burst
  - [ ] Profile title
  - [ ] Badge
- [ ] Each item declares display name, reward type, character/global ownership, asset references, rarity/presentation tier, and unlock source.
- [ ] Separate item ownership from item equipment.
- [ ] Treat existing Classic/Swimsuit/Maid Café content and existing menu splashes as migration inputs, not hard-coded exceptions.

### Presentation loadout

- [ ] Add per-bowler Skin, Victory Pose, Defeat Pose, Player Card, Menu Splash, and Profile Art slots.
- [ ] Add global Ball Trail, Strike Burst, Title, Badge, Profile Frame, and Profile Background slots where appropriate.
- [ ] Preserve graceful canon/default fallbacks when optional art is missing.
- [ ] Store a schema version and migrate existing `equipped-skins` and `menu-splash` local preferences.
- [ ] Keep Featured Bowler and Featured Skin separate from the gameplay loadout.

### Pre-progression behavior

- [ ] During development, expose catalog items through a deliberate debug/dev entitlement rather than pretending local ownership is authoritative.
- [ ] Do not show XP prices or unlock claims until server-backed ownership exists.

## Milestone 3 — Equippable visual effects

### Ball trails

- [ ] Add a render-only trail emitter driven by the displayed ball transform.
- [ ] Ship a no-trail/default option and at least one equipped example such as `Red Neon Ball Trail`.
- [ ] Ensure trails never alter trajectory, collision, timing, or server shot inputs.
- [ ] Bound particle count and object lifetime for desktop and mobile.

### Strike bursts

- [ ] Add a render-only burst triggered by the authoritative strike outcome.
- [ ] Support unique equipped palettes/shapes while keeping the strike readable.
- [ ] Ship a default burst and at least one alternate effect.
- [ ] Avoid double-triggering when an online snapshot is replayed or resumed.

### Accessibility and performance

- [ ] Respect reduced-motion preferences with a subdued replacement effect.
- [ ] Keep effects inside the lane/cabinet presentation and clear of critical score/input UI.
- [ ] Add deterministic emitter tests and a particle-budget regression test.
- [ ] Verify no measurable change to physics outcomes or fixed-timestep behavior.

## Milestone 4 — Progression domain and authoritative persistence

### Data model

- [ ] Define versioned Player Progress, Bowler Progress, Match Grant, Inventory, and Equipment records.
- [ ] Store per-bowler level, XP, eligible match count, wins, strikes, high game, and unlocked reward IDs.
- [ ] Define XP curves centrally and test every level boundary through level 30.
- [ ] Make every grant idempotent by authoritative match/campaign-clear ID.
- [ ] Define migration, offline/error behavior, and recovery before enabling grants.

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

- [ ] Grant only after the authoritative match reaches a qualifying terminal state.
- [ ] A player who deliberately leaves early receives no completion or win XP.
- [ ] Define the non-leaving player's forfeit reward separately from ordinary wins.
- [ ] Reject duplicate, stale, client-authored, and mode-ineligible grants.
- [ ] Do not let rematches reuse a grant ID.
- [ ] Add abuse telemetry before adding completion streaks, sportsmanship bonuses, or uncapped performance XP.

### Definition of done

- [ ] Unit tests cover eligibility, level boundaries, duplicate grants, forfeits, reconnects, and every mode family.
- [ ] Integration tests prove the same match cannot grant twice across retry/reconnect.
- [ ] The client can display a pending/retry state without inventing a balance.
- [ ] Existing wins/losses/ELO remain intact.

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

- [ ] Scope a bowling circuit: Local Alley → City League → Regional → Nationals → Yam Championship.
- [ ] Define named CPU rivals and first-clear IDs before authoring rewards.
- [ ] Award Player XP + active Bowler XP on first clear only, with a small or zero replay reward.
- [ ] Keep ordinary Vs CPU as zero-XP practice.
- [ ] Add campaign-only cosmetics/titles without creating gameplay advantages.

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
