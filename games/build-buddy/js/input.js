import { VIEW_MODES } from './view-modes.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;
    this.listeners = [];
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, rightDown: false, justClicked: false, justRightClicked: false };
    this.taps = new Set();
    this.selectedTool = 'platform';
    this.viewModeRequest = null;

    this.listen(window, 'keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Digit1') this.selectedTool = 'platform';
      if (e.code === 'Digit2') this.selectedTool = 'springYellow';
      if (e.code === 'Digit3') this.selectedTool = 'springGreen';
      if (e.code === 'Digit4') this.selectedTool = 'springBlue';
      if (e.code === 'Digit5') this.selectedTool = 'checkpoint';
      if (e.code === 'Digit6') this.viewModeRequest = VIEW_MODES.RUNNER;
      if (e.code === 'Digit7') this.viewModeRequest = VIEW_MODES.BUILDER;
      if (e.code === 'Digit8') this.viewModeRequest = VIEW_MODES.HYBRID;
    });

    this.listen(window, 'keyup', (e) => this.keys.delete(e.code));

    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(canvas, 'pointermove', (e) => this.updatePointer(e));
    this.listen(canvas, 'pointerdown', (e) => {
      this.updatePointer(e);
      if (e.button === 2) {
        this.mouse.rightDown = true;
        this.mouse.justRightClicked = true;
      } else {
        this.mouse.down = true;
        this.mouse.justClicked = true;
      }
      canvas.setPointerCapture?.(e.pointerId);
    });
    this.listen(canvas, 'pointerup', (e) => {
      this.updatePointer(e);
      if (e.button === 2) this.mouse.rightDown = false;
      else this.mouse.down = false;
    });

    this.bindMobileButtons();
  }

  listen(target, type, handler) {
    const listener = (event) => { if (this.enabled) handler(event); };
    target.addEventListener(type, listener);
    this.listeners.push(() => target.removeEventListener?.(type, listener));
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.keys.clear();
    this.taps.clear();
    this.mouse.down = false;
    this.mouse.rightDown = false;
    this.viewModeRequest = null;
    this.endFrame();
    for (const button of document.querySelectorAll('[data-hold]')) button.classList.remove('is-held');
  }

  dispose() {
    this.setEnabled(false);
    for (const remove of this.listeners) remove();
    this.listeners = [];
  }

  updatePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    this.mouse.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
  }

  bindMobileButtons() {
    for (const btn of document.querySelectorAll('[data-hold]')) {
      const key = btn.dataset.hold;
      const on = (e) => { e.preventDefault(); this.keys.add(`mobile:${key}`); btn.classList.add('is-held'); };
      const off = (e) => { e.preventDefault(); this.keys.delete(`mobile:${key}`); btn.classList.remove('is-held'); };
      this.listen(btn, 'pointerdown', on);
      this.listen(btn, 'pointerup', off);
      this.listen(btn, 'pointercancel', off);
      this.listen(btn, 'pointerleave', off);
    }

    for (const btn of document.querySelectorAll('[data-tap]')) {
      this.listen(btn, 'pointerdown', (e) => {
        e.preventDefault();
        this.taps.add(btn.dataset.tap);
      });
    }

    for (const btn of document.querySelectorAll('[data-tool]')) {
      this.listen(btn, 'pointerdown', (e) => {
        e.preventDefault();
        this.selectedTool = btn.dataset.tool;
      });
    }

    for (const btn of document.querySelectorAll('[data-view-mode]')) {
      this.listen(btn, 'pointerdown', (e) => {
        e.preventDefault();
        this.viewModeRequest = btn.dataset.viewMode;
      });
    }
  }

  axisX() {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.keys.has('mobile:left');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.keys.has('mobile:right');
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  upHeld() {
    return this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.keys.has('mobile:up');
  }

  downHeld() {
    return this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.keys.has('mobile:down');
  }

  jumpHeld() {
    return this.keys.has('Space') || this.taps.has('jumpHold');
  }

  consumeJumpPressed() {
    if (this.keys.has('Space') && !this.prevSpace) return true;
    if (this.keys.has('KeyW') && !this.prevW && !this.upHeld()) return true;
    if (this.taps.has('jump')) return true;
    return false;
  }

  consumeViewModeRequest() {
    const mode = this.viewModeRequest;
    this.viewModeRequest = null;
    return mode;
  }

  consumeReposition() {
    if (this.keys.has('KeyR') && !this.prevR) return true;
    if (this.taps.has('reposition')) return true;
    return false;
  }

  consumePlace() {
    if (this.mouse.justClicked) return true;
    if (this.taps.has('place')) return true;
    return false;
  }

  consumeDelete() {
    if (this.mouse.justRightClicked) return true;
    if (this.keys.has('Delete') && !this.prevDelete) return true;
    if (this.taps.has('delete')) return true;
    return false;
  }

  cameraNudgeX() {
    return (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
  }

  endFrame() {
    this.prevSpace = this.keys.has('Space');
    this.prevW = this.keys.has('KeyW');
    this.prevR = this.keys.has('KeyR');
    this.prevDelete = this.keys.has('Delete');
    this.mouse.justClicked = false;
    this.mouse.justRightClicked = false;
    this.taps.clear();
  }
}
