# Profile CSS Ownership Cleanup Pass — Scoping Handoff

**Status: Complete — 2026-05-09**

Shared layout grid, column base, panel shell visual decoration, and 980px responsive collapse are now in `profile-page.css`. `me.css` and `player.css` are now mostly page-specific. Obsolete thoughts-panel grid placement removed. No HTML or JS changes were needed. Pending manual smoke test of `/me` and `/player` at multiple widths.

---

## Goal

Reduce duplicated `/me` and `/player` profile layout CSS before adding more profile features.

This is a CSS ownership cleanup pass, not a visual redesign and not a feature pass.

The purpose is to make the next profile feature pass, especially Profile Music, safer by ensuring shared profile layout and panel primitives live in shared profile CSS instead of remaining split across page-specific files.

## Current Context

The shared frontend architecture cleanup is already far enough along that `/me`, `/player`, `/thoughts`, `gallery-page`, `profile-editor`, and `profile-social` now have stable subsystem ownership. The next profile feature in the platform build queue is Profile Music.

The remaining risk is CSS ownership drift.

Current CSS shape:

```txt
css/arcade.css
css/me.css
css/player.css
css/profile-page.css
css/profile-stage.css
css/profile-hero.css
css/profile-hero-card.css
css/profile-featured-cabinet.css
css/profile-identity.css
css/profile-rail.css
css/profile-social.css
css/profile-editor-card.css
```

The current shared CSS README says page-specific styles, shared shell styles, and profile-specific style layers all live in `css/`, and when a page has multiple concerns, smaller focused files are preferred over one stylesheet owning unrelated sections.

This cleanup should respect that direction.

## Why This Pass Is Worth Doing

`me.css` and `player.css` still contain duplicated layout and panel shell concepts.

`me.css` currently owns:

- `/me` stage theme variables
- custom background treatment
- `/me` three-column layout
- `/me` column wrappers
- panel ordering
- `.me-panel` base panel shell
- friend navigator
- danger panel
- responsive collapse rules

`player.css` currently owns:

- `/player` stage theme variables
- custom background treatment
- `/player` nav/back/portal details
- `/player` three-column layout
- `/player` column wrappers
- `.player-panel` base panel shell
- public profile hero actions
- gesture buttons
- challenge picker
- responsive collapse rules

`profile-page.css` already owns shared profile page chrome:

- `.me-panel, .player-panel`
- shared panel titles
- shared link/card item styles
- thought feed scroll behavior inside profile pages
- about/badge styling
- stage title/subtitle styling

That means shared profile layout ownership is incomplete. Some shared profile page primitives are still split between `me.css` and `player.css`.

## Target Outcome

After this pass:

- `profile-page.css` owns shared profile page layout and panel primitives.
- `me.css` mostly owns `/me`-specific owner controls and owner-only layout exceptions.
- `player.css` mostly owns `/player`-specific public profile actions and public-view exceptions.
- The visual layout remains unchanged.
- No HTML changes are required.
- No Profile Music implementation is added during this pass.

## Primary Cleanup Targets

Move or consolidate these shared concepts into `profile-page.css`.

### 1. Shared Profile Layout Grid

Unify shared layout rules for:

```txt
.me-layout
.player-layout
.me-layout__main
.player-layout__main
.me-layout__side
.player-layout__side
.me-layout__side--middle
.player-layout__side--middle
.me-layout__side--right
.player-layout__side--right
```

Expected shared behavior:

- desktop profile pages use a three-column grid
- main column is left
- middle utility/favorite/gallery column is center
- right feed/about/badge column is right
- columns stack predictably at smaller widths
- each column remains an independent grid stack

Do not redesign the column ratios unless a current bug requires it.

### 2. Shared Panel Shell

Consolidate shared panel shell styling for:

```txt
.me-panel
.player-panel
```

Shared panel shell should include only true shared primitives:

- display/grid baseline
- gap
- padding
- min-height baseline, if still needed
- border
- border radius
- background
- box shadow
- overflow behavior

