# Bugs

## Big gap on friends page between favorite game panel and photo gallery panel. need the photo gallery panel to utilize that space instead of leaving a huge gap: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 094034.png"

## Same issue on me page, photo gallery and danger zone need to be brought up to fill in massive gap: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 120947.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 120958.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-01 121012.png"

## Remaining architecture / polish backlog

- Navigation UI/UX can still be polished further

Still needs cleanup after the current folder move:
- `/me` still needs a decision on whether it has stable enough boundaries for a real `js/me-page/` subsystem

Folderization follow-up:
- `js/player-page/` and `js/thoughts-page/` are now real subsystems; preserve them as the canonical homes for those page concerns
- only introduce `js/me-page/` if we can move stable ownership boundaries there instead of creating another dump folder
