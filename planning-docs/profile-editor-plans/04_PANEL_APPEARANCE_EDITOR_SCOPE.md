# Panel Appearance Editor Scope

Status snapshot: 2026-05-18

This scopes the next customization pass after the first `/me/layout` visual controls. The goal is a smoother appearance-editing experience where users can tune one panel while seeing the real live panel as it currently appears on their profile, before saving.

The first live-preview slice has moved past the hero card into most non-composer panels. Do not roll the deeper appearance controls across every panel until the hero flow feels solid, debuggable, and pleasant.

Important 2026-05-18 lesson: a preview is only useful if it uses the same renderer, CSS stack, scaling path, and CSS variables as the real profile page. Fake editor-only tiles drift too easily.

## Product Goal

Users should be able to customize a selected panel's appearance with immediate visual feedback.

The layout editor currently answers:

```txt
Where is this panel?
How large is this panel?
Is this panel visible?
What broad colors does this panel use?
```

The appearance editor should answer:

```txt
How does this panel look in detail?
How do its text, title bubbles, borders, sub-panels, and smaller elements feel together?
Can I see the actual panel while I tune it?
Can I save only when I like the result?
```

## UX Direction

Add a dedicated editing category/mode inside `/me/layout`, likely alongside the existing layout inspector.

Recommended modes:

```txt
Layout
- Move, resize, show/hide, reset placement.

Appearance
- Edit visual details for the selected panel.
- Show a live isolated preview of the selected panel using the same real renderer/CSS as `/me`.
- Keep unsaved edits local until the user saves.
```

The experience should feel smooth and "liquid":

```txt
Slider changes should update the preview immediately.
Color changes should update without panel reflow jumps.
The selected panel preview should stay visually stable while controls change.
Saving should feel explicit and reversible.
Reset should support at least "reset selected panel appearance."
The editor should avoid putting users in a tiny cramped inspector when they are doing visual work.
```

## Hero Card MVP

The first implementation target is the hero card only.

Hero card appearance controls should start with stable CSS-token customization, not arbitrary CSS.

Initial hero controls:

```txt
Panel surface color
Panel gradient color
Panel transparency
Panel saturation
Panel brightness
Panel gradient angle
Title bubble color
Primary text color
Secondary text color
Muted/label text color
Inner card/field color
Inner border color
Accent/glow color
Portrait frame color
Metrics card color
Rail/card color
```

Nice-to-have after the first pass feels stable:

```txt
Border strength
Glow strength
Shadow strength
Backdrop image dim/blur strength
Roundedness within platform limits
Preset chips for quick starting points
Copy appearance from another panel
```

Do not add all nice-to-haves in the first pass.

## Data Model

Continue storing appearance under the existing layout JSON:

```json
{
  "id": "hero",
  "style": {
    "panelColor": "#191126",
    "panelColor2": "#2b1740",
    "opacity": 0.96,
    "saturation": 1,
    "brightness": 1,
    "gradientAngle": 180,
    "titleColor": "#ffdcbb",
    "elementColor": "#ffffff",
    "textColor": "#ffffff",
    "secondaryTextColor": "#d8cce6",
    "mutedTextColor": "#b9a8c9",
    "innerPanelColor": "#140d20",
    "innerBorderColor": "#6b5875",
    "accentColor": "#8cff9b",
    "portraitFrameColor": "#6b5875",
    "metricsCardColor": "#1c1428",
    "railCardColor": "#171225"
  }
}
```

This should not require a backend migration if the API already saves normalized `profile_layout` JSON.

Normalization should:

```txt
Allow only known style keys.
Clamp numeric values.
Normalize hex colors.
Drop unknown fields.
Fallback cleanly if old saved layouts lack the new keys.
```

## Rendering Contract

The live profile renderer should remain the source of truth.

Avoid building a fake hero preview with duplicated markup. The appearance editor should reuse the same hero card renderer and CSS variables that `/me` and `/player` use, ideally through a preview container that receives the same normalized layout/style data.

Current shipped direction:

```txt
Hero preview in /me/layout uses the live /me hero renderer.
Identity, rankings, top friends, friends, friend code, favorite game, gallery, about, and badges now use live /me renderers in /me/layout.
The editor page loads the live owner-profile CSS needed for that hero.
Editor tiles set both editor variables and live --profile-panel-* variables.
Live previews use the same scale-to-fit helper as the live profile.
```

Implementation direction:

```txt
Use normalized layout data as the editor state.
When a hero appearance control changes, update local state.
Apply CSS custom properties to the live preview immediately.
Do not save until Save is clicked.
On cancel/reset, restore from the last saved normalized layout.
```

