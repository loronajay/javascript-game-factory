import { UNIT_TYPES, getUnitType } from "../core/unitCatalog.js";
import { colorOf } from "../core/state.js";
import { createPortrait, getPortrait } from "./portraits.js";
import { getNicknamePref } from "./nicknameModel.js";
import { el } from "./domHelpers.js";

const VALID_SIDES = new Set(["left", "right"]);

function findSpeakerUnit(state, line) {
  if (!state?.units?.length) return null;
  if (line.speakerId) return state.units.find((unit) => unit.id === line.speakerId) ?? null;
  if (!line.speaker) return null;
  if (!UNIT_TYPES[line.speaker]) {
    return state.units.find((unit) => unit.id === line.speaker) ?? null;
  }
  // A bare unit-type speaker (no id) still needs to resolve to a real unit so it
  // picks up that unit's nickname exactly like a speakerId line does — otherwise
  // the same character flips between its nickname and its base type name across
  // dialogue boxes depending on which shorthand a given line happened to use.
  // Scoped to a specific player (defaulting to the human party, player 1) so a
  // same-typed enemy can never resolve to — and borrow — the local player's
  // nickname preference.
  const type = line.speaker;
  const player = line.player ?? 1;
  return (
    state.units.find((unit) => unit.type === type && unit.player === player && unit.hp > 0) ??
    state.units.find((unit) => unit.type === type && unit.player === player) ??
    null
  );
}

function speakerType(line, speakerUnit) {
  return line.type ?? line.unitType ?? speakerUnit?.type ?? (UNIT_TYPES[line.speaker] ? line.speaker : null);
}

function safeUnitName(type) {
  if (!type) return null;
  try {
    return getUnitType(type).name;
  } catch {
    return null;
  }
}

function normalizeSide(side, player) {
  if (VALID_SIDES.has(side)) return side;
  return player === 2 ? "right" : "left";
}

export function normalizeDialogueLine(line = {}, state = null, index = 0, total = 1) {
  const hasPresentedSpeaker = Boolean(line.speakerId || line.speaker || line.type || line.unitType || line.name);
  const narration = line.narration === true || !hasPresentedSpeaker;
  const speakerUnit = findSpeakerUnit(state, line);
  const type = speakerType(line, speakerUnit);
  const player = line.player ?? speakerUnit?.player ?? null;
  const skin = line.skin ?? speakerUnit?.skin ?? null;
  // The saved nickname is the device owner's personal label for their OWN units
  // (player 1). A live unit's nickname always wins, but overworld cutscenes play with
  // no live match units to read (getState is stale/empty), so a player-side speaker
  // (player 1, or unspecified — which defaults to the local player) falls back to the
  // saved preference. This is what makes "my Swordsman" still speak under the nickname I
  // set on the map. Enemy lines (player 2) never take this fallback, so a rival Swordsman
  // keeps its base name.
  const isLocalSpeaker = player == null || player === 1;
  const nickname =
    line.nickname ??
    speakerUnit?.nickname ??
    (isLocalSpeaker && type ? getNicknamePref(type) : null);
  const name = narration ? "" : (line.name ?? nickname ?? safeUnitName(type) ?? "Narrator");
  const portrait = !narration && type ? getPortrait(type, skin) : null;

  return Object.freeze({
    ...line,
    text: String(line.text ?? ""),
    narration,
    name,
    type,
    player,
    skin,
    side: normalizeSide(line.side, player),
    portrait,
    progress: Object.freeze({ index, current: index + 1, total })
  });
}

export function normalizeDialogueScript(lines = [], state = null) {
  const script = Array.isArray(lines) ? lines : [lines];
  return script.map((line, index) => normalizeDialogueLine(line, state, index, script.length));
}

export function createDialogueSystem(host, { getState = () => null, onOpen = () => {}, onClose = () => {}, onLineAction = () => {} } = {}) {
  if (!host) throw new Error("createDialogueSystem requires a host element");

  let lines = [];
  let index = 0;
  let open = false;
  let advancing = false;
  let resolveCurrent = null;

  host.classList.add("dialogue-layer");
  host.hidden = true;

  function isOpen() {
    return open;
  }

  function show(script, { startIndex = 0 } = {}) {
    lines = normalizeDialogueScript(script, getState());
    index = Math.max(0, Math.min(startIndex, Math.max(0, lines.length - 1)));
    open = lines.length > 0;
    if (!open) {
      host.hidden = true;
      host.replaceChildren();
      return Promise.resolve();
    }
    render();
    host.hidden = false;
    onOpen();
    document.addEventListener("keydown", onKey);
    return new Promise((resolve) => { resolveCurrent = resolve; });
  }

  function hide({ completed = false } = {}) {
    if (!open) return;
    open = false;
    advancing = false;
    host.hidden = true;
    host.replaceChildren();
    document.removeEventListener("keydown", onKey);
    const resolve = resolveCurrent;
    resolveCurrent = null;
    onClose({ completed });
    if (resolve) resolve({ completed, index });
  }

  async function next() {
    if (!open || advancing) return;
    advancing = true;
    try {
      const line = lines[index];
      if (line?.afterAction) {
        await onLineAction(line.afterAction, line);
        if (!open) {
          advancing = false;
          return;
        }
      }
      if (index >= lines.length - 1) {
        advancing = false;
        hide({ completed: true });
        return;
      }
      index += 1;
      advancing = false;
      render();
    } catch (error) {
      advancing = false;
      throw error;
    }
  }

  function onKey(event) {
    if (!open || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide({ completed: false });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void next();
    }
  }

  function render() {
    const line = lines[index];
    const currentState = getState();
    host.replaceChildren();
    host.classList.toggle("is-left", line.side === "left");
    host.classList.toggle("is-right", line.side === "right");

    const card = el("section", `dialogue-card is-${line.side}${line.narration ? " is-narration" : ""}`);
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-live", "polite");
    card.setAttribute("aria-label", line.narration ? "Story beat" : `${line.name} dialogue`);
    if (line.player && currentState) card.style.setProperty("--team", colorOf(currentState, line.player));

    const portrait = line.narration
      ? null
      : line.type
        ? createPortrait(line.type, { variant: "is-dialogue", alt: `${line.name} portrait`, eager: true, skin: line.skin })
        : el("figure", "unit-portrait is-dialogue is-glyph-fallback dialogue-narrator", "!");

    const body = el("div", "dialogue-body");
    const text = el("p", "dialogue-text", line.text);
    const foot = el("footer", "dialogue-foot");
    const count = el("span", "dialogue-count", `${line.progress.current}/${line.progress.total}`);
    const controls = el("span", "dialogue-controls");
    const skip = el("button", "dialogue-btn ghost", "Skip");
    const advance = el("button", "dialogue-btn", index >= lines.length - 1 ? "Done" : "Next");

    skip.type = "button";
    advance.type = "button";
    skip.addEventListener("click", () => hide({ completed: false }));
    advance.addEventListener("click", () => { void next(); });
    controls.append(skip, advance);
    foot.append(count, controls);
    if (!line.narration) body.append(el("div", "dialogue-speaker", line.name));
    body.append(text, foot);
    if (portrait) card.append(portrait);
    card.append(body);
    host.append(card);
    advance.focus({ preventScroll: true });
  }

  return Object.freeze({ show, hide, next, isOpen });
}
