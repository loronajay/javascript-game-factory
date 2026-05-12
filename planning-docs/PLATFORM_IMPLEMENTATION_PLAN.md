# Javascript Game Factory Platform Status Plan

Last updated: 2026-05-12

## Purpose

This document is the current status map for the shared platform.

Use it to answer two questions quickly:

- what is already shipped and covered by repo tests
- what still needs implementation, polish, or manual verification

Use it with:

1. `ARCHITECTURE_HANDOFF.md` for current module ownership and cleanup history
2. `BUGS.md` for active defects
3. `COMMENT_DELETE_PLAN.md` only when working on the comment-delete gap

This doc is intentionally no longer the place for long handoff history or full inline schema dumps. Exact contracts now live in the shared modules and backend normalizers listed below.

## Stable Product Boundaries

- The platform owns canonical identity, profiles, relationships, thoughts, messages, notifications, media metadata, and shared social records.
- Games may read public platform data and publish approved activity/results through shared contracts, but they must not become the long-term home for profile ownership.
- `/me` and `/player` remain the same public profile composition, with owner-only controls layered on top of `/me`.
- Discovery remains context-driven. A cold generic `/players` directory is still not the product direction.
- Read-heavy platform surfaces should stay simpler and safer than write-heavy feature pushes.

## Exact Contracts Live In Code

When you need the real current shape, read these modules instead of this doc:

- `js/platform/profile/profile.mjs` and `platform-api/src/normalize-profiles.mjs`
- `js/platform/thoughts/` and `platform-api/src/normalize-thoughts.mjs`
- `js/platform/activity/` and `platform-api/src/normalize-activity.mjs`
- `js/platform/relationships/` and `platform-api/src/normalize-relationships.mjs`
- `js/platform/metrics/metrics.mjs` and `platform-api/src/normalize-metrics.mjs`
- `platform-api/src/routes/` and `platform-api/src/db/` for live backend route/data ownership

## Live Pages

Live today:

- `/index.html`
- `/grid.html`
- `/me/index.html`
- `/me/edit/index.html`
- `/player/index.html?id=<playerId>`
- `/thoughts/index.html`
- `/activity/index.html`
- `/search/index.html`
- `/bulletins/index.html`
- `/events/index.html`
- `/event/index.html?slug=<eventSlug>`
- `/gallery/index.html?id=<playerId>`
- `/notifications/index.html`
- `/messages/index.html`
- `/messages/conversation/index.html?id=<convId>`
- `/sign-in/index.html`
- `/sign-up/index.html`
- `/forgot-password/index.html`
- `/reset-password/index.html`

Not implemented yet:

- `/doomscroll/index.html`
- `/groups/index.html`
- `/group/index.html?id=<groupId>`
- `/me/layout/index.html`

## Shipped And Covered By Repo Tests

### Auth, identity, and session shell

- Account creation, sign-in, sign-out, password reset, and 30-day HttpOnly `arcade_session` auth are live in `platform-api/`.
- `claimPlayerId` account linking is live for upgrading a guest identity into a durable account.
- `js/arcade-session-nav.mjs` owns the shared signed-in shell across the main platform pages.
- Coverage exists in `platform-api/tests/app-auth.test.mjs`, `platform-api/tests/auth-routes.test.mjs`, and browser-page seams under `js/tests/`.

### Profiles, search, and relationships

- Profiles, metrics, relationships, and player search are API-backed for authenticated users, with local fallback where appropriate.
- `/me`, `/me/edit`, `/player`, and `/search` are live.
- The profile editor currently covers profile name, real name, tagline, bio, links, favorite game, discoverability, background style, and friend-rail mode.
- Friend requests, accept/reject flows, and shared relationship normalization are live.
- Coverage exists in `platform-api/tests/player-routes.test.mjs`, `platform-api/tests/profiles-db.test.mjs`, `platform-api/tests/relationships-db.test.mjs`, `platform-api/tests/relationships-domain.test.mjs`, `js/me-page/tests/`, `js/player-page/tests/`, `js/profile-editor/tests/`, and `js/platform/relationships/*.test.mjs`.

### Thoughts, comments, reactions, shares, and activity

