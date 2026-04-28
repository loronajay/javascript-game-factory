# Photo Uploads — Implementation Plan

## What this covers
Three related but distinct flows, built in order:
1. **Avatar upload** — profile photo, never touches the feed
2. **Gallery upload** — photos stored on the player's profile, with an optional "also post to feed" toggle at upload time
3. **Feed photo post** — a thought with an attached image; can be authored directly from the compose UI or cross-posted from the gallery upload

---

## Before you can start — things you need to do first

### 1. Create a Cloudinary account
Go to [cloudinary.com](https://cloudinary.com) and sign up for a free account.
- Free tier: 25GB storage, 25GB bandwidth/month — more than enough to start
- After sign-up you land on the dashboard. Note down three values:
  - **Cloud Name** (shown at the top of the dashboard)
  - **API Key**
  - **API Secret**

### 2. Create an upload preset (for server-side signed uploads)
In the Cloudinary dashboard:
- Settings → Upload → Upload Presets → Add upload preset
- Set mode to **Signed**
- **Preset name**: `user_uploads`
- **Asset folder**: `uploads` (avatars and gallery photos go into subfolders: `uploads/avatars`, `uploads/player-photos`)

### 3. Add env vars locally
Create or update `platform-api/.env` (this file should be gitignored):
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. Add the same vars to Railway
In the Railway dashboard for the platform-api service:
- Variables tab → add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

---

## Build order

### Pass 1 — Shared upload infrastructure
Everything else depends on this.

- [ ] Install `cloudinary` npm package in `platform-api`
- [ ] Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` to `config.mjs`
- [ ] Create `platform-api/src/services/upload.mjs` — wraps Cloudinary SDK, exports a single `uploadImage(buffer, options)` function that returns `{ assetId, url }`. Options include `folder` (`avatars` vs `player-photos`) and `maxWidth` for server-side resize.
- [ ] Add `POST /upload/avatar` route to `app.mjs` — authenticated, `multipart/form-data`, 10MB cap, validates MIME type (JPEG/PNG/WebP), calls upload service with `folder: "avatars"` and `maxWidth: 800`, returns `{ assetId, url }`
- [ ] Add multipart body parser (use `busboy` package — no multer, the server is raw Node.js HTTP)
- [ ] Wire `avatarUrlResolver` in `server.mjs` — maps `assetId` to the Cloudinary URL so profile reads resolve `avatarAssetId` → public CDN URL

### Pass 2 — Avatar UI
- [ ] Add photo file input + preview to the profile editor panel (`arcade-profile.mjs`)
- [ ] On file select: show preview immediately, POST to `/upload/avatar`, store returned `assetId` in the form's pending state
- [ ] On profile save: include `avatarAssetId` in the patch payload — the existing `savePlayerProfile` route already accepts and persists it

### Pass 3 — Gallery + feed photo post
Requires Pass 1 complete.

**DB migration:**
- [ ] New migration `011-player-photos.sql` — creates `player_photos` table: `id`, `player_id`, `asset_id`, `image_url`, `caption`, `visibility`, `created_at`
- [ ] New migration `012-thought-image.sql` — adds `image_url text not null default ''` to `thought_posts`

**Backend:**
- [ ] `platform-api/src/db/photos.mjs` — `savePlayerPhoto`, `listPlayerPhotos`, `deletePlayerPhoto`
- [ ] `POST /upload/photo` route — same as avatar upload but `folder: "player-photos"`, returns `{ assetId, url }`
- [ ] `POST /players/:playerId/photos` — saves gallery entry, optionally creates a thought post if `postToFeed: true` is in the body (one request, two writes)
- [ ] `GET /players/:playerId/photos` — returns the player's photo gallery
- [ ] `DELETE /players/:playerId/photos/:photoId` — owner-only
- [ ] Update `saveThought` / `buildThoughtParams` in `db/thoughts.mjs` to include `image_url`
- [ ] Update `mapRowToThought` to read `image_url` from the row

**Frontend:**
- [ ] Gallery upload modal — file picker, preview, caption field, "also post to my feed" toggle, visibility selector
- [ ] Gallery panel on profile/me page — photo grid, links to full view
- [ ] Thought card rendering — if `imageUrl` is present, render the image above the caption text
- [ ] Thought compose UI — photo attach button as an alternative entry point (uploads to gallery with `postToFeed: true` implicitly, or offers the toggle)

---

## Data model summary

### `player_photos`
| column | type | notes |
|---|---|---|
| `id` | text PK | |
| `player_id` | text | FK → players |
| `asset_id` | text | Cloudinary public ID |
| `image_url` | text | Cloudinary delivery URL |
| `caption` | text | 500 char max |
| `visibility` | text | public / friends / private |
| `created_at` | timestamptz | |

### `thought_posts` (addition)
| column | type | notes |
|---|---|---|
| `image_url` | text | empty string = text-only thought |

---

## Key decisions already made
- **Storage backend**: Cloudinary (free tier, server-side signed uploads, handles resize)
- **Size cap**: 10MB accepted, resized server-side to max 800px wide for avatars
- **Gallery → feed**: optional cross-post toggle at upload time, not a separate flow
- **Direct compose → feed**: photo attach creates a gallery entry as a side effect
- **No client-side upload**: all uploads go through the backend API (security, resize, asset tracking)
