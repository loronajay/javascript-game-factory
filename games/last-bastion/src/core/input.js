export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.pointer = { x: 0, y: 0, down: false, justPressed: false, justReleased: false };
    this.onPress = null;
    this.onMove = null;

    canvas.addEventListener('pointerdown', (event) => this.handleDown(event));
    canvas.addEventListener('pointermove', (event) => this.handleMove(event));
    canvas.addEventListener('pointerup', (event) => this.handleUp(event));
    canvas.addEventListener('pointercancel', (event) => this.handleUp(event));
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  position(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  handleDown(event) {
    event.preventDefault();
    this.canvas.setPointerCapture?.(event.pointerId);
    Object.assign(this.pointer, this.position(event), { down: true, justPressed: true });
    this.onPress?.(this.pointer);
  }

  handleMove(event) {
    Object.assign(this.pointer, this.position(event));
    this.onMove?.(this.pointer);
  }

  handleUp(event) {
    event.preventDefault();
    Object.assign(this.pointer, this.position(event), { down: false, justReleased: true });
  }

  endFrame() {
    this.pointer.justPressed = false;
    this.pointer.justReleased = false;
  }
}
