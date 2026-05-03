# Photo Uploads - Implementation Plan

## What this covers
Three related but distinct flows, built in order:
1. **Avatar upload** - profile photo, never touches the feed
2. **Gallery upload** - photos stored on the player's profile, with an optional "also post to feed" toggle at upload time
3. **Feed photo post** - a thought with an attached image; can be authored directly from the compose UI or cross-posted from the gallery upload

---

## Current Repo Status (2026-05-01)

This plan started as a blank implementation checklist. All infrastructure, avatar, gallery, and feed photo passes are shipped. The gallery page and preview cap are now live.

### Shipped in repo
- Pass 1 shared upload infrastructure:
  - Cloudinary upload service: `platform-api/src/services/upload.mjs`
  - multipart parsing via `busboy` in `platform-api/src/app.mjs`
  - authenticated `POST /upload/avatar` and `POST /upload/photo` routes
  - `avatarUrlResolver` wired in `platform-api/src/server.mjs`
- Pass 2 avatar UI:
  - profile editor exposes avatar upload + preview in `js/arcade-profile.mjs`
  - `avatarAssetId` persisted through the profile save flow
- Pass 3 gallery + feed photo post:
  - migrations `011-player-photos.sql` and `012-thought-image.sql`
  - `platform-api/src/db/photos.mjs` and thought `image_url` persistence
  - thought cards render `imageUrl` across `/me`, `/player`, and `/thoughts`
  - direct thought composer photo posts with preview, gallery caption, visibility, and gallery cross-post controls
- Pass 0 (gallery UX stabilization): friend-rail avatar clamping and gallery bulldoze fixes done externally
- **Pass 1 (gallery page) — complete (2026-05-01)**:
  - `renderGalleryPanel` in `js/profile-social/social-view.mjs` now accepts `previewCap` (caps visible photos, suppresses upload composer) and `viewAllHref` (renders "View All Photos →" link)
  - Profile pages (`/me`, `/player`) now show a 5-photo read-only preview strip with a "View All" link; upload composer removed from both
  - Shared gallery page at `gallery/index.html?id=<playerId>` — new `js/gallery-page/` subsystem: `loader.mjs` (isOwner detection), `render.mjs`, `wire.mjs` (upload/delete wiring)
  - `css/gallery.css` added for gallery page layout; `gallery-panel__*` selectors added to `profile-page.css`; `gallery-view-all` link style added to `profile-social.css`

### Still open
- Pass 3: photo-native reactions/comments + counters in viewer — **complete (2026-05-02)**
- Pass 4: reaction/comment counts on grid cards + viewer selected-reaction state polish
- Pass 5: albums
---

---

## Build order

### Pass 1 - Shared upload infrastructure
Everything else depends on this.

