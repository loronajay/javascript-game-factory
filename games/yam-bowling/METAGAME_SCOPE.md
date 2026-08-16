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
- Canon is the only starting skin. Swimsuit and Maid require exact, authoritative
  per-bowler skin entitlements; the same entitlement owns that skin's victory
  and defeat poses.
- Legacy non-Canon selections are preserved only when a one-time server
  migration grants the exact skin already equipped in a saved server garage.
  Local preferences never create ownership, and the migration never grants the
  rest of the skin catalog.

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
- [x] Clearly distinguish `Previewing` and `Equipped`; inspection only offers skins the current ownership source permits.
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
- [x] Treat existing Classic/Swimsuit/Maid Café content and existing menu splashes as migration inputs, not hard-coded exceptions. Only an exact saved server selection qualifies for the one-time alternate-skin grant.

Player rooms (`room-core.js`) are the eleventh reward type. The starter room is
the only `founding` room and the other twelve are `campaign` or `achievement`.
Skins use the same ownership/equipment split with a narrower starter rule: Canon
is founding, while each Swimsuit or Maid look and its outcome poses share one
exact server entitlement. Rooms own no legacy preference key; alternate skins
instead use migration `039`, which grants only a non-Canon selection already
saved in that player's authoritative garage.

### Presentation loadout

- [x] Add per-bowler Skin, Victory Pose, Defeat Pose, Player Card, Menu Splash, and Profile Art slots.
- [x] Add global Ball Trail, Strike Burst, Title, Badge, Profile Frame, and Profile Background slots where appropriate.
- [x] Preserve graceful canon/default fallbacks when optional art is missing.
- [x] Store a schema version and migrate existing `equipped-skins` and `menu-splash` local preferences.
- [x] Keep Featured Bowler and Featured Skin separate from the gameplay loadout.

### Pre-progression behavior

- [x] During development, expose catalog items through a deliberate debug/dev entitlement rather than pretending local ownership is authoritative.
- [x] Do not show XP prices or unlock claims until server-backed ownership exists.

### Surfaced

Every slot the loadout owns now has a player-facing control:

- [x] A loadout screen for the victory/defeat pose, player card, and profile art slots.
- [x] Featured Bowler / Featured Skin selection UI (milestone 6 owns the profile that displays them).
- [x] Ball trail and strike burst equipping.

They live in the room editor on the `My room` screen rather than in a screen of
their own, because that editor already owns the dirty/save path into the server
garage — a second screen would have needed a second one. The rows are generated
from the catalog, so a reward type added to `cosmetics-core.js` appears without
new UI code. Ownership decides what may be **equipped**, never what is **shown**:
locked rewards stay visible and disabled, the same rule the skin picker follows.

Two consequences worth recording:

- An **outcome pose is now resolved through the equipped slot**, not through the
  skin worn on the lane, so the control is not decoration. `ui/character-assets.mjs`
  owns that resolution, and a remote bowler keeps the look that came over the
  wire — this device's equipment has no say over an opponent.
- The two decoration slots have **no default**, so empty is one of their real
  answers. `clearGlobalSlot` exists for exactly that: without it a frame could be
  put on and never taken off. Slots that have a default cannot be cleared,
  because there the default *is* the answer.

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

### Surfaced

- [x] A player-facing control for equipping a trail or a burst, in the room
      editor beside the rest of the presentation slots. The alternates are still
      milestone-5 rewards, so a player who has earned nothing sees the founding
      default equipped and the alternate locked; the dev entitlement remains how
      an owned alternate is exercised until the unlock tree grants one.

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

### Shipped: the re-send

- [x] Re-send a grant whose request never reached the server.

A queued grant now keeps the **whole request** that would file it, not just what
it was worth, so a report that never landed can be sent again exactly as it was
first built. The queue stores it opaquely — `progression-core.js` owns *when* a
grant may be replayed, not what a report says — and hands back a copy, so nothing
can edit the envelope the queue would replay.

The replay goes through the same single call site a fresh result does
(`flushPendingReports` in `online-session.mjs`), which is what keeps "one request,
one session id" true: a replay path of its own would be a second thing that could
disagree. It runs on the first signed-in boot and after each online match. Sending
again is safe rather than double-paying because the server dedups on the same
session id the grant is keyed by, and a request is stored only if it is complete —
half of one would have to be guessed at, and a guessed rating report is a wrong
record.

### Still to come

- [ ] Abuse telemetry, before any streak, sportsmanship, or uncapped bonus.

Not yet browser-verified end to end: that needs `factory-network-server`, the API,
and two signed-in clients running together.

## Milestone 5 — Bowler unlock tree and progression UI

### Level 1–30 reward plan