The hero card CSS should expose stable custom properties for the editable parts. Prefer clear ownership tokens like:

```txt
--profile-hero-text-rgb
--profile-hero-muted-rgb
--profile-hero-inner-panel-rgb
--profile-hero-inner-border-rgb
--profile-hero-accent-rgb
--profile-hero-portrait-frame-rgb
--profile-hero-metrics-card-rgb
--profile-hero-rail-card-rgb
```

Do not make appearance editing depend on brittle selector-specific inline styles.

## Editor Layout Direction

The current right-side inspector can keep basic style controls, but detailed panel appearance likely needs more room.

Recommended first pass:

```txt
When the user selects Hero and opens Appearance:
- The canvas focuses the selected hero panel preview.
- Controls appear in a wider appearance panel underneath or beside the selected-panel info.
- Controls are grouped by part: Surface, Text, Inner Cards, Portrait, Metrics/Rail.
- The rest of the layout can be dimmed or de-emphasized while editing appearance.
```

This keeps the user oriented in their real page while making the selected panel the editing subject.

## Save/Reset Behavior

Keep appearance changes local until explicit save.

Expected behavior:

```txt
Save Appearance saves the whole normalized layout JSON.
Reset Hero Appearance clears only `hero.style` detail keys or restores defaults.
Reset Layout should not unexpectedly wipe appearance unless explicitly scoped that way.
Leaving the page with unsaved appearance changes should use the existing dirty-state warning if available.
```

If save remains one global layout save button, make the dirty state clearly include appearance changes.

## Implementation Passes

### Pass 1 - Hero Token Inventory

Inspect `css/profile-hero-card.css`, `css/profile-hero.css`, hero renderers, and existing `apply-layout.mjs` style variables.

Decide which hero sub-elements get editable variables.

Do not add UI yet.

### Pass 2 - Style Normalization

Extend `DEFAULT_PANEL_STYLE`, `normalizePanelStyle`, editor preview style application, and live profile style application with the hero-specific keys.

Keep unknown style keys rejected.

### Pass 3 - Hero CSS Variables

Wire the hero card CSS to consume the new variables for text, labels, inner panels, borders, accent/glow, portrait frame, metrics cards, and rail cards.

Verify old profiles still look unchanged when no new keys exist.

### Pass 4 - Appearance Mode UI

Add an Appearance category/mode for the selected hero panel.

Render controls grouped by hero part.

Update local style state immediately on input.

### Pass 5 - Live Preview Focus

Make the selected hero panel preview feel like the main subject while editing appearance.

Avoid building a separate fake component; use the same panel DOM/render path wherever practical.

### Pass 5b - Extend Live Preview Pattern

After the hero preview remains stable, extend live previews one panel family at a time:

```txt
Identity/Profile panel - shipped
Favorite Game panel - shipped
Gallery panel - shipped
About/Badges panels - shipped
Friends/Top Friends/Rankings/Friend Code panels - shipped
Music panel
Thoughts feed panel
```

For each panel, first reuse the live renderer/CSS and verify it matches `/me`; only then add deeper appearance controls for that panel.

### Pass 6 - Save/Reset Polish

Add reset-selected-appearance behavior for hero.

Ensure Save persists the new style keys and reload renders the same appearance on `/me` and `/player`.

## Non-Goals For First Pass

Do not implement every panel at once.

Do not add arbitrary CSS entry fields.

Do not introduce custom HTML/widgets.

Do not build mobile freeform appearance editing yet.

Do not add backend work unless the existing layout JSON save path cannot persist the new style keys.

Do not redesign the hero card structure while adding appearance controls.

## Done Criteria For Hero

```txt
Hero appearance controls update a live preview immediately.
Unsaved edits remain local until save.
Saved hero appearance reloads correctly on `/me`.
Saved hero appearance renders correctly on `/player`.
Old profiles without hero detail style still render with current defaults.
Reset selected appearance restores hero defaults without moving/resizing panels.
The editor has a clear Layout vs Appearance distinction.
The implementation creates a pattern that can be repeated for the next panel.
```

## Next Panel Preview Scope

Before adding more appearance controls, continue the live-preview foundation.

Recommended next panel order:

```txt
1. Music panel - important visually, but more interactive.
2. Thoughts feed - keep internal scrolling intentional.
3. Then begin deeper hero-panel appearance controls and sub-grid planning.
```

Each panel preview should ship only when it visually matches the live `/me` panel at the same saved grid size.
