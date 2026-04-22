# Javascript Game Factory Platform Implementation Plan

## Purpose

This document turns the platform idea into a build plan we can execute safely.

The goal is not to ship every social/platform feature quickly. The goal is to grow the arcade into a stable multi-page platform without creating a tangled mess of one-off page logic, duplicated data rules, or game-owned profile state.

## Product Direction

The platform is evolving from a game launcher into a multi-page arcade site with:

- shared player identity
- player profile pages
- bulletin and announcement surfaces
- event pages
- user links
- friends activity
- a shared thoughts feed for user-authored status updates and repostable bulletin-style posts
- eventual media upload

Important terminology note:

- `Bulletins` can continue to mean the current platform-owned announcement / noticeboard surface.
- We also want a separate user-authored bulletin style: short status updates in a scrollable home feed, closer to old Myspace bulletins or Facebook status posts.
- That future social surface should support feed-style interaction patterns such as comments, sharing/reposting, emoji-style reactions with visible totals, and profile-linked authorship once the platform is ready for heavier social features.

Product framing note:

- Treat this project as a Facebook/Myspace-style social-media platform built around arcade identity and games, not as a generic launcher with a few profile extras.
- Games are a major content pillar, but the long-term product is still a social platform: profiles, feeds, friends, reactions, reposting, personal identity fields, and public/self expression all matter as first-class product goals.

The platform remains the owner of long-term identity and social state.
Games remain self-contained experiences that can read platform data and publish approved activity/results, but games must not become the permanent home for profile ownership.

## Non-Negotiables

These rules are here to protect stability.

1. Platform-owned identity stays platform-owned.
   `playerId`, canonical `profileName`, future profile fields, friends, links, posts, bulletins, activity, and media metadata belong to the platform layer, not to individual games.

2. Read-heavy pages come before write-heavy pages.
   We should ship stable display pages before adding many forms, mutations, uploads, or cross-user interactions.

3. Local-first before backend.
   We can prototype page structure and data contracts locally, but we should not fake a full social backend in scattered page code.

4. Uploads come late.
   Photo/avatar upload should wait until auth, storage, file validation, moderation rules, and failure handling are defined.

5. Every shared rule lives in shared modules.
   No page should invent its own idea of what a profile, bulletin, activity item, or post looks like.

6. Games publish through a contract.
   Games may emit platform-recognized results and activity events, but only through a shared interface owned by the platform.

7. Stability beats cleverness.
   Prefer simple modules, plain HTML pages, query-param routing where needed, and explicit tests over premature abstraction.

## Current Foundation

The repo already has the start of a platform layer:

- `index.html` and `grid.html` establish the arcade shell.
- `js/arcade-catalog.mjs` owns game listing and launcher metadata loading.
- `js/factory-profile.mjs` already defines canonical shared identity storage.
- `js/match-identity.mjs` already separates permanent identity from temporary per-match aliases.
- `js/arcade-profile.mjs` already gives us a shell-level profile editor.
- `games/lovers-lost/` already consumes the shared identity model.

This means the platform does not need to start from zero. It needs to become more deliberate and more formal.

## Architecture Shape

The safest platform structure is four layers.

### 1. Page Layer

Owns page-specific HTML composition and interaction flow.

Examples:

- home page
- games page
- player profile page
- bulletins page
- events page
- activity page
- thoughts page

This layer should be thin. It renders shared view models and calls shared modules.

### 2. Shared Domain Layer

Owns data shapes, sanitization, normalization, and core platform rules.

Examples:

- player profile normalization
- link validation
- bulletin model normalization
- activity item formatting
- post visibility rules
- event metadata shape

This is where stability comes from.

### 3. Storage / Data Source Layer

Owns where data comes from and where it is written.

Early on this will be local storage plus fixture files.
Later this will expand to backend APIs and media storage.

The page layer should not care whether data came from:

- local storage
- JSON fixtures
- mock adapters
- a real backend

### 4. Game Integration Layer

Owns the contract between games and the platform.

Examples:

- reading canonical player identity
- reading preferences/favorites
- publishing run results
- publishing recent activity
- requesting temporary match aliases