- [x] Create one reusable 30-level reward cadence before writing character-specific flavor.
- [x] Preserve competitive equality at every level.
- [x] Give every node a tempting, specific label even when locked, for example:
  - [x] `Gym Day Skin`
  - [x] `Alt Menu Splash`
  - [x] `Red Neon Ball Trail`
- [x] Reserve level 30 for a mastery skin plus an exclusive character title.
- [x] Ensure the tree supports future levels 31–40 without changing existing reward IDs.

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

- [x] Put the unlock tree in the character inspector.
- [x] Show current level, XP progress, next reward, owned/equipped state, and the full locked path.
- [x] Celebrate newly earned items once, then leave them discoverable in inventory.
- [x] Make level-up presentation skippable and safe across reconnect/reload.

### Shipped: mastery path and level-up presentation

`mastery-rewards-core.js` defines one immutable node for every launch level and
resolves bowler-specific reward IDs shaped as
`mastery:<bowler>:level-<nn>:<reward>`. Appending levels 31–40 therefore cannot
rename any launch reward. The definitions carry presentation and equipment
references only; none can reach physics, scoring, shot timing, or online input.
Level 30 resolves two rewards for every bowler: her mastery skin and exclusive
`<First Name> Master` title.

The character inspector always renders the full path, including while signed
out, so locked rewards remain discoverable without exposing cached private
stats. After an authoritative progression sync it joins the synced bowler level
to the loadout, labels reached nodes `Owned`, and labels the exact matching worn
item `Equipped`; current level, XP, next reward, collection completion, and all
future locked levels remain visible together.

`state/mastery-celebrations.mjs` keeps a per-account, per-bowler high-water mark
and a durable pending queue. The first authoritative observation establishes a
baseline instead of replaying an established account's old levels. Later level
gains are persisted before their modal opens, duplicate/replayed snapshots do
not enqueue twice, and a pending presentation survives reload until Continue or
Escape acknowledges it. The celebration is presentation only: it never changes
XP, ownership, or equipment.

`state/player-level-celebrations.mjs` applies the same acknowledgement contract
to the player track without folding player state into the bowler queue. A jump
across several player levels becomes one modal containing every reward returned
by `player-rewards-core.js`; equippable rewards are identified as unlocked (or
already equipped), and the player event is presented before the accompanying
bowler-mastery event from the same authoritative snapshot.

## Milestone 6 — Yam player profiles and online presentation

### Yam-specific profile layer

- [x] Extend the existing Factory identity/profile model rather than replacing it.
- [x] Add Player Level, wins/losses, high game, strikes, and character mastery summary.
- [ ] Add rank/ELO and spare rate after those records have one authoritative source and denominator.
- [x] Add Featured Bowler, Featured Skin, Title, and Badge presentation.
- [x] Add Profile Background and Profile Frame editor controls.
- [ ] Add *authored* background and frame art. Both slots are typed `profile-art`
      on the client and on the server, so today they are filled from the roster's
      existing portrait art and are gated by owning that bowler. Authored
      decoration would be new reward types on both sides of that contract.
- [x] Make the featured bowler the visual centerpiece, occupying roughly 30–40% of the profile composition on desktop.
- [x] Keep profile statistics on progression-eligible online/campaign tracks so practice and local exhibition cannot inflate them.
- [x] Provide safe fallback presentation for old profiles and unavailable cosmetics.

### Shipped: profile/loadout backend foundation

Yam is registered with the platform's generic `game_loadouts` storage rather
than creating a second identity or profile table. The server catalog validates
the complete presentation document against the current entitlement set on both
write and read. Canon and other starter items remain available, unknown or
cross-bowler slot values are stripped, revoked skin selections fall back to
Canon, and the client cannot persist its own `granted` ownership ledger.

Migration `039` is the only legacy alternate-skin bridge. It reads the existing
server-owned garage once and grants only each exact Swimsuit/Maid skin found in
a saved per-bowler or Featured selection. Victory and defeat poses derive from
that same entitlement. It does not accept a client claim or grant another
bowler's skin, another variant, or the full catalog.

The public loadout is deliberately narrower than the owner's document. It
exposes Featured Bowler + Featured Skin, room, title, badge, profile frame, and
profile background—the presentation another player may inspect—without exposing
the owner's saved per-bowler equipment collection. Player level and bowler stats
remain in the public progression document and are composed with this presentation
layer by the profile room.

### Shipped: first usable player room

The signed-in title menu now opens a responsive `My room` screen. It puts the
featured bowler and selected skin over the equipped room art, displays Player
Level, eligible career totals, and that bowler's mastery, and offers only owned
bowlers, owned skins, and entitled rooms in its editor. Saves replace the
private server garage and immediately reapply the server-sanitized answer. Boot,
profile-open, and circuit-clear syncs all replace client ownership with the
current entitlement set; local grants and stale campaign caches cannot add a
choice to an authenticated profile.

