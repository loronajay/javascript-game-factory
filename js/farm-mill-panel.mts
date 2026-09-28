// The Sawmill, on screen: every timber species the farm holds logs of, each
// row the logs going in and the planks coming out, a count to saw and one
// button. The same panel serves both sawmills — the Market Square's stall,
// which charges its fee per log, and a farm's own, which charges nothing —
// so the page hands it the fee and the `mill` call, and the panel never
// decides what was sawn: it shows the stock the page hands back after the
// server answers.

import { MAX_MILL_LOGS, PLANKS_PER_LOG } from "./farm-catalog/carpentry.mjs";
import { millLines, type MillLine } from "./farm-workshop.mjs";
import type { FarmInventory } from "./farm-crops.mjs";

type Elements = Readonly<{
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  list: HTMLElement;
  status: HTMLElement;
}>;

export type MillOutcome = Readonly<{ ok: boolean; message: string; inventory?: FarmInventory }>;

type Options = Readonly<{
  /** Tickets a log costs at this sawmill: the market's fee, or 0 at home. */
  feePerLog: number;
  mill: (speciesId: string, logs: number) => Promise<MillOutcome>;
  thumbnail?: (itemKey: string, onReady: (url: string) => void) => string | null;
  /** What the panel says when there is nothing to saw. */
  emptyNote: string;
  onClose?: () => void;
}>;

export type MillPanel = Readonly<{
  open: (inventory: FarmInventory, note?: string) => void;
  close: () => void;
  isOpen: () => boolean;
}>;

function node(tag: string, className = "", text = ""): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function createMillPanel(elements: Elements, options: Options): MillPanel {
  let inventory: FarmInventory | null = null;
  let picked: Record<string, number> = {};
  let busy = false;

  const isOpen = (): boolean => !elements.root.hidden;

  function portrait(itemKey: string): HTMLElement {
    const frame = node("span", "seed-card__image");
    frame.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    const show = (url: string): void => { image.src = url; frame.replaceChildren(image); };
    const ready = options.thumbnail?.(itemKey, show);
    if (ready) show(ready);
    return frame;
  }

  function count(line: MillLine): number {
    const wanted = picked[line.id] ?? Math.min(line.logs, MAX_MILL_LOGS);
    return Math.max(0, Math.min(line.logs, MAX_MILL_LOGS, wanted));
  }

  function row(line: MillLine): HTMLElement {
    // Its own row, not the market's sale-row: the market's sheet loads later and would impose its grid.
    const item = node("li", "mill-row");
    item.dataset.species = line.id;
    const logs = count(line);
    const words = node("div", "sale-row__label");
    words.append(node("strong", "", `${line.title} logs`), node("small", "", `${line.logs} held · ${line.planks} planks already`));
    const stepper = node("div", "sale-row__stepper");
    const less = node("button", "", "−") as HTMLButtonElement;
    less.type = "button";
    less.disabled = busy || logs <= 1;
    less.addEventListener("click", () => { picked = { ...picked, [line.id]: logs - 1 }; render(); });
    const amount = node("strong", "mill-row__count", String(logs));
    const more = node("button", "", "+") as HTMLButtonElement;
    more.type = "button";
    more.disabled = busy || logs >= Math.min(line.logs, MAX_MILL_LOGS);
    more.addEventListener("click", () => { picked = { ...picked, [line.id]: logs + 1 }; render(); });
    stepper.append(less, amount, more);
    const fee = logs * options.feePerLog;
    const saw = node("button", "farm-button farm-button--accent mill-row__saw") as HTMLButtonElement;
    saw.type = "button";
    saw.disabled = busy || logs < 1;
    saw.textContent = `Saw → ${logs * PLANKS_PER_LOG} planks${options.feePerLog ? ` · ${fee} ticket${fee === 1 ? "" : "s"}` : ""}`;
    saw.addEventListener("click", () => { void mill(line.id, logs); });
    // Top line: the logs going in, what they are, the planks coming out. Bottom line: how many, and the saw.
    const controls = node("div", "mill-row__controls");
    controls.append(stepper, saw);
    item.append(portrait(`log:${line.id}`), words, portrait(`plank:${line.id}`), controls);
    return item;
  }

  function render(): void {
    if (!inventory) return;
    const lines = millLines(inventory).filter((line) => line.logs > 0);
    elements.list.replaceChildren(...(lines.length ? lines.map(row) : [node("li", "sale-empty", options.emptyNote)]));
  }

  async function mill(speciesId: string, logs: number): Promise<void> {
    if (busy || logs < 1) return;
    busy = true;
    elements.status.textContent = "The blade bites…";
    render();
    try {
      const outcome = await options.mill(speciesId, logs);
      elements.status.textContent = outcome.message;
      if (outcome.inventory) {
        inventory = outcome.inventory;
        const { [speciesId]: _done, ...rest } = picked;
        picked = rest;
      }
    } catch {
      elements.status.textContent = "The saw jammed. Nothing was used — try again in a moment.";
    } finally {
      busy = false;
      render();
    }
  }

  function open(next: FarmInventory, note = ""): void {
    inventory = next;
    picked = {};
    elements.status.textContent = note;
    elements.root.hidden = false;
    document.exitPointerLock?.();
    render();
    elements.list.querySelector<HTMLButtonElement>(".mill-row__saw")?.focus();
  }

  function close(): void {
    if (!isOpen()) return;
    elements.root.hidden = true;
    options.onClose?.();
  }

  elements.closeButton.addEventListener("click", close);
  elements.root.hidden = true;
  return Object.freeze({ open, close, isOpen });
}