Games should never write directly into random platform storage keys.

## Route / Page Plan

Because this repo is plain HTML/CSS/JS, the route plan should stay static-host friendly.

Recommended first-class pages:

- `/index.html`
  Arcade home and entry point.
- `/grid.html`
  Game library / cabinet browser.
- `/me/index.html`
  Personal dashboard for the signed-in or local current player.
- `/players/index.html`
  Player discovery or player list later if needed.
- `/player/index.html?id=<playerId>`
  Public player profile page.
- `/bulletins/index.html`
  Platform notices and curated announcements.
- `/events/index.html`
  Event listing page.
- `/event/index.html?slug=<eventSlug>`
  Event detail page.
- `/activity/index.html`
  Friends and platform activity.
- `/thoughts/index.html`
  Shared thoughts feed for user-authored status updates, social posting, and the eventual doomscroll-style home feed.

Notes:

- For now, prefer stable query-param detail pages over pretending we have full dynamic routing.
- If we later move to a hosting setup that supports clean routes, the page logic can survive the URL change.

## Long-Term Player Page Reference

Use the current example profile mockup as a layout and feature-direction reference for the long-term player page.
It is a placement / information architecture reference, not a mandate to match the exact visual treatment.

Canonical reference asset:

- `images/mock-page-references/user-profile-page-reference.png`
- Keep this file as the single in-repo visual reference for the long-term player-page target unless we intentionally replace it with a newer canonical mock.

Target long-term player page sections:

- profile portrait with a small presence indicator
- display name with a customizable tagline directly underneath
- optional real-name field in the identity panel, separate from the arcade username/display name
- social links block
- favorite game block with an actual grid-entry / cabinet link
- ladder placement block that can show a player's top placements across games
- scrollable player feed for status updates / posts
- about-me block
- badges block
- friends block with a special `main squeeze` slot
- customizable 16:9 background image behind the page composition

Important behavior notes from the reference:

- The page title must be the player's `profileName`.
  This is not optional flavor copy. The canonical profile page headline is the player's public display name.
- The line directly underneath the page title must be the player's editable `tagline`.
  This is a public-facing identity field, not throwaway helper copy or a dashboard subtitle.
- The in-profile `Name` field is an optional real-name field.
  It is separate from the arcade `profileName` / username and should only render player-supplied real-name text when the player chooses to share it.
- Do not collapse the optional real-name field into the page title.
  The header title remains `profileName`; the identity-panel `Name` field is a distinct profile field with different meaning.
- Presence should eventually support at least online, offline, and similar simple states.
  The green dot in the mockup is the reference for that presence affordance.
- The status feed area should behave like a constrained scrollable panel rather than forcing the whole page layout to expand infinitely.
- Favorite games should not be plain text only.
  They should link back into the arcade grid / cabinet entry once those routes are stable.
- Ladder placement should focus on best placements, especially top-three finishes or top-ranked positions per game when available.
- The `main squeeze` friend slot implies a future best-friend style relationship layer.
  We are not building that yet, but it should be tracked as a future platform concept.
- Future friend points should likely derive from shared play behavior, such as time spent playing together or a similar trust / affinity metric.
  That system needs separate scoping later and should remain platform-owned.
- The background image should eventually be a user-uploaded asset standardized to a 16:9 presentation area.
  Until upload systems exist, use a default background image / fallback treatment.
- Empty fields need strong defaults so the page still feels intentional when a player has no links, no rankings, no favorite game, no badges, no posts, no featured friend, or no custom background.
- The current example image can serve as the default background reference until a proper background-image system is wired.

Canonical composition notes:

- Treat `/me` and `/player` as the same public profile composition.
- The owner view should not become a separate dashboard layout.
- The owner-specific difference is an owner-only `Edit Profile` button and related editing controls layered onto the same public-facing page.
- The intended composition from the reference is:
  left rail for portrait, identity support, rankings, and friends
  center feature for the favorite game / featured cabinet
  right rail for the player feed, about block, and badges
  top header for `profileName` with `tagline` directly underneath
