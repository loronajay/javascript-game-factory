# Photo Uploads - Implementation Plan

## What this covers
Three related but distinct flows, built in order:
1. **Avatar upload** - profile photo, never touches the feed
2. **Gallery upload** - photos stored on the player's profile, with an optional "also post to feed" toggle at upload time
3. **Feed photo post** - a thought with an attached image; can be authored directly from the compose UI or cross-posted from the gallery upload

---

## Current Repo Status (2026-04-28)

This plan started as a blank implementation checklist. The repo is now partway through the work.

### Shipped in repo
- Pass 1 shared upload infrastructure is implemented:
  - Cloudinary upload service lives in `platform-api/src/services/upload.mjs`
  - multipart parsing is handled in `platform-api/src/app.mjs` via `busboy`
  - authenticated `POST /upload/avatar` and `POST /upload/photo` routes are live
  - `avatarUrlResolver` is wired in `platform-api/src/server.mjs`
- Pass 2 avatar UI is implemented:
  - profile editor exposes avatar upload + preview in `js/arcade-profile.mjs`
  - uploaded `avatarAssetId` is persisted through the existing profile save flow
- Most of Pass 3 is implemented:
  - migrations `011-player-photos.sql` and `012-thought-image.sql` exist
  - `platform-api/src/db/photos.mjs` and thought `image_url` persistence are live
  - `/me` and owner-view `/player` now have gallery upload composers with preview, caption, visibility, and optional cross-post toggle
  - thought cards render `imageUrl` across `/me`, `/player`, and `/thoughts`
  - direct thought composer photo posts now expose preview, gallery caption, visibility, and gallery cross-post controls, and still fall back cleanly to plain thought save if the gallery side effect cannot complete

### Still open
- Gallery items do not yet open into a dedicated full-view or lightbox experience
- End-to-end manual verification against a real Cloudinary-backed deployment still needs to happen after env vars are confirmed

---

## Before you can start

### 1. Create a Cloudinary account
Go to [cloudinary.com](https://cloudinary.com) and sign up for a free account.
- Free tier: 25GB storage, 25GB bandwidth/month
- After sign-up, note these values:
  - **Cloud Name**
  - **API Key**
  - **API Secret**

### 2. Create an upload preset
In the Cloudinary dashboard:
- Settings -> Upload -> Upload Presets -> Add upload preset
- Set mode to **Signed**
- **Preset name**: `user_uploads`
- **Asset folder**: `uploads` (avatars and gallery photos go into subfolders: `uploads/avatars`, `uploads/player-photos`)

### 3. Add env vars locally
Create or update `platform-api/.env`:

```txt
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. Add the same vars to Railway
In the Railway dashboard for the platform API service, add:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

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
