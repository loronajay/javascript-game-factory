# JavaScript Game Factory Profile Editor + Custom Layout Scope

Status snapshot: 2026-05-17

- Milestone 1, the standalone editor route at `/me/edit`, is shipped.
- Milestone 2, profile layout customization and draggable/resizable panel management at `/me/layout`, is shipped.
- The 2026-05-17 pass added per-panel visual customization under the existing `profile_layout` JSON: panel surface color, gradient color, title bubble color, inner element color, transparency, saturation, brightness, and gradient angle.
- Read the docs in this folder as shipped foundation history and product guardrails. Do not treat the original sequencing language as a statement that `/me/edit` or `/me/layout` still needs to be built.

## Purpose

This document set scopes the next profile customization milestone for JavaScript Game Factory.

The work began with a standalone profile editor page, then continued into a draggable/resizable profile panel layout system. The standalone editor page was not just a cosmetic refactor. It is the foundation that prevents layout customization from being jammed into the existing profile view and becoming coupled to unrelated profile content systems.

## Required Read Order

1. `01_STANDALONE_PROFILE_EDITOR_PAGE_SCOPE.md`
2. `02_PROFILE_LAYOUT_GRID_AND_PANEL_SYSTEM_SCOPE.md`
3. `03_AGENT_IMPLEMENTATION_HANDOFF.md`
4. `04_PANEL_APPEARANCE_EDITOR_SCOPE.md`

The first document defines how the dedicated editor page should behave and what it should own.

The second document defines the draggable/resizable panel layout model, grid rules, responsive behavior, validation rules, and save model.

The third document gives the agent the implementation boundaries, pass order, and anti-drift rules.

The fourth document scopes the next appearance-editing pass: start with a deeper hero-card appearance editor that uses live panel preview and normalized style tokens before expanding the pattern to other panels.

## Scope Boundary

This is for JavaScript Game Factory.

Do not mix this with JayArcade.com routing, cabinet OS work, TurboWarp Game Factory extension work, or unrelated arcade grid-selector behavior.

This feature touches the JavaScript Game Factory profile system only.

## High-Level Product Direction

Profiles should become user-customizable spaces.

The user should be able to edit profile content through a dedicated editor page.

Users can now customize where profile panels appear, how large they are within constraints, which optional panels are visible, and how each panel is visually styled.

The platform still owns the rules. User customization must be constrained, validated, and responsive.

## Core Route Direction

Recommended route split:

```txt
/me
/me/edit
/me/layout
/player?id=...
```

`/me` is the owner-facing profile view.

`/me/edit` is the standalone profile content editor.

`/me/layout` is the layout customization editor.

`/player` remains the public profile viewer.

## Core Rule

`/me/edit` changes profile content.

`/me/layout` changes profile presentation.

`/me` displays the result.

`/player` displays the public result.

Do not blur these responsibilities.

## Database Direction

The standalone editor page should continue using existing profile fields wherever possible.

The draggable/resizable layout system uses the profile layout JSON field:

```sql
ALTER TABLE player_profiles
ADD COLUMN profile_layout JSONB DEFAULT NULL;
```

Keep the field nullable. If no saved layout exists, code should derive the default layout.

Panel visual style is stored per panel under `panel.style` in that same JSON, so the color/gradient controls did not require a backend migration.

## Hard Constraints

Do not store raw pixel positions for panels.

Do not allow arbitrary HTML widgets.

Do not allow public `/player` pages to expose drag or resize behavior.

Do not let Profile Music own layout behavior.

Do not let the layout editor mutate profile content fields.

Do not trust client-provided layout JSON.

Do not build mobile drag/resize in v1.

## Expected Deliverable Style

Implementation should be done in passes.

Each pass should preserve working profile behavior.

The agent should smoke-test after each pass before moving forward.
