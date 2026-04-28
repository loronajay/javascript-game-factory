# Hybrid Cutover Handoff

## Active Side Workstream - Photo Uploads (2026-04-28)

This repo now has a second in-flight workstream alongside the backend cutover notes below.

### Current status
- Shared upload infrastructure is live in `platform-api/`:
  - Cloudinary upload service: `platform-api/src/services/upload.mjs`
  - multipart parsing in `platform-api/src/app.mjs` via `busboy`
  - authenticated `POST /upload/avatar` and `POST /upload/photo`
- Avatar upload flow is live in the profile editor (`js/arcade-profile.mjs`)
- Gallery/backend photo flow is live:
  - migrations `011-player-photos.sql` and `012-thought-image.sql`
  - `platform-api/src/db/photos.mjs`
  - `POST/GET/DELETE /players/:playerId/photos`
  - thought `image_url` persistence in `platform-api/src/db/thoughts.mjs`
- Frontend gallery flow is live on `/me` and owner-view `/player`:
  - gallery upload composer with preview, caption, visibility, and optional feed cross-post
  - gallery delete flow
  - thought cards render attached images across `/me`, `/player`, and `/thoughts`
- Direct thought composer photo posts now expose preview, gallery caption, visibility, and optional gallery-save controls; they still fall back to plain thought save if the gallery side effect cannot complete

### Remaining gap before this workstream is done
- Gallery items still do not open into a dedicated full-view or lightbox experience
- Manual end-to-end verification against a real Cloudinary-backed deployment still needs to happen after env vars are confirmed

### Source-of-truth doc
- See `PHOTO_UPLOADS_PLAN.md` for the checklist/status view of this workstream

## Problem Summary

The platform has a hybrid local/backend model where `localStorage` is still treated as a peer data
source alongside the Railway Postgres backend. Every domain module reads local first, then fetches
remote, then merges the two — meaning authenticated users can have phantom posts, drifted counts,
and stale profile data depending on which write landed last. The goal is: **backend = source of
truth for authenticated users; localStorage = write-through cache or guest-only**.

---

## localStorage Key Inventory

| Key | Module | Data | Auth users rely on read? | Backend equivalent? | Classification |
|-----|--------|------|--------------------------|---------------------|----------------|
| `javascript-game-factory.factoryProfile` | `js/platform/identity/factory-profile.mjs` | Full profile (playerId, profileName, realName, bio, tagline, links, friendsPreview, mainSqueeze, preferences) | YES — every page read starts here | `player_profiles` table | **MIGRATE** |
| `javascript-game-factory.profileMetrics` | `js/platform/metrics/metrics.mjs` | Metrics record keyed by playerId (view count, thought count, friend count, etc.) | YES — read on every `/me` load | `player_metrics` table | **MIGRATE** |
| `javascript-game-factory.profileRelationships` | `js/platform/relationships/relationships.mjs` | Relationship record (friendPlayerIds, friendPoints, slot settings, etc.) | YES | `player_relationships` table | **MIGRATE** |
| `javascript-game-factory.profileRelationshipLedger` | `js/platform/relationships/relationships.mjs` | Interaction ledger (timestamps, per-partner interaction counts for cap enforcement) | YES | Backend relationship endpoints | **MIGRATE** |
| `javascript-game-factory.activityFeed` | `js/platform/activity/activity.mjs` | Activity items (game results, up to 40) | YES — merged with remote on load | `activity_items` table | **MIGRATE** |
| `javascript-game-factory.thoughtFeed` | `js/platform/thoughts/thoughts-store.mjs` | Thought posts (full feed including DEFAULT_THOUGHTS fixtures) | YES — merged with remote on every sync | `thoughts` table | **MIGRATE** (highest risk) |
| `javascript-game-factory.thoughtComments` | `js/platform/thoughts/thoughts-store.mjs` | Comments across all thoughts | YES — merged with remote on open | `thought_comments` table | **MIGRATE** |
| `lovers-lost.onlineIdentity.displayName` | `js/platform/storage/storage.mjs` (key def) | Lovers Lost session display name | Guest-only game session | None needed | **KEEP** |

