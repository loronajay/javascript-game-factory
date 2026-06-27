// Penalty view registry — the client-side index of penalty two-surface views.
// Mirrors the server's qd-penalties registry. Penalties without a bespoke view
// fall back to the default "mash" view. Add a view here when you add its module.
import { defaultView } from "./default.mjs";
import { patternPanicView } from "./pattern-panic.mjs";

const VIEWS = { "pattern-panic": patternPanicView };

export function getPenaltyView(penaltyId) {
  return VIEWS[penaltyId] || defaultView;
}
