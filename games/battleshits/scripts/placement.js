import { FLEET_DEFS, cellIndex, placeShip, removeShip } from './board.js';
import { renderPlacementBoard, renderShipRoster } from './renderer.js';

export function selectShip(gs, shipId) {
  if (gs.placedShips[shipId]) {
    gs.myFleet = removeShip(gs.myFleet, shipId);
    delete gs.placedShips[shipId];
  } else if (gs.selectedShipId === shipId) {
    gs.selectedShipId = null;
    renderPlacementBoard(gs);
    renderShipRoster(gs, (id) => selectShip(gs, id));
    return;
  }
  gs.selectedShipId = shipId;
  renderPlacementBoard(gs);
  renderShipRoster(gs, (id) => selectShip(gs, id));
}

export function handlePlacementHover(gs, col, row) {
  gs.hoverCol = col;
  gs.hoverRow = row;
  renderPlacementBoard(gs);
}

export function handlePlacementClick(gs, col, row) {
  if (!gs.selectedShipId) {
    const cell = gs.myFleet[cellIndex(col, row)];
    if (cell.ship) selectShip(gs, cell.ship);
    return;
  }

  const def = FLEET_DEFS.find(d => d.id === gs.selectedShipId);
  if (!def) return;

  const result = placeShip(gs.myFleet, gs.selectedShipId, def.length, col, row, gs.horizontal);
  if (!result) return;

  gs.myFleet = result;
  gs.placedShips[gs.selectedShipId] = { col, row, horizontal: gs.horizontal };
  gs.selectedShipId = null;

  renderPlacementBoard(gs);
  renderShipRoster(gs, (id) => selectShip(gs, id));
}

export function rotateShip(gs) {
  gs.horizontal = !gs.horizontal;
  renderPlacementBoard(gs);
}
