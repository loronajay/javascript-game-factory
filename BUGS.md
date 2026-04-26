# Bugs

## Drellgor still on friends rail even though i removed him on the editor: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 012941.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013000.png"
FIXED: Three issues:
1. Race condition — post-save rerender in arcade-me-wire.mjs was calling rerender("", true) (shouldHydrate=true), which fetched stale relationships from the API before Railway had processed the save, then overwrote fresh localStorage with old data. Changed to rerender() (no hydration) so the post-save render reads straight from localStorage.
2. playerId now flows through createFriendCardItem so the view knows which player each card represents.
3. Friend cards are now anchor tags linking to /player/index.html?id=<playerId>; placeholders stay as article elements. Default cloud image used when no avatarSrc.

## Friends data still not in database, though it says friend request was accepted and indicates we are friends on the frontend. the frontend is supposed to be populated by actual backend data, how is this possible?: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013801.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013833.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013846.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013904.png"
FIXED: Two issues in createFriendshipBetweenPlayers (relationships.mjs):
1. savePlayerMetrics was never called — friend_count and friend_points stayed at 0/{} permanently. Now both players get their metrics synced inside the same transaction after the relationship save.
2. player_profiles.friends was being read from savedLeftRecord.friendPlayerIds (which can come back empty when RETURNING is called on a transaction client). Now uses leftRecord.friendPlayerIds (the pre-save in-memory record, which is always correct at that point). Needs Railway redeploy + fresh friend request to verify DB shows correct values.

## Unfriend not working — Drellgor still shows in friend rail editor dropdown and Unfriend button still appears on his player page after navigating away and back
FIXED: Three issues:
1. friendsPreview and mainSqueeze in the factory profile (localStorage) were never cleaned after unfriend — now explicitly filters targetPlayerId out of friendsPreview and clears mainSqueeze if it matched, then saves the updated profile (arcade-player-wire.mjs).
2. The frontend removeFriendBetweenPlayers never called mirrorPairRecordsToApi — so the API's player_relationships record still had Drellgor in friendPlayerIds. When /me loaded, hydrateArcadeProfileFromApi fetched that stale API record and overwrote localStorage, restoring the friendship on every page revisit. Fixed by adding mirrorPairRecordsToApi after savePairRecords in removeFriendBetweenPlayers (relationships.mjs) — same pattern as createFriendshipBetweenPlayers.
3. The apiClient.removeFriend call in the unfriend handler was using currentProfile.playerId (localStorage identity) instead of authSession.playerId (JWT identity), causing a 403 from the backend auth check. Fixed to use authSession.playerId.