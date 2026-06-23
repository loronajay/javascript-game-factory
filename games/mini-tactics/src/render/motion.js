// Shared motion gate for the JS-driven juice (screen shake, particle bursts,
// staggered reveals). The CSS already neutralizes declarative animations under
// `prefers-reduced-motion: reduce` (styles/responsive.css), but Web-Animations
// calls bypass that rule, so anything scripted must consult this helper and skip
// the flourish (jumping straight to the end state) when motion is unwelcome.
//
// Guarded for non-browser use: the headless core/AI/tests never import this, but
// returning `false` off-DOM keeps it harmless if it is ever pulled in.
export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
