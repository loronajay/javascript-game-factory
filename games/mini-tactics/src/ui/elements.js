export function getUiElements(documentRef = document) {
  return {
    svg: required(documentRef, "boardSvg"),
    boardLayer: required(documentRef, "boardLayer"),
    overlayLayer: required(documentRef, "overlayLayer"),
    unitsLayer: required(documentRef, "unitsLayer"),
    effectsLayer: required(documentRef, "fxLayer"),
    message: required(documentRef, "message"),
    diceOverlay: required(documentRef, "diceOverlay"),
    dieFace: required(documentRef, "dieFace"),
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
    p1Squad: required(documentRef, "p1Squad"),
    p2Squad: required(documentRef, "p2Squad"),
    restartBtn: required(documentRef, "restartBtn"),
    rulesBtn: required(documentRef, "rulesBtn"),
    rulesModal: required(documentRef, "rulesModal"),
    closeRulesBtn: required(documentRef, "closeRulesBtn"),
    boardSizeSelect: required(documentRef, "boardSizeSelect")
  };
}

function required(documentRef, id) {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required DOM element: #${id}`);
  }

  return element;
}
