# Profile Music Upload Investigation Handoff

## Purpose

Investigate whether `profileMusic` should ship as URL-only, upload-only, or a staged hybrid, based on the actual current upload/media architecture in the repo.

This is an investigation and planning pass, not an implementation pass.

Do not build Profile Music yet. Do not add new database migrations yet. Do not add frontend UI yet. The output of this pass should be a concrete implementation plan grounded in the existing code.

## Background

The platform roadmap already includes `profileMusic`: a player-assigned audio track that autoplays on profile page load in the Myspace tradition.

The original planned v1 contract was URL-based only:

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

However, photo uploads are already live. That means an uploaded audio track may be feasible if the existing upload/media architecture is reusable and not tightly photo-specific.

The goal of this pass is to inspect the current upload stack and decide whether Profile Music v1 should use:

1. URL-only
2. upload-only
3. URL first, upload later
4. upload first, URL later
5. both URL and upload in the same first pass, only if this is genuinely low-risk

Default bias: do not build both URL and upload in v1 unless the current architecture makes it cheap and testable.

## Core Question

Can Profile Music v1 reuse the existing photo upload pipeline cleanly, or would audio upload require a new media subsystem?

If it can reuse the existing upload pipeline cleanly, upload-backed Profile Music may be the better v1 product.

If the current upload pipeline is photo-specific, brittle, or tightly coupled to gallery/avatar/background behavior, Profile Music v1 should stay URL-only and audio upload should wait for a generic media asset pass.

## Files / Areas To Inspect

Inspect the current backend upload routes and storage helpers:

```txt
platform-api/src/routes/photo-routes.mjs
platform-api/src/app.mjs
platform-api/src/http-utils.mjs
platform-api/src/db/*photo*
platform-api/src/db/*media*
platform-api/src/*upload*
platform-api/src/*storage*
platform-api/tests/photo-routes.test.mjs
```

Inspect frontend upload flows:

```txt
js/profile-editor/
js/profile-social/
js/gallery-page/
js/me-page/media-actions.mjs
js/player-page/
js/platform/api/platform-api.mjs
js/platform/api/auth-api.mjs
```

Inspect current data contracts and normalization:

```txt
js/platform/profile/
js/platform/profile/profile.mjs
js/platform/api/platform-api.mjs
platform-api/src/normalize-profiles.mjs
platform-api/src/normalize.mjs
platform-api/src/db/profiles*
```

Inspect CSS/component placement readiness:

```txt
css/profile-page.css
css/profile-social.css
css/profile-editor-card.css
css/me.css
css/player.css
```

Only inspect CSS for placement feasibility. Do not start a CSS refactor in this pass.

## Investigation Tasks

### 1. Determine Whether Uploads Are Generic Or Photo-Specific

Answer these questions:

- Is the backend upload route hardcoded around image validation only?
- Are accepted MIME types limited to image formats?
- Does the backend assume image dimensions, thumbnails, captions, or gallery semantics?
- Is storage organized around a generic media asset table/object, or around photo-specific records?
- Can a new asset `kind` like `profile-music` or `audio` be added without duplicating route logic?
- Does the current upload code already enforce authenticated ownership?
- Is delete/replace behavior already implemented or easy to reuse?
- Are uploaded files served through stable public URLs, signed URLs, or API proxy URLs?

Expected output: classify the upload system as one of:

```txt
A. Generic enough for audio reuse now
B. Mostly reusable but needs a small media abstraction first
C. Photo-specific; do not use for Profile Music v1
```

### 2. Identify Backend Requirements For Audio Upload

If upload-backed music is viable, identify the exact backend work needed.

Minimum audio requirements:

```txt
allowed MIME types: audio/mpeg, audio/wav, audio/ogg, audio/webm if browser support is acceptable
max file size: recommend 10–15 MB for v1 unless repo already has a media size standard
max duration: recommend 2–3 minutes for v1
one track per profile
authenticated owner only
replace current track behavior defined
clear current track behavior defined
no playlists
no waveform
no trimming
no background transcoding in v1
```

Check whether duration validation is realistic in the current stack. If duration detection requires a heavy dependency or server-side decoding, call that out. A conservative v1 may use size/MIME validation only and defer duration validation, but that is a product risk and should be explicit.

### 3. Identify Frontend Requirements For Audio Upload

If upload-backed music is viable, identify the exact frontend work needed.

Likely areas:

