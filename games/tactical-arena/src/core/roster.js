const PLAYER_COLORS = Object.freeze({
  1: "#5288c6",
  2: "#c4463f",
  3: "#d8a33f",
  4: "#48a86f",
});

export const FORMATS = Object.freeze({ FFA: "ffa", TEAMS: "teams" });

const FOUR_PLAYER_CORNER_BY_SEAT = Object.freeze({ 1: 0, 2: 2, 3: 1, 4: 3 });

export function createRoster({ playerCount = 2, format = FORMATS.FFA, teamColors = null } = {}) {
  const count = clampPlayerCount(playerCount);
  const teams = format === FORMATS.TEAMS;
  const seenInTeam = new Map();
  const roster = [];

  for (let seat = 1; seat <= count; seat += 1) {
    const team = teams ? (seat % 2 === 1 ? 1 : 2) : seat;
    const indexInTeam = seenInTeam.get(team) ?? 0;
    seenInTeam.set(team, indexInTeam + 1);
    roster.push({
      id: seat,
      team,
      corner: cornerForSeat(seat, count, teams),
      color: teams && teamColors?.[team]
        ? shade(teamColors[team], indexInTeam === 0 ? 1 : 0.66)
        : PLAYER_COLORS[seat],
    });
  }

  return roster;
}

function cornerForSeat(seat, playerCount, teams) {
  if (teams || playerCount === 4) return FOUR_PLAYER_CORNER_BY_SEAT[seat] ?? (seat - 1);
  return seat - 1;
}

export function playerColor(player) {
  return PLAYER_COLORS[player] ?? PLAYER_COLORS[1];
}

function clampPlayerCount(playerCount) {
  const count = Math.floor(Number(playerCount));
  if (!Number.isFinite(count)) return 2;
  return Math.max(2, Math.min(4, count));
}

function shade(hex, factor) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!match || factor === 1) return hex;
  const value = parseInt(match[1], 16);
  const part = (shift) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)))
    .toString(16)
    .padStart(2, "0");
  return `#${part(16)}${part(8)}${part(0)}`;
}
