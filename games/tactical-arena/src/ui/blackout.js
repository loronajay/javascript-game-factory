// Blackout — a full-screen fade-to-black the match can hold on while something happens to
// the board underneath it.
//
// The campaign's cutting seam so far has been the dialogue box: the board mutates on an
// `afterAction` and the player watches it happen. That works when the change is a reveal.
// It does NOT work when the board itself is replaced — a different size, a different
// roster — because the player just sees the world flicker.
//
// So: `enter()` fades the screen to black and STAYS there. Dialogue keeps working on top of
// it (the dialogue layer sits above this one), which is the whole point — the party can talk
// in the dark while the ground is swapped out from under them. `exit()` fades back in on
// whatever the board has become.
//
// A blackout can carry a `caption`: a line of text on the black field, used by the finale to
// title each duel. The caption is aria-live so a screen reader announces the stage change
// rather than silently skipping a purely visual beat.

const DEFAULT_ENTER_MS = 620;
const DEFAULT_EXIT_MS = 760;
const DEFAULT_HOLD_MS = 420;

export function createBlackout(host, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!host) throw new Error("createBlackout requires a host element");

  let active = false;

  host.classList.add("blackout-layer");
  host.hidden = true;
  host.setAttribute("aria-live", "polite");

  function isActive() {
    return active;
  }

  function setCaption(caption = null) {
    host.replaceChildren();
    if (!caption) return;
    const line = document.createElement("p");
    line.className = "blackout-caption";
    line.textContent = caption;
    host.append(line);
  }

  // Fade to black and hold. Resolves once the screen is fully dark, so the caller can safely
  // rebuild the board before anyone sees it.
  async function enter({ caption = null, duration = DEFAULT_ENTER_MS, hold = DEFAULT_HOLD_MS } = {}) {
    setCaption(caption);
    host.style.setProperty("--blackout-fade", `${duration}ms`);
    host.hidden = false;
    // Force a reflow so the transition runs from opacity 0 rather than snapping to black.
    void host.offsetWidth;
    host.classList.add("is-active");
    active = true;
    await sleep(duration);
    if (hold > 0) await sleep(hold);
  }

  // Fade back in on the new board. A no-op if we were never dark, so a skipped cutscene
  // can call it defensively.
  async function exit({ duration = DEFAULT_EXIT_MS } = {}) {
    if (!active) return;
    host.style.setProperty("--blackout-fade", `${duration}ms`);
    host.classList.remove("is-active");
    active = false;
    await sleep(duration);
    host.hidden = true;
    host.replaceChildren();
  }

  // Drop the black instantly, no transition. For teardown paths (leaving the match, a
  // skipped script) where an animated fade would just be a delay nobody asked for.
  function clear() {
    active = false;
    host.classList.remove("is-active");
    host.hidden = true;
    host.replaceChildren();
  }

  return Object.freeze({ enter, exit, clear, isActive, setCaption });
}
