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
- editable about-me / profile biography
- favorite-game pinning
- friends activity
- a shared thoughts feed for user-authored status updates and repostable bulletin-style posts
- direct / private messaging
- friend / affinity metrics
- badge and reputation surfaces
- eventual media upload
- profile music: a player-assigned audio track that autoplays on profile page load, in the Myspace tradition
- player gestures: lightweight expressive social interactions triggered from a player's public profile — Poke, Hug, Kick, Blow Kiss, Nudge, and Challenge to Game; each gesture generates a notification for the recipient
- notification shell: a platform-owned notification bell and inbox that collects received gestures and other social signals such as reactions, friend requests, and event invites
- doomscroll: a dedicated personalized home feed page showing thoughts from friends and groups the player has joined, with support for inline YouTube/video embedding via iframes — the primary high-engagement social surface of the platform
- groups: Facebook-style community spaces any player can create, join, or be invited to; thoughts posted inside a group surface in members' doomscroll feed alongside friend posts

Important terminology note:

- `Bulletins` means the current platform-owned announcement / noticeboard surface.
- `Thoughts` is the user-authored status-update feed with doomscroll/home-feed behavior.
- These are distinct product surfaces and must not collapse into each other.

Product framing note:

- Treat this project as a Facebook/Myspace-style social-media platform built around arcade identity and games, not as a generic launcher with a few profile extras.
- Games are a major content pillar, but the long-term product is still a social platform: profiles, feeds, friends, reactions, reposting, personal identity fields, private messaging, and public/self expression all matter as first-class product goals.
- Explicit sign-up, sign-in, and durable account ownership are part of the destination product. Auto-created local/browser profiles are acceptable scaffolding during early phases, but the platform is not "truly online" until players can intentionally register, own, and return to the same account across devices.

The platform remains the owner of long-term identity and social state.
Games remain self-contained experiences that can read platform data and publish approved activity/results, but games must not become the permanent home for profile ownership.

## Long-Term Experience Pillars

- `context-driven discovery`
  Discovery should come from shared games, recent opponents, event participation, ladder overlap, feed interaction, and most-played-with relationships rather than from a cold generic player directory.
  Once registered online profiles exist, contextual discovery should be reinforced by add-friend entry points on game results screens and by profile-linked in-game chat and lobby surfaces rather than by relying only on a standalone people index.
- `durable memories`
  The platform should turn cabinet runs, event appearances, activity items, and status posts into durable memories that can resurface on player pages, profile highlights, and future seasonal-history surfaces instead of leaving meaningful moments trapped inside isolated game sessions.
- `seasonal programming`
  Bulletins, featured cabinets, event schedules, ladder snapshots, and thought-feed prompts should eventually work together as seasonal programming so the arcade feels like a living scene with recurring beats instead of a static list of pages.
- `connected social loop`
  Thoughts, activity, bulletins, events, and player profiles should eventually feel like parts of one shared social loop, with each surface able to reinforce the others without blurring ownership boundaries.

## Non-Negotiables

These rules are here to protect stability.

1. Platform-owned identity stays platform-owned.
   `playerId`, canonical `profileName`, future profile fields, friends, links, posts, bulletins, activity, and media metadata belong to the platform layer, not to individual games.

2. Read-heavy pages come before write-heavy pages.
   We should ship stable display pages before adding many forms, mutations, uploads, or cross-user interactions.

3. Every shared rule lives in shared modules.
   No page should invent its own idea of what a profile, bulletin, activity item, or post looks like.

4. Games publish through a contract.
   Games may emit platform-recognized results and activity events, but only through a shared interface owned by the platform.

5. Stability beats cleverness.
   Prefer simple modules, plain HTML pages, query-param routing where needed, and explicit tests over premature abstraction.

6. Uploads come late.
   Photo/avatar upload should wait until auth, storage, file validation, moderation rules, and failure handling are defined.

7. Do not keep piling behavior into monolithic page controllers.
   For `/me`, `/player`, `/thoughts`, and related platform surfaces, extract loader, view-model, rendering, and action modules before the next major feature pass if those concerns are converging in one file.

## Architecture Shape

The safest platform structure is four layers.

### 1. Page Layer

Owns page-specific HTML composition and interaction flow. This layer should be thin — it renders shared view models and calls shared modules.

### 2. Shared Domain Layer

Owns data shapes, sanitization, normalization, and core platform rules. This is where stability comes from.

### 3. Storage / Data Source Layer

