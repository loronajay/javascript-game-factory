# Bugs

- need to be able to delete comments left on thoughts or photos if i'm the poster of the comment and if i'm the photo owner and i happen to not like the comment on my photo.

## Remaining architecture / polish backlog

- normalize.mjs is still way too big and needs to be broken into modules. same with app.mjs there is no reason that file should be 58kb this is so sloppy. same with relationships.mjs.

Still needs cleanup after the current folder move:
- `/me` still needs a decision on whether it has stable enough boundaries for a real `js/me-page/` subsystem

Folderization follow-up:
- `js/player-page/` and `js/thoughts-page/` are now real subsystems; preserve them as the canonical homes for those page concerns
- only introduce `js/me-page/` if we can move stable ownership boundaries there instead of creating another dump folder
