# Planning Docs

This folder holds cross-cutting platform plans, handoffs, and historical implementation notes.

## Start Here

After a context clear, read in this order:

1. `CHANGELOG.md` - dated narrative of what shipped when; fastest way to rebuild context
2. `ARCHITECTURE_HANDOFF.md`
3. `PLATFORM_IMPLEMENTATION_PLAN.md`
4. `BUGS.md`

## Active Docs

- `CHANGELOG.md` - the dated history extracted out of the root `CLAUDE.md` so that file can stay a lean orientation guide. Read the root `CLAUDE.md` for orientation, this one for archaeology.
- `ARCHITECTURE_HANDOFF.md` - current architecture ownership and cleanup status
- `PLATFORM_IMPLEMENTATION_PLAN.md` - current shipped-vs-pending platform status
- `BUGS.md` - active defects
- `badge-plans/javascript_game_factory_canon_badge_batch_1_scope.md` - future badge pass reference. Note this covers **platform profile badges**, which are still unwired placeholders; Tactical Arena's in-game badge system is separate and shipped (`games/tactical-arena/SOCIAL_FEATURES_PLAN.md`).
- `profile-editor-plans/04_PANEL_APPEARANCE_EDITOR_SCOPE.md` - active scope for deeper live-preview panel appearance editing, starting with the hero card
- `GAME_SDK_PLAN.md` - proposed shared cabinet SDK; not started

## Historical Or Mostly Implemented Docs

These are still useful for context, but they should not be treated as the current work queue:

- `TYPESCRIPT_MIGRATION_PLAN.md` - the non-game migration (Phases 0–9, platform frontend + backend) is **complete as of 2026-05-30**; all of `js/**` and `platform-api/src/**` are `.mts` under `strict: true`. Only game cabinets remain, migrated last per-cabinet.
- `COMMENT_DELETE_PLAN.md` - **shipped 2026-07-25.** Comment deletion by the comment author or the owning post/photo owner is live on both surfaces, and the same pass added auth to every thought mutation. Kept as design history; see the Comment Moderation entry in `CHANGELOG.md`.
- `ONLINE_LOGIN_GATE_PLAN.md` - shipped; online features are gated behind a signed-in factory account via `js/platform/ui/online-account-feature-gate.mjs`
- `CUTOVER_HANDOFF.md` - backend cutover history
- `PHOTO_UPLOADS.md` - upload workstream history and remaining deployment-verification notes
- `me-page-cleanup-handoff.md` - completed `/me` subsystem extraction handoff
- `profile-css-ownership-cleanup-handoff.md` - completed shared profile CSS cleanup handoff
- `profile-editor-plans/` - original editor/layout scope (`00`–`03`), now useful as implementation history and guardrails; `/me/edit` and `/me/layout` are shipped, with current caveats called out in the handoff README
- `profile-music-upload-investigation-handoff.md` - resolved investigation; profile music shipped

## Working Guidance

- Use this folder for multi-surface planning that spans pages, frontend modules, and the API.
- Keep per-game design source of truth inside the relevant game folder instead of here.
- Prefer updating an existing plan when it is still active rather than creating near-duplicate handoff files.
- If a doc is complete but still worth keeping, mark it clearly as historical instead of letting it read like an active TODO.