Owns where data comes from and where it is written. The page layer should not care whether data came from local storage, JSON fixtures, or the backend API. Backend is now source of truth for authenticated users; localStorage is a write-through cache or guest-only fallback.

### 4. Game Integration Layer

Owns the contract between games and the platform. Games should never write directly into random platform storage keys.

## Route / Page Plan

Because this repo is plain HTML/CSS/JS, the route plan should stay static-host friendly.

First-class pages:

- `/index.html` — Arcade home and entry point
- `/grid.html` — Game library / cabinet browser
- `/me/index.html` — Personal dashboard for the signed-in or local current player
- `/player/index.html?id=<playerId>` — Public player profile page
- `/search/index.html` — Player search / discovery
- `/bulletins/index.html` — Platform notices and curated announcements
- `/events/index.html` — Event listing page
- `/event/index.html?slug=<eventSlug>` — Event detail page
- `/activity/index.html` — Friends and platform activity
- `/thoughts/index.html` — Shared thoughts feed for user-authored status updates
- `/notifications/index.html` — Platform notification inbox (all social signals)
- `/messages/index.html` — Direct message inbox
- `/messages/conversation/index.html?id=<convId>` — Message thread view
- `/sign-in/index.html` — Sign-in page
- `/sign-up/index.html` — Account creation page

Planned future pages:

- `/doomscroll/index.html` — Personalized home feed (friends + group posts). Page shell can be scaffolded locally; real cross-user feed requires backend persistence and group support.
- `/groups/index.html` — Group discovery and listing
- `/group/index.html?id=<groupId>` — Group detail, feed, and member management

Notes:

- Prefer stable query-param detail pages over pretending we have full dynamic routing.
- `/players/index.html` (generic player directory) is not a planned page — discovery stays context-driven.

## Platform Module Map

Shared platform modules live here — read the code for current API shape:

- `js/platform/identity/` — canonical playerId + profileName
- `js/platform/storage/` — local storage helpers
- `js/platform/api/` — shared browser API clients (auth, notifications, messages, etc.)
- `js/platform/profile/` — profile-domain normalization
- `js/platform/bulletins/` — bulletin contracts
- `js/platform/events/` — event contracts
- `js/platform/activity/` — activity publishing/loading
- `js/platform/thoughts/` — 4-layer split: `thoughts-schema.mjs` (constants), `thoughts-normalize.mjs` (sanitization), `thoughts-store.mjs` (local feed/storage/card rendering), `thoughts-api.mjs` (API sync) — barrel `thoughts.mjs` preserves all import paths
- `js/platform/relationships/` — relationship normalization, slot resolution, relationship-write APIs
- `js/platform/metrics/` — canonical metrics split: public/support, relationship/discovery, backend-only analytics
- `platform-api/` — Node.js backend; Railway Postgres via `DATABASE_URL`; backend is source of truth for authenticated users

## What's Live

The following is the complete current state of the platform.

**Auth and identity:**
- Sign-up, sign-in, sign-out with 30-day HttpOnly JWT cookie (`arcade_session`)
- Account creation with `claimPlayerId` to attach existing guest identity to a new account
- `GET /auth/me`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- `js/arcade-session-nav.mjs` wired into home, grid, and `/me`

**Profiles:**
- Database-backed profiles, metrics, and relationships via `platform-api/`
- `GET /players/:id/profile`, `PUT /players/:id/profile`, `GET /players/search?q=...`
- `/me` and `/player` hydrate through API-aware adapters with local fallback
- Profile edit covers: profileName, realName, tagline, bio, links, favoriteGameSlug, discoverable, friend-rail slot mode
- `hasAccount` and `discoverable` ship on every profile API response
- `/search/index.html` for player discovery by name

**Social graph:**
- Friend requests: `POST /friend-requests`, accept/reject endpoints, `friend_request` + `friend_accept` notifications
- Guest viewers fall back to local direct-link path
- `js/platform/relationships/` owns canonical relationship normalization and slot resolution

**Thoughts and feed:**
- Thoughts create/delete mirror through backend; emoji reactions, share/repost, and thread comments all live via `platform-api/`
- `Share` supports immediate repost or caption composer with original attached
- `Comments` opens a thread panel on `/thoughts`, `/me`, and `/player`
- Thought social actions generate backend notifications to the thought author (reaction, comment, share)

**Activity:**
- Game results from `Lovers Lost` and `Battleshits` publish through shared activity contract and mirror to backend
- `js/platform/activity/` owns the canonical game-to-platform publishing seam