---

## Merge / Dual-Write Hotspots

These are the exact functions where the hybrid pattern lives. Every one of them needs to be
rewritten to be session-aware.

### `js/platform/thoughts/thoughts-api.mjs`

- **`syncThoughtFeedFromApi` (line 30)** — fetches remote feed, then merges with local stored feed
  instead of replacing it for authenticated users; writes merged result back to localStorage.
- **`publishThoughtPostWithApi` (line 79)** — writes local first (`publishThoughtPost`), then
  mirrors to API, then merges the remote response back into storage. If API fails silently the
  local-only post persists as a phantom.
- **`deleteThoughtPostWithApi` (line 102)** — deletes local first, then fires API delete. If the
  API call fails, the post is gone locally but still in Postgres.
- **`commentOnThoughtPostWithApi` (line 118)** — local comment written first, API call second,
  then deduplication surgery on the stored comment list. Comment count on the stored thought is
  updated locally regardless of API success.
- **`shareThoughtPostWithApi` (line 185)** — local share first, API second, then merges remote
  result back into local feed.
- **`reactToThoughtPostWithApi` (line 250)** — local reaction toggle first, API second, then
  merges remote thought back into local feed.

### `js/platform/activity/activity.mjs`

- **`syncActivityFeedFromApi` (line 360)** — fetches remote feed, merges with local via
  `mergeStoredActivityFeed`, writes merged result to localStorage.
- **`publishActivityItem` (line 159)** — always writes to localStorage first, then calls
  `maybeRecordSharedSessionFromActivity` which queues a relationship update.
- **`mirrorPublishedActivityItem` (line 392)** — fire-and-forget API mirror after local write;
  merges remote result back into storage on success, silently keeps local on failure.

### `js/arcade-profile.mjs`

- **`hydrateArcadeProfileFromApi` (line 261)** — always reads `loadFactoryProfile(storage)` as
  the base, fetches remote, overlays remote fields, then calls `saveFactoryProfile` to persist back
  to localStorage. Falls back to local profile object if API fails.
- **`persistArcadeProfileDetails` (line 326)** — calls `saveArcadeProfileDetails` (local write)
  first, then fires `apiClient.savePlayerProfile` and `apiClient.savePlayerRelationships` via
  `Promise.allSettled`. Local is always the first write target.

### `js/platform/metrics/metrics.mjs`

- **`syncProfileMetricsFromApi` (line 280)** — falls back to `loadProfileMetricsRecord` (local)
  if API call fails or returns no record.
- **`mirrorProfileMetricsRecord` (line 227)** — fire-and-forget API mirror after every local
  metric update; updates localStorage again from the API response on success.
- **`updateProfileMetricsRecord` (line 245)** — always reads local, applies updater, writes local.
  API sync is a separate fire-and-forget step, not part of the write path.

### `js/arcade-me-wire.mjs`

- **`rerender` (line 29)** — `shouldHydrate=false` path reads profile, metrics, and relationships
  entirely from localStorage with no API call, even for authenticated users during in-session
  rerenders (e.g. after posting a thought, after a comment).

---

## Session-Aware Branching Gaps

No domain module currently checks authentication state before choosing a data source. The session
context is injected as `apiClient` at the page level (`arcade-me-wire.mjs`, `arcade-thoughts.mjs`),
but the modules themselves treat local and remote as symmetric peers.

Files where an explicit `isAuthenticated` branch is **missing but required**:

