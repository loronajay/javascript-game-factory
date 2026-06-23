// ScreenManager owns which screen is visible. Exactly one screen is active at a
// time; switching toggles the `.is-active` class the CSS keys off (styles/menus.css
// + layout.css). It knows nothing about screen internals — each screen is a small
// object with an `el` plus optional `onEnter(params)` / `onExit()` lifecycle hooks.
//
// This is intentionally tiny: it is the single seam every screen routes through,
// so adding Single Player, Online, Lobby, Settings, etc. later is just another
// register() call, never a change to the navigation core.

export class ScreenManager {
  constructor() {
    this.screens = new Map();
    this.activeName = null;
  }

  // screen: { el: HTMLElement, onEnter?(params), onExit?() }
  register(name, screen) {
    if (!screen?.el) {
      throw new Error(`Screen "${name}" must provide an element.`);
    }
    this.screens.set(name, screen);
    return this;
  }

  show(name, params) {
    const next = this.screens.get(name);
    if (!next) {
      throw new Error(`Unknown screen: ${name}`);
    }

    if (this.activeName && this.activeName !== name) {
      const prev = this.screens.get(this.activeName);
      prev.el.classList.remove("is-active");
      prev.onExit?.();
    }

    next.el.classList.add("is-active");
    next.onEnter?.(params);
    this.activeName = name;
  }
}
