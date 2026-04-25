# Bugs

---

## HARD — Backend / Data Integrity

### [PLATFORM] Timestamps are unstable — change on every refresh and show raw ISO strings
Comment timestamps display as raw `2026-04-25T07:21:51.371Z` instead of a formatted relative time, and the relative label changes on every page load. Timestamps need to be stored as fixed absolute values and formatted at render time, not regenerated.
Screenshot: `Screenshots/Screenshot 2026-04-25 002949.png`

### [PLATFORM] Friend not appearing in Friends Rail editor dropdown
The rail editor "Main Squeeze Pick" dropdown only shows "No manual pick" — actual friends are not populating it. Depends on the friendship record being correct in the DB (see below).
Screenshot: `Screenshots/Screenshot 2026-04-25 003458.png`

### [PLATFORM] Friend's thought count in DB doesn't match count shown on their profile
The thought-count metric stored for the friend's player record is out of sync with the actual post count visible on their public profile. The count write path isn't firing on their behalf, or it's writing to the wrong record.
Screenshots: `Screenshots/Screenshot 2026-04-25 002448.png`, `Screenshots/Screenshot 2026-04-25 002511.png`

### [PLATFORM] Friendship not saved to DB after friend request is accepted — root cause bug
The `friends` column in the relationships table is still an empty array after the friend request accept flow completes. This is likely the root cause of the rail editor bug and the friend-count discrepancy. The `POST /friend-requests/:id/accept` route is probably not writing the friendship record into the relationships table correctly.
Screenshot: `Screenshots/Screenshot 2026-04-25 002117.png`
