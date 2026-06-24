// Player/team naming + color for UI surfaces. The reducer's `winner` is a TEAM
// id (which equals the player id in free-for-all), so victory wording and color
// must resolve through the roster rather than assume two players.

import { colorOf } from "../state/gameState.js";
import { UNIT_TYPES } from "../config.js";

// Display name for a single unit. Reads the ordinal straight off the id: a
// duplicated type spawns as `p1-ranger-2` and reads "Ranger 2", while a unique
// type keeps its bare id (`p1-tank`) and reads just "Tank". Single source of
// truth so the dossier card and squad chips name a unit identically.
export function unitLabel(unit) {
  const name = UNIT_TYPES[unit.type]?.name ?? unit.type;
  const ordinal = /-(\d+)$/.exec(unit.id);
  return ordinal ? `${name} ${ordinal[1]}` : name;
}

// Display name for a team. A custom lobby-entered name wins; otherwise it is
// "Team N" in team play or "Player N" in free-for-all (where each player is its
// own team). Single source of truth for team naming across every UI surface.
export function teamLabel(state, teamId) {
  const custom = state.teamNames?.[teamId];
  if (custom) return custom;
  return state.format === "teams" ? `Team ${teamId}` : `Player ${teamId}`;
}

// How a victorious team is named — the same naming as everywhere else.
export function winnerLabel(state, teamId) {
  return teamLabel(state, teamId);
}

// The display hue for a team: the full-shade color of its first roster member.
// (Teammates share a hue and differ only by shade, so the first member is the
// canonical team color.) Falls back to treating the id as a player id.
export function teamColor(state, teamId) {
  const lead = state.players?.find((slot) => slot.team === teamId);
  return colorOf(state, lead ? lead.id : teamId);
}