**Notifications:**
- `notifications` and `friend_requests` Postgres tables (migration 008)
- Bell + dropdown in session nav on home, grid, `/me`
- Full-page inbox at `/notifications/index.html`
- Live notification types: `thought_reaction`, `thought_comment`, `thought_share`, `friend_request`, `friend_accept`, `player_gesture`, `player_challenge`, `challenge_accepted`, `challenge_declined`
- Inline Accept/Reject for friend requests; inline Accept/Decline for challenges

**Gestures and challenges:**
- Poke, Hug, Kick, Blow Kiss, Nudge each fire `POST /players/:id/gesture` → `player_gesture` notification
- Challenge 🎮 opens inline game picker → `POST /challenges` → `player_challenge` notification with Accept/Decline
- Accept navigates acceptor to the game and notifies challenger; Decline notifies challenger
- `challenges` table via migration 009

**Direct messaging:**
- `conversations` + `messages` tables via migration 010
- `GET /messages`, `GET /messages/with/:playerId`, `POST /messages`, `GET /messages/:convId`, `POST /messages/:convId/read`
- Inbox at `/messages/index.html`, thread view at `/messages/conversation/index.html`
- 5-second polling for new messages; Enter-to-send
- `new_message` bell notification type
- Message 💬 button on `/player` profiles

**Infrastructure:**
- CSS split: shared base + per-page CSS (`home.css`, `me.css`, `player.css`, `thoughts.css`, `activity.css`, `bulletins.css`, `events.css`, `event.css`, `messages.css`)
- `js/platform/thoughts/` 4-layer module split (schema, normalize, store, api)
- `js/platform/metrics/` canonical metrics split

## Build Queue

Ordered by priority. Do not start the next item until the current one ships cleanly.

### 1. Profile Music

`profileMusic` contract in the profile editor, set/clear form, and a mini `<audio>` player widget that autoplays on profile page load with a visible pause/mute control.

Scope:
- Add `profileMusic` to the profile editor: one-track set-or-clear form (title, artist, URL, autoplay flag, volume)
- Store via shared API seam, not raw localStorage
- Render a persistent mini player widget on `/me` and `/player` when `profileMusic` is set
- Autoplay on profile load; widget must be immediately visible so visitors can pause or mute
- Graceful no-op when `profileMusic` is null — no broken widget
- `embedKind: "url"` only for now; YouTube/SoundCloud embeds belong to a later pass

Not in scope: playlists, YouTube embeds, SoundCloud embeds, multiple tracks.

### 2. Durable Memories

Surface game results, activity, and event participation as intentional memory cards on `/me` and `/player` rather than flat feed lists.

Scope:
- Define the `memoryCard` display contract: what data, what layout, what kind labels (game result, event appearance, milestone)
- Pull from existing activity and results payloads — no new data source needed
- Render as distinct cards or a scrollable memory rail, not as a raw activity dump
- Owner view (`/me`) and public view (`/player`) both get this surface

Not in scope: a standalone memories page, seasonal recap surfaces, cross-game leaderboard integration.

### 3. Profile Polish

These items are wired but incomplete:

- Ladder placements beyond empty placeholder — at minimum surface top-three finishes from existing activity data
- Badges beyond empty placeholder — define at least a small set of earnable badge conditions from platform data
- Avatar frame and 16:9 background matte visual pass — validate fallback behavior once real images exist; ensure the frame contract is stable before uploads arrive
- Favorite-cabinet card — verify correct rendering for most profiles, not just edge cases

### 4. Seasonal Programming

Make bulletins and events API-driven and content-rotated rather than fully static HTML fixtures.

Scope:
- Backend routes for admin-authored bulletins and events
- Frontend reads from API with fixture fallback
- Enough to rotate seasonal content without a deploy

Not in scope: full CMS, rich editor, image attachments.

### 5. Email / Domain

- Verify `RESEND_FROM_EMAIL` + domain once a custom domain is live
- Swap from `onboarding@resend.dev` test sender so password reset works for all users, not just the Resend account owner

## Deferred

These are part of the long-term product but are not being built yet.

**Deferred until after profile polish and memories:**
- Real uploads: avatar/background upload requires auth, storage, file validation, moderation rules, and failure handling — none of which are ready. Display constraints should be stabilized now so later upload work plugs into a stable frame.
- Profile music richer embeds: YouTube, SoundCloud, playlist support

**Deferred until backend is more settled:**
- WebSocket real-time message delivery (polling is live and sufficient; push delivery is a later pass)
- Threaded comments beyond the current flat-comment model
- Read receipts per message
- Group messaging