| File | Missing check |
|------|--------------|
| `js/platform/thoughts/thoughts-api.mjs` | Every exported `*WithApi` function: should skip local write for auth users and treat API response as canonical |
| `js/platform/activity/activity.mjs` | `publishActivityItem` and `syncActivityFeedFromApi`: auth users should write to API only, read from API only |
| `js/platform/metrics/metrics.mjs` | `updateProfileMetricsRecord`: for auth users, increment should go to API; local is cache only |
| `js/platform/relationships/relationships.mjs` | All load/save functions: for auth users, backend is authoritative |
| `js/arcade-me-wire.mjs` | `rerender` non-hydrate path: even mid-session rerenders should read from a backend-backed in-memory cache, not from localStorage |
| `js/arcade-profile.mjs` | `hydrateArcadeProfileFromApi`: for auth users the local read should not be the base; API response should be the base |

---

## Recommended Cutover Sequence

Work one pass at a time. Each pass leaves the subsystem cleaner and de-risks the next.

### Pass Status

| Pass | Status | Notes |
|------|--------|-------|
| Pass 1 — Profiles | ✅ Complete | `hydrateArcadeProfileFromApi`: API response is now the base (removed `...currentProfile` merge); returns `{ error: "profile_load_failed" }` instead of silently falling back to local. `persistArcadeProfileDetails`: flipped to API-first; throws on failure; updates local cache from API response. `arcade-me-wire.mjs` `rerender`: uses module-scope `cachedHydration`, passes `apiClient` to hydration, invalidates cache on profile edit/clear. |
| Pass 2 — Thoughts / Feed | ✅ Complete | `thoughts-api.mjs`: all six `*WithApi` functions + both sync functions flipped to API-first for auth users; guest path is an explicit `!isAuth` branch (no try/catch fallback). `syncThoughtFeedFromApi`: writes API response directly to local (no merge with local user posts). `syncThoughtCommentsFromApi`: API response replaces local comments for the given thought. `publishThoughtPostWithApi`: API first, no local pre-write, returns null on API failure (no phantom post). `deleteThoughtPostWithApi`/comment/share/react: same API-first pattern. `arcade-me-wire.mjs`: added missing `{ apiClient }` to `publishThoughtPostWithApi` and `deleteThoughtPostWithApi` calls. |
| Pass 3 — Activity | ✅ Complete | `syncActivityFeedFromApi`: API response replaces local directly (no merge). `publishActivityItemWithApi`: flipped to API-first; no local pre-write; updates local cache from API response; returns null on failure (no phantom). `publishLoversLostRunActivity` / `publishBattleshitsMatchActivity`: now route through `publishActivityItemWithApi`. `mirrorPublishedActivityItem` removed (dead code). |
| Pass 4 — Metrics | ✅ Complete | `syncThoughtPostCountWithApi` / `incrementProfileViewCountWithApi`: API-first; no local pre-write; guest path is explicit `!isAuth` branch. `syncProfileMetricsFromApi`: returns `null` on API failure (no silent local fallback). `mirrorProfileMetricsRecord` removed (dead code). `computeIncrementedViewRecord` extracted as private helper. `arcade-player.mjs` `renderPlayerPage`: view-count call is now `void`/fire-and-forget (function became async). `arcade-profile.test.mjs`: mock client updated with `isConfigured: true` to match Pass 1's guard change. |
| Pass 5 — Relationships | ✅ Complete | `relationships.mjs`: all 5 mutation functions (`createFriendshipBetweenPlayers`, `removeFriendBetweenPlayers`, `recordSharedSessionBetweenPlayers`, `recordSharedEventBetweenPlayers`, `recordDirectInteractionBetweenPlayers`) made async and API-first; guest path is explicit `!isAuth` branch; `mirrorPairRecordsToApi` removed. Callers updated: `arcade-me.mjs` (removed duplicate API check), `arcade-player-wire.mjs` (removed duplicate `apiClient.removeFriend` call; guest add-friend passes `apiClient: {}` to force local path), `arcade-event-detail.mjs` (`recordLinkedEntryBetweenPlayers` simplified to direct delegation), `activity.mjs` (`queueSharedSessionRelationshipUpdate` simplified to single `void` call), `thoughts-api.mjs` (removed redundant `isAuth` check around `recordDirectInteractionBetweenPlayers`). |
| Pass 6 — Strip Merge Code | ✅ Complete | `mergeThoughtSources` and `mergeThoughtComments` un-exported (still private in `thoughts-store.mjs` for guest-local CRUD). `writeMergedThoughtFeed` deleted; replaced by private `cacheThoughtPosts` helper in `thoughts-api.mjs` (upsert semantics, no merge). `mergeStoredActivityFeed` and `mergeRemoteActivityItemIntoStorage` deleted from `activity.mjs`; replaced by inline upsert in `publishActivityItemWithApi`. |

