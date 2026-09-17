// The overlay an interactive decor item opens: a page in a framed card over the room.
//
// The room hands it a definition and nothing else. The page is the item's own (the
// calendar's viewer, say) and this module never learns what is in it — it loads the
// URL, shows the card, and unloads the frame on close so nothing keeps running behind
// the room. Unlike a cabinet, the page is not projected onto the object: a wall
// calendar is a hand-sized thing, and flipping through it wants the whole screen.

import type { DecorDefinition } from "./arcade-room-catalog/decor.mjs";

export type DecorOverlayElements = Readonly<{
  layer: HTMLElement;
  frame: HTMLIFrameElement;
  title: HTMLElement;
  closeButton: HTMLButtonElement;
}>;

export type DecorOverlayOptions = Readonly<{
  elements: DecorOverlayElements;
  /** The room page's own href; interaction URLs in the catalog are relative to it. */
  roomHref: string;
  onOpen?: (definition: DecorDefinition) => void;
  onClose?: () => void;
}>;

export type DecorOverlay = Readonly<{
  open: (definition: DecorDefinition) => boolean;
  close: () => void;
  isOpen: () => boolean;
}>;

export function createDecorOverlay(options: DecorOverlayOptions): DecorOverlay {
  const { layer, frame, title, closeButton } = options.elements;
  const { roomHref } = options;
  let open = false;

  function close(): void {
    if (!open) return;
    open = false;
    frame.src = "about:blank";
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    options.onClose?.();
  }

  function openFor(definition: DecorDefinition): boolean {
    if (open || !definition.interaction) return false;
    open = true;
    title.textContent = definition.interaction.title;
    frame.title = definition.interaction.title;
    frame.src = new URL(definition.interaction.url, roomHref).toString();
    layer.hidden = false;
    layer.setAttribute("aria-hidden", "false");
    closeButton.focus();
    options.onOpen?.(definition);
    return true;
  }

  function onFrameKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }

  closeButton.addEventListener("click", close);
  frame.addEventListener("load", () => {
    if (!open) return;
    frame.focus();
    // Keys pressed inside the frame never reach this page, so Escape is listened for on the
    // frame's own window. Same-origin only; a page from elsewhere still has the button.
    try {
      frame.contentWindow?.addEventListener("keydown", onFrameKeydown);
    } catch {
      // Cross-origin: nothing to attach to.
    }
  });

  return Object.freeze({ open: openFor, close, isOpen: () => open });
}
