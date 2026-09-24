export function createMatchEndView(mode, winnerName) {
  const online = mode === "online";
  return {
    eyebrow: "Match complete",
    title: `${winnerName || "Player"} wins`,
    primaryLabel: online ? "Find Another Match" : "Play Again",
    primaryAction: online ? "find-another-match" : "rematch",
  };
}
