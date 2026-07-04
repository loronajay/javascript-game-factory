export function turnAnnouncementSub({ matchMode, player, mySeat, isCpu }) {
  if (matchMode === "hotseat" || matchMode == null) return "Pass the device";
  if (matchMode === "online") return player === mySeat ? "Your turn" : "Opponent's turn";
  if (isCpu) return "CPU turn";
  return "Your turn";
}
