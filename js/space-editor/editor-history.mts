// Undo for a build mode: a bounded stack of layouts and the one rule every
// editor gesture follows.
//
// Pure — no DOM, no THREE — and generic over the layout document, so the
// arcade room and the farm share it without either knowing the other's shape.
//
// A GESTURE IS ONE UNDO STEP. A drag, a colour-pad drag, a handle stretch and
// a run of wheel notches are each many previews and one commit: the layout
// before the first preview is remembered ONCE (`open`), every preview
// replaces the working layout without touching the stack, and the commit
// closes the gesture (`close`) — dropping the remembered step again when the
// gesture ended up changing nothing, so Ctrl+Z never "undoes" a no-op. A
// single-shot change (a button, a key) goes straight through `record`.
//
// The editor still owns the working layout; this only owns what came before.

export type EditHistoryOptions<T> = Readonly<{
  /** How many steps back a player can go; the oldest fall off the bottom. */
  depth?: number;
  /** Structural equality for the document, used to drop no-op steps. */
  equal: (first: T, second: T) => boolean;
}>;

export type EditHistory<T> = Readonly<{
  /** Remember `before` as the step a single-shot change is undone to. */
  record: (before: T) => void;
  /** Begin a many-preview gesture from `before`; a second call while open is ignored. */
  open: (before: T) => void;
  isOpen: () => boolean;
  /**
   * End the gesture with the layout it settled on. The remembered step is kept
   * only when `final` differs from it. Returns whether a step was kept.
   */
  close: (final: T) => boolean;
  /** The layout to go back to, or undefined when there is nothing to undo (or a gesture is open). */
  undo: () => T | undefined;
  canUndo: () => boolean;
  size: () => number;
  clear: () => void;
}>;

export const DEFAULT_UNDO_DEPTH = 40;

export function createEditHistory<T>(options: EditHistoryOptions<T>): EditHistory<T> {
  const depth = Math.max(1, options.depth ?? DEFAULT_UNDO_DEPTH);
  const { equal } = options;
  const stack: T[] = [];
  let open = false;

  function push(before: T): void {
    stack.push(before);
    if (stack.length > depth) stack.shift();
  }

  return Object.freeze({
    record: (before) => push(before),
    open(before) {
      if (open) return;
      open = true;
      push(before);
    },
    isOpen: () => open,
    close(final) {
      if (!open) return false;
      open = false;
      const before = stack[stack.length - 1];
      if (before !== undefined && equal(before, final)) {
        stack.pop();
        return false;
      }
      return true;
    },
    undo() {
      if (open) return undefined;
      return stack.pop();
    },
    canUndo: () => !open && stack.length > 0,
    size: () => stack.length,
    clear() {
      stack.length = 0;
      open = false;
    },
  });
}
