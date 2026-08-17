const DISPLAY_MS = 2400;

export function createMatchEmotes({
  session,
  onlineClient,
  emoteCore,
  getElement = (id) => document.getElementById(id),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let lastEventKey = "";
  let hideTimer = null;
  const button = getElement("match-emote-button");
  const bubble = getElement("match-emote-bubble");
  const art = getElement("match-emote-art");
  const sender = getElement("match-emote-sender");

  function canSend() {
    return Boolean(session?.onlineMatch && session?.match?.status === "playing");
  }

  function refresh() {
    if (button) {
      button.hidden = !session?.onlineMatch;
      button.disabled = !canSend();
    }
  }

  function send() {
    if (!canSend()) return false;
    onlineClient?.sendEmote?.();
    return true;
  }

  function hide() {
    if (bubble) bubble.hidden = true;
    hideTimer = null;
  }

  function handle(event) {
    const emoteId = typeof event?.emoteId === "string" ? event.emoteId : "";
    const slug = emoteId.startsWith("emote:") ? emoteId.slice("emote:".length) : "";
    const sequence = Number(event?.sequence);
    const senderClientId = typeof event?.senderClientId === "string" ? event.senderClientId : "";
    if (!senderClientId || !Number.isInteger(sequence) || sequence < 1 || !emoteCore?.isEmoteSlug?.(slug)) return false;
    const key = `${senderClientId}:${sequence}`;
    if (key === lastEventKey) return false;
    lastEventKey = key;
    const emote = emoteCore.getEmote(slug);
    if (art) {
      art.src = emote.src;
      art.alt = emote.alt;
    }
    if (sender) {
      sender.textContent = session?.match?.players?.find?.((player) => player.id === senderClientId)?.name || "Bowler";
    }
    if (bubble) bubble.hidden = false;
    if (hideTimer != null) clearTimer?.(hideTimer);
    hideTimer = setTimer?.(hide, DISPLAY_MS) ?? null;
    return true;
  }

  function bind() {
    button?.addEventListener?.("click", send);
    refresh();
  }

  return { bind, handle, hide, refresh, send };
}
