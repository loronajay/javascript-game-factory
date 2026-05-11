# Profile Layout Grid and Draggable Panel System Scope

## Purpose

This document scopes the second milestone: a constrained profile layout system where users can customize panel placement and size.

This should begin only after the standalone editor page exists or is at least structurally underway.

The goal is not unrestricted freeform web design. The goal is controlled profile customization using a responsive grid with platform-owned validation.

## Product Goal

Users should be able to customize their profile presentation by arranging profile panels.

Expected user-facing abilities:

```txt
Move panels on a grid
Resize panels within allowed min/max sizes
Show/hide optional panels
Reset layout to default
Preview profile layout before saving
Save layout explicitly
```

## Non-Goals

Do not build arbitrary HTML widgets.

Do not allow arbitrary CSS injection.

Do not store pixel-based positions.

Do not build per-breakpoint visual editing in v1.

Do not build mobile drag/resize in v1.

Do not let panels overlap in v1.

Do not autosave layout changes in v1.

## Route

Recommended route:

```txt
/me/layout
```

This route edits profile presentation only.

It should load the real user profile data, then render it through an editable layout preview.

## Relationship to Other Profile Pages

```txt
/me/edit
- Edits profile content.

 /me/layout
- Edits panel placement, size, visibility, and presentation layout.

 /me
- Displays the owner view of the profile.

 /player
- Displays the public view of the profile.
```

Public viewer routes must never activate layout editing controls.

## Core Layout Model

Panel positions and sizes should be stored in grid units.

Do not store raw pixels.

Recommended future profile field:

```sql
ALTER TABLE player_profiles
ADD COLUMN profile_layout JSONB DEFAULT NULL;
```

Recommended JSON shape:

```json
{
  "version": 1,
  "desktop": {
    "columns": 12,
    "panels": [
      {
        "id": "hero",
        "enabled": true,
        "x": 0,
        "y": 0,
        "w": 12,
        "h": 2
      },
      {
        "id": "bio",
        "enabled": true,
        "x": 0,
        "y": 2,
        "w": 5,
        "h": 3
      },
      {
        "id": "music",
        "enabled": true,
        "x": 5,
        "y": 2,
        "w": 4,
        "h": 3
      }
    ]
  },
  "mobile": {
    "mode": "stacked",
    "order": ["hero", "bio", "music"]
  }
}
```

For v1, `mobile` may be omitted and derived from desktop order.

## Grid Rules

Desktop layout should use a 12-column grid.

Panel `x`, `y`, `w`, and `h` values are abstract grid units.

Example:

```json
{
  "id": "music",
  "x": 5,
  "y": 2,
  "w": 4,
  "h": 3
}
```

This means:

```txt
Start at column 5
Start at row 2
Span 4 columns
Span 3 rows
```

The browser converts those units into fluid dimensions.

## CSS Direction

Example direction:

```css
.profile-layout-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: clamp(72px, 7vw, 112px);
  gap: clamp(10px, 1.2vw, 18px);
}

.profile-panel {
  min-width: 0;
  min-height: 0;
}
```

Each panel receives grid placement from JS:

```js
panelEl.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
panelEl.style.gridRow = `${panel.y + 1} / span ${panel.h}`;
```

## Responsive Behavior

The layout should preserve grid proportions on desktop.

Panels should not preserve exact pixel dimensions. They should preserve relative grid dimensions.

Desktop rule:

```txt
Use saved 12-column layout.
Panel sizes scale fluidly as the window resizes.
```

Mobile rule for v1:

```txt
Do not use freeform drag layout.
Stack panels vertically.
Derive order by sorting desktop panels by y, then x.
```

Example mobile order derivation:

```js
const mobileOrder = [...layout.panels].sort((a, b) => {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
});
```

CSS direction:

```css
@media (max-width: 899px) {
  .profile-layout-grid {
    display: flex;
    flex-direction: column;
  }

  .profile-panel {
    width: 100%;
  }
}
```

Do not attempt mobile drag/resize in the first version.

## Panel Internal Formatting

Grid placement controls the panel box.

Panel internals control how content adapts inside that box.

Do not mix these concerns.

A panel should be able to render in different density modes based on its assigned size.

Example:

```js
function getPanelDensity(panel) {
  const area = panel.w * panel.h;

  if (panel.w <= 3 || panel.h <= 2) return "compact";
  if (area <= 12) return "standard";
  return "expanded";
}
```

Then:

```js
panelEl.dataset.density = getPanelDensity(panel);
```

CSS can hide or reveal internal parts:

