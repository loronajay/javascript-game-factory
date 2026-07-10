import { UNIT_TYPES, getUnitType } from "../core/unitCatalog.js";
import { colorOf } from "../core/state.js";
import { createPortrait, getPortrait } from "./portraits.js";

const VALID_SIDES = new Set(["left", "right"]);

function findSpeakerUnit(state, line) {
  if (!state?.units?.length) return null;
  if (line.speakerId) return state.units.find((unit) => unit.id === line.speakerId) ?? null;
  if (line.speaker && !UNIT_TYPES[line.speaker]) {
    return state.units.find((unit) => unit.id === line.speaker) ?? null;
  }
  return null;
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
  const speakerUnit = findSpeakerUnit(state, line);
  const type = speakerType(line, speakerUnit);
  const player = line.player ?? speakerUnit?.player ?? null;
  const skin = line.skin ?? speakerUnit?.skin ?? null;
  const name = line.name ?? safeUnitName(type) ?? "Narrator";
  const portrait = type ? getPortrait(type, skin) : null;

  return Object.freeze({
    ...line,
    text: String(line.text ?? ""),
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

    const card = el("section", `dialogue-card is-${line.side}`);
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-live", "polite");
    card.setAttribute("aria-label", `${line.name} dialogue`);
    if (line.player && currentState) card.style.setProperty("--team", colorOf(currentState, line.player));

    const portrait = line.type
      ? createPortrait(line.type, { variant: "is-dialogue", alt: `${line.name} portrait`, eager: true, skin: line.skin })
      : el("figure", "unit-portrait is-dialogue is-glyph-fallback dialogue-narrator", "!");

    const body = el("div", "dialogue-body");
    const heading = el("div", "dialogue-speaker", line.name);
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
    body.append(heading, text, foot);
    card.append(portrait, body);
    host.append(card);
    advance.focus({ preventScroll: true });
  }

  return Object.freeze({ show, hide, next, isOpen });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