```txt
profile editor: upload/select/replace/clear track controls
profile editor: title/artist/autoplay/volume fields
profile view model: include normalized profileMusic
/me render: visible mini-player when set
/player render: visible mini-player when set
shared player component: render mini audio widget
API client: upload profile music file or set profileMusic reference
error states: unsupported file, too large, upload failed, playback failed
```

The mini-player must always be visible when autoplay is enabled so visitors can pause or mute immediately.

### 4. Decide The v1 Product Shape

Recommend one of these options:

#### Option A: URL-only v1

Use this if the upload path is photo-specific or audio validation/storage would be too invasive.

Contract:

```js
{
  trackTitle: "",
  trackArtist: "",
  trackUrl: "",
  audioAssetId: "",
  embedKind: "url",
  autoplay: true,
  volume: 0.7,
  setAt: ""
}
```

Rules:

- direct audio URL only
- no file upload
- no YouTube/SoundCloud
- no playlists
- no embeds
- visible pause/mute control

#### Option B: Upload-only v1

Use this if the existing photo/media upload pipeline can be cleanly reused.

Contract:

```js
{
  trackTitle: "",
  trackArtist: "",
  trackUrl: "",
  audioAssetId: "",
  embedKind: "upload",
  autoplay: true,
  volume: 0.7,
  setAt: ""
}
```

Rules:

- one uploaded track per profile
- no external URL input in v1
- replace existing uploaded track when a new one is saved, or explicitly preserve old asset if current media policy does that
- clear removes the profileMusic reference; physical asset deletion should follow existing media deletion policy
- no playlists
- no embeds

#### Option C: URL + Upload v1

Use this only if both paths can be supported with minimal branching and strong tests.

This is not the default recommendation. It increases UI states, validation branches, persistence cases, and player rendering cases.

## Proposed Future-Safe Contract

Regardless of v1 choice, prefer a future-safe `profileMusic` object:

```js
{
  trackTitle: "",
  trackArtist: "",
  trackUrl: "",
  audioAssetId: "",
  embedKind: "url", // "url" | "upload"
  autoplay: true,
  volume: 0.7,
  setAt: ""
}
```

Rules:

- `profileMusic` is `null` when unset.
- `embedKind: "url"` uses `trackUrl` as the direct `<audio src>`.
- `embedKind: "upload"` uses `audioAssetId` or a resolved asset URL from the API.
- Empty or invalid music data must render as no widget, not a broken widget.
- Autoplay must always be paired with a visible mini-player control.

## Boundaries

Do not implement Profile Music during this investigation.

Do not create migrations during this investigation.

Do not create a one-off audio upload path that bypasses the existing media/photo ownership model.

Do not add YouTube, SoundCloud, Spotify, playlists, waveform previews, trimming, or transcoding.

Do not make games responsible for profile music.

Do not store profile music in game-owned state.

Do not add group/doomscroll/media-gallery scope.

Do not do a CSS redesign.

Do not start TypeScript migration.

## Recommended Output From This Investigation

Produce a follow-up implementation handoff named:

```txt
PROFILE_MUSIC_IMPLEMENTATION_HANDOFF.md
```

It should include:

- chosen v1 shape: URL-only, upload-only, or hybrid
- exact backend files to patch
- exact frontend files to patch
- data contract changes
- API route changes, if any
- DB migration needs, if any
- validation rules
- test list
- manual smoke checklist
- rollback risk
- deferred follow-up items

## Decision Gate

Before recommending upload-backed Profile Music, confirm all of the following:

```txt
existing upload pipeline enforces authenticated ownership
storage path / asset record can support audio without lying about dimensions/thumbnails
audio MIME/file-size validation is straightforward
profileMusic can store an asset reference cleanly
/me and /player can resolve the playable audio URL consistently
clear/replace behavior is defined
manual smoke path is testable locally
```

If any of these are false, recommend URL-only v1.

## Suggested Smoke Checklist For Later Implementation

Do not run this now unless implementation has started. This is for the future feature pass.

```txt
profile with no music renders no widget
owner can set music
owner can clear music
owner can replace music
/me shows the mini-player when music is set
/player shows the mini-player when music is set
autoplay attempts only when autoplay is true
visible pause/mute control is always present
invalid audio source fails gracefully
mobile layout remains readable
sign-out/sign-in preserves saved music
other players cannot edit someone else's music
```

## Hard Recommendation For The Investigator

If the current upload system is clean and reusable, prefer upload-only v1 over URL-only v1 because it gives the platform a more native profile identity feature.

If the current upload system is photo-specific, do not force it. Ship URL-only Profile Music first and schedule a generic media asset/audio upload pass later.