```css
.profile-panel[data-density="compact"] .music-track-meta {
  display: none;
}

.profile-panel[data-density="expanded"] .music-playlist {
  display: block;
}
```

This is how panels keep relative formatting when the window resizes.

The saved grid footprint stays stable.

The panel's internal presentation adapts to its assigned grid size.

## Panel Registry

The platform should centrally register known panel types.

Example:

```js
export const PROFILE_PANEL_REGISTRY = {
  hero: {
    label: "Hero",
    minW: 8,
    minH: 2,
    maxW: 12,
    maxH: 4,
    defaultW: 12,
    defaultH: 2,
    required: true,
    draggable: false,
    resizable: false
  },

  bio: {
    label: "Bio",
    minW: 3,
    minH: 2,
    maxW: 8,
    maxH: 5,
    defaultW: 5,
    defaultH: 3,
    required: true,
    draggable: true,
    resizable: true
  },

  music: {
    label: "Music",
    minW: 3,
    minH: 2,
    maxW: 6,
    maxH: 5,
    defaultW: 4,
    defaultH: 3,
    required: false,
    draggable: true,
    resizable: true
  },

  badges: {
    label: "Badges",
    minW: 3,
    minH: 1,
    maxW: 12,
    maxH: 4,
    defaultW: 6,
    defaultH: 2,
    required: false,
    draggable: true,
    resizable: true
  }
};
```

The exact panel IDs should match existing JavaScript Game Factory profile sections.

The agent must inspect existing profile sections before finalizing the registry.

## Default Layout

Recommended default layout direction:

```js
export const DEFAULT_PROFILE_LAYOUT = {
  version: 1,
  desktop: {
    columns: 12,
    panels: [
      { id: "hero", enabled: true, x: 0, y: 0, w: 12, h: 2 },
      { id: "bio", enabled: true, x: 0, y: 2, w: 5, h: 3 },
      { id: "music", enabled: true, x: 5, y: 2, w: 4, h: 3 },
      { id: "stats", enabled: true, x: 9, y: 2, w: 3, h: 3 },
      { id: "badges", enabled: true, x: 0, y: 5, w: 6, h: 2 },
      { id: "recentGames", enabled: true, x: 6, y: 5, w: 6, h: 2 }
    ]
  }
};
```

If the existing platform has different canonical profile sections, adjust IDs to match existing code.

Do not invent panels that do not exist yet unless the pass explicitly scopes placeholder support.

## Validation and Normalization

Saved layout JSON must always be normalized before rendering.

Backend/API should also validate before saving.

Normalization responsibilities:

```txt
Confirm version.
Confirm desktop object exists.
Confirm columns are supported.
Drop unknown panel IDs.
Add missing required panels.
Clamp x/y/w/h to valid ranges.
Clamp w/h to registry min/max.
Prevent out-of-bounds panels.
Prevent overlap.
Repair or auto-place invalid panels.
Drop disabled required panels or force them enabled.
```

Unknown panel IDs should not render.

Invalid layout should not break profile pages.

If a saved layout is unusable, fallback to default layout.

## Collision Rules

V1 should use simple deterministic collision behavior.

Dragging:

```txt
Show ghost preview.
If target overlaps another panel, mark target invalid.
Reject drop if invalid.
```

Resizing:

```txt
Show resize preview.
Reject resize if it overlaps another panel.
Reject resize if it violates min/max.
Reject resize if it exits grid bounds.
```

Do not implement auto-push or auto-pack in v1. It sounds better than it behaves. Auto-moving other panels can make the editor feel unpredictable.

## Editor Page UI

`/me/layout` should have three main zones.

```txt
Top Toolbar
- Back to Profile
- Edit Content
- Preview Public Profile
- Reset Layout
- Save

Panel Inspector
- List of panels
- Selected panel metadata
- Visible toggle for optional panels
- Width/height readout
- Reset selected panel

Main Layout Canvas
- Profile preview
- Grid overlay in edit mode
- Draggable panels
- Resize handles
- Ghost preview
- Invalid drop state
```

The layout editor should not look exactly like the public profile at all times. It needs editor affordances.

## Layout Save Flow

No autosave in v1.

Expected flow:

```txt
Open /me/layout
Fetch current user's profile data
Fetch or derive normalized profile layout
Render editable preview
User drags/resizes/toggles panels
Dirty state becomes true
User clicks Save
Client sends layout JSON only
Backend/API normalizes and saves layout
Response returns saved normalized layout
Editor re-renders from saved layout
Dirty state becomes false
```

Layout save should not update profile content fields.

