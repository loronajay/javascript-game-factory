# Standalone Profile Editor Page Scope

Status: largely shipped foundation as of 2026-05-12.

The route and core separation described here now exist at `/me/edit`. Keep this doc for ownership rationale and remaining polish guidance, not as an unstarted feature scope.

## Purpose

The first milestone is to move profile editing into a dedicated standalone page.

The reason is structural. The existing owner profile page should not become overloaded with content editing, media editing, layout editing, preview behavior, and drag/resize controls. If all of that stays inside `/me`, the system will become hard to maintain before draggable panels even begin.

The standalone editor page gives profile editing its own route, layout, toolbar, save flow, validation states, and future expansion room.

## Canonical Route Direction

Recommended route:

```txt
/me/edit
```

Related routes:

```txt
/me
/me/layout
/player?id=...
```

`/me/edit` edits profile content.

`/me/layout` edits profile layout and panel placement later.

`/me` displays the owner profile.

`/player` displays another user's public profile.

## Ownership Boundary

The standalone editor page owns profile content editing.

It should not own draggable panel layout rules.

It should not own public profile rendering rules.

It should not own Profile Music playback behavior beyond embedding or invoking the existing music editor where appropriate.

## Editor Page Responsibilities

The editor page should let the authenticated user edit existing profile-owned fields and media.

Expected areas:

```txt
Identity
- Display name
- Bio / profile text
- Avatar
- Banner / profile background image

Media
- Profile music playlist
- Track title / artist metadata
- Track ordering
- Track removal

Profile Display Entry Point
- Link or button to "Customize Layout"
```

The exact fields should follow the current JavaScript Game Factory profile schema. The agent should inspect the existing profile implementation before changing field names or introducing new ones.

## Page Layout

Recommended editor page structure:

```txt
Top Bar
- Back to Profile
- Save
- Cancel / Revert
- Dirty-state indicator

Main Editor
- Identity section
- Media section
- Display/customization section

Optional Right Preview
- Compact profile preview
- Should not become the source of truth
```

The editor should be usable without a full public-profile preview. Preview is useful, but the editor's core job is stable content editing.

## Top Bar Requirements

The top bar should include:

```txt
Back to Profile
Save
Cancel / Revert
Dirty state indicator
```

Optional later:

```txt
Preview Public Profile
Customize Layout
```

## Dirty State

The page should track whether the user has unsaved changes.

Dirty state should become true when an editable field differs from the loaded profile data.

After successful save, dirty state should reset to false.

If the user navigates away with unsaved changes, the UI should warn or clearly indicate unsaved changes. This does not need to be overbuilt in the first pass, but the state model should support it.

## Save Model

Do not use autosave for v1.

Explicit Save is safer.

Expected flow:

```txt
Load /me/edit
Fetch authenticated user's profile
Populate editor fields
User changes content
Dirty state becomes true
User clicks Save
Client sends only valid editable profile fields
Backend/API persists profile content
Response returns saved profile
Editor refreshes local state from saved result
Dirty state becomes false
```

## Revert / Cancel Model

Cancel or Revert should restore the editor to the last loaded/saved profile state.

It should not partially preserve unsaved form state unless explicitly designed later.

## Existing Profile Music Integration

Profile Music is already implemented and stable.

Current known architecture:

```txt
js/profile-editor/music-player.mjs
js/profile-editor/music-editor.mjs
css/profile-music.css
```

The standalone editor should reuse the existing Profile Music editor.

Do not rewrite Profile Music as part of this pass.

Do not move music-player logic into layout code.

Do not create cross-subsystem imports from layout modules into music modules.

## Recommended File Structure

The agent should inspect the current repo before making final file decisions, but the intended separation is:

