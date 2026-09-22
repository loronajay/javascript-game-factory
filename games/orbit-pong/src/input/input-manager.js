import { createInputState } from "./input-state.js";

export function createInputManager({ target = window, touchRoot = document } = {}) {
  const state = createInputState();

  const onKeyDown = (event) => {
    if (state.setKey(event.code, true)) event.preventDefault();
  };
  const onKeyUp = (event) => {
    if (state.setKey(event.code, false)) event.preventDefault();
  };
  const onBlur = () => state.clear();

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  const buttons = [...touchRoot.querySelectorAll("[data-touch-player][data-orbit]")];
  for (const button of buttons) {
    const playerIndex = Number(button.dataset.touchPlayer);
    const orbit = Number(button.dataset.orbit);
    const release = (event) => {
      state.releasePointer(event.pointerId);
      button.classList.remove("is-held");
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      state.pressPointer(event.pointerId, playerIndex, orbit);
      button.classList.add("is-held");
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  return {
    commands: state.commands,
    clear: state.clear,
    destroy() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      state.clear();
    },
  };
}
