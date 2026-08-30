// Minimal DOM and event transport for exercising the real menu/online controllers without WebGL.
function element() {
  const listeners = new Map();
  return {
    textContent: '', dataset: {}, children: [], attributes: {}, firstChild: { textContent: '' },
    classList: {
      set: new Set(), add(n) { this.set.add(n); }, remove(n) { this.set.delete(n); },
      contains(n) { return this.set.has(n); },
      toggle(n, on) { if (on ?? !this.set.has(n)) this.set.add(n); else this.set.delete(n); },
    },
    addEventListener(name, handler) { listeners.set(name, [...(listeners.get(name) || []), handler]); },
    fire(name, event = {}) { for (const handler of listeners.get(name) || []) handler(event); },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; }, focus() {},
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      return selector === '.mapCard' ? all.filter(child => child.className?.split(' ').includes('mapCard')) : all;
    },
    querySelector(selector) {
      if (!this.queries) this.queries = new Map();
      if (!this.queries.has(selector)) this.queries.set(selector, element());
      return this.queries.get(selector);
    },
  };
}
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function environment() {
  const elements = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, createElementNS: element, body: element(),
  };
  let reloads = 0;
  const timers = new Map(); let timerId = 0;
  const window = Object.assign(element(), {
    location: { hostname: 'localhost', search: '', href: 'http://localhost/games/hide-and-seek/', reload() { reloads++; } },
    localStorage: storage(), sessionStorage: storage(),
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent(event) { this.fire(event.type, event); },
  });
  return { elements, document, window, timers, get reloads() { return reloads; } };
}
module.exports = { element, environment };
