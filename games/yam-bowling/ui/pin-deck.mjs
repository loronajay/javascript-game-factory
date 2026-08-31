import { $ } from "./dom.mjs";

// The down-lane rack, drawn as a pin diagram beside the scorecard. In 3D Bowl
// the deck is forty units away and half a pin wide on screen, so a player can
// see that pins fell without being able to read *which*. This is that readout
// and nothing else: it paints the standing flags the deck simulation already
// wrote, and never touches the rack, physics or a match.
//
// Rows read the way a bowler sees them — head pin nearest, the four-pin back
// row furthest — and the markers sit on a seven-column half-step grid so each
// row offsets against the one behind it the way the real rack does.
export const PIN_ROWS = [
  [7, 8, 9, 10],
  [4, 5, 6],
  [2, 3],
  [1],
];

const COLUMNS = { 7: 1, 8: 3, 9: 5, 10: 7, 4: 2, 5: 4, 6: 6, 2: 3, 3: 5, 1: 4 };

// During an online 3D replay the rack readout follows the server's timeline.
// Between rolls it follows the served spare/fresh rack. Local physics is paint,
// so numerical differences can never change the count or the indicated leave.
export function displayedStandingPins(session) {
  const roll = session.onlineMatch && session.pendingAuthoritativeRoll?.roll;
  if (roll && Array.isArray(roll.pinFalls)) {
    const elapsed = session.scene?.simulation?.elapsed || 0;
    const fallen = new Set(roll.pinFalls.filter(p => p.time <= elapsed + 1e-8).map(p => Number(p.id)));
    return (roll.pinsBefore || []).filter(p => p.standing && !fallen.has(Number(p.id)));
  }
  return (session.scene?.pins || []).filter(p => p.standing);
}

export function createPinDeck({ session, getElement = $ }) {
  let markers = null;

  function build() {
    const deck = getElement("pin-deck-pins");
    deck.innerHTML = "";
    markers = new Map();
    PIN_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "pin-deck__row";
      row.forEach((id) => {
        const pin = document.createElement("i");
        pin.className = "pin-deck__pin";
        pin.style.gridColumn = String(COLUMNS[id]);
        pin.dataset.pin = String(id);
        rowEl.appendChild(pin);
        markers.set(id, pin);
      });
      deck.appendChild(rowEl);
    });
  }

  function update() {
    if (!markers) build();
    const standing = new Set(displayedStandingPins(session).map(pin => Number(pin.id)));
    for (const [id, marker] of markers) {
      marker.classList.toggle("is-down", !standing.has(id));
    }
    getElement("pin-deck-count").textContent = `${standing.size} up`;
  }

  return { update };
}
