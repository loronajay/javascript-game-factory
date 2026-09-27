// The felling meter on screen: the bar, its target zone (a good band with a
// perfect core), the sweeping marker, how much tree is left, and a word for
// the last swing. The maths is the pure `farm-chop.mts`; this file only moves
// DOM to match a state it is handed.

import { chopMarker, type ChopQuality, type ChopState } from "./farm-chop.mjs";

export type ChopMeterView = Readonly<{
  show: (title: string) => void;
  render: (state: ChopState, now: number) => void;
  flash: (quality: ChopQuality) => void;
  hide: () => void;
}>;

const WORDS: Readonly<Record<ChopQuality, string>> = Object.freeze({ perfect: "Perfect!", good: "Good", poor: "Glancing blow" });

export function createChopMeter(root: HTMLElement): ChopMeterView {
  const title = root.querySelector<HTMLElement>("[data-chop-title]");
  const good = root.querySelector<HTMLElement>("[data-chop-good]");
  const perfect = root.querySelector<HTMLElement>("[data-chop-perfect]");
  const marker = root.querySelector<HTMLElement>("[data-chop-marker]");
  const health = root.querySelector<HTMLElement>("[data-chop-health]");
  const word = root.querySelector<HTMLElement>("[data-chop-word]");
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const percent = (value: number) => `${(Math.min(1, Math.max(0, value)) * 100).toFixed(2)}%`;

  return Object.freeze({
    show(text) {
      if (title) title.textContent = text;
      if (word) word.textContent = "";
      root.hidden = false;
    },
    render(state, now) {
      if (good) {
        good.style.left = percent(state.zone - state.windows.good);
        good.style.width = percent(state.windows.good * 2);
      }
      if (perfect) {
        perfect.style.left = percent(state.zone - state.windows.perfect);
        perfect.style.width = percent(state.windows.perfect * 2);
      }
      if (marker) marker.style.left = percent(chopMarker(state, now));
      if (health) health.style.width = percent(state.health / state.toughness);
    },
    flash(quality) {
      if (!word) return;
      word.textContent = WORDS[quality];
      word.dataset.quality = quality;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { word.textContent = ""; }, 700);
    },
    hide() {
      root.hidden = true;
    },
  });
}