Keep page-specific panel variants in their page files.

### 3. Shared Responsive Collapse

Consolidate shared responsive collapse behavior where `/me` and `/player` match.

Likely shared breakpoints:

```css
@media (max-width: 980px) { ... }
@media (max-width: 640px) { ... }
```

Only move responsive rules that are genuinely shared.

Keep `/me`-specific mid-desktop behavior in `me.css` if it only applies to the owner layout.

### 4. Obsolete Shared Grid Placement Rules

Audit this rule in `profile-page.css`:

```css
.me-panel--thoughts,
.player-panel--thoughts {
  grid-column: 3 / 4;
  grid-row: 1 / span 2;
  min-height: 0;
}
```

`/me` and `/player` now use explicit column wrappers, and both page CSS files reset old parent-grid placement behavior.

If this rule is obsolete, remove or neutralize it.

Do not remove it blindly. Confirm that both `/me` and `/player` still render correctly after removal.

## Files In Scope

```txt
css/me.css
css/player.css
css/profile-page.css
```

These files may be touched if needed for direct fallout from the extraction:

```txt
css/profile-stage.css
css/profile-hero.css
css/profile-hero-card.css
css/profile-rail.css
```

But avoid touching them unless the cleanup directly requires it.

## Files Out Of Scope

Do not change these unless a broken import or direct regression forces it:

```txt
css/arcade.css
css/profile-editor-card.css
css/profile-featured-cabinet.css
css/profile-identity.css
css/profile-social.css
```

Reasoning:

- `arcade.css` is global shell styling and is not the current duplication hotspot.
- `profile-editor-card.css` already has a clean owner-editor boundary.
- `profile-featured-cabinet.css` already pairs `.me-featured-cabinet` and `.player-featured-cabinet` shared styles.
- `profile-identity.css`, `profile-hero.css`, `profile-hero-card.css`, and `profile-rail.css` already mostly use paired `.me-*` / `.player-*` selectors and look like proper shared component layers.
- `profile-social.css` owns gallery/social surfaces and is not the profile layout duplication hotspot for this pass.

## Hard Boundaries

Do not redesign `/me`.

Do not redesign `/player`.

Do not change HTML.

Do not add Profile Music.

Do not add Durable Memories.

Do not change JavaScript.

Do not change backend files.

Do not change route structure.

Do not change CSS import order unless required.

Do not move owner-only styles into shared files.

Do not move public-view-only gesture/challenge styles into shared files.

Do not chase every CSS file in the repo.

This pass is about shared profile layout/panel ownership only.

## Keep In `me.css`

The following should remain page-specific unless a strong reason appears:

- `.me-page-shell` stage theme variables
- `.me-stage--custom-bg`
- `.me-stage__controls`
- `.me-stage__title`
- `/me` panel ordering if it differs from `/player`
- friend navigator styles
- danger zone styles
- owner-only edit chip positioning if not already in shared stage CSS
- any `/me`-specific mid-desktop reflow that does not match `/player`

Specifically keep these owner-only concerns in `me.css`:

```txt
.me-friends-navigator*
.me-panel--danger
.me-danger-btn
#meFriendCodePanel if it has owner-only behavior
#meFriendsPanel if it has owner-only behavior
```

## Keep In `player.css`

The following should remain page-specific unless a strong reason appears:

- `.player-page-shell` stage theme variables
- `.player-stage--custom-bg`
- `.player-stage__nav`
- `.player-stage__back`
- `.player-stage__portal`
- public profile friend/message action buttons
- gesture rail
- challenge picker
- challenge game buttons
- public-view-only layout exceptions

Specifically keep these public-view concerns in `player.css`:

```txt
.player-hero-card__social-action
.player-hero-card__friend-action
.player-hero-card__gesture-*
.player-hero-card__challenge-*
```

## Suggested Implementation Steps

### Step 1 — Baseline Capture

Before changing CSS, manually inspect or screenshot these breakpoints for both `/me` and `/player`:

```txt
desktop wide: 1440px+
mid desktop: around 1200px
tablet: around 980px
phone: 640px and below
```

