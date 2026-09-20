// The chat box on screen.
//
// `arcade-room-chat.mts` decides what the chat holds and whether the box is
// open; this puts it in the DOM. The log is patched by entry id rather than
// rebuilt (a line that is already there stays there, a faded one is removed,
// a new one is appended and scrolled to), and the box is a plain text input
// that takes keyboard focus while open and gives it back to the canvas when
// it closes, so the walking keys resume without a click.
//
// Keys reach this through the room's own window listener rather than a
// listener of its own: the room decides whether it is in a state where chat
// makes sense (walking, not building, not inside a cabinet) and then asks the
// view first, so a key the box takes never also moves the player.
export function createRoomChatView(options) {
    const { chat, root, log, input, returnFocusTo } = options;
    const rows = new Map();
    let lastOpen = null;
    let lastVisibleKey = "";
    function rowFor(entry) {
        const row = document.createElement("li");
        row.className = `room-chat__line room-chat__line--${entry.kind}`;
        if (entry.kind === "system") {
            row.textContent = entry.text;
            return row;
        }
        const name = document.createElement("b");
        name.className = "room-chat__name";
        name.textContent = `${entry.displayName}:`;
        const text = document.createElement("span");
        text.className = "room-chat__text";
        text.textContent = entry.text;
        row.append(name, " ", text);
        return row;
    }
    function render() {
        const open = chat.isOpen();
        const visible = chat.visible();
        const key = `${open}|${visible.map((entry) => entry.id).join(",")}`;
        if (key === lastVisibleKey)
            return;
        lastVisibleKey = key;
        const keep = new Set(visible.map((entry) => entry.id));
        for (const [id, row] of rows) {
            if (!keep.has(id)) {
                row.remove();
                rows.delete(id);
            }
        }
        // Walk the visible list in order and append each row in turn: a row already in the log
        // moves to its place, a new one is created there. Opening the box brings faded lines
        // back, and they must land where they were said, not after everything newer.
        let appended = false;
        for (const entry of visible) {
            let row = rows.get(entry.id);
            if (!row) {
                row = rowFor(entry);
                rows.set(entry.id, row);
                appended = true;
            }
            log.append(row);
        }
        root.dataset.open = open ? "true" : "false";
        root.hidden = !open && visible.length === 0;
        if (appended || open !== lastOpen)
            log.scrollTop = log.scrollHeight;
        if (open !== lastOpen) {
            lastOpen = open;
            if (open) {
                input.value = "";
                input.focus();
            }
            else if (document.activeElement === input) {
                input.blur();
                returnFocusTo.focus();
            }
        }
    }
    chat.onChange(render);
    // Clicking back into the room while typing is the same as Escape.
    input.addEventListener("blur", () => { if (chat.isOpen())
        chat.close(); });
    render();
    function handleKey(event) {
        const result = chat.handleKey(event, input.value);
        if (result === null)
            return false;
        // A typing key must still reach the box; Enter and Escape must not reach anything else.
        if (result !== "typing")
            event.preventDefault();
        return true;
    }
    return Object.freeze({ handleKey, tick: render });
}