---

### Pass 1 — Profiles (Start Here)
**Files:** `js/arcade-profile.mjs`, `js/platform/identity/factory-profile.mjs`, `js/arcade-me-wire.mjs`

Profile is the best first win: the API already returns the full profile record, the fetch already
happens in `hydrateArcadeProfileFromApi`, and there are no fan-out duplication risks. The only
change is inverting the read direction for authenticated users.

### Pass 2 — Thoughts / Feed
**Files:** `js/platform/thoughts/thoughts-api.mjs`, `js/platform/thoughts/thoughts-store.mjs`, `js/arcade-me-wire.mjs`, `js/arcade-thoughts.mjs`

Highest risk of visible corruption. Phantom posts come from local writes surviving API failures.
After this pass, authenticated thought writes must go to API first; local is updated from the API
response only.

### Pass 3 — Activity
**Files:** `js/platform/activity/activity.mjs`

Same pattern as thoughts. Game-published activity should fire to API; for auth users local storage
is not a durable target.

### Pass 4 — Metrics
**Files:** `js/platform/metrics/metrics.mjs`

No user-visible duplication risk, but counts drift between local and backend permanently. After
this pass, auth user metric increments go through the API; local is a read cache only.

### Pass 5 — Relationships
**Files:** `js/platform/relationships/relationships.mjs`

The relationship ledger (interaction window + cap enforcement) still lives in localStorage. After
this pass, friend-point writes, shared session credits, and interaction caps are enforced by the
backend only.

### Pass 6 — Strip Merge Code
**Files:** `thoughts-store.mjs`, `thoughts-api.mjs`, `activity.mjs`

Delete `mergeThoughtSources`, `mergeThoughtComments`, `mergeStoredActivityFeed`,
`writeMergedThoughtFeed`, and all dual-write helper paths that are only needed because local and
remote are peers. Keep only guest-local adapters and optional response caches.

---

## Pass 1 Start-Here Instructions

### Files to open
1. `js/arcade-profile.mjs` — `hydrateArcadeProfileFromApi` (line 261) and `persistArcadeProfileDetails` (line 326)
2. `js/arcade-me-wire.mjs` — `rerender` closure (line 29)
3. `js/platform/identity/factory-profile.mjs` — `saveFactoryProfile` / `loadFactoryProfile`

### What to change in `hydrateArcadeProfileFromApi`

**Current pattern (broken for auth users):**
```js
// Always loads local as the base — remote is an overlay
const currentProfile = loadFactoryProfile(storage, options);
// ... fetch remote ...
const profile = resolvedProfileResult?.playerId === playerId
  ? saveFactoryProfile({ ...currentProfile, ...resolvedProfileResult, playerId }, storage)
  : currentProfile;   // <-- local fallback if API has no record
```

**Target pattern:**
```js
// For authenticated users: API response IS the profile; local is a cache write
if (!canLoad) {
  // guest path — local only, unchanged
  return { profile: loadFactoryProfile(storage), ... };
}

const [profileResult, ...] = await Promise.all([...]);

if (!profileResult?.playerId) {
  // API failed — surface the error; do NOT silently return stale local data
  return { profile: null, error: "profile_load_failed", ... };
}

// API is authoritative — save to local as cache, use API object as the canonical profile
const profile = saveFactoryProfile({ ...profileResult, playerId }, storage);
```

### What to change in `persistArcadeProfileDetails`

