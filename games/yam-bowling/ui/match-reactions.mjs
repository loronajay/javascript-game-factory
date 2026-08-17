const DISPLAY_MS = 2400;

// The two wheels the match HUD paints, in order. `kind` is the reward type, so
// it is the same string the loadout, the wire and the server all index by; a
// third wheel is a row here and nothing else in this module changes.
const WHEELS = Object.freeze([
  Object.freeze({ kind: "emote", listId: "match-emote-wheel", label: "Emotes", key: "" }),
  Object.freeze({ kind: "catch-line", listId: "match-catch-line-wheel", label: "Catch lines", key: "Shift" }),
]);

const WHEEL_SIZE = 4;

export function createMatchReactions({
  session,
  onlineClient,
  loadout,
  cosmetics,
  getElement = (id) => document.getElementById(id),
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let lastEventKey = "";
  let hideTimer = null;
  let renderedFor = "";
  const tray = getElement("match-reaction-tray");
  const bubble = getElement("match-reaction-bubble");
  const art = getElement("match-reaction-art");
  const text = getElement("match-reaction-text");
  const sender = getElement("match-reaction-sender");

  function canSend() {
    return Boolean(session?.onlineMatch && session?.match?.status === "playing");
  }

  // A reaction is only ever sent by slot. The id under the button is for the
  // picture and the tooltip; it is never what travels, because the server
  // resolves the slot against the wheel it froze at match start.
  function send(kind, slot) {
    if (!canSend()) return false;
    return onlineClient?.sendReaction?.(kind, slot) === true;
  }

  function itemFor(kind, slot) {
    const wheel = loadout?.getReactionWheel?.(kind) || [];
    const item = cosmetics?.getItem?.(wheel[slot]);
    return item?.type === kind ? item : null;
  }

  function buttonMarkup(wheel, slot) {
    const item = itemFor(wheel.kind, slot);
    const name = item?.name || `Slot ${slot + 1}`;
    const shortcut = `${wheel.key ? `${wheel.key}+` : ""}${slot + 1}`;
    const face = wheel.kind === "emote"
      ? `<img src="${escapeText(item?.assets?.art || "")}" alt="" decoding="async" />`
      : `<span>${escapeText(item?.assets?.text || name)}</span>`;
    return `<button class="reaction-chip reaction-chip--${wheel.kind}" type="button"
      data-reaction-kind="${wheel.kind}" data-reaction-slot="${slot}"
      title="${escapeText(name)} (${shortcut})" aria-label="${escapeText(name)}, shortcut ${shortcut}">${face}</button>`;
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  // Rebuilt whenever the equipped wheels change, so re-equipping between matches
  // is visible without a reload — the same reason the splash picker rebuilds its
  // owned cards each time it opens.
  function render() {
    const signature = WHEELS
      .map((wheel) => (loadout?.getReactionWheel?.(wheel.kind) || []).join("|"))
      .join("//");
    if (signature === renderedFor) return;
    renderedFor = signature;
    for (const wheel of WHEELS) {
      const list = getElement(wheel.listId);
      if (!list) continue;
      list.innerHTML = Array.from({ length: WHEEL_SIZE }, (_unused, slot) => buttonMarkup(wheel, slot)).join("");
    }
  }

  function refresh() {
    if (tray) tray.hidden = !session?.onlineMatch;
    if (session?.onlineMatch) render();
    for (const wheel of WHEELS) {
      const list = getElement(wheel.listId);
      for (const button of list?.querySelectorAll?.("button") || []) button.disabled = !canSend();
    }
  }

  function hide() {
    if (bubble) bubble.hidden = true;
    hideTimer = null;
  }

  // The server sends a resolved item id, so the kind is read off its prefix and
  // the catalog decides whether it is a picture or a sentence. An id this build
  // does not know is dropped rather than drawn empty.
  function handle(event) {
    const reactionId = typeof event?.reactionId === "string" ? event.reactionId : "";
    const sequence = Number(event?.sequence);
    const senderClientId = typeof event?.senderClientId === "string" ? event.senderClientId : "";
    const item = cosmetics?.getItem?.(reactionId);
    const kind = WHEELS.find((wheel) => wheel.kind === item?.type)?.kind || "";
    if (!senderClientId || !kind || !Number.isInteger(sequence) || sequence < 1) return false;
    const key = `${senderClientId}:${sequence}`;
    if (key === lastEventKey) return false;
    lastEventKey = key;

    const isEmote = kind === "emote";
    if (art) {
      art.hidden = !isEmote;
      if (isEmote) {
        art.src = item.assets?.art || "";
        art.alt = item.assets?.alt || `${item.name} emote`;
      }
    }
    if (text) {
      text.hidden = isEmote;
      text.textContent = isEmote ? "" : item.assets?.text || item.name || "";
    }
    if (sender) {
      sender.textContent = session?.match?.players?.find?.((player) => player.id === senderClientId)?.name || "Bowler";
    }
    if (bubble) {
      bubble.hidden = false;
      bubble.dataset.reactionKind = kind;
    }
    if (hideTimer != null) clearTimer?.(hideTimer);
    hideTimer = setTimer?.(hide, DISPLAY_MS) ?? null;
    return true;
  }

  // Delegated, because the chips are rebuilt whenever the wheels change and a
  // listener per button would have to be rebound with them.
  function bind() {
    tray?.addEventListener?.("click", (event) => {
      const button = event?.target?.closest?.("[data-reaction-kind]");
      if (!button) return;
      send(button.dataset.reactionKind, Number(button.dataset.reactionSlot));
    });
    refresh();
  }

  // Digits pick an emote and Shift+digit picks a catch line, which is why the
  // event's `code` is read rather than its `key`: Shift+1 is not "1".
  function handleKey(event) {
    if (!canSend()) return false;
    const slot = WHEELS.length && /^Digit[1-4]$/.test(event?.code || "")
      ? Number(event.code.slice(-1)) - 1
      : -1;
    if (slot < 0) return false;
    return send(event.shiftKey ? "catch-line" : "emote", slot);
  }

  return { bind, handle, handleKey, hide, refresh, render, send };
}
