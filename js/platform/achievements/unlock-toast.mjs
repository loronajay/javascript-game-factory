// The platform's achievement-unlocked toast. One presentation for every game.
//
//   ACHIEVEMENT UNLOCKED
//   Perfect Run
//   Lovers Lost
//
// A cabinet calls `createAchievementToaster()` once and `show(gameSlug,
// gameTitle, unlocked)` with the server's unlock list after each run. The
// toaster owns its styles (injected once, no stylesheet to include), its
// queue (simultaneous unlocks play one after another), its dedupe (a replayed
// response shows nothing) and its dismissal (automatic, with a tap to hurry).
//
// Placement is top-centre, clear of the bottom-anchored touch controls every
// cabinet mounts, and the layer is `pointer-events: none` except for the card
// itself so nothing underneath loses a click. Safe-area insets are honoured
// for notched phones, and reduced-motion users get a fade instead of a slide.
import { createUnlockQueue } from "./unlock-queue.mjs";
export const ACHIEVEMENT_TOAST_LAYER_ID = "jgf-achievement-toast-layer";
const STYLE_ID = "jgf-achievement-toast-style";
const DEFAULT_DURATION_MS = 4200;
const GAP_MS = 350;
const EXIT_MS = 320;
const STYLES = `
#${ACHIEVEMENT_TOAST_LAYER_ID} {
  position: fixed;
  top: max(10px, env(safe-area-inset-top, 0px));
  left: 0; right: 0;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  z-index: 2147483000;
  pointer-events: none;
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
}
.jgf-ach-toast {
  pointer-events: auto;
  cursor: pointer;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 32px));
  display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: center;
  padding: 10px 14px 10px 10px;
  border-radius: 12px;
  color: #fff8e7;
  background: linear-gradient(135deg, rgba(22, 16, 40, 0.96), rgba(46, 24, 70, 0.96));
  border: 1px solid rgba(255, 214, 102, 0.75);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.35) inset, 0 0 18px rgba(255, 214, 102, 0.25);
  animation: jgf-ach-in 320ms cubic-bezier(.2,.9,.3,1.2) both;
}
.jgf-ach-toast--leaving { animation: jgf-ach-out ${EXIT_MS}ms ease-in both; }
.jgf-ach-toast__glyph {
  width: 44px; height: 44px; border-radius: 10px;
  display: grid; place-items: center;
  font-weight: 800; font-size: 18px; letter-spacing: 1px;
  color: #2a1a05;
  background: radial-gradient(circle at 30% 30%, #fff0b3, #ffcf4d 55%, #d99a12);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.35) inset;
}
.jgf-ach-toast__kicker {
  font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
  color: #ffd666; margin: 0 0 2px;
}
.jgf-ach-toast__name { font-size: 15px; font-weight: 700; margin: 0; line-height: 1.15; }
.jgf-ach-toast__game { font-size: 11px; opacity: 0.8; margin: 3px 0 0; }
@keyframes jgf-ach-in  { from { opacity: 0; transform: translateY(-16px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes jgf-ach-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) {
  .jgf-ach-toast { animation: jgf-ach-fade 200ms ease-out both; }
  .jgf-ach-toast--leaving { animation: jgf-ach-fade 200ms ease-in reverse both; }
  @keyframes jgf-ach-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;
function glyphFor(item) {
    const words = item.name.split(/\s+/).filter(Boolean);
    const initials = words.slice(0, 2).map((word) => word[0].toUpperCase()).join("");
    return initials || "★";
}
export function createAchievementToaster(options = {}) {
    const doc = options.doc ?? (typeof document !== "undefined" ? document : null);
    const durationMs = Math.max(1200, Math.floor(options.durationMs ?? DEFAULT_DURATION_MS));
    const queue = options.queue ?? createUnlockQueue();
    const schedule = options.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
    let current = null;
    let showing = false;
    function ensureLayer() {
        if (!doc?.body)
            return null;
        if (!doc.getElementById(STYLE_ID)) {
            const style = doc.createElement("style");
            style.id = STYLE_ID;
            style.textContent = STYLES;
            doc.head?.appendChild(style);
        }
        let layer = doc.getElementById(ACHIEVEMENT_TOAST_LAYER_ID);
        if (!layer) {
            layer = doc.createElement("div");
            layer.id = ACHIEVEMENT_TOAST_LAYER_ID;
            layer.setAttribute("role", "status");
            layer.setAttribute("aria-live", "polite");
            doc.body.appendChild(layer);
        }
        return layer;
    }
    function render(item, layer) {
        const card = doc.createElement("div");
        card.className = "jgf-ach-toast";
        card.dataset.achievementKey = item.key;
        const glyph = doc.createElement("div");
        glyph.className = "jgf-ach-toast__glyph";
        glyph.textContent = glyphFor(item);
        const body = doc.createElement("div");
        const kicker = doc.createElement("p");
        kicker.className = "jgf-ach-toast__kicker";
        kicker.textContent = "Achievement unlocked";
        const name = doc.createElement("p");
        name.className = "jgf-ach-toast__name";
        name.textContent = item.name;
        const game = doc.createElement("p");
        game.className = "jgf-ach-toast__game";
        game.textContent = item.points > 0 ? `${item.gameTitle} · ${item.points} pts` : item.gameTitle;
        body.append(kicker, name, game);
        card.append(glyph, body);
        layer.appendChild(card);
        return card;
    }
    function pump() {
        if (showing)
            return;
        const item = queue.next();
        if (!item) {
            current = null;
            return;
        }
        const layer = ensureLayer();
        if (!layer) {
            current = null;
            return;
        } // no document: drop silently, never block
        showing = true;
        current = item;
        const card = render(item, layer);
        let dismissed = false;
        const dismiss = () => {
            if (dismissed)
                return;
            dismissed = true;
            card.classList.add("jgf-ach-toast--leaving");
            schedule(() => {
                card.remove();
                showing = false;
                schedule(pump, GAP_MS);
            }, EXIT_MS);
        };
        card.addEventListener("click", dismiss);
        schedule(dismiss, durationMs);
    }
    return {
        queue,
        show(gameSlug, gameTitle, unlocked) {
            const added = queue.enqueue(gameSlug, gameTitle, unlocked);
            if (added > 0)
                pump();
            return added;
        },
        current() {
            return current;
        },
    };
}
