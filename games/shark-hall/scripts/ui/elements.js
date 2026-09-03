// Every element id the cabinet uses, looked up once.
//
// One place, so a renamed id breaks in one file rather than in five, and so
// `tests/modules.test.js` can check that every name here actually exists in
// `index.html` — which is the kind of defect that otherwise costs a manual
// browser round-trip to find.
//
// The lookup is deliberately forgiving: a missing element becomes `null` rather
// than throwing at import time, because a cabinet that fails to boot over a
// typo'd id in an optional readout is worse than one that boots with a dead
// readout and a console warning.

/** Every id, grouped the way the markup is. */
export const ELEMENT_IDS = Object.freeze({
  // shell
  canvas: "game",
  status: "status",
  sub: "sub",
  log: "log",
  pauseBtn: "pauseBtn",
  muteBtn: "muteBtn",

  // table HUD
  turnChip: "turnChip",
  p1Label: "p1Label",
  p1Count: "p1Count",
  p2Kicker: "p2Kicker",
  p2Label: "p2Label",
  p2Count: "p2Count",
  p1Plaque: "p1Plaque",
  p2Plaque: "p2Plaque",
  placementBanner: "placementBanner",
  ballTip: "ballTip",
  ballTipSwatch: "ballTipSwatch",
  ballTipName: "ballTipName",
  ballTipOwner: "ballTipOwner",
  turnCard: "turnCard",
  turnCardKicker: "turnCardKicker",
  turnCardName: "turnCardName",
  turnCardReason: "turnCardReason",

  // table actions
  camBtn: "camBtn",
  resetAim: "resetAim",

  // control deck
  aim: "aim",
  aimText: "aimText",
  nudgeLeft: "nudgeLeft",
  nudgeRight: "nudgeRight",
  spin: "spin",
  spinText: "spinText",
  powerText: "powerText",
  chargeFill: "chargeFill",
  shoot: "shoot",

  // front door
  frontDoor: "frontDoor",
  menuMain: "menuMain",
  menuPlayPanel: "menuPlayPanel",
  menuHowPanel: "menuHowPanel",
  menuRulesPanel: "menuRulesPanel",
  menuSettingsPanel: "menuSettingsPanel",
  menuOnlinePanel: "menuOnlinePanel",
  menuPlay: "menuPlay",
  menuHow: "menuHow",
  menuRules: "menuRules",
  menuSettings: "menuSettings",
  startMatch: "startMatch",
  difficultyWrap: "difficultyWrap",
  guideSetting: "guideSetting",
  cameraSetting: "cameraSetting",
  musicSetting: "musicSetting",
  nowPlaying: "nowPlaying",

  // online lobby
  onlineAccountName: "onlineAccountName",
  onlineRace: "onlineRace",
  onlineRaceNote: "onlineRaceNote",
  onlinePairing: "onlinePairing",
  onlineQuick: "onlineQuick",
  onlineCreate: "onlineCreate",
  onlineRoomInput: "onlineRoomInput",
  onlineJoin: "onlineJoin",
  onlineBack: "onlineBack",
  onlineLobbyPanel: "onlineLobbyPanel",
  onlineRoomCode: "onlineRoomCode",
  onlinePlayers: "onlinePlayers",
  onlineStatus: "onlineStatus",
  onlineStart: "onlineStart",
  onlineLeave: "onlineLeave",

  // modals
  pauseLayer: "pauseLayer",
  resumeBtn: "resumeBtn",
  newRack: "newRack",
  pauseRules: "pauseRules",
  pauseSettings: "pauseSettings",
  quitMenu: "quitMenu",
  resultLayer: "resultLayer",
  resultTitle: "resultTitle",
  resultSub: "resultSub",
  rematchBtn: "rematchBtn",
  resultMenu: "resultMenu",
});

/** Look every id up. Returns an object with the same keys, values possibly null. */
export function findElements(doc = document) {
  const found = {};
  const missing = [];
  for (const [key, id] of Object.entries(ELEMENT_IDS)) {
    found[key] = doc.getElementById(id);
    if (!found[key]) missing.push(id);
  }
  if (missing.length) console.warn(`[shark-hall] markup is missing: ${missing.join(", ")}`);
  return found;
}

/** Class-name groups the markup and the code both use. Kept here for the same reason. */
export const SELECTORS = Object.freeze({
  modeCard: ".mode-card",
  difficultyButton: "[data-difficulty]",
  menuBack: ".menu-back",
  menuPanel: ".menu-panel",
});