- Thoughts create/delete are live with backend mirroring.
- Reactions, thread comments, and share/repost flows are live across `/thoughts`, `/me`, and `/player`.
- Thought social activity generates backend notifications.
- Shared activity publishing is live, including game result publishing from `Lovers Lost` and `Battleshits`.
- Coverage exists in `platform-api/tests/thought-routes.test.mjs`, `platform-api/tests/thoughts-db.test.mjs`, `platform-api/tests/thoughts-domain.test.mjs`, `platform-api/tests/app-feed.test.mjs`, `platform-api/tests/activity-db.test.mjs`, `js/profile-social/tests/`, `js/platform/thoughts/**/*.test.mjs`, and `js/platform/activity/*.test.mjs`.

### Notifications, gestures, challenges, and messages

- Notification bell, dropdown, and full inbox are live.
- Friend-request notifications, thought notifications, gestures, challenges, and direct-message notifications are live.
- Direct messages, inbox, thread view, and polling-based refresh are live.
- Coverage exists in `platform-api/tests/notification-routes.test.mjs`, `platform-api/tests/message-routes.test.mjs`, `platform-api/tests/app-messages.test.mjs`, `js/tests/arcade-notifications*.test.mjs`, and `js/tests/arcade-messagespage.test.mjs`.

### Media, gallery, backgrounds, and profile music

- Avatar, gallery photo, background image, and profile music uploads are live through `platform-api/src/services/upload.mjs` and the `/upload/*` routes.
- Thought image posting is live.
- Gallery preview panels, the dedicated gallery page, and the shared full-view photo viewer are live.
- Profile music shipped as `profileMusicPlaylist` with upload-backed tracks, drag-to-reorder editing, and the shared cassette-style player on `/me` and `/player`.
- Background presentation now includes a stored `backgroundStyle` contract.
- Coverage exists in `platform-api/tests/photo-routes.test.mjs`, `platform-api/tests/app-social-records.test.mjs`, `js/gallery-page/*.test.mjs`, `js/me-page/tests/media-actions.test.mjs`, `js/player-page/tests/media-actions.test.mjs`, `js/profile-editor/tests/`, and related browser-page tests under `js/tests/`.

### Architecture cleanup already landed

- `js/platform/activity/`, `js/platform/relationships/`, `js/profile-social/`, `js/profile-editor/`, `js/player-page/`, `js/thoughts-page/`, `js/me-page/`, and `js/gallery-page/` are now real ownership seams rather than one giant page-file sprawl.
- `platform-api/src/routes/` now owns the backend route-family split, with `src/app.mjs` acting as the dispatch shell instead of the permanent home for every feature.
- The test layout has already been moved out of mixed root/source placement into subsystem and page test locations.

## Shipped But Still Needing Manual Verification Or Polish

- Latest manual verification is complete for the profile CSS ownership and layout passes.
- Upload flows are manually verified as working, including avatar/background/media uploads and multiple-photo gallery usage.
- Ladder placements, badges, and favorite-cabinet empty-state polish still need a cleaner pass even though the surrounding profile surfaces are live.

## Still To Implement

### Active product work that has not shipped yet

- Durable memories on `/me` and `/player`
- A real badge pass instead of placeholder badge presentation
- Better ladder-placement surfacing from existing activity/results data
- API-driven bulletins and events so seasonal content can rotate without a deploy
- Production email/domain sender verification beyond the temporary sender setup

### Active defects or missing behavior

- Comment deletion for thought comments and photo comments is still missing. Track implementation in `BUGS.md` and `COMMENT_DELETE_PLAN.md`.

### Profile editor follow-up that is still pending

- `/me/layout` and any draggable/resizable profile layout system

## Deferred Or Later

- Groups, group membership management, group feeds, and the personalized doomscroll feed
- WebSocket real-time messaging
- Read receipts per message
- Group messaging
- Richer profile-music embeds such as YouTube or SoundCloud
- Arbitrary file upload beyond the current supported media flows

## Route Notes For Local Fixture Surfaces

- `bulletins` and `events` pages are live today as platform surfaces with local/shared contracts and tests.
- They are not yet API-authored or CMS-driven.
- Keep that distinction clear in future planning so we do not describe them as unshipped pages when the actual remaining work is the backend/content-management pass.

## Definition Of Success

We are succeeding if:

- the arcade continues to grow as a multi-page social platform without handing profile ownership back to games
- shared contracts stay centralized in the platform modules and backend normalizers
- new work lands in stable page/domain/data seams instead of reviving monolithic controllers
- planning docs tell the truth about what already shipped, what is tested, and what is still only a plan