The stats shown in this first pass are the records the XP tracks already own:
matches, wins/losses, strikes, and high game. Rank/ELO and spare rate stay absent
until the backend gives each one a single trustworthy definition. The starter
room begins owned; circuit promotions and the rotating tournament prize pool
add server-entitled rooms after their authoritative claims settle.

### Shipped: public inspection and Match Found identity

Read-only inspection now joins the existing public loadout and public
progression endpoints by player id. It has no private garage request, editor, or
save path. The opponent link is available from online identity presentation and
the completed match, while unavailable player ids and failed public reads stay
explicitly non-inspectable instead of treating a socket id as an account id.

Match Found uses the same compact identity card. The card uses the selected
gameplay bowler and skin, while the full public room uses Featured Bowler and
Featured Skin. Public profile reads are cached for the session, and levels remain
unknown until the authoritative progression document arrives rather than being
invented locally.

Rank/ELO and spare rate remain absent until their authoritative records can be
joined. Circuit promotion and tournament room grants share the normal
server-entitlement/loadout path.

### Per-character history

- [x] In the inspector, add a `Your <Bowler>` section with level, matches, wins, strikes, high game, and collection completion.
- [x] Keep fictional biography data separate from player-owned/statistical data even when presented together.

The inspector now joins the current session's authoritative bowler progression
snapshot with owned character-scoped catalog items. It withholds cached numbers
when signed out or when the current session has not successfully applied a
progression document, and presents the player-owned history in a card separate
from the fictional league dossier and biography.

### Social visibility

- [x] Add read-only public profile inspection by player id from online opponent presentation.
- [x] Add Match Found cards with player name, equipped bowler/skin, Player Level, and Bowler Level.
- [ ] Add rank/ELO to Match Found after those records have one authoritative public definition.
- [x] Use the actual gameplay skin in match presentation; use Featured Skin only on the profile.
- [x] Verify the privacy boundary and missing-profile fallback for public inspection.
- [ ] Apply platform moderation policy to profile names when that policy exposes a cabinet-facing contract.

## Milestone 7 — Campaign progression and achievements

### Lightweight campaign

- [x] Scope a bowling circuit: Local Alley → City League → Regional → Nationals → Yam Championship.
- [x] Define named CPU rivals and first-clear IDs before authoring rewards.
- [x] Award Player XP + active Bowler XP on first clear only, with a small or zero replay reward.
- [x] Keep ordinary Vs CPU as zero-XP practice.
- [ ] Add campaign-only cosmetics/titles without creating gameplay advantages.

`campaign-core.js` ships the five divisions, their sanctioned matches, the rival each
unlocks and the per-match achievement. A successful server claim now joins that
clear to the existing XP transaction: ordinary encounters award 300 Player XP
and active Bowler XP, promotion matches award 600, and the circuit claim id is
also the idempotent XP grant id. The claim carries the bowler actually used, but
the server accepts it only when that bowler was a starter or already owned before
the clear; a client cannot redirect mastery XP into a locked bowler.

Player rooms are the first campaign-sourced cosmetics. Promotion clears now grant
two fixed rooms per division, and clearing the championship summit also grants the
Tower Penthouse. The authoritative loadout validator and room reward
cadence now agree on the same entitlement ids, so a room can be equipped as
soon as the Factory accepts the promotion clear.

### Achievements

- [ ] `The Roster` — get every bowler to level 5.
- [ ] `Dedicated` — reach level 20 with one bowler.
- [ ] Character mastery achievements such as `Reina Master`.
- [ ] `Yam Connoisseur` — reach maximum mastery with five bowlers.
- [ ] Decide whether achievements award badges/titles only after the inventory contract exists.

## Milestone 8 — Player level reward tree and Skin Vouchers

### The split that makes two ladders worth having

The player track rewards the **player**; bowler mastery rewards the **bowler**.
Every player-tree reward is global — ball trails, strike bursts, titles, badges
and Skin Vouchers — and none of it is a bowler's own art. The two ladders also
never promise the same trail or burst, because a reward you could have earned on
the other ladder is not a reward. `player-rewards-core.test.js` asserts both
rules against the live mastery cadence rather than trusting the authored lists.

- [x] Reuse one 30-level state machine across both ladders (`reward-tree-core.js`).
- [x] Give every level a specific, tempting label even while locked.
- [x] Keep reward ids (`player:level-<nn>:<key>`) stable so levels 31–40 can be appended.
- [x] Preserve competitive equality: no player-tree reward can reach physics, scoring or the wire.
- [x] Show the full ladder signed out, with locked levels visible.
- [x] Make level rewards actually ownable and equippable (see below).
- [ ] Author the player ladder's own titles/badges and bind them (`PENDING_CONTENT`, 8 nodes).

