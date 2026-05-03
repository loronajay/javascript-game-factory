# Bugs

## currently can't interact (react/comment) with photos unless i'm on the gallery page. i need to be able to interact with the photos from the viewer, anywhere: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-02 115731.png"

## upload status text is moving the "upload photos" button: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-05-02 103158.png"

## Remaining architecture / polish backlog

- Navigation UI/UX can still be polished further

Still needs cleanup after the current folder move:
- `/me` still needs a decision on whether it has stable enough boundaries for a real `js/me-page/` subsystem

Folderization follow-up:
- `js/player-page/` and `js/thoughts-page/` are now real subsystems; preserve them as the canonical homes for those page concerns
- only introduce `js/me-page/` if we can move stable ownership boundaries there instead of creating another dump folder