- New passes should move toward this composition instead of rearranging the same panels into unrelated dashboard layouts.

Reference asset note:

- Yes, keep a single copy of the screenshot in the repo if we want it to remain a durable design reference.
- It should live as documentation/reference material, not as a shipped gameplay asset.
- `images/mock-page-references/user-profile-page-reference.png` is now the canonical reference asset for this mockup.
- We can move it to a docs/reference area later if we decide to separate runtime assets from design references more strictly.
- Avoid scattering multiple duplicate screenshots through the repo. One canonical reference is enough.

Suggested field-length constraints for future profile systems:

- `profileName`: 24 characters max
- `realName`: 48 characters max
- `tagline`: 80 characters max
- `bio` / `aboutMe`: 280 characters max
- social link label: 24 characters max
- social link URL: 280 characters max
- status-post title / subject if used: 80 characters max
- status-post body for the profile feed preview: 500 characters max before longer-read handling

Constraint notes:

- These limits are meant to protect layout integrity first, especially in the profile header, friends panel, and scrollable feed cards.
- We can revise exact numbers later, but the platform should treat character limits as shared contract rules, not page-by-page styling hacks.
- Empty-state fallback copy should be designed with the same space constraints in mind so blank profiles do not break the composition.

## Shared Data Objects

These objects should be defined centrally before new pages are built.

### `factoryProfile`

Platform-owned identity and private player state.

Suggested shape:

```js
{
  version: 1,
  playerId: "player-123",
  profileName: "Maya",
  realName: "",
  bio: "",
  tagline: "",
  avatarAssetId: "",
  favorites: [],
  friends: [],
  recentPartners: [],
  links: [],
  preferences: {},
  createdAt: "",
  updatedAt: ""
}
```

### `playerProfileView`

Public-facing subset of player profile data.

Suggested shape:

```js
{
  playerId: "player-123",
  profileName: "Maya",
  realName: "",
  bio: "",
  tagline: "",
  avatarUrl: "",
  backgroundImageUrl: "",
  presence: "offline",
  links: [],
  featuredGames: [],
  favoriteGameSlug: "",
  ladderPlacements: [],
  friendsPreview: [],
  mainSqueeze: null,
  recentActivity: [],
  thoughtCount: 0,
  badgeIds: []
}
```

Future-facing notes:

- `presence` should stay lightweight at first and only expose simple user-facing states.
- `favoriteGameSlug` should support linking back to the cabinet entry.
- `ladderPlacements` should summarize a player's strongest rankings without requiring a full standings page inside the profile itself.
- `mainSqueeze` is a future social-field concept, not an immediate implementation target.
- `backgroundImageUrl` should resolve to a normalized 16:9 presentation asset once uploads exist.

## Profile Page Contract Notes

The long-term player page should be treated as a stable product target with incremental delivery underneath it.
In practice that means we can ship simpler profile pages now, but each pass should move toward the same eventual composition instead of drifting into disconnected one-off layouts.

Long-term page zones:

- header identity area with display name, tagline, portrait, and presence indicator
- identity-support area with optional real name, social links, and lightweight profile facts
- social / links area
- favorite game feature area with cabinet-entry link behavior
- rankings area for strongest ladder placements
- friends area with room for `main squeeze` plus a broader friend list
- scrollable status-feed area
- about-me area
- badges / achievements area
- background-image treatment behind the page shell

Shared contract expectations:

- text limits should be enforced in shared platform modules, not only in page forms
- empty fields should render deliberate fallback copy or fallback panels, not collapsed blank boxes
- layout-critical fields should be normalized before rendering so long names, broken links, and oversized text do not damage the page composition
- uploaded visual assets should eventually resolve to standardized presentation shapes rather than letting each page crop differently
- the profile page headline must render the player's `profileName`, not generic page copy such as `Player Page`
- the public subtitle line under the headline must render the player's editable `tagline`
- the identity-panel `Name` field must remain a separate optional real-name field rather than echoing `profileName`
- owner-mode UI must not replace the public profile composition; it only adds owner-only controls such as `Edit Profile`
- the profile page should be treated as a public social profile first, not as a generic account dashboard
- the profile page should read like a social-media profile in the Facebook/Myspace family, adapted to the arcade setting