### A level reward needs no entitlement row

`loadout.owns()` resolves a `bowler-level` or `player-level` item against the set
the ladders have paid out at the account's synced levels, recomputed by
`applyLevelUnlocks()` in the composition root on every authoritative snapshot.
The XP the server already holds is the proof, so minting a durable grant for
"reached level 13" would duplicate a fact the account owns — the same
second-source-of-truth problem the tree itself avoids. The earned set is
session-only and never persisted, and an unsynced device earns nothing.

It is deliberately an *extra* route, not the only one: if the server grants a
level reward directly — a tournament prize, a make-good — the client defers to it
rather than overruling the authority it is supposed to follow.

Which ladder earns an effect is recorded in `cosmetics-core.js` beside the item,
because the catalog sits underneath the ladders and cannot import them.
`player-rewards-core.test.js` asserts the two never drift, and that no item is
ever promised by both ladders.

### Unlock progress is account state, not device state

There is no stored unlock record anywhere in this milestone. A node is owned when
the authoritative player level reaches it, and that level is derived by
`progression-core.js` from server-synced XP. The profile screen reads
`getSyncState()` and says plainly when a device is unsynced instead of presenting
a cached level 1 as earned progress. `project-structure.test.js` asserts the
player ladder can never persist, cache, or name a balance.

### Skin Vouchers

A voucher is the scarce reward of this track: **one voucher buys one skin**, chosen
by the player from the bowlers they already own, which is what makes a circuit
bowler unlock raise the value of a voucher already in hand.

- [x] Exactly two vouchers in the player tree, at levels 10 and 25.
- [x] The first lands early enough to teach the mechanic while there is tree left.
- [x] Vouchers carry no equipment and are never equippable.
- [x] Server balance in `game_inventory_items` and the spend transaction (decrement + entitlement grant, one transaction).
- [x] Redemption UI: pick a skin from an owned bowler.
- [x] Rare tournament voucher source; circuit voucher milestones remain deferred.
- [ ] Real-money vouchers, after the earned path is established.

Nothing may advertise a voucher price or offer redemption until that authoritative
spend exists. The tree may say a voucher is coming; it may not say what it buys.

## Milestone 9 — Rotating CPU tournaments

Tournaments are limited-time **single-player** brackets, not human matchmaking.
They open for four days every other week and rotate among four named majors. Each
event has three CPU rounds: a Competitive opening round, a Pro semifinal, and a
Champion final. The final is a full Classic Ten match so the prize is not gated
behind a three-frame pushover.

- [x] Use the unlocked circuit roster for the player's tournament entry.
- [x] Keep tournament progress separate from the permanent circuit.
- [x] Require round claims in order and accept only the server's active event id.
- [x] Grant the `Yam Champion` title on the first championship clear.
- [x] Roll prizes on the server and persist the exact result for replay safety.
- [x] Common pool: four tournament-only Ball Trails and four Strike Bursts.
- [x] Rare pool: `Champion's Room` and one Skin Voucher.
- [x] Remove already entitled cosmetics before rolling; fall back to a voucher
      after the finite cosmetic pool is exhausted.
- [x] Keep tournament rewards presentational: no prize reaches scoring, physics,
      CPU strength, or input.

The platform schedule uses server time. The cabinet can show the upcoming event
while entries are closed, but it cannot move the window, skip a round, name a
prize, or apply ownership before the returned game-progress snapshot arrives.

## Explicitly deferred

- Paid cosmetics, storefront, and pricing. Skin Vouchers are an *earned* currency
  as of Milestone 8; buying them with real money stays deferred until the earned
  path and the server spend transaction are both shipped.
- Buying Player XP, Bowler XP, levels, or mastery rewards.
- Gameplay-stat upgrades tied to characters or cosmetics.
- A level cap above 30.
- A story-heavy RPG campaign.
- Rear-view/rotatable character inspection.
- Intro poses and strike-celebration animations beyond the loadout hooks needed for shipped assets.
- Sportsmanship streaks, daily tasks, battle passes, seasons, or prestige resets.
- Swimsuit/Maid acquisition cadence and grant sources beyond the one-time exact
  legacy migration; define them authoritatively before exposing an unlock claim.

## Recommended first implementation slice

Start with Milestones 0 and 1 as one vertical slice:

1. [x] Complete and validate all 30 bios.
2. [x] Generate tested runtime character data from the Markdown sources.
3. [x] Add a read-only, front-view inspector reachable from character selection.
4. [x] Show biography fields and preview existing skin portraits without changing equipment.

This immediately uses content and assets that already exist, creates the natural home for the future unlock tree, and does not depend on new server APIs, XP balancing, or particle work.
