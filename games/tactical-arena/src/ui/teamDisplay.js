export function teamForSeat(seat, format = "ffa") {
  const normalizedSeat = Number(seat) || 1;
  return format === "teams" ? (normalizedSeat % 2 === 1 ? 1 : 2) : normalizedSeat;
}

export function teamGroupsForSetup(playerCount = 2, format = "ffa") {
  const count = Math.max(2, Math.min(4, Math.floor(Number(playerCount)) || 2));
  if (format !== "teams" || count !== 4) {
    return Array.from({ length: count }, (_, index) => ({
      team: index + 1,
      seats: [index + 1],
    }));
  }
  return [
    { team: 1, seats: [1, 3] },
    { team: 2, seats: [2, 4] },
  ];
}

export function teamPairingSummary(playerCount = 2, format = "ffa") {
  const groups = teamGroupsForSetup(playerCount, format);
  if (format !== "teams" || groups.length !== 2) return "";
  return `Teams: ${playerSeatListLabel(groups[0].seats)} vs ${playerSeatListLabel(groups[1].seats)}.`;
}

export function playerSeatListLabel(seats = []) {
  const labels = seats.map((seat) => `Player ${seat}`);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" + ");
  return `${labels.slice(0, -1).join(", ")} + ${labels.at(-1)}`;
}

export function shouldSyncHotSeatSetupForSegment(seg) {
  return Boolean(
    seg?.closest?.('[data-screen="hsSetup"]') &&
    (seg.closest('[data-field="playerCount"]') || seg.closest('[data-field="format"]'))
  );
}
