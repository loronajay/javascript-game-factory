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
- eventual direct / private messaging
- friend / affinity metrics
- badge and reputation surfaces
- eventual media upload
- profile music: a player-assigned audio track that autoplays on profile page load, in the Myspace tradition
- player gestures: lightweight expressive social interactions triggered from a player's public profile — Poke, Hug, Kick, Blow Kiss, Nudge, and Challenge to Game; each gesture generates a notification for the recipient
- notification shell: a platform-owned notification bell and inbox that collects received gestures and later other social signals such as reactions, friend requests, and event invites
- doomscroll: a dedicated personalized home feed page showing thoughts from friends and groups the player has joined, with support for inline YouTube/video embedding via iframes — the primary high-engagement social surface of the platform
- groups: Facebook-style community spaces any player can create, join, or be invited to; thoughts posted inside a group surface in members' doomscroll feed alongside friend posts

Important terminology note:

- `Bulletins` can continue to mean the current platform-owned announcement / noticeboard surface.
- We also want a separate user-authored bulletin style: short status updates in a scrollable home feed, closer to old Myspace bulletins or Facebook status posts.
- That future social surface should support feed-style interaction patterns such as comments, sharing/reposting, emoji-style reactions with visible totals, and profile-linked authorship once the platform is ready for heavier social features.

Product framing note:

- Treat this project as a Facebook/Myspace-style social-media platform built around arcade identity and games, not as a generic launcher with a few profile extras.
- Games are a major content pillar, but the long-term product is still a social platform: profiles, feeds, friends, reactions, reposting, personal identity fields, private messaging, and public/self expression all matter as first-class product goals.
- Explicit sign-up, sign-in, and durable account ownership are part of the destination product, not optional extras. Auto-created local/browser profiles are acceptable scaffolding during early phases, but the platform is not "truly online" until players can intentionally register, own, and return to the same account across devices.

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
- connected social loop
  Thoughts, activity, bulletins, events, and player profiles should eventually feel like parts of one shared social loop, with each surface able to reinforce the others without blurring ownership boundaries.

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
- `js/platform/identity/factory-profile.mjs` defines canonical shared identity storage.
- `js/platform/identity/match-identity.mjs` separates permanent identity from temporary per-match aliases.
- `js/arcade-profile.mjs` already gives us a shell-level profile editor.
- `js/platform/profile/`, `js/platform/activity/`, `js/platform/thoughts/`, `js/platform/bulletins/`, and `js/platform/events/` now formalize the first shared platform contracts.
- owner-authored thought submission on `/me` and owner-view `/player` now exists as a local-first platform capability rather than a future-only note.
- `games/lovers-lost/` and `games/battleshits/` already consume the shared identity/activity model.

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
  Deferred discovery surface only if context-driven discovery eventually needs a dedicated index. Do not treat this as an immediate page requirement.
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
- `/notifications/index.html`
  Platform notification inbox. Shows received gestures (Poke, Hug, Kick, Blow Kiss, Nudge, Challenge to Game) in the local-first phase; expands to all social signals (reactions, friend requests, event invites) once backend delivery exists.
- `/doomscroll/index.html`
  Personalized home feed. Shows thoughts from friends and groups the player has joined. YouTube/video links in posts render as inline iframe embeds. The page shell can be scaffolded locally but real cross-user feed content requires backend persistence. This is the primary high-engagement social surface of the platform.
- `/groups/index.html`
  Group discovery and listing. Shows groups the player has joined and allows browsing/searching public groups.
- `/group/index.html?id=<groupId>`
  Group detail page. Shows the group feed, member list, and group info. Owner view adds group management controls.

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
- profile music: a player-assigned audio track that autoplays on profile page load, just like Myspace song selection

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
- Favorite game pinning should be player-controlled first.
  We can track most-played cabinets separately and later offer a `use most played` shortcut, but the platform should not auto-overwrite a player's public favorite game without an explicit player action.
- Ladder placement should focus on best placements, especially top-three finishes or top-ranked positions per game when available.
- The `main squeeze` friend slot implies a future best-friend style relationship layer.
  We are not building that yet, but it should be tracked as a future platform concept.
- Future friend points should likely derive from shared play behavior, such as time spent playing together or a similar trust / affinity metric.
  That system needs separate scoping later and should remain platform-owned.
- Friend rail placement should support either manual or automatic behavior for every visible slot once that system exists.
  `Main Squeeze` and the four standard friend slots should each be able to respect player curation or platform-owned affinity ordering without forcing one mode as the permanent default.
