import { normalizeJoinCodeInput } from "./online-menu.js";

export const JOIN_CODE_INPUT_ID = "bird-duty-join-code-input";

export function createJoinCodeInput({
  document: doc = globalThis.document,
  onInput = () => {},
  onSubmit = () => {},
  onEscape = () => {},
} = {}) {
  if (!doc?.body) return null;
  const existing = doc.getElementById?.(JOIN_CODE_INPUT_ID);
  if (existing) return existing;

  const input = doc.createElement("input");
  input.id = JOIN_CODE_INPUT_ID;
  input.className = "bird-duty-join-code-input";
  input.type = "text";
  input.inputMode = "text";
  input.maxLength = 6;
  input.autocomplete = "off";
  input.autocapitalize = "characters";
  input.spellcheck = false;
  input.hidden = true;
  input.setAttribute("aria-label", "Room code");

  input.addEventListener("input", () => {
    const normalized = normalizeJoinCodeInput(input.value);
    if (input.value !== normalized) input.value = normalized;
    onInput(normalized);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation?.();
      onSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation?.();
      onEscape();
    }
  });

  doc.body.appendChild(input);
  return input;
}

export function syncJoinCodeInputValue(input, value = "") {
  if (!input) return false;
  const normalized = normalizeJoinCodeInput(value);
  if (input.value !== normalized) input.value = normalized;
  return true;
}

export function setJoinCodeInputActive(input, active, value = "") {
  if (!input) return false;
  syncJoinCodeInputValue(input, value);
  input.hidden = !active;
  input.classList?.toggle?.("is-active", !!active);
  return true;
}

export function focusJoinCodeInput(input) {
  if (!input || input.hidden) return false;
  input.focus?.({ preventScroll: true });
  input.select?.();
  return true;
}
