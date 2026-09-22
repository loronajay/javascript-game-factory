export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, listener) {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
    return () => group.delete(listener);
  }

  emit(type, detail = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(detail);
  }

  clear() {
    this.listeners.clear();
  }
}
