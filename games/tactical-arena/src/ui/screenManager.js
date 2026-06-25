// ScreenManager owns which screen is visible. Exactly one screen is active at a
// time; switching toggles the `.is-active` class the CSS keys off. It knows
// nothing about screen internals — each screen is just an element plus optional
// onEnter/onExit hooks. Ported from Mini-Tactics; intentionally tiny so it stays
// the single seam every screen routes through.
export class ScreenManager {
  constructor() {
    this.screens = new Map();
    this.activeName = null;
  }

  register(name, screen) {
    if (!screen?.el) throw new Error(`Screen "${name}" must provide an element.`);
    this.screens.set(name, screen);
    return this;
  }

  show(name, params) {
    const next = this.screens.get(name);
    if (!next) throw new Error(`Unknown screen: ${name}`);
    if (this.activeName && this.activeName !== name) {
      const prev = this.screens.get(this.activeName);
      prev.el.classList.remove("is-active");
      prev.onExit?.();
    }
    next.el.classList.add("is-active");
    next.onEnter?.(params);
    this.activeName = name;
  }

  get active() {
    return this.activeName;
  }
}