Future systems that support this profile vision:

- profile background image upload and moderation flow
- lightweight presence states
- favorites linking back into arcade grid entries
- per-game ladder summary data
- friend points / affinity scoring
- user-authored status feed items with comments, sharing, and emoji-style reactions

Important scoping reminder:

- This profile vision is the destination.
- We do not need to build every section before the platform is useful.
- The rule is that new plumbing should make this page easier to realize later, not harder.

### `linkItem`

Suggested shape:

```js
{
  id: "link-1",
  label: "Itch.io",
  url: "https://example.com",
  kind: "external",
  createdAt: ""
}
```

### `bulletin`

Suggested shape:

```js
{
  id: "bulletin-1",
  slug: "spring-jam",
  title: "Spring Jam",
  summary: "",
  body: "",
  status: "published",
  audience: "public",
  publishedAt: "",
  createdBy: "system"
}
```

### `eventItem`

Suggested shape:

```js
{
  id: "event-1",
  slug: "lovers-lost-weekend",
  title: "Lovers Lost Weekend",
  summary: "",
  body: "",
  startsAt: "",
  endsAt: "",
  relatedGames: [],
  bulletinIds: [],
  status: "scheduled"
}
```

### `activityItem`

Suggested shape:

```js
{
  id: "activity-1",
  type: "game-result",
  actorPlayerId: "player-123",
  gameSlug: "lovers-lost",
  summary: "Maya finished a run in Lovers Lost",
  visibility: "friends",
  createdAt: "",
  metadata: {}
}
```

### `thoughtPost`

Suggested shape:

```js
{
  id: "thought-1",
  authorPlayerId: "player-123",
  text: "Need one more clean goblin pass.",
  visibility: "public",
  commentCount: 0,
  shareCount: 0,
  reactionTotals: {
    like: 0,
    love: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0
  },
  viewerReaction: "",
  repostOfId: "",
  createdAt: "",
  editedAt: ""
}
```

Notes:

- Treat `thoughtPost` as the first contract for the Myspace/Facebook-style bulletin concept.
- In other words, announcement bulletins live in the `bulletin` model, while user status-update bulletins live in the feed/post model.
- Naming can change later, but the product distinction should stay explicit in the shared contracts.
- `reactionTotals` is the shared contract for emoji-style reactions with visible per-emoji totals.
- `viewerReaction` is the future field for the current viewer's chosen reaction on a given post.
- Reaction UI should read like a Facebook-style social feed affordance rather than a generic counter-only metric.

### `mediaAsset`

Do not implement uploads yet, but define the future boundary now.

Suggested shape:

```js
{
  id: "asset-1",
  ownerPlayerId: "player-123",
  kind: "avatar",
  storageKey: "",
  mimeType: "image/png",
  width: 0,
  height: 0,
  status: "ready",
  createdAt: ""
}
```

## Ownership Rules

These rules should stay true through every phase.

- The platform owns canonical identity.
- The platform owns profile editing.
- The platform owns social graph data.
- The platform owns posts, links, bulletins, events, and media metadata.
- Games may request a temporary match/session display name.
- Games may publish approved result/activity payloads.
- Games may read public platform profile data when necessary.
- Games must not directly mutate profile, friends, feed, bulletin, or upload records.

## Implementation Phases

## Phase 0: Hardening The Foundation

Goal: formalize the platform core before we add pages.

Deliverables:

- define central data shapes and normalization helpers
- separate platform storage keys by feature area
- create shared modules for profile, links, bulletins, events, activity, and thoughts
- create fixture data strategy for non-game pages
- document the game-to-platform integration contract

Recommended code areas:

- `js/platform/identity/`
- `js/platform/profile/`
- `js/platform/bulletins/`
- `js/platform/events/`
- `js/platform/activity/`
- `js/platform/thoughts/`
- `js/platform/storage/`

Testing expectations:

- unit tests for every normalizer/sanitizer
- tests for storage adapters
- tests for fixture loading fallbacks

