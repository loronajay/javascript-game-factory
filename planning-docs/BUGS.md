# Bugs

## Active

- Thought and photo comments still cannot be deleted by the comment author or by the owning thought/photo owner. Track the implementation details in `COMMENT_DELETE_PLAN.md`.

- **Layout editor UX — partially resolved, still open (as of 2026-05-16)**: The round of fixes landed 2026-05-16 addressed content clipping on live panels (`overflow-y: auto`, corrected shell height formula), hero card movement lock (`draggable: true`), 2×2 panels (`minW: 2`), and drag coordinate math at zoom < 1 (`canvas.offsetWidth` in `getGridMetrics`). The user confirmed there are still remaining editor issues. Known specifics not yet enumerated — investigate drag/resize feel, ghost placement accuracy, and any edge cases in the WYSIWYG match between the editor and the live `/me`/`/player` pages when continuing this workstream.

## Notes

- Old architecture-cleanup notes about `normalize.mjs`, `app.mjs`, `relationships.mjs`, and the `/me` subsystem decision were removed from this file because those are no longer active bugs. Current seam ownership lives in `ARCHITECTURE_HANDOFF.md`.