## Reset Behavior

There should be two reset levels eventually:

```txt
Reset selected panel
Reset entire layout
```

V1 can start with reset entire layout.

Reset should restore the default layout and require Save unless product behavior intentionally saves immediately.

Explicit Save is preferred.

## Visibility Rules

Panels can be required or optional.

Required panels:

```txt
Cannot be disabled.
May be locked in v1 if needed.
Example: hero identity area.
```

Optional panels:

```txt
Can be hidden.
Can be shown again from the panel list.
```

Hiding a panel removes it from the rendered layout but should preserve or regenerate a safe position when re-enabled.

## Recommended Files

Target separation:

```txt
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
  profile-layout.css
```

Possible responsibilities:

```txt
registry.mjs
- Known panel definitions and constraints.

default-layout.mjs
- Default layout generation.

normalize-layout.mjs
- Pure validation and repair functions.

grid-engine.mjs
- Collision detection, snapping, bounds checks.

layout-renderer.mjs
- Render normalized layout into profile panel DOM.

layout-editor.mjs
- Drag, resize, selection, ghost preview, dirty state.

layout-storage.mjs
- API calls for loading/saving layout.

layout-wire.mjs
- Page entry point for /me/layout.

profile-layout.css
- Grid display, editor canvas, handles, panel states.
```

## Rendering Boundary

The layout renderer should place panels.

The panel renderer should render content inside panels.

Do not let individual panels know their grid coordinates unless needed for density mode.

Do not let Profile Music own layout placement.

Do not put drag/resize logic inside individual profile panels.

## Public Rendering

Public profile rendering should use normalized layout.

Public pages should receive layout styles but not editor controls.

No handles.

No grid overlay.

No drag events.

No resize events.

## Editing Controls

Editing controls should be active only on `/me/layout`.

Expected controls:

```txt
Panel click selects panel.
Drag handle moves panel.
Resize handle changes w/h.
Escape cancels active drag/resize if practical.
Save persists layout.
Reset restores default layout locally.
```

Do not make the entire panel draggable if it interferes with panel controls such as music buttons.

Use a visible drag handle.

## Touch and Mobile

V1 should not support mobile drag/resize.

Mobile users can still view the layout and may be able to use stacked order controls later.

A future mobile editor could support reordering panels only.

This is deliberately constrained. Full mobile freeform layout editing is high-friction and likely to burn implementation time.

## Pass Plan

### Pass 1 — Layout Data and Default Renderer

Introduce layout registry, default layout, and normalization.

Render `/me` and/or `/player` through normalized default layout.

No editor behavior yet.

### Pass 2 — `/me/layout` Read-Only Preview

Create layout customization route.

Load real profile data.

Render the same panels through the layout renderer.

Add toolbar and inspector shell.

No drag/resize yet.

### Pass 3 — Panel Selection and Grid Overlay

Click a panel to select it.

Show selected panel details.

Show grid overlay in edit mode.

Track dirty state but do not save changes yet.

### Pass 4 — Dragging

Add drag handle.

Snap movement to grid.

Reject overlap and out-of-bounds drops.

Update local layout state.

Save layout explicitly.

### Pass 5 — Resizing

Add resize handle.

Snap resize to grid.

Clamp min/max from registry.

Reject invalid overlap or bounds.

Save updated layout explicitly.

### Pass 6 — Optional Panel Visibility

Allow optional panels to be hidden/shown.

Required panels cannot be hidden.

Persist enabled state.

### Pass 7 — Mobile Stacked Preview

Render mobile stacked behavior.

Add mobile preview toggle if useful.

Do not add mobile drag/resize.

### Pass 8 — Polish and Presets

Add reset selected panel.

Add reset entire layout.

Add layout presets later if desired.

## Done Criteria

The layout system is complete for v1 when:

```txt
Layout data is stored in grid units, not pixels.
Default layout renders without saved layout JSON.
Saved layout renders safely.
Unknown/invalid layout data is normalized or rejected.
Users can drag panels within bounds.
Users can resize panels within min/max bounds.
Panels cannot overlap.
Optional panels can be hidden/shown if included in the pass.
Desktop layout preserves relative grid formatting on window resize.
Mobile renders as stacked order.
Public profile pages do not expose editor controls.
```

## Anti-Drift Rules

Do not build a full website/page builder.

Do not add arbitrary widgets.

Do not make layout depend on Profile Music internals.

Do not make mobile drag a v1 requirement.

Do not use pixels as the saved layout format.

Do not save invalid client JSON.

Do not collapse profile content editing and layout editing back into the same page.

