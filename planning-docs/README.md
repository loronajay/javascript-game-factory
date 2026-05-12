# Planning Docs

This folder holds cross-cutting platform plans, handoffs, and historical implementation notes.

## Start Here

After a context clear, read in this order:

1. `ARCHITECTURE_HANDOFF.md`
2. `PLATFORM_IMPLEMENTATION_PLAN.md`
3. `BUGS.md`
4. `COMMENT_DELETE_PLAN.md` only if working on comment deletion
5. `TYPESCRIPT_MIGRATION_PLAN.md` only if the work is about future typing

## Active Docs

- `ARCHITECTURE_HANDOFF.md` - current architecture ownership and cleanup status
- `PLATFORM_IMPLEMENTATION_PLAN.md` - current shipped-vs-pending platform status
- `BUGS.md` - active defects
- `COMMENT_DELETE_PLAN.md` - active implementation plan for the remaining comment-delete gap
- `TYPESCRIPT_MIGRATION_PLAN.md` - deferred future work, still useful as a staging plan
- `badge-plans/javascript_game_factory_canon_badge_batch_1_scope.md` - future badge pass reference
- `profile-editor-plans/` - mixed status; `/me/edit` shipped, layout customization still pending

## Historical Or Mostly Implemented Docs

These are still useful for context, but they should not be treated as the current work queue:

- `CUTOVER_HANDOFF.md` - backend cutover history
- `PHOTO_UPLOADS.md` - upload workstream history and remaining deployment-verification notes
- `me-page-cleanup-handoff.md` - completed `/me` subsystem extraction handoff
- `profile-css-ownership-cleanup-handoff.md` - completed shared profile CSS cleanup handoff
- `profile-music-upload-investigation-handoff.md` - resolved investigation; profile music shipped

## Working Guidance

- Use this folder for multi-surface planning that spans pages, frontend modules, and the API.
- Keep per-game design source of truth inside the relevant game folder instead of here.
- Prefer updating an existing plan when it is still active rather than creating near-duplicate handoff files.
- If a doc is complete but still worth keeping, mark it clearly as historical instead of letting it read like an active TODO.