**Current pattern:**
```js
const savedProfile = saveArcadeProfileDetails(storage, fields, options);  // local first
await Promise.allSettled([apiClient.savePlayerProfile(...), ...]);         // API second
return savedProfile;  // returns local object, not API response
```

**Target pattern:**
```js
const [profileResult, relResult] = await Promise.allSettled([
  apiClient.savePlayerProfile(playerId, fields),
  apiClient.savePlayerRelationships(playerId, relFields),
]);

if (profileResult.status !== "fulfilled") {
  throw new Error("Profile save failed");  // surface real failures
}

// Update local cache from API response
const saved = saveFactoryProfile(profileResult.value, storage);
return saved;
```

### What to change in `arcade-me-wire.mjs:rerender`

**Current pattern:**
```js
const hydrated = shouldHydrate
  ? await hydrateArcadeProfileFromApi(storage)
  : {
      profile: currentProfile,                                         // <-- localStorage read
      metricsRecord: loadProfileMetricsRecord(currentProfile.playerId, storage),   // localStorage
      relationshipsRecord: loadProfileRelationshipsRecord(currentProfile.playerId, storage),  // localStorage
    };
```

**Target pattern — after Pass 1:**
```js
// Always use the API-backed hydration for authenticated users.
// Pass a lightweight in-memory cache so mid-session rerenders don't re-fetch.
const hydrated = cachedHydration ?? await hydrateArcadeProfileFromApi(storage, apiClient);
// Store in module-scope variable; invalidate on profile edit or explicit refresh.
```

---

## Target Pattern Reference

This is what every authenticated read/write path in this codebase should converge on.

```js
// READ — authenticated user
async function loadResource(playerId, { session, apiClient, storage }) {
  if (!session?.playerId) {
    // Guest: local only
    return readFromLocal(storage, playerId);
  }

  const remote = await apiClient.load(playerId);
  if (!remote) throw new Error("load_failed");   // visible failure, not silent local fallback

  writeToLocalCache(storage, remote);             // local = derived cache
  return remote;                                  // API object is canonical
}

// WRITE — authenticated user
async function saveResource(playerId, fields, { session, apiClient, storage }) {
  if (!session?.playerId) {
    // Guest: local only
    return writeToLocal(storage, fields);
  }

  const saved = await apiClient.save(playerId, fields);
  if (!saved) throw new Error("save_failed");     // surface real failures

  writeToLocalCache(storage, saved);              // update cache from API response
  return saved;                                   // return API object, not local object
}
```

Key rules:
- `apiClient.load()` failure for an authenticated user → **error**, not local fallback
- `apiClient.save()` → **await the result**; use the returned object as canonical
- `writeToLocalCache` always receives the **API response**, never the local pre-write object
- Guest path is an explicit `if (!session)` branch, not a try/catch fallback
- No merge logic between local and remote for authenticated users

---

## Files to Read First in a Fresh Session

1. `js/platform/storage/storage.mjs` — all localStorage key names and the storage wrapper API
2. `js/platform/identity/factory-profile.mjs` — `loadFactoryProfile` / `saveFactoryProfile` — the profile read/write primitives that everything calls
3. `js/arcade-profile.mjs` — `hydrateArcadeProfileFromApi` and `persistArcadeProfileDetails` — Pass 1 target functions
4. `js/arcade-me-wire.mjs` — the `/me` page controller; shows how profile, thoughts, metrics, and relationships are wired together today
5. `js/platform/thoughts/thoughts-api.mjs` — all six `*WithApi` functions; the clearest example of the dual-write and merge-first patterns
6. `js/platform/activity/activity.mjs` — `publishActivityItem` + `syncActivityFeedFromApi` — activity dual-write pattern
7. `js/platform/metrics/metrics.mjs` — `updateProfileMetricsRecord` + `mirrorProfileMetricsRecord` — metrics dual-write pattern
8. `js/platform/api/platform-api.mjs` — the shared API client factory; confirms which backend calls are available
