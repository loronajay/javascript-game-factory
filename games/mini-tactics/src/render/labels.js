// Player/team naming + color for UI surfaces. The reducer's `winner` is a TEAM
// id (which equals the player id in free-for-all), so victory wording and color
// must resolve through the roster rather than assume two players.

import { colorOf } from "../state/gameState.js";

// How a victorious team is named. In team play it is "Team N"; in free-for-all,
// where each player is its own team, it reads as that player.
export function winnerLabel(state, teamId) {
  return state.format === "teams" ? `Team ${teamId}` : `Player ${teamId}`;
}

// The display hue for a team: the full-shade color of its first roster member.
// (Teammates share a hue and differ only by shade, so the first member is the
// canonical team color.) Falls back to treating the id as a player id.
export function teamColor(state, teamId) {
  const lead = state.players?.find((slot) => slot.team === teamId);
  return colorOf(state, lead ? lead.id : teamId);
}
