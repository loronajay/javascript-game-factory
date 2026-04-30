function getOnlineSideSelectRects() {
  return {
    boy:  { x: 240, y: 130, w: 220, h: 240 },
    girl: { x: 500, y: 130, w: 220, h: 240 },
  };
}

function getOnlineNameEntryButtonRects() {
  return {
    continue: { x: 380, y: 336, w: 200, h: 52 },
  };
}

function getOnlineLobbyButtonRects(lobbyPhase) {
  if (lobbyPhase === 'main') {
    return {
      findMatch:  { x: 320, y: 272, w: 320, h: 56 },
      playFriend: { x: 320, y: 348, w: 320, h: 56 },
    };
  }
  if (lobbyPhase === 'searching') {
    return { cancel: { x: 380, y: 350, w: 200, h: 44 } };
  }
  if (lobbyPhase === 'friend_options') {
    return {
      create: { x: 340, y: 282, w: 280, h: 52 },
      join:   { x: 340, y: 354, w: 280, h: 52 },
    };
  }
  if (lobbyPhase === 'create') {
    return { cancel: { x: 380, y: 390, w: 200, h: 44 } };
  }
  if (lobbyPhase === 'join') {
    return {
      joinSubmit: { x: 380, y: 314, w: 200, h: 52 },
      cancel:     { x: 400, y: 390, w: 160, h: 40 },
    };
  }
  return {};
}

export { getOnlineSideSelectRects, getOnlineNameEntryButtonRects, getOnlineLobbyButtonRects };