```txt
me.html
me-edit.html
me-layout.html

js/profile-editor/
  wire.mjs
  avatar-editor.mjs
  banner-editor.mjs
  music-editor.mjs
  music-player.mjs
  profile-form.mjs
  editor-wire.mjs

js/profile-layout/
  registry.mjs
  default-layout.mjs
  normalize-layout.mjs
  grid-engine.mjs
  layout-renderer.mjs
  layout-editor.mjs
  layout-storage.mjs
  layout-wire.mjs

css/
  profile.css
  profile-editor.css
  profile-layout.css
```

If the repo already has equivalent files, preserve existing structure and add only what is needed.

## Sectioning

The editor should be visibly sectioned.

Recommended sections:

```txt
Identity
Media
Profile Display
```

Do not bury layout customization controls inside the same form.

The editor may contain a button or card that links to `/me/layout`.

Example:

```txt
Profile Display
Customize the placement and size of your profile panels.
[Customize Layout]
```

## `/me` Behavior After This Change

`/me` should become more profile-view focused.

It should show the user's profile and provide owner actions:

```txt
Edit Profile
Customize Layout
View Public Profile
```

It should not carry the full profile editing form once `/me/edit` exists.

This should be done carefully to avoid breaking existing profile behavior.

## `/player` Behavior After This Change

`/player` should remain public viewer behavior.

It should not show owner-only editor controls unless the current implementation already has a safe owner-detection pattern and the route intentionally supports it.

No drag, resize, save, or layout editing behavior should be active on public profile pages.

## Validation

The editor should validate content before save.

Validation should follow existing project rules and backend constraints.

General expectations:

```txt
Display name must not be empty if the platform requires it.
Text length should be bounded.
Media values should use existing upload/storage rules.
Music playlist should keep the existing max-track behavior.
```

Do not invent new validation rules that conflict with existing platform behavior.

## Error States

The editor should represent:

```txt
Loading
Loaded
Saving
Saved
Save failed
Unauthorized / not logged in
Profile missing
```

Do not silently fail.

If a save fails, preserve the user's unsaved edits in the form.

## Accessibility and Input

The standalone editor should remain keyboard usable.

Buttons should be real buttons.

Inputs should have labels.

Do not make the editor depend on drag behavior.

This matters because the layout editor later will introduce pointer/touch interactions, and the normal content editor should remain stable without them.

## Pass Plan

### Pass 1 — Route and Page Shell

Create the standalone editor route/page.

Add basic page structure and navigation.

Do not move all behavior at once unless the existing code is already modular enough.

### Pass 2 — Load Current Profile Data

Load the authenticated user's profile into the editor.

Render existing fields with current values.

No new data model yet.

### Pass 3 — Save Existing Editable Fields

Wire explicit Save.

Preserve existing API expectations.

Update only content fields.

Do not introduce profile layout data in this pass.

### Pass 4 — Move/Reuse Existing Media Editors

Integrate existing avatar/banner/music editor behavior.

Do not rewrite stable Profile Music behavior.

### Pass 5 — Clean `/me`

Make `/me` a cleaner owner profile view.

Add links/buttons to `/me/edit` and later `/me/layout`.

### Pass 6 — Prep for Layout Editor Entry

Add a Profile Display section with a route entry to `/me/layout`.

This can be inactive until the layout route exists, but the editor page should be designed around the future split.

## Done Criteria

The standalone editor pass is complete when:

```txt
/me displays the user's profile without carrying the full editing form.
/me/edit loads the current user's editable profile data.
/me/edit can save existing profile fields.
/me/edit preserves existing Profile Music behavior.
/me/edit has clear save/loading/error states.
/me/edit links back to /me.
No draggable/resizable layout behavior has been added yet.
```

## Anti-Drift Rules

Do not redesign the whole profile system.

Do not rename existing stable Profile Music modules without a concrete need.

Do not introduce profile layout JSON during the standalone editor pass unless the implementation pass explicitly reaches layout preview.

Do not add marketplace, merchant, arcade cabinet, or game-grid concerns.

Do not build a general-purpose website builder.