Record any existing defects before the cleanup so they do not get blamed on the extraction.

### Step 2 — Extract Shared Layout Rules

Move matching layout declarations into `profile-page.css`.

Start with shared selectors like:

```css
.me-layout,
.player-layout {
  display: grid;
  gap: 18px;
  width: min(94vw, 1380px);
  align-items: start;
}

.me-layout__main,
.me-layout__side,
.player-layout__main,
.player-layout__side {
  display: grid;
  gap: 18px;
  align-content: start;
  min-width: 0;
}
```

Then preserve page-specific column placement and ordering where necessary.

Do not over-normalize if `/me` and `/player` intentionally differ.

### Step 3 — Extract Shared Panel Shell

Move common `.me-panel` / `.player-panel` styling into `profile-page.css`.

Avoid duplicating the same border/background/shadow in both page files.

Keep variants like `.me-panel--danger`, `.player-panel--favorite`, or other page-specific modifiers in page CSS.

### Step 4 — Audit Thought Panel Placement

Check whether the shared `.me-panel--thoughts, .player-panel--thoughts` grid-column/grid-row rule is obsolete.

If obsolete, remove only the grid-placement parts and keep any useful shared `min-height` behavior.

Example candidate:

```css
.me-panel--thoughts,
.player-panel--thoughts {
  min-height: 0;
}
```

Only apply this if layout remains correct.

### Step 5 — Re-run Manual Layout Checks

Check `/me` and `/player` at:

```txt
1440px+
1200px
980px
640px
mobile portrait
```

Verify that:

- `/me` keeps explicit owner-panel placement
- `/me` feed/about/badges do not get squeezed
- `/player` collapses into a readable single column on phone widths
- thought feeds still scroll correctly on desktop and expand correctly on mobile
- custom profile backgrounds still render
- avatar frames still render
- favorite cabinet panel still renders
- gallery panel still renders
- danger zone still renders on `/me`
- gestures/challenge UI still renders on `/player`

## Testing / Verification

CSS does not need pixel-perfect tests.

Use existing test baseline if available:

```powershell
node .\js\tests\arcade-player.test.mjs
node .\js\tests\arcade-playerpage.test.mjs
node .\js\tests\arcade-me.test.mjs
node .\js\tests\arcade-mepage.test.mjs
node .\js\tests\arcade-session-nav.test.mjs
node .\js\me-page\tests\friend-navigator.test.mjs
node .\js\me-page\tests\media-actions.test.mjs
node .\js\me-page\tests\page-data.test.mjs
node .\js\me-page\tests\render-sections.test.mjs
```

Manual smoke matters more for this pass.

Required manual smoke:

```txt
/me authenticated view
/player public view
/me desktop wide
/player desktop wide
/me mid desktop
/player mid desktop
/me phone width
/player phone width
/me profile editor open/close still overlays correctly
/player gesture/challenge controls still fit
```

## Definition Of Done

This cleanup pass is complete when:

- shared profile layout primitives live in `profile-page.css`
- shared panel shell primitives live in `profile-page.css`
- `me.css` is mostly owner-page-specific
- `player.css` is mostly public-profile-specific
- obsolete shared grid-placement rules are removed or confirmed still necessary
- `/me` visual layout is unchanged
- `/player` visual layout is unchanged
- no HTML changes were needed
- no JS changes were needed
- no product features were added
- manual smoke passes

## Failure Conditions

Stop and revert or narrow the pass if:

- `/me` owner feed/about/badges layout regresses
- `/player` mobile collapse regresses
- shared CSS starts needing many page-specific exceptions
- Profile Music scope starts bleeding into this cleanup
- the pass requires HTML or JS changes
- visual behavior changes in ways unrelated to ownership cleanup

## Next Pass After This

After this cleanup is complete, proceed to Profile Music.

Profile Music should have its own shared component/style layer and should render on both `/me` and `/player` when `profileMusic` is set.

Do not use this cleanup pass to start that implementation.