**Deferred until groups are scoped properly:**
- Group creation, membership management, invitations
- Group-scoped feeds
- Doomscroll personalized feed (requires groups + friends feed backend)
- `/groups/` and `/group/` pages beyond shell scaffolding

**Explicitly not planned:**
- Generic `/players` discovery directory — discovery stays context-driven
- Per-game custom social schemas
- Multi-image galleries
- Arbitrary file upload

## Long-Term Player Page Reference

Use the current example profile mockup as a layout and feature-direction reference for the long-term player page. It is a placement / information architecture reference, not a mandate to match the exact visual treatment.

Canonical reference asset:

- `images/mock-page-references/user-profile-page-reference.png`

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
- profile music: a player-assigned audio track that autoplays on profile page load

Canonical composition notes:

- Treat `/me` and `/player` as the same public profile composition.
- The owner view should not become a separate dashboard layout.
- The owner-specific difference is an owner-only `Edit Profile` button and related editing controls layered onto the same public-facing page.
- The intended composition from the reference:
  - left rail for portrait, identity support, rankings, and friends
  - center feature for the favorite game / featured cabinet
  - right rail for the player feed, about block, and badges
  - top header for `profileName` with `tagline` directly underneath

Important behavior notes:

- The page title must be the player's `profileName`. The canonical profile page headline is the player's public display name.
- The line directly underneath the page title must be the player's editable `tagline`.
- The in-profile `Name` field is an optional real-name field, separate from the arcade `profileName`.
- Presence should eventually support at least online, offline, and similar simple states.
- Favorite games should not be plain text only — they should link back into the arcade grid.
- Favorite game pinning should be player-controlled first. Most-played telemetry can offer a suggestion shortcut later but must not silently replace the player's stated favorite.
- Ladder placement should focus on best placements, especially top-three finishes.
- Profile background should render as a static backdrop while the profile content scrolls in front.
- Non-16:9 uploads should be letterboxed or pillarboxed inside a fixed 16:9 frame instead of forcing arbitrary crop rules. Dead space defaults to a simple matte (black or white).
- Social links should be a repeatable structured list (label, URL, kind), not a single freeform blob.
- Profile panel headers should be visually separated from panel content — use boxed section labels so headers like `Social Links` read as container labels rather than blending into player-authored content.
- Empty fields need strong defaults so the page still feels intentional when a player has no links, no rankings, no favorite game, no badges, no posts, or no custom background.

Suggested field-length constraints:

- `profileName`: 24 characters max
- `realName`: 48 characters max
- `tagline`: 80 characters max
- `bio` / `aboutMe`: 280 characters max
- social link label: 24 characters max
- social link URL: 280 characters max
- status-post body: 500 characters max before longer-read handling

## Shared Data Objects

These objects are defined centrally. No page should invent its own version of these shapes.

### `factoryProfile`

```js
{
  version: 1,
  playerId: "player-123",
  profileName: "Maya",
  realName: "",
  bio: "",
  tagline: "",
  avatarAssetId: "",
  favoriteGameSlug: "",
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
  badgeIds: [],
  profileMusic: null
}
```

### `profileMetrics`

```js
{
  playerId: "player-123",
  profileViewCount: 0,
  thoughtPostCount: 0,
  activityItemCount: 0,
  receivedReactionCount: 0,
  receivedCommentCount: 0,
  receivedShareCount: 0,
  mostPlayedGameSlug: "",
  mostPlayedWithPlayerId: "",
  friendCount: 0,
  friendPoints: {},
  totalPlaySessionCount: 0,
  totalPlayTimeMinutes: 0,
  uniqueGamesPlayedCount: 0,
  eventParticipationCount: 0,
  topThreeFinishCount: 0
}
```

Canonical metrics split:

- **public/support** — profileViewCount, thoughtPostCount, activityItemCount, receivedReactionCount, receivedCommentCount, receivedShareCount, mostPlayedGameSlug, mostPlayedWithPlayerId, friendCount, friendPoints, totalPlaySessionCount, totalPlayTimeMinutes, uniqueGamesPlayedCount, eventParticipationCount, topThreeFinishCount
- **relationship/discovery** — mutualFriendCount, sharedGameCount, sharedSessionCount, sharedEventCount
- **backend-only analytics** — resultsScreenProfileOpenCount, resultsScreenAddFriendClickCount, chatProfileOpenCount, friendRequestSentCount, friendRequestAcceptedCount, thoughtImpressionCount, profileOpenSourceBreakdown

### `profileRelationships`

