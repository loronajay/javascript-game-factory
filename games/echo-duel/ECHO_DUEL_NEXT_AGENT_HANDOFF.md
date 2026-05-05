# Echo Duel Remaining Handoff

Do not redesign the rules. Penalty word behavior is intentionally correct and should not be changed.

This build now includes client-side hardening for stale input rejection, state sync ordering, host/lobby metadata preservation, disconnect cleanup, and deterministic signal playback metadata.

## Canon Rules To Preserve

- 2–6 active players.
- One active pattern driver.
- Pattern starts at 4 inputs.
- Driver adds 2 inputs when the chain grows.
- Pattern cap is 10 inputs.
- Pattern grows only when all active challengers successfully copy it.
- If any challenger fails, failed challengers receive letters and the driver starts a fresh 4-input pattern.
- If the driver fails their own replay, they lose control and receive no letter.
- Challenger copy attempts happen simultaneously.
- Signal playback happens before copy mode.
- During playback, the full signal is shown visually and audibly.
- During copy, the visible signal disappears.

## Remaining Work For Agent

1. Run the full multiplayer QA matrix in browser tabs/devices:
   - 1v1 private lobby start and disconnect.
   - 3-player lobby, one challenger fails and one succeeds.
   - 3-player lobby, all challengers succeed and chain grows.
   - 6-player lobby, elimination and last-player win.
   - Host disconnect during lobby.
   - Host disconnect during active match.
   - Non-host disconnect during `signal_playback` and `challenger_copy`.

2. Audit naming for readability only. Existing behavior should be preserved. Prefer these meanings:
   - `hostId` = state broadcaster / authority client.
   - `lobbyOwnerId` = server lobby owner / start/settings control.
   - `driver` = active pattern driver.

3. Do not add new mechanics, progression, ranking, cosmetics, or server-authoritative gameplay unless explicitly requested.
