const CONTROL_KEYS = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  KeyD: "right",
  ArrowLeft: "turnLeft",
  KeyQ: "turnLeft",
  ArrowRight: "turnRight",
  KeyE: "turnRight",
};

export class MatchInput {
  constructor(canvas, controlsRoot = document) {
    this.held = new Set();
    this.lookDegrees = 0;
    this.faceRequested = false;
    this.resetRequested = false;
    this.guardToggleRequested = false;
    this.drag = null;

    window.addEventListener("keydown", (event) => {
      if (CONTROL_KEYS[event.code]) {
        event.preventDefault();
        this.held.add(CONTROL_KEYS[event.code]);
      }
      if (event.code === "KeyF") this.faceRequested = true;
      if (event.code === "KeyR") this.resetRequested = true;
      if (event.code === "KeyG" && !event.repeat) this.guardToggleRequested = true;
    });
    window.addEventListener("keyup", (event) => {
      const control = CONTROL_KEYS[event.code];
      if (control) this.held.delete(control);
    });
    window.addEventListener("blur", () => this.held.clear());

    canvas.addEventListener("pointerdown", (event) => {
      this.drag = { id: event.pointerId, x: event.clientX };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (this.drag?.id !== event.pointerId) return;
      this.lookDegrees += (event.clientX - this.drag.x) * 0.18;
      this.drag.x = event.clientX;
    });
    const endDrag = (event) => {
      if (this.drag?.id === event.pointerId) this.drag = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    for (const button of controlsRoot.querySelectorAll("[data-hold]")) {
      const control = button.dataset.hold;
      const release = () => {
        this.held.delete(control);
        button.classList.remove("active");
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.held.add(control);
        button.classList.add("active");
        button.setPointerCapture(event.pointerId);
      });
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
    }
    controlsRoot.querySelector("[data-action='face']")?.addEventListener("click", () => {
      this.faceRequested = true;
    });
    controlsRoot.querySelector("[data-action='reset']")?.addEventListener("click", () => {
      this.resetRequested = true;
    });
    controlsRoot.querySelector("[data-action='guard']")?.addEventListener("click", () => {
      this.guardToggleRequested = true;
    });
  }

  sample() {
    const result = {
      forward: Number(this.held.has("forward")) - Number(this.held.has("backward")),
      strafe: Number(this.held.has("right")) - Number(this.held.has("left")),
      turn: Number(this.held.has("turnRight")) - Number(this.held.has("turnLeft")),
      lookDegrees: this.lookDegrees,
      faceRequested: this.faceRequested,
      resetRequested: this.resetRequested,
      guardToggleRequested: this.guardToggleRequested,
    };
    this.lookDegrees = 0;
    this.faceRequested = false;
    this.resetRequested = false;
    this.guardToggleRequested = false;
    return result;
  }
}
