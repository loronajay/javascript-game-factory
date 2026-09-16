const bindings = [
  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS', attack: 'KeyF', dodge: 'KeyG' },
  { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown', attack: 'KeyK', dodge: 'KeyL' },
];

export class InputManager {
  constructor(target = window) {
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.debugPressed = false;
    this.restartPressed = false;
    const captured = new Set([...bindings.flatMap((set) => Object.values(set)), 'F1', 'KeyR']);

    target.addEventListener('keydown', (event) => {
      if (captured.has(event.code)) event.preventDefault();
      if (!event.repeat) {
        this.pressed.add(event.code);
        if (event.code === 'F1') this.debugPressed = true;
        if (event.code === 'KeyR') this.restartPressed = true;
      }
      this.held.add(event.code);
    });
    target.addEventListener('keyup', (event) => {
      if (captured.has(event.code)) event.preventDefault();
      this.held.delete(event.code);
      this.released.add(event.code);
    });
    target.addEventListener('blur', () => this.held.clear());
  }

  player(index) {
    const keys = bindings[index];
    return {
      left: this.held.has(keys.left),
      right: this.held.has(keys.right),
      jump: this.held.has(keys.jump),
      down: this.held.has(keys.down),
      attack: this.held.has(keys.attack),
      dodge: this.held.has(keys.dodge),
      jumpPressed: this.pressed.has(keys.jump),
      jumpReleased: this.released.has(keys.jump),
      attackPressed: this.pressed.has(keys.attack),
      dodgePressed: this.pressed.has(keys.dodge),
    };
  }

  endTick() {
    this.pressed.clear();
    this.released.clear();
    this.debugPressed = false;
    this.restartPressed = false;
  }
}