```js
{
  playerId: "player-123",
  mainSqueezeMode: "manual",
  mainSqueezePlayerId: "",
  friendRailMode: "auto",
  manualFriendSlotPlayerIds: ["", "", "", ""],
  mostPlayedWithPlayerId: "",
  lastPlayedWithPlayerId: "",
  recentlyPlayedWithPlayerIds: [],
  friendPlayerIds: [],
  friendPointsByPlayerId: {},
  mutualFriendCountByPlayerId: {},
  sharedGameCountByPlayerId: {},
  sharedSessionCountByPlayerId: {},
  sharedEventCountByPlayerId: {},
  lastSharedSessionAtByPlayerId: {},
  lastSharedEventAtByPlayerId: {},
  lastInteractionAtByPlayerId: {}
}
```

Friend-points v1:

- creating a friendship: `+100`
- full shared session: `+10` (both players started in the same lobby and reached results together)
- shared event as a team / linked entry: `+50` (must enter as an explicit linked pair; not just co-present)
- direct social interaction: `+1`

Guardrails: apply each bonus once per qualifying event; cap repeated low-value interactions in a short window; no decay in v1.

Visible friend placement is separate from relationship strength. `Main Squeeze` and the four standard friend slots each support either manual or automatic behavior.

### `profileMusic`

```js
{
  trackTitle: "",
  trackArtist: "",
  trackUrl: "",
  embedKind: "url",
  autoplay: true,
  volume: 0.7,
  setAt: ""
}
```

- `embedKind: "url"` means a direct `<audio>` src. YouTube/SoundCloud kinds belong to a later pass.
- Autoplay must always be paired with a visible mini player widget so visitors can pause or mute immediately.
- `profileMusic` is `null` when unset. Empty profiles must render gracefully with no broken player widget.
- Profile editor: one-track set-or-clear form only.

### `linkItem`

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

```js
{
  id: "thought-1",
  authorPlayerId: "player-123",
  subject: "",
  text: "Need one more clean goblin pass.",
  groupId: "",
  visibility: "public",
  attachments: [],
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

- `visibility` supports `"public"`, `"friends"`, and `"group"`. Group posts require `groupId`.
- `groupId` is empty/null for non-group posts.
- `reactionTotals` is the contract for emoji-style reactions with visible per-emoji totals.
- `viewerReaction` is the current viewer's chosen reaction on a given post.
- `attachments` is a list of embedded media items attached to the post.

### `thoughtAttachment`

```js
{
  kind: "youtube",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  embedId: "dQw4w9WgXcQ",
  title: ""
}
```

Attachment kinds: `"youtube"` (iframe embed), `"link"` (styled link card). Open Graph preview requires a backend proxy and belongs to a later pass.

### `gestureItem`

```js
{
  id: "gesture-1",
  kind: "poke",
  fromPlayerId: "player-123",
  toPlayerId: "player-456",
  createdAt: ""
}
```

Supported kinds: `poke`, `hug`, `kick`, `blow-kiss`, `nudge`, `challenge`. `challenge` opens a game picker and creates a `challenges` record rather than sending a bare gesture notification. Treat `kind` as an open enumeration — the list will grow.

### `notificationItem`

```js
{
  id: "notif-abc123",
  recipientPlayerId: "player-456",
  actorPlayerId: "player-123",
  actorDisplayName: "Jay",
  type: "thought_reaction",
  status: "unread",
  payload: {},
  createdAt: ""
}
```

Live types: `thought_reaction`, `thought_comment`, `thought_share`, `friend_request`, `friend_accept`, `player_gesture`, `player_challenge`, `challenge_accepted`, `challenge_declined`, `new_message`.

Planned future types: `event_invite`.

### `group`

```js
{
  id: "group-1",
  slug: "retro-runners",
  name: "Retro Runners",
  description: "",
  createdByPlayerId: "player-123",
  visibility: "public",
  memberCount: 0,
  createdAt: "",
  updatedAt: ""
}
```

### `groupMembership`

```js
{
  groupId: "group-1",
  playerId: "player-123",
  role: "member",
  joinedAt: ""
}
```

Roles: `"owner"`, `"member"`. Group creation and membership management require backend work and belong to the deferred phase.

### `mediaAsset`

Do not implement uploads yet, but maintain this boundary.

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

## Testing Strategy

Required test categories:

- data normalization tests
- storage adapter tests
- page structure/smoke tests
- view-model tests
- game integration contract tests

The highest-value tests for the platform are the ones that prevent schema drift and ownership drift.

Not required:

- pixel-perfect rendering tests
- full DOM/browser integration for every interaction

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
