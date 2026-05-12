# Agent Implementation Handoff - Profile Editor and Draggable Panels

Status: partial historical handoff as of 2026-05-12.

The first implementation milestone in this handoff is no longer pending because `/me/edit` already shipped. The remaining relevant future scope in this folder is the constrained layout-customization pass, not the original standalone-editor bootstrap.

## Project

JavaScript Game Factory profile system.

## Mission

Implement this feature in controlled passes.

Start by creating a standalone profile editor page. After that foundation is stable, introduce a constrained draggable/resizable panel layout system for user profile customization.

Do not jump directly into draggable panels before the standalone editor is separated.

## Read These First

```txt
00_PROFILE_EDITOR_HANDOFF_README.md
01_STANDALONE_PROFILE_EDITOR_PAGE_SCOPE.md
02_PROFILE_LAYOUT_GRID_AND_PANEL_SYSTEM_SCOPE.md
```

## Existing Stable Context

Profile Music upload has already shipped and is considered stable.

Known current structure:

```txt
profileMusicPlaylist
- Stored on player_profiles as JSONB.
- Up to 5 tracks.
- Track shape: { url, title, artist }.

js/profile-editor/music-player.mjs
js/profile-editor/music-editor.mjs
css/profile-music.css
```

Do not rewrite Profile Music as part of this work.

Do not move music-player logic into layout modules.

## Core Route Target

Recommended:

```txt
/me
/me/edit
/me/layout
/player?id=...
```

## Responsibility Split

```txt
/me
- Owner-facing profile display.

 /me/edit
- Profile content editor.

 /me/layout
- Profile layout customization editor.

 /player
- Public profile display.
```

## Important Rule

Content editing and layout editing must remain separate.

`/me/edit` changes profile data.

`/me/layout` changes layout data.

## Required Implementation Order

### Phase 1 — Inspect Current Profile System

Before patching, inspect current profile route files, profile API helpers, profile editor modules, profile music modules, CSS ownership, and save/load flows.

Do not guess field names.

Do not guess route conventions.

Preserve existing working behavior.

### Phase 2 — Create `/me/edit`

Create the standalone editor page/route.

Move or reuse existing profile content editing behavior there.

The first version should edit existing profile data only.

Do not introduce draggable panel layout in this phase.

Expected behavior:

```txt
Load authenticated user's profile.
Render current editable fields.
Save edited fields.
Show loading/saving/error states.
Link back to /me.
Preserve Profile Music editor behavior.
```

### Phase 3 — Clean `/me`

After `/me/edit` works, simplify `/me` into an owner profile display page.

Expected owner actions:

```txt
Edit Profile
Customize Layout
View Public Profile
```

If `/me/layout` does not exist yet, the Customize Layout button may be hidden or disabled until the route lands.

### Phase 4 — Create Layout System Foundations

Add layout modules.

Recommended direction:

```txt
js/profile-layout/
  registry.mjs
  default-layout.mjs
  normalize-layout.mjs
  grid-engine.mjs
  layout-renderer.mjs
  layout-storage.mjs
  layout-wire.mjs
```

Do not add drag/resize first.

First, make default layout rendering work.

### Phase 5 — Create `/me/layout` Preview

Create the layout customization page.

Load real current profile data.

Render panels through the layout renderer using default or saved normalized layout.

Add toolbar and inspector shell.

No drag/resize yet.

### Phase 6 — Add Selection and Grid Overlay

Allow selecting panels.

Show selected panel metadata.

Show grid overlay.

Track dirty state.

Do not save layout until the local model is stable.

### Phase 7 — Add Dragging

Add drag handle behavior.

Rules:

```txt
Snap to grid.
Reject overlap.
Reject out-of-bounds.
Use ghost preview.
Update local layout state only after valid drop.
Save explicitly.
```

Do not make the whole panel draggable if it interferes with buttons or links inside the panel.

### Phase 8 — Add Resizing

Add resize handle behavior.

Rules:

```txt
Snap to grid.
Clamp min/max using registry.
Reject overlap.
Reject out-of-bounds.
Save explicitly.
```

### Phase 9 — Add Optional Panel Visibility

If panel visibility is included in the pass:

```txt
Required panels cannot be hidden.
Optional panels can be hidden.
Hidden panels do not render on public profile.
Re-enabled panels should be placed in a valid location.
```

### Phase 10 — Add Mobile Stacked Rendering

Mobile v1 should stack panels.

Do not implement mobile drag/resize.

Derive order from desktop layout using y, then x.

## Data Model

Recommended future DB field:

```sql
ALTER TABLE player_profiles
ADD COLUMN profile_layout JSONB DEFAULT NULL;
```

Keep nullable.

If missing, generate default layout in code.

## Layout JSON

Use grid units.

Do not use pixels.

Recommended shape:

```json
{
  "version": 1,
  "desktop": {
    "columns": 12,
    "panels": [
      {
        "id": "bio",
        "enabled": true,
        "x": 0,
        "y": 2,
        "w": 5,
        "h": 3
      }
    ]
  }
}
```

## Validation Rules

Validate on client for UX.

Validate or normalize again before save.

Rules:

```txt
Known panel IDs only.
Required panels must exist.
Required panels cannot be disabled.
Panel sizes clamp to registry min/max.
Panel positions stay inside grid bounds.
No overlap.
Unknown fields are ignored.
Bad layout falls back to default or repaired layout.
```

## Responsive Rules

Desktop:

```txt
12-column grid.
Grid units scale fluidly with window size.
Saved proportions remain stable.
```

Mobile:

```txt
Stacked layout.
No freeform drag.
Order derived from desktop layout unless mobile-specific ordering is later introduced.
```

## Panel Density

Panels should support internal formatting based on assigned grid footprint.

Example modes:

```txt
compact
standard
expanded
```

Do not use only viewport media queries for panel formatting. A specific panel's assigned grid size matters more than the whole browser width.

## Save Boundaries

Profile content save should not include layout JSON.

Layout save should not include profile content fields.

Keep these API paths or update payloads separate if possible.

## Smoke Tests After Each Phase

Run at least these checks after relevant passes:

```txt
Unauthenticated user cannot edit profile.
Authenticated user can load /me.
Authenticated user can load /me/edit.
Saving existing profile content still works.
Profile Music editor still works.
Profile Music mini-player still works on /me and /player.
Public /player page does not show owner-only editor controls.
Default layout renders when profile_layout is null.
Bad layout JSON does not crash profile rendering.
Dragging cannot create overlap.
Resizing cannot violate min/max panel constraints.
Mobile profile stacks panels instead of shrinking the desktop grid into unusable boxes.
```

## Anti-Drift Rules

Do not mix JavaScript Game Factory scope with JayArcade scope.

Do not rewrite profile music.

Do not introduce arbitrary HTML widgets.

Do not build a full website builder.

Do not store pixel coordinates.

Do not enable editor controls on public profile pages.

Do not add mobile freeform drag in v1.

Do not rename existing stable modules unless required.

Do not make unrelated visual redesigns while implementing architecture.

## Expected Final State

When this milestone is complete:

```txt
/me is a clean owner profile view.
/me/edit is the standalone profile content editor.
/me/layout is the standalone profile layout editor.
Profile panels render from normalized grid layout data.
Users can drag and resize panels within platform-owned constraints.
Profiles remain responsive as the browser resizes.
Mobile profiles use a stacked layout.
Public profiles never expose editing controls.
```
