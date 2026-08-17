const STYLES = new Set(["spotlight", "champion"]);

export function createMatchEntrance({
  getElement = (id) => document.getElementById(id),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  cosmetics = null,
} = {}) {
  const element = getElement("match-entrance");
  let timer = null;

  function hide() {
    if (element) element.hidden = true;
    timer = null;
  }

  function catchLine(player) {
    const item = cosmetics?.getItem?.(player?.presentation?.catchLineId);
    return item?.type === "catch-line" && typeof item.assets?.text === "string"
      ? item.assets.text.trim()
      : "";
  }

  function show(player, onDone = hide) {
    const id = player?.presentation?.entranceId;
    const style = typeof id === "string" && id.startsWith("entrance:") ? id.slice(9) : "";
    const line = catchLine(player);
    const hasEntrance = STYLES.has(style);
    if (!element || (!hasEntrance && !line)) return false;
    const name = player?.name || "Bowler";
    element.className = `match-entrance${hasEntrance ? ` is-${style}` : ""}`;
    element.textContent = hasEntrance
      ? `${name} enters the lane${line ? ` — “${line}”` : ""}`
      : `${name} — “${line}”`;
    element.hidden = false;
    if (timer != null) clearTimer?.(timer);
    timer = setTimer?.(onDone, 1800) ?? null;
    return true;
  }

  function showAll(players) {
    const queue = Array.isArray(players) ? players.slice() : [];
    function next() {
      const player = queue.shift();
      if (!player) return hide();
      if (!show(player, next)) next();
    }
    if (!queue.length) return false;
    next();
    return !element?.hidden;
  }

  return { hide, show, showAll };
}