- [x] Install `cloudinary` npm package in `platform-api`
- [x] Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` to `config.mjs`
- [x] Create `platform-api/src/services/upload.mjs` - wraps Cloudinary SDK, exports a single `uploadImage(buffer, options)` function that returns `{ assetId, url }`
- [x] Add `POST /upload/avatar` route to `app.mjs` - authenticated, `multipart/form-data`, 10MB cap, validates MIME type (JPEG/PNG/WebP), calls upload service with `folder: "avatars"` and `maxWidth: 800`
- [x] Add multipart body parser via `busboy`
- [x] Wire `avatarUrlResolver` in `server.mjs` so profile reads resolve `avatarAssetId` to a public URL

### Pass 2 - Avatar UI
- [x] Add photo file input + preview to the profile editor panel (`arcade-profile.mjs`)
- [x] On file select: show preview immediately, POST to `/upload/avatar`, store returned `assetId` in pending form state
- [x] On profile save: include `avatarAssetId` in the patch payload

### Pass 3 - Gallery + feed photo post
Requires Pass 1 complete.

**DB migration:**
- [x] New migration `011-player-photos.sql` - creates `player_photos` table: `id`, `player_id`, `asset_id`, `image_url`, `caption`, `visibility`, `created_at`
- [x] New migration `012-thought-image.sql` - adds `image_url text not null default ''` to `thought_posts`

**Backend:**
- [x] `platform-api/src/db/photos.mjs` - `savePlayerPhoto`, `listPlayerPhotos`, `deletePlayerPhoto`
- [x] `POST /upload/photo` route - same as avatar upload but `folder: "player-photos"`, returns `{ assetId, url }`
- [x] `POST /players/:playerId/photos` - saves gallery entry and optionally creates a thought post if `postToFeed: true`
- [x] `GET /players/:playerId/photos` - returns the player's photo gallery
- [x] `DELETE /players/:playerId/photos/:photoId` - owner-only
- [x] Update `saveThought` / `buildThoughtParams` in `db/thoughts.mjs` to include `image_url`
- [x] Update `mapRowToThought` to read `image_url` from the row

**Frontend:**
- [x] Gallery upload composer - file picker, preview, caption field, "also post to my feed" toggle, visibility selector
- [~] Gallery panel on profile pages - photo grid is live on `/me` and owner-view `/player`; dedicated full-view links/lightbox still missing
- [x] Thought card rendering - if `imageUrl` is present, render the image above the caption text
- [x] Thought compose UI - photo attach flow now exposes preview, gallery caption, visibility, and optional gallery save controls while preserving the fallback plain-thought path

---

## Data model summary

### `player_photos`
| column | type | notes |
|---|---|---|
| `id` | text PK | |
| `player_id` | text | FK -> players |
| `asset_id` | text | Cloudinary public ID |
| `image_url` | text | Cloudinary delivery URL |
| `caption` | text | 500 char max |
| `visibility` | text | public / friends / private |
| `created_at` | timestamptz | |

### `thought_posts` addition
| column | type | notes |
|---|---|---|
| `image_url` | text | empty string = text-only thought |

---

## Key decisions already made
- **Storage backend**: Cloudinary
- **Size cap**: 10MB accepted, resized server-side
- **Gallery -> feed**: optional cross-post toggle at upload time
- **Direct compose -> feed**: photo attach should create a gallery entry as a side effect
- **No client-side upload**: all uploads go through the backend API



# Plans for Photo Uploads

## Recommended shape

Keep the profile page as a preview surface only: show the latest 5 photos max, with a View All Photos link.
Add a single shared gallery page (`/gallery/index.html?id=<playerId>`) for both owner and public-viewer browsing instead of letting the full grid keep growing inside `/me` and `/player`.
Make every thumbnail clickable into a proper photo viewer, not just a static `<img>`.
Put photo reactions/comments inside that viewer, with visible counts on the grid cards and in the viewer header.
Do not tie photo comments/reactions to feed-thought comments/reactions in this pass. A cross-posted thought should stay its own social object; otherwise this turns into a much riskier data-model rewrite.

## Where things actually live today

The gallery is a full unbounded grid rendered by `renderGalleryPanel` in `js/profile-social/social-view.mjs:261`. That function is shared by both `/me` and `/player` via `createProfileSocialViewRenderer` — it is not duplicated in the old shim files (`arcade-me-view.mjs` and `arcade-player-view.mjs` are now thin compatibility shims).

- `/me` gallery wiring: `js/arcade-me-wire.mjs` — hardcodes `isOwner: true`, always owner mode
- `/player` gallery wiring: `js/player-page/wire.mjs` + `js/player-page/media-actions.mjs` — determines `isOwner` by comparing `pageData.profile.playerId === authSessionPlayerId`
- Photo storage: `platform-api/src/db/photos.mjs`
- Photo routes: `platform-api/src/app.mjs`

## Owner vs. viewer distinction

This is the most important architectural constraint for the gallery page. There are three distinct viewing contexts:

| Context | Entry point | `isOwner` | What they see |
|---|---|---|---|
| Owner viewing own profile | `/me` | always true | full grid + upload composer + delete buttons |
| Owner viewing own player page | `/player/?id=<own-id>` | true (auth compare) | same as above |
| Authenticated non-owner | `/player/?id=<other-id>` | false | public + friends-only photos, no controls |
| Unauthenticated visitor | any | false | public photos only, no controls |

The gallery page is a **new entry point** and cannot borrow `isOwner` from the profile page wire. It must own this detection independently in its own loader:

1. Read `playerId` from the `?id=` query param
2. Load the auth session to get `authSessionPlayerId`
3. Compute `isOwner = !!authSessionPlayerId && playerId === authSessionPlayerId`
4. Fetch `listPlayerPhotos(playerId, isOwner ? {} : { visibility: “public” })`
5. Pass `isOwner` into render — `renderGalleryPanel` already gates upload composer and delete buttons on this flag
6. Wire upload form and delete handlers only when `isOwner`

The “View All” link from `/me` and from `/player` both point to `/gallery/index.html?id=<playerId>`. The gallery page resolves owner mode itself — no need for separate `/me/gallery/` and `/player/gallery/` entry points, which would just duplicate the detection logic.

## Pass order

Pass 0: stabilize the current photo UX.
Pass 1: move full-gallery browsing to a dedicated shared gallery page and cap profile-page preview to 5.
Pass 2: add a photo viewer with next/prev, caption, owner delete, and permalink/query-param open state.
Pass 3: add photo-native reactions/comments + counters.
Pass 4: add gallery metrics to cards/viewer and wire notifications if wanted.
Pass 5: albums.

## What to ship in each pass

### Pass 0 - COMPLETE

- Fix friend-rail avatar clamping. The likely issue is missing clipping on the avatar frame even though the image is set to `width:100%; height:100%; object-fit:cover` in `css/me.css` and `css/player.css`. Add hard clipping and make the frame own the crop.
- ~~Prevent double-submit on gallery upload.~~ **Already done.** `arcade-me-wire.mjs` and `js/player-page/media-actions.mjs` both check `galleryUploadState?.isUploading` and early-return. `social-view.mjs` renders all gallery form inputs with `disabled` and swaps the label to “Uploading...” when that flag is set.
- Stop the gallery panel from vertically bulldozing lower panels. This is partly a layout containment fix and partly resolved naturally once the full grid moves off-profile in Pass 1.

### Pass 1 - COMPLETE

- Add a shared gallery page at `/gallery/index.html?id=<playerId>` as a new `js/gallery-page/` subsystem with its own loader, render, and wire modules. The loader owns `isOwner` detection independently (see above).
- On `/me` and `/player`, replace the current full grid with a 5-photo preview strip/grid plus a “View All” link pointing to `/gallery/index.html?id=<playerId>`. The cleanest seam is adding a `previewCap` option to `renderGalleryPanel` in `social-view.mjs` — both profile pages pick it up automatically since they share that renderer.
- Upload composer moves to the owner gallery page only. Profile page preview becomes read-only (no upload UI on `/me` or `/player` in preview mode; optionally keep a small “Add Photo” CTA that routes to the gallery page).
- Do not duplicate upload/delete wiring into the already-large `/me` and `/player` files; the gallery page’s own wire owns it.

### Pass 2 - COMPLETE

Add a viewer overlay or dedicated viewer panel with:
- full image
- caption
- timestamp
- owner actions (delete)
- next/previous navigation
- close/back behavior
- deep-link support via `?photo=photo-...`

The existing `renderGalleryPanel` already emits `data-photo-id` on each `.gallery-item`. Wire a click delegation on `[data-photo-id]` — the same pattern as `openReactionThoughtId` in the thought panel. Clicking a preview image on the profile-page strip or the gallery page both open the same viewer state.

### Pass 3 - COMPLETE

Extend the photo model to support social state, mirroring the thought contract:
- `comment_count`
- `reaction_totals`
- viewer-specific `viewerReaction` returned from read endpoints

New DB tables: `photo_reactions` and `photo_comments`, modeled after the thought tables.

New routes:
- `GET /players/:playerId/photos/:photoId`
- `GET /photos/:photoId/comments`
- `POST /photos/:photoId/comments`
- `POST /photos/:photoId/reactions`

Reuse the same emoji reaction contract as thoughts so the UI feels consistent and the implementation can borrow from `js/platform/thoughts/thoughts-api.mjs`.

Keep photo comments/reactions separate from feed-thought comments/reactions. A cross-posted thought and its gallery photo are different social objects and should stay that way.

### Pass 4 - COMPLETE

- Show comment/reaction counts directly on each photo card in the gallery grid.
- Show the viewer’s selected reaction state so they can’t blind-react with no feedback.
- Photo notification types: optional for this pass.

### Pass 4.5

- Wire notifications for photo interactions. Example: "Drellgor commented on your photo!". Same for reaction notifications on photos, they should work the way the other notifications work. Currently the notifications for this just read "loronajay sent you a notification" and if it's a comment it shows the comment, but there's not enough context.

### Pass 5

Albums should be their own pass, not bundled with viewer/comments/reactions.

Future shape:
- `photo_albums` table: `id`, `player_id`, `name`, `visibility`, `created_at`
- `album_id` nullable on `player_photos`
- default “All Photos” view always present even when albums exist

That keeps today’s gallery work forward-compatible without forcing album UX now.

We'll need to scope out the album UX before we get to it.

## Testing

Start each pass with tests. Photo backend coverage is currently thin.

Add/extend:
- `platform-api` route tests for photo read, detail, comment, and reaction behavior
- photo DB tests alongside the existing thought/profile DB tests
- page markup tests for the new gallery page and the profile-page 5-photo preview
- API client tests for new photo detail/comment/reaction endpoints
- gallery page loader tests covering `isOwner` detection for owner, authenticated non-owner, and unauthenticated visitor cases

## Product decisions locked

- Profile page: preview only, 5 max, read-only.
- Gallery page: single shared page at `/gallery/index.html?id=<playerId>`, owner mode auto-detected.
- Upload and delete controls: gallery page only, gated on `isOwner`.
- Viewer: the only place for photo social actions.
- Feed thought reactions/comments: separate social objects from gallery photo reactions/comments.
