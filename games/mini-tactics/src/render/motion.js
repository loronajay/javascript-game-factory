// Shared motion gate for the JS-driven juice (screen shake, particle bursts,
// staggered reveals). The CSS already neutralizes declarative animations under
// `prefers-reduced-motion: reduce` (styles/responsive.css), but Web-Animations
// calls bypass that rule, so anything scripted must consult this helper and skip
// the flourish (jumping straight to the end state) when motion is unwelcome.
//
// Honors two sources, OR'd together: the OS-level `prefers-reduced-motion` media
// query AND an explicit in-game Settings toggle, which Settings writes as
// `data-reduce-motion="on"` on the document root (it cannot relax the OS pref,
// only force motion off on top of it). Reading the attribute keeps Settings from
// having to push state into this module.
//
// Guarded for non-browser use: the headless core/AI/tests never import this, but
// returning `false` off-DOM keeps it harmless if it is ever pulled in.
export function prefersReducedMotion() {
  if (typeof document !== "undefined") {
    const forced = document.documentElement?.getAttribute("data-reduce-motion");
    if (forced === "on") {
      return true;
    }
  }
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