- The background image should eventually be a user-uploaded asset standardized to a 16:9 presentation area.
  Until upload systems exist, use a default background image / fallback treatment.
- Treat that background as a static profile backdrop rather than a scrolling page layer.
  The profile content and feed areas should scroll while the background image remains visually fixed behind the composition.
- Backgrounds should render inside a fixed 16:9 presentation area even when the uploaded image is not 16:9.
  Preserve the full uploaded image and handle dead space with matte / letterbox treatment rather than forcing destructive auto-cropping.
- Dead space should default to a simple matte treatment such as black or white, with room for a future player-controlled matte color option.
- The avatar / profile-picture area should also obey shared presentation constraints.
  Standardize portrait cropping, sizing, and fallback behavior in platform code before real uploads exist so later media work plugs into a stable frame.
- Social links should be modeled as a repeatable structured list, not a single freeform text blob.
  Each link item should normalize its own label, URL, and kind so the page never renders sloppy mixed-format link copy.
- Profile panel headers should be visually separated from panel content.
  Use boxed section labels or a similarly explicit treatment so headers such as `Social Links` read as container labels rather than blending into player-authored link labels or other body content.
- The profile feed should eventually support actual player-authored thought submission from the owner view.
  Comments, reactions, and sharing belong to the same feed contract, but cross-user behavior should not force backend work into early local-first passes.
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
  badgeIds: [],
  profileMusic: null
}
```

Future-facing notes:

- `presence` should stay lightweight at first and only expose simple user-facing states.
- `favoriteGameSlug` should support linking back to the cabinet entry.
- `ladderPlacements` should summarize a player's strongest rankings without requiring a full standings page inside the profile itself.
- `mainSqueeze` is a future social-field concept, not an immediate implementation target.
- `backgroundImageUrl` should resolve to a normalized 16:9 presentation asset once uploads exist.
- profile backgrounds should render as static backdrops while the foreground profile composition scrolls independently.
- non-16:9 uploads should be letterboxed or pillarboxed inside that 16:9 frame instead of forcing arbitrary crop rules.
- `bio` is the canonical editable about-me field and should not drift into a second duplicated description concept.
- `links` should support multiple normalized entries and render cleanly whether a player has zero, one, or many links.
- `favoriteGameSlug` should represent an explicit public pin first, while most-played telemetry remains a separate metric rather than silently replacing the player's stated favorite.
- `profileMusic` is a player-assigned audio track that autoplays on profile page load. It is `null` when unset and should never autoplay silently without a visible player widget that lets visitors pause or mute.

### `profileMetrics`

Suggested shape:

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

Notes:

- Treat metrics as platform-owned support data, not as page-owned presentation state.
- `profileViewCount` is the canonical metric behind any future page/profile views UI.
- `thoughtPostCount` and `activityItemCount` are support metrics that help player pages summarize output without scraping view markup.
- `receivedReactionCount`, `receivedCommentCount`, and `receivedShareCount` should reflect totals received on the player's authored public content, not raw interaction controls rendered on a single page load.
- `mostPlayedGameSlug` and `mostPlayedWithPlayerId` should inform future UI and shortcuts without overriding explicit player profile choices.
- `friendCount` is a first-class support metric even if friend lists later become richer objects.
- `friendPoints` is the future affinity source for automatic friend ordering and other relationship/discovery surfaces, but visible slot placement can still be manual when the player chooses it.
- `totalPlaySessionCount`, `totalPlayTimeMinutes`, and `uniqueGamesPlayedCount` summarize arcade participation without turning the shared metrics contract into a full game-stats dump.
- `eventParticipationCount` matters because events are a first-class platform pillar in the long-term vision.
- `topThreeFinishCount` is a compact competitive-social summary that reads well on a public profile without dragging cabinet-specific score tables into the shared contract.

### `profileRelationships`

Suggested shape:

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

Relationship-system notes:

- `friendPoints` are platform-derived support data and should never be manually edited.
  In other words, friendPoints are platform-derived, while visible slot placement can still be manual.
- visible friend placement is separate from relationship strength
- `Main Squeeze` can be either manual or automatic
  Main Squeeze can be either manual or automatic depending on the player's chosen slot behavior.
- the four standard friend slots can also be either manual or automatic
- the visible profile rail should always resolve to five total slots: one `Main Squeeze` slot plus four standard friend slots
- the system should track both affinity and recency
- affinity signals include friend points plus shared counts
- recency signals include last played with, recently played with, last shared session, last shared event, and last direct interaction

Friend-points v1:

- creating a friendship: `+100`
- full shared session: `+10`
  A qualifying shared session means both players started in the same lobby and reached the same results screen together.
- shared event as a team / linked entry: `+50`
  This bonus should only apply when two players enter an event together as a team or explicit linked entry; simply being present in the same broad event should not qualify.
- direct social interaction: `+1`

Guardrails:

- apply the friendship bonus only once when the friendship is created
- award session points only once per full shared session
- award event points only once per qualifying team/linked event
- cap repeated low-value interaction gains inside a short window so the system cannot be farmed through spam
- do not decay points in v1
- use recency later as a tiebreaker or suggestion signal rather than replacing the main affinity totals
- Exact storage strategy can change later, but the concepts should stay centralized.

Recommended canonical metrics split:

- public/profile support metrics
  `profileViewCount`, `thoughtPostCount`, `activityItemCount`, `receivedReactionCount`, `receivedCommentCount`, `receivedShareCount`, `mostPlayedGameSlug`, `mostPlayedWithPlayerId`, `friendCount`, `friendPoints`, `totalPlaySessionCount`, `totalPlayTimeMinutes`, `uniqueGamesPlayedCount`, `eventParticipationCount`, `topThreeFinishCount`
- relationship/discovery metrics
  `mutualFriendCount`, `sharedGameCount`, `sharedSessionCount`, `sharedEventCount`
- backend-only analytics
  `resultsScreenProfileOpenCount`, `resultsScreenAddFriendClickCount`, `chatProfileOpenCount`, `friendRequestSentCount`, `friendRequestAcceptedCount`, `thoughtImpressionCount`, `profileOpenSourceBreakdown`

Scope rules for this list:

- `favoriteGameSlug` stays explicit and player-authored and must not be replaced by `mostPlayedGameSlug`.
- the shared public/support metrics contract should remain small, legible, and support-oriented; avoid turning it into a dumping ground for every cabinet-specific stat.
- relationship/discovery metrics can be canonical without becoming first-wave public profile counters; they exist to support friend surfacing and contextual discovery.
- backend-only analytics should stay separate from public/shared profile metrics even when they are useful for product decisions.
- per-game high scores, streaks, and ladder details can exist in game/platform result systems, but they should only be promoted into shared profile metrics if they support multiple surfaces cleanly.

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
- profile background imagery should stay static behind the page composition while profile panels and feed content do the scrolling
- profile background uploads may use flexible source aspect ratios as long as the displayed profile frame remains a fixed 16:9 area with deliberate dead-space handling
- the owner-edit surface should cover the profile picture frame, about-me text, favorite game pin, and structured social links instead of scattering those writes through unrelated pages
- the profile page headline must render the player's `profileName`, not generic page copy such as `Player Page`
- the public subtitle line under the headline must render the player's editable `tagline`
- the identity-panel `Name` field must remain a separate optional real-name field rather than echoing `profileName`
- owner-mode UI must not replace the public profile composition; it only adds owner-only controls such as `Edit Profile`
- the profile page should be treated as a public social profile first, not as a generic account dashboard
- the profile page should read like a social-media profile in the Facebook/Myspace family, adapted to the arcade setting
- redundant helper copy should be removed once the surrounding panel label already communicates the section purpose

Future systems that support this profile vision:

- profile background image upload and moderation flow
- static profile-background rendering with a fixed 16:9 display contract and flexible source-image aspect ratios
- lightweight presence states
- favorites linking back into arcade grid entries
- per-game ladder summary data
- friend points / affinity scoring
- recommended canonical metrics split covering public/support metrics, relationship/discovery metrics, and backend-only analytics
- user-authored status feed items with comments, sharing, and emoji-style reactions
- direct / private messaging once authenticated identity and cross-user backend rules exist
- profile music: a player-assigned audio track with a persistent mini player widget on the profile page, in the Myspace tradition; richer embed kinds (YouTube, SoundCloud) and playlist support belong to the backend phase

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

Notes:

- Treat `thoughtPost` as the first contract for the Myspace/Facebook-style bulletin concept.
- In other words, announcement bulletins live in the `bulletin` model, while user status-update bulletins live in the feed/post model.
- Naming can change later, but the product distinction should stay explicit in the shared contracts.
- `reactionTotals` is the shared contract for emoji-style reactions with visible per-emoji totals.
- `viewerReaction` is the future field for the current viewer's chosen reaction on a given post.
- Reaction UI should read like a Facebook-style social feed affordance rather than a generic counter-only metric.
- `groupId` is empty/null for non-group posts. When set, the post belongs to a group and should surface in that group's feed and in members' doomscroll feed.
- `attachments` is a list of embedded media items (YouTube links, external links, etc.) attached to the post.
- `visibility` should eventually support `"public"`, `"friends"`, and `"group"`. Group posts use `"group"` and require `groupId`.
- The doomscroll feed is a filtered view: friends' posts with `"public"` or `"friends"` visibility, plus `"group"` posts from groups the player has joined.

### `thoughtAttachment`

A media item or link attached to a thought post.

Suggested shape:

```js
{
  kind: "youtube",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  embedId: "dQw4w9WgXcQ",
  title: ""
}
```

Attachment kinds:
- `"youtube"` — YouTube video. `embedId` is extracted from the URL and rendered as a native `<iframe>` embed. No custom media player needed.
- `"link"` — a bare external URL. Renders as a styled link card. Open Graph preview metadata belongs to the backend phase since cross-origin fetching requires a proxy.
- (future) `"vimeo"` — same iframe embed pattern as YouTube.

Notes:
- YouTube and Vimeo embeds are handled entirely client-side via native iframes — no custom media player is required.
- Link preview cards (title + thumbnail from Open Graph) require a backend proxy to fetch cross-origin metadata and belong to a later pass.
- The post composer should auto-detect YouTube/Vimeo URLs pasted into the body and convert them to attachments rather than leaving them as raw text.

### `group`

A player-created community space. Any player can create a group, join a public group, or be invited by a member.

Suggested shape:

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

Tracks a player's membership in a group.

Suggested shape:

```js
{
  groupId: "group-1",
  playerId: "player-123",
  role: "member",
  joinedAt: ""
}
```

Roles: `"owner"`, `"member"`. Owner is the player who created the group.

Notes:
- `visibility` controls discoverability: `"public"` groups can be browsed and joined by anyone; `"private"` groups require an invitation.
- Group posts are `thoughtPost` records with a `groupId` set and `visibility: "group"`.
- Group posts from groups a player has joined surface in that player's doomscroll feed alongside friend posts.
- Group creation, membership management, and group-scoped feeds all require backend persistence and belong to Phase 4.
- The page shell for `/groups/` and `/group/` can be scaffolded in a local-first pass, but real group data requires backend work.

### `profileMusic`

Suggested shape:

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

Notes:

- `trackUrl` is the canonical source for playback. In the local-first phase this is a direct audio file URL or a publicly embeddable stream link the player supplies manually.
- `embedKind` describes how the URL should be interpreted. `"url"` means a direct `<audio>` src. Other kinds such as `"youtube"` or `"soundcloud"` belong to the backend phase once embed policy is clear.
- Autoplay must always be paired with a visible mini music player widget on the profile page so visitors can immediately pause or mute. Silent forced autoplay is not acceptable UX.
- Volume should be normalized to a range of 0–1 and clamped before storage.
- `profileMusic` is `null` when the player has not set a track. Empty profiles must render gracefully with no broken player widget.
- The profile editor should treat `profileMusic` as a simple set-or-clear form: one track at a time, no playlist.
- Multi-track playlists and richer embed integrations belong to the backend phase.

### `gestureItem`

A player-to-player expressive social interaction triggered from a public profile view.

Supported gesture kinds: `poke`, `hug`, `kick`, `blow-kiss`, `nudge`, `challenge`.

Suggested shape:

```js
{
  id: "gesture-1",
  kind: "poke",
  fromPlayerId: "player-123",
  toPlayerId: "player-456",
  createdAt: ""
}
```

Notes:

- `challenge` is a special kind that carries an optional `gameSlug` hint for which cabinet the challenge is for.
- Gestures are one-directional; the recipient does not need to respond.
- In the local-first phase, sent gestures are written into the sender's own localStorage and can be reflected locally; real cross-user delivery requires a backend push layer.
- The gesture list is intended to expand with new kinds over time; `kind` should always be treated as an open enumeration, not a closed set.
- Gestures should never auto-repeat silently; if a sender sends the same kind to the same player within a short window, the UI should acknowledge the repeat rather than silently stacking duplicates.

### `notificationItem`

A platform-owned notification targeting a specific player.

Suggested shape:

```js
{
  id: "notif-1",
  kind: "gesture",
  targetPlayerId: "player-456",
  fromPlayerId: "player-123",
  relatedId: "gesture-1",
  summary: "Jay poked you",
  read: false,
  createdAt: ""
}
```

Notification kinds (v1 scope):

- `gesture` — a received Poke, Hug, Kick, Blow Kiss, Nudge, or Challenge
- (future) `reaction` — a reaction on a thought post
- (future) `friend-request` — a friend request received
- (future) `event-invite` — an event team invitation

Notes:

- Notifications are platform-owned and live under the platform storage layer, not inside individual game modules.
- `read` controls unread badge counts on the notification bell.
- The notification bell in the nav shell should show an unread count badge when unread notifications exist.
- In the local-first phase, only gesture notifications are generated and only the current player's own inbox is accessible.
- Real cross-user notification delivery (push or polling) belongs to the backend transition phase.
- The notification page (`/notifications/index.html`) is the primary inbox surface; a nav-level bell is the entry point.

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
- fix profile-picture presentation constraints and fallback behavior without introducing upload
- set lightweight preferences
- set or clear profile music track (title, artist, URL, autoplay flag, volume)

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
- owner-authored thought submission on the profile/feed surface
- profile metrics groundwork for the recommended canonical metrics split across profile support, engagement, play summaries, relationship discovery, and backend analytics boundaries
- explicit friend-points / auto-sort contract with room for later manual override
- groundwork for user-authored status posts that can later gain comments, sharing, and emoji-style reactions
- stronger profile identity fields so player pages feel like social-media profiles rather than launcher-side stat cards
- UI-contract prep for contextual profile surfacing, especially profile links from results/history surfaces and future add-friend entry points on game results screens
- player gesture contract (`gestureItem`) and gesture buttons on public profile pages — Poke, Hug, Kick, Blow Kiss, Nudge, and Challenge to Game
- notification shell groundwork: `notificationItem` contract, platform notification storage key, nav-level notification bell with unread badge, and `/notifications/index.html` inbox page
- in the local-first phase the notification inbox surfaces received gestures only; the bell and inbox UI should be designed to accept additional notification kinds later without structural change

Guardrails:

- start with append-only or simple replace flows
- no rich replies/threads yet
- no private messaging
- no cross-user mutation without real backend planning
- in-game chat and lobby surfaces may be scoped visually or contractually, but real cross-user chat behavior belongs to backend transition work
- comment, reaction, and share UI contracts may be defined early, but true cross-user persistence belongs to backend transition work
- treat the first thoughts feed pass as the future doomscroll/home-feed surface, not as a replacement for the platform announcement board

Exit criteria:

- platform can display meaningful social surfaces
- game results can flow into a common activity model
- page interactions stay simple and testable

## Phase 4: Backend Transition

Goal: move from local-first platform scaffolding to real persistent multi-user data through shared backend adapters rather than page rewrites.

Current status:

- This phase has now started.
- Railway Postgres is provisioned for the project.
- `platform-api/` now exists as the first shared backend service scaffold and reads `DATABASE_URL`.
- Initial migration/sql wiring plus backend record routes for profiles, metrics, relationships, activity items, and thought posts are now part of the active implementation path.
- The frontend is now in an adapter-first hybrid state: shared API seams are live for profile/feed/activity/metrics reads and mirrors, while local fallback remains in place intentionally for stability.
- Thought interactions are no longer placeholders: reactions, repost/share records, and comments now have real backend routes and shared frontend adapters, while the page layer still keeps local fallback behavior.

This is the trigger point for:

- authentication
- database-backed profiles
- friend relationships
- add-friend entry points on game results screens
- in-game chat and lobby surfaces that can link to public profiles
- real shared feed data
- doomscroll personalized feed (friends posts + group posts in one scroll)
- group creation, membership, invitations, and group-scoped feeds
- direct / private messaging
- cross-user comments, reactions, and shares
- real cross-user gesture delivery so Poke / Hug / Kick / Blow Kiss / Nudge / Challenge actually arrives in the recipient's inbox instead of staying local
- backend-pushed notification delivery for all notification kinds (gestures, reactions, friend requests, event invites)
- persistent profile/page metrics
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
- fixed 16:9 profile background presentation with matte / dead-space handling for non-16:9 uploads
- avatar crop / display-shape rules
- upload failure states
- asset replacement rules
- moderation/safety decisions

Exit criteria:

- uploads are a narrow feature built onto stable profile/media contracts
- upload logic does not leak into unrelated page code

## Things We Should Explicitly Not Build Yet

- direct messages
- threaded comments
- real cross-user notification delivery (local-first gesture/notification UI is in scope; server push belongs to Phase 4)
- generalized chat
- multi-image galleries
- arbitrary file upload
- per-game custom social schemas
- backend-dependent UX before backend contracts exist
- real group creation/membership/feeds (group data shapes and page shells can be defined locally; actual group persistence and member management require Phase 4 backend)
- doomscroll cross-user feed content (the doomscroll page shell can be scaffolded locally; a real personalized feed of friends and group posts requires backend persistence)

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

1. Finish the current profile polish pass so the mock-aligned page stops carrying redundant or sloppy helper copy.
   This includes things like duplicate profile-picture labeling and other presentation drift inside the shared profile composition.
2. Separate panel headers from panel content across the shared player profile composition, using boxed section labels or similarly explicit framing so labels like `Social Links` never blend into user-authored content.
3. Finish stabilizing favorite-cabinet presentation, profile background fallback treatment, and avatar framing so the mock-aligned profile composition feels intentional even before uploads exist.
4. Define the recommended canonical metrics split for platform-owned support data: public/profile support metrics, relationship/discovery metrics, and backend-only analytics.
5. Turn future discovery into context-driven discovery through shared games, events, activity, and feed participation instead of shipping a generic empty player directory.
6. Reserve chat/lobby profile links and add-friend results-screen prompts as the primary future profile-surfacing routes once authenticated online profiles exist.
7. Shape bulletins, events, featured cabinets, ladder snapshots, and feed prompts into the first pass of seasonal programming.
8. Use those shared metrics/contracts to support durable memories on player pages and future home-feed/story surfaces without pretending full cross-user persistence already exists.
9. Keep backend work concentrated inside shared adapters and the new `platform-api/` service instead of leaking ad hoc fetch/storage logic into page code.

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
- `/thoughts/index.html` now exists as the first public player-status feed surface for the future social/home-feed layer.
- `js/platform/profile/` now normalizes richer public profile fields including favorite game, ladder placements, friends preview, main squeeze, presence, badges, and background-image fallback data.
- `/me/index.html` and `/player/index.html?id=<playerId>` now expose read-only favorite-cabinet, ranking, and friends sections with fallback content instead of only the earlier summary panels.
- `/me/index.html` and `/player/index.html?id=<playerId>` now embed player-owned thoughts feeds directly into the profile composition instead of leaving that social lane detached from the player page.
- owner-authored thought submission on `/me` and owner-view `/player` now exists, with new posts written locally into the shared thought-feed contract.
- owner-view thought cards can now be deleted from `/me` and owner-view `/player`, and those removals propagate cleanly to the shared local-first feed state.
- the public and profile-embedded thought lanes now use constrained scroll windows so cards stay at full size instead of compressing as the feed grows.
- `/me` and `/player` now follow the canonical reference composition much more closely with a true left rail, a square featured-cabinet tile that reuses the arcade grid-card shape, and a right-side feed/about/badges lane.
- The profile identity contract now includes a separate optional `realName` field distinct from the arcade `profileName`, and the current owner edit surface supports editing that field locally.
- the current owner edit surface now also supports canonical `bio`, structured multi-link editing, bare-domain link normalization, local-first favorite cabinet storage, and manual/automatic visible friend-rail settings.
- The profile presence affordance now treats the dot beside the in-panel `Name` field as the visible source of truth for online/offline state instead of rendering a redundant status row.
- The current profile pass has also removed redundant duplicate headers and placeholder labels inside the mock-defined sections so panel titles only read once.
- The long-term feed contract now explicitly includes emoji-style reactions with visible totals so the thoughts/feed layer does not drift away from the intended Facebook-style interaction model.
- `games/lovers-lost/` and `games/battleshits/` now publish platform-owned result/activity payloads through that shared activity contract instead of owning their own long-term activity schema.
- `js/platform/relationships/` now owns canonical relationship normalization, fixed-slot friend-rail resolution, local-first relationship storage, and symmetric write APIs for friendship creation, qualifying shared sessions, qualifying linked events, and capped direct interactions.
- qualifying shared-session relationship credit now flows through `js/platform/activity/` for `Lovers Lost` and `Battleshits`, so result publishing stays cabinet-owned while affinity/recency math stays platform-owned.
- `Battleshits` now preserves opponent `playerId` through the online match/result flow so shared-session relationship updates can bind to real platform identities.
- Railway Postgres is now provisioned for the product as the long-term source of truth for cross-game platform data.
- `platform-api/` now exists as a separate Node.js service scaffold for the platform backend, with `DATABASE_URL` wiring, health/readiness routes, and the first migration runner.
- `platform-api/` now includes the first Postgres schema covering players, profiles, metrics, relationships, relationship ledger entries, activity items, and thought posts.
- `platform-api/` now exposes the first real backend record routes for profiles, metrics, relationships, activity items, and thought posts.
- `js/platform/api/` now owns the shared browser-side client/adapters for talking to `platform-api/` without leaking fetch logic into page code.
- the backend transition is now adapter-first: shared frontend seams stay in place while persistence logic moves behind the new API service.
- `/me` and `/player` now hydrate profiles, metrics, and relationships through API-aware adapters with local fallback instead of staying pure local-cache readers.
- the owner profile-edit persistence path now mirrors through the shared API seam, and `GET /players/:id/profile` now exists so public profile reads can stay symmetric.
- `js/platform/thoughts/` and `js/platform/activity/` now perform merge-first API-aware feed sync so remote records can appear without wiping unsynced local items.
- owner thought create/delete flows now mirror through the backend adapter path while preserving the local-first UX contract.
- the thoughts layer now includes real backend-backed social actions: emoji reactions, share/repost records, and thread comments through shared `js/platform/thoughts/` helpers and `platform-api/` routes.
- `Share` now follows the intended social flow: a share sheet can either repost immediately or open a caption composer that keeps the original post attached underneath.
- `Comments` now opens a thread panel that combines current replies with a write-comment composer on `/thoughts`, `/me`, and `/player`.
- profile-view increments and thought-count updates now mirror through API-aware metrics helpers without blocking page flow.
- `games/lovers-lost/` and `games/battleshits/` result activity now mirrors to the backend in the background while preserving immediate local activity publishing.
- public `/player` pages now expose an explicit friendship-creation entry point backed by the centralized relationship seam rather than page-local friend state.
- `/event` detail now exposes a qualifying linked-entry action backed by the centralized relationship seam so shared-event credit can be recorded from the platform surface itself.
- `js/platform/metrics/` now exports an explicit canonical split for public/profile support metrics, relationship/discovery metrics, and backend-only analytics; `friendPoints` remains part of the public/support contract.
- Home, grid, bulletins, events, activity, thoughts, and player pages now expose direct navigation across the growing platform surface.
- The `/me` hero now uses a default portrait asset plus a clamped avatar frame so future uploads with mixed dimensions crop consistently.
- The `/me` hero layout now reserves dedicated space for the portrait rail so long names and bio copy do not collide with the avatar area.
- platform secondary pages now use consistent `Back` navigation plus normalized `Player Page` portal naming so the platform feels more like one connected shell.
- `css/arcade.css` is now split into a shared base file plus 8 per-page CSS files (`home.css`, `me.css`, `player.css`, `thoughts.css`, `activity.css`, `bulletins.css`, `events.css`, `event.css`); each page loads only what it needs and the test infrastructure combines the relevant files to match what browsers load.
- `js/platform/thoughts/thoughts.mjs` is now a clean 4-layer module: `thoughts-schema.mjs` (storage keys, reaction IDs, shape constants), `thoughts-normalize.mjs` (sanitization, formatting helpers), `thoughts-store.mjs` (local feed, storage, card rendering, social writes), `thoughts-api.mjs` (API sync and backend mirrors) — the barrel `thoughts.mjs` re-exports everything so all existing import paths stay unchanged; all four modules stay under 500 lines.
- `renderMePage` now calls `syncThoughtPostCount` on every page render so the thought-post-count metric stays canonical without a separate explicit write path.
- `arcade-me-view.mjs` now exposes `renderSupportPanel`, a generic `me-card-item__title`-based card renderer ready for future side-panel wiring (rankings/friends side panels are still hidden pending that work).
- authentication is now fully implemented: `platform-api/` has bcryptjs password hashing, JWT signing/verification, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, and `GET /auth/me` routes backed by the `accounts` Postgres table; the 30-day HttpOnly JWT cookie is set as `arcade_session`.
- `sign-up/index.html` and `sign-in/index.html` exist as styled synthwave auth pages with full form validation, error messaging, and redirect-on-success; sign-up supports `claimPlayerId` so existing guest local identities can be attached to a new account.
- `js/platform/api/auth-api.mjs` exposes `register`, `login`, `logout`, and `getSession` through the shared API seam so no page invents its own fetch logic for auth.
- `js/arcade-session-nav.mjs` is a shared session chip module that calls `GET /auth/me` on load and injects either Sign In + Create Account links or the player name + Sign Out button into any container element; it is wired into `index.html`, `grid.html`, and `/me`.
- player discovery design is locked: registered players have full public `/player` profiles; unregistered guests have no public profile page; guests can view registered profiles but cannot add friends; results screens show clickable usernames only for registered opponents, with a menu of Add Friend (signed-in viewers only) and View Profile; a `hasAccount` boolean will be added to the profile API response so games can make this decision without a separate round-trip; a `discoverable` opt-out preference will gate search inclusion without hiding the profile itself.

## Scope Lock For Upcoming Profile Passes

Use this section as a drift guard when work moves across threads.

Immediate priorities across the current local/backend boundary:

- stabilize the first backend record routes inside `platform-api/` against the live Railway Postgres deployment
- continue tightening the shared frontend adapters so `/player`, `/me`, `/thoughts`, and `/activity` keep reading shared backend data without losing local fallback behavior
- start the first durable-memory/player-page pass so activity, posts, and results can surface more intentionally on top of the settled persistence seams
- turn activity/posts/results into durable memories on player pages once the shared persistence path is stable
- continue remaining presentation cleanup where the mock-aligned profile composition still carries fallback-heavy copy
- keep context-driven discovery scoped to real profile surfacing from games, activity, events, and relationships rather than inventing a generic people directory early

Player discovery build order (active next steps):

1. Add `hasAccount` boolean to `GET /players/:id/profile` response — checks whether an `accounts` row exists for that `player_id`; no new endpoint needed
2. Add `discoverable` boolean to `player_profiles.preferences` jsonb column (default true) — respected by search only, not by direct profile links
3. Build `GET /players/search?q=...` backend endpoint — queries `profile_name` and `real_name`, filters to `discoverable: true` records, requires the player to have an account row
4. Build `/search/index.html` search UI page — synthwave shell, search input, result cards linking to `/player?id=xxx`
5. Wire results screen menus in both games: fetch opponent profile on results load, use `hasAccount` to conditionally render clickable username → mini menu (Add Friend if viewer is signed in, View Profile always for registered opponents)

Important not-now items, even though they remain part of the product vision:

- profile picture/avatar upload and profile background upload
- profile music authoring/player UI
- a generic `/players` discovery directory
- player gesture buttons plus notification inbox/bell work
- direct/private messaging (comments, reactions, and sharing are now live through the backend adapter layer)

Default product calls for this scope:

- favorite game is manual first; most-played data can inform later suggestions but must not silently replace the player's chosen favorite
- social links are repeatable structured items with normalized label/url/kind fields
- panel headers should be visually separated from panel content, preferably with boxed section labels in the shared profile composition
- profile music is a single player-assigned track (no playlist); autoplay is paired with a visible mini player widget so visitors can pause or mute immediately; multi-track and rich embeds belong to the backend phase
- the recommended canonical metrics split is now explicit in code: public/support metrics stay separate from relationship/discovery metrics and backend analytics, with `friendPoints` staying visible/public-support data
- friend points should stay platform-derived while visible friend placement supports either manual or automatic behavior for `Main Squeeze` and the four standard friend slots
- relationship ordering should be able to use both affinity (`friendPoints`, shared counts) and recency (`last played with`, `recently played with`, last shared session/event, last interaction) without forcing one permanent display mode
- comments, emoji reactions, and sharing belong to the thoughts/feed contract, and their first real cross-user persistence is now part of the active backend transition work
- discovery should stay context-driven instead of becoming a generic empty people directory
- once online profiles exist, add-friend entry points on game results screens and in-game chat and lobby surfaces should be treated as first-class profile-surfacing paths; a generic directory should stay secondary
- player pages should accumulate durable memories from platform-owned activity/posts/results rather than forcing every cabinet to invent its own legacy/history UI
- bulletins, events, ladders, and featured cabinets should be able to support seasonal programming without requiring a separate product line
- uploads stay late even though avatar/background display constraints should be stabilized now

Deferred until later phases:

- real uploads
- profile music authoring/player UI
- generic player-directory / broad discovery page
- player gesture UI plus notification inbox/bell delivery work
- real shared comments/reactions/shares across devices
- direct / private messaging
- ladder ranking systems beyond current contract prep

Now actively in progress rather than deferred:

- database-backed profiles through the shared `platform-api/` service
- backend-owned profile/relationship/activity/thought persistence behind the existing frontend seams
- authentication: sign-up, sign-in, sign-out, and 30-day JWT session management are built; `sign-in/index.html`, `sign-up/index.html`, `js/platform/api/auth-api.mjs`, and the `accounts` Postgres table are all live
- player discovery: `hasAccount` flag on profile API, results-screen clickable usernames, and player search with `discoverable` opt-out are the active next implementation steps

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