Exit criteria:

- no new page invents its own data shape
- shared objects have stable normalizers
- storage access is no longer ad hoc

## Phase 1: Read-Only Platform Pages

Goal: add stable page structure without heavy mutation risk.

Pages:

- `me` dashboard shell
- public player profile page
- bulletins listing
- events listing and event detail
- activity page with fixture/mock data

Rules:

- pages may read from local storage and fixture data
- pages should avoid destructive or multi-user write paths
- visual structure should be real even if some data is mocked

Testing expectations:

- page smoke tests for required mounts/copy/controls
- unit tests for page view-model builders

Exit criteria:

- page map exists
- navigation model is stable
- shared modules can support multiple pages without duplication

## Phase 2: Safe Personal Editing

Goal: allow the current player to edit platform-owned personal data.

Writes allowed in this phase:

- edit canonical profile name
- edit optional real name
- edit bio/tagline
- add/remove personal links
- set favorite game / featured cabinet
- set lightweight preferences

Writes not allowed yet:

- cross-user friend requests
- media upload
- public comments/replies
- complex moderation-dependent content

Rules:

- all forms write through shared platform modules
- page code never writes raw storage payloads directly
- every editable field has sanitization and normalization tests

Exit criteria:

- `me` becomes the single edit surface for personal platform data
- other pages read the same shared data cleanly

## Phase 3: Controlled Social Surfaces

Goal: add low-complexity social behavior without requiring the hardest backend work yet.

Features:

- shared thoughts feed
- recent activity feed
- game-published activity items
- simple friends list display
- groundwork for user-authored status posts that can later gain comments, sharing, and emoji-style reactions
- stronger profile identity fields so player pages feel like social-media profiles rather than launcher-side stat cards

Guardrails:

- start with append-only or simple replace flows
- no rich replies/threads yet
- no private messaging
- no cross-user mutation without real backend planning
- treat the first thoughts feed pass as the future doomscroll/home-feed surface, not as a replacement for the platform announcement board

Exit criteria:

- platform can display meaningful social surfaces
- game results can flow into a common activity model
- page interactions stay simple and testable

## Phase 4: Backend Transition

Goal: move from local-first platform scaffolding to real persistent multi-user data.

This is the trigger point for:

- authentication
- database-backed profiles
- friend relationships
- real shared feed data
- event publishing workflows
- cross-device state

Preconditions:

- stable front-end data contracts already exist
- page responsibilities are already separated
- write flows are already understood locally

Exit criteria:

- backend replaces adapters, not page logic
- platform pages do not need to be rewritten from scratch

## Phase 5: Media Uploads

Goal: add avatars/photos only after backend and moderation boundaries exist.

Required before implementation:

- authenticated ownership rules
- supported mime types
- file size caps
- image dimension rules
- upload failure states
- asset replacement rules
- moderation/safety decisions

Exit criteria:

- uploads are a narrow feature built onto stable profile/media contracts
- upload logic does not leak into unrelated page code

## Things We Should Explicitly Not Build Yet

- direct messages
- threaded comments
- notifications system
- generalized chat
- multi-image galleries
- arbitrary file upload
- per-game custom social schemas
- backend-dependent UX before backend contracts exist

## Navigation Strategy

Navigation should expand gradually instead of all at once.

Recommended progression:

1. keep current home and grid stable
2. add `Me` and `Bulletins`
3. add `Events`
4. add `Activity`
5. add `Thoughts`
6. add profile discovery only when it has a clear purpose

This keeps the shell understandable while the platform surface grows.

## Testing Strategy

Because this repo is already test-oriented, the platform should follow the same discipline.

Required test categories:

- data normalization tests
- storage adapter tests
- page structure/smoke tests
- view-model tests
- game integration contract tests

Not required:

- pixel-perfect rendering tests
- full DOM/browser integration for every interaction

The highest-value tests for the platform are the ones that prevent schema drift and ownership drift.

## Suggested Build Order For The Next Few Passes

1. Render the platform-owned activity page from the shared activity feed contract.
2. Add simple thoughts feed scaffolding only after the activity surface is stable.
   This is where the future Facebook/Myspace-style status-update bulletin feed should begin.
