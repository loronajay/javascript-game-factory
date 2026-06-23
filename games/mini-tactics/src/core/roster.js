// Roster construction: turns a mode request (player count + format) into the
// authoritative `players` list carried in match state. Each entry is:
//
//   { id, team, corner, color }
//     id     — player slot 1..N (matches unit.player and command.player)
//     team   — team id; friend/foe is decided by team, never by id
//     corner — board corner index (resolved to coordinates in gameState.js)
//     color  — display hue for this match (assignable per match, never derived
//              from the slot at render time)
//
// This module is pure and headless: no DOM, no RNG. It is the only place that
// decides how seats map to teams and corners, so 2P duel / 3-4P FFA / 2v2 teams
// all flow from one rule set.

import { PLAYER_COLORS } from "../config.js";

export const FORMATS = Object.freeze({ FFA: "ffa", TEAMS: "teams" });

// Teams seat -> corner. Allies share a board diagonal (so the board still reads
// as two opposing sides), while seat order 1,2,3,4 alternates teams for turns:
//   team 1 (odd seats) -> corners 0 & 1   (the (0,max)/(max,0) diagonal)
//   team 2 (even seats) -> corners 2 & 3   (the (0,0)/(max,max) diagonal)
const TEAM_CORNER_BY_SEAT = Object.freeze({ 1: 0, 2: 2, 3: 1, 4: 3 });

export function createRoster({
  playerCount = 2,
  format = FORMATS.FFA,
  teams = null,
  colors = null,
  teamColors = null
} = {}) {
  const count = clampCount(playerCount);
  const isTeams = format === FORMATS.TEAMS;

  // Team play: each team picks one hue (chosen per match in the lobby) and its
  // members are told apart by shade. `seenInTeam` tracks each player's index
  // within their team so the second member is darkened.
  const seenInTeam = new Map();

  const roster = [];
  for (let seat = 1; seat <= count; seat += 1) {
    const team = teams?.[seat] ?? (isTeams ? teamForSeat(seat) : seat);
    const indexInTeam = seenInTeam.get(team) ?? 0;
    seenInTeam.set(team, indexInTeam + 1);

    roster.push({
      id: seat,
      team,
      corner: isTeams ? TEAM_CORNER_BY_SEAT[seat] : seat - 1,
      color: resolveColor({ seat, team, indexInTeam, isTeams, colors, teamColors })
    });
  }
  return roster;
}

// Color precedence: an explicit per-player color wins; otherwise a per-team hue
// (shaded by the member's index) for team play; otherwise the slot default.
function resolveColor({ seat, team, indexInTeam, isTeams, colors, teamColors }) {
  if (colors?.[seat]) return colors[seat];
  if (isTeams && teamColors?.[team]) {
    return shade(teamColors[team], indexInTeam === 0 ? 1 : 0.66);
  }
  return PLAYER_COLORS[seat] ?? PLAYER_COLORS[1];
}

// Multiply an #rrggbb hue toward black. factor 1 = unchanged, < 1 = darker.
function shade(hex, factor) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!match || factor === 1) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)));
  const hexPart = (n) => n.toString(16).padStart(2, "0");
  return `#${hexPart(channel(16))}${hexPart(channel(8))}${hexPart(channel(0))}`;
}

// Odd seats form team 1, even seats team 2. Pairing this with seat-order turns
// means a team never acts twice in a row.
function teamForSeat(seat) {
  return seat % 2 === 1 ? 1 : 2;
}

function clampCount(playerCount) {
  const value = Math.floor(Number(playerCount));
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(4, value));
}
