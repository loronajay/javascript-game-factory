# Bugs

## Drellgor still on friends rail even though i removed him on the editor: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 012941.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013000.png"

## Friends data still not in database, though it says friend request was accepted and indicates we are friends on the frontend. the frontend is supposed to be populated by actual backend data, how is this possible?: "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013801.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013833.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013846.png" and "C:\Users\leoja\Pictures\Screenshots\Screenshot 2026-04-26 013904.png"
FIXED: Two issues in createFriendshipBetweenPlayers (relationships.mjs):
1. savePlayerMetrics was never called — friend_count and friend_points stayed at 0/{} permanently. Now both players get their metrics synced inside the same transaction after the relationship save.
2. player_profiles.friends was being read from savedLeftRecord.friendPlayerIds (which can come back empty when RETURNING is called on a transaction client). Now uses leftRecord.friendPlayerIds (the pre-save in-memory record, which is always correct at that point). Needs Railway redeploy + fresh friend request to verify DB shows correct values.