3. Enrich the shared player-profile data/view contract for favorite games, rankings, friend preview, presence, badges, and background fallbacks.
4. Embed player-owned thoughts feeds into `/me` and `/player` so the profile page starts behaving like a social profile rather than only a summary card.
5. Add profile discovery only when it has a clear use case for the surrounding pages.
6. Keep backend/auth/database work in the later transition phase instead of leaking it into local-first pages.

## Current Progress

- `js/platform/identity/` is now the source of truth for canonical platform identity.
- `js/platform/storage/` now owns shared platform storage keys and safe storage access helpers.
- `js/platform/profile/` now owns shared bio/tagline/link normalization plus public profile-view building.
- The canonical long-term profile contract now explicitly treats the page title as `profileName`, the subtitle as editable `tagline`, and the owner view as the same public composition plus an `Edit Profile` affordance.
- `/me/index.html` now exists as the first non-game platform page and reuses the synthwave shell language rather than introducing a separate visual system.
- `/player/index.html?id=<playerId>` now exists as a public player profile route backed by shared view models and explicit local-cache fallback behavior.
- `js/platform/bulletins/` now owns shared bulletin normalization plus a fixture-backed public bulletin feed.
- `/bulletins/index.html` now exists as the first read-only noticeboard surface for platform-owned announcements.
- The future user-authored "bulletin" concept is now explicitly tracked as part of the `thoughts` / social feed roadmap rather than replacing the current announcement board.
- `js/platform/events/` now owns shared event normalization, listing helpers, and slug-based event resolution.
- `/events/index.html` and `/event/index.html?slug=<eventSlug>` now exist as read-only event listing/detail surfaces backed by shared event contracts.
- `js/platform/activity/` now owns the first shared game-to-platform activity publishing contract plus the shared activity feed storage key.
- `js/platform/thoughts/` now owns shared status-post normalization plus a fixture/storage-backed public thoughts feed.
- `/thoughts/index.html` now exists as the first read-only player-status feed surface for the future social/home-feed layer.
- `js/platform/profile/` now normalizes richer public profile fields including favorite game, ladder placements, friends preview, main squeeze, presence, badges, and background-image fallback data.
- `/me/index.html` and `/player/index.html?id=<playerId>` now expose read-only favorite-cabinet, ranking, and friends sections with fallback content instead of only the earlier summary panels.
- The long-term feed contract now explicitly includes emoji-style reactions with visible totals so the thoughts/feed layer does not drift away from the intended Facebook-style interaction model.
- `games/lovers-lost/` and `games/battleshits/` now publish platform-owned result/activity payloads through that shared activity contract instead of owning their own long-term activity schema.
- Home, grid, bulletins, events, activity, thoughts, and player pages now expose direct navigation across the growing platform surface.
- The `/me` hero now uses a default portrait asset plus a clamped avatar frame so future uploads with mixed dimensions crop consistently.
- The `/me` hero layout now reserves dedicated space for the portrait rail so long names and bio copy do not collide with the avatar area.

## Decision Gates

Before starting a feature, ask:

- Is this page mostly read-only or write-heavy?
- Does the data shape already exist centrally?
- Does this belong to the platform or to a game?
- Can this ship locally first without lying about multi-user behavior?
- Will this feature force backend decisions we have not made yet?

If the answer to the last question is yes, the feature probably belongs in a later phase.

## Definition Of Success

We are succeeding if:

- the arcade grows into a multi-page platform without losing clarity
- shared identity remains centralized
- new pages reuse shared contracts instead of inventing their own
- games integrate through platform APIs instead of storage hacks
- backend adoption later feels like swapping adapters, not rebuilding the product

## Immediate Working Assumptions

These assumptions should hold unless we explicitly change them.

- The repo remains vanilla HTML/CSS/JS for now.
- Platform pages should stay static-host friendly.
- Query-param detail pages are acceptable early on.
- Local storage and fixtures are valid scaffolding for early phases.
- Real social persistence and uploads require a backend phase.
