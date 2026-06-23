export function getUiElements(documentRef = document) {
  return {
    svg: required(documentRef, "boardSvg"),
    boardLayer: required(documentRef, "boardLayer"),
    overlayLayer: required(documentRef, "overlayLayer"),
    unitsLayer: required(documentRef, "unitsLayer"),
    forecastLayer: required(documentRef, "forecastLayer"),
    ambientLayer: required(documentRef, "ambientLayer"),
    effectsLayer: required(documentRef, "fxLayer"),
    turnFlash: required(documentRef, "turnFlash"),
    message: required(documentRef, "message"),
    diceOverlay: required(documentRef, "diceOverlay"),
    dieFace: required(documentRef, "dieFace"),
    turnBanner: required(documentRef, "turnBanner"),
    turnTitle: required(documentRef, "turnTitle"),
    turnSub: required(documentRef, "turnSub"),
    unitCard: required(documentRef, "unitCard"),
    actionHelp: required(documentRef, "actionHelp"),
    moveBtn: required(documentRef, "moveBtn"),
    attackBtn: required(documentRef, "attackBtn"),
    healBtn: required(documentRef, "healBtn"),
    defendBtn: required(documentRef, "defendBtn"),
    cancelMoveBtn: required(documentRef, "cancelMoveBtn"),
    finishBtn: required(documentRef, "finishBtn"),
    squadOverlays: required(documentRef, "squadOverlays"),
    restartBtn: required(documentRef, "restartBtn"),
    concedeBtn: required(documentRef, "concedeBtn")
  };
}

function required(documentRef, id) {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required DOM element: #${id}`);
  }

  return element;
}
