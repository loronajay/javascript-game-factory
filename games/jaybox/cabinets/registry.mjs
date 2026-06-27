// Cabinet registry — the single index of games the Jaybox shell can host. The
// shell never names a specific game; it asks here, mirroring how
// factory-network-server's generic src/ asks games/registry.mjs. Add a cabinet by
// importing its module and listing it in CABINETS.
import { potOfGreedCabinet } from "./pot-of-greed.mjs";
import { questionableDecisionsCabinet } from "./questionable-decisions.mjs";

const CABINETS = [potOfGreedCabinet, questionableDecisionsCabinet];

export function getCatalog() {
  return CABINETS.slice();
}

export function getCabinet(gameId) {
  return CABINETS.find((cabinet) => cabinet.gameId === gameId) || null;
}
