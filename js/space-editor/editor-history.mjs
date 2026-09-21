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
export const DEFAULT_UNDO_DEPTH = 40;
export function createEditHistory(options) {
    const depth = Math.max(1, options.depth ?? DEFAULT_UNDO_DEPTH);
    const { equal } = options;
    const stack = [];
    let open = false;
    function push(before) {
        stack.push(before);
        if (stack.length > depth)
            stack.shift();
    }
    return Object.freeze({
        record: (before) => push(before),
        open(before) {
            if (open)
                return;
            open = true;
            push(before);
        },
        isOpen: () => open,
        close(final) {
            if (!open)
                return false;
            open = false;
            const before = stack[stack.length - 1];
            if (before !== undefined && equal(before, final)) {
                stack.pop();
                return false;
            }
            return true;
        },
        undo() {
            if (open)
                return undefined;
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
