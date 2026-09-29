// Pointer (hover + click) routing for Lovers Lost menus and lobbies.
//
// `createMenuInteraction` attaches the canvas `mousemove` and `click`
// listeners. Hover results are written to the shared `host.hover` object
// (read by the renderer dispatch); clicks drive phase changes and online
// actions through the shared `host` accessor object.
import {
  getOnlineSideSelectRects, getOnlineNameEntryButtonRects, getOnlineLobbyButtonRects,
} from './lobby-ui.js';
import {
  MAIN_MENU_RECTS,
  PUZZLE_MENU_RECTS,
  PUZZLE_LOCAL_RECTS,
  PUZZLE_PLAY_RECTS,
  PUZZLE_COMPLETE_RECTS,
  pointInRect,
} from './puzzle-ui.js';

function inBtn(cx, cy, b) { return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h; }
function inRect(cx, cy, rect) { return !!rect && inBtn(cx, cy, rect); }

function createMenuInteraction(canvas, host) {
  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (canvas.width  / rect.width),
      cy: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  canvas.addEventListener('mousemove', e => {
    const { cx, cy } = toCanvasCoords(e);
    const hover = host.hover;

    if (host.gs.phase === 'menu') {
      hover.menu0 = pointInRect(cx, cy, MAIN_MENU_RECTS.solo);
      hover.menu1 = pointInRect(cx, cy, MAIN_MENU_RECTS.local);
      hover.menu2 = pointInRect(cx, cy, MAIN_MENU_RECTS.online);
      hover.menu3 = pointInRect(cx, cy, MAIN_MENU_RECTS.puzzle);
      hover.menu4 = pointInRect(cx, cy, MAIN_MENU_RECTS.help);
    } else { hover.menu0 = hover.menu1 = hover.menu2 = hover.menu3 = hover.menu4 = false; }

    if (host.gs.phase === 'puzzle_campaign_menu') {
      hover.puzzleLocal = pointInRect(cx, cy, PUZZLE_MENU_RECTS.local);
      hover.puzzleOnline = pointInRect(cx, cy, PUZZLE_MENU_RECTS.online);
      hover.puzzleBack = pointInRect(cx, cy, PUZZLE_MENU_RECTS.back);
    } else { hover.puzzleLocal = hover.puzzleOnline = hover.puzzleBack = false; }

    if (host.gs.phase === 'puzzle_local_select') {
      hover.puzzleSolo = pointInRect(cx, cy, PUZZLE_LOCAL_RECTS.solo);
      hover.puzzleLocalTwo = pointInRect(cx, cy, PUZZLE_LOCAL_RECTS.local);
      hover.puzzleLocalBack = pointInRect(cx, cy, PUZZLE_LOCAL_RECTS.back);
    } else { hover.puzzleSolo = hover.puzzleLocalTwo = hover.puzzleLocalBack = false; }

    if (host.gs.phase === 'puzzle_playing') {
      hover.puzzlePlayMenu = pointInRect(cx, cy, PUZZLE_PLAY_RECTS.menu);
      hover.puzzleReset = pointInRect(cx, cy, PUZZLE_PLAY_RECTS.reset);
    } else { hover.puzzlePlayMenu = hover.puzzleReset = false; }

    if (host.gs.phase === 'puzzle_complete') {
      hover.puzzleRetry = pointInRect(cx, cy, PUZZLE_COMPLETE_RECTS.retry);
      hover.puzzleCompleteMenu = pointInRect(cx, cy, PUZZLE_COMPLETE_RECTS.menu);
    } else { hover.puzzleRetry = hover.puzzleCompleteMenu = false; }

    if (host.gs.phase === 'solo_side_select') {
      const r = getOnlineSideSelectRects();
      hover.soloBoy  = inRect(cx, cy, r.boy);
      hover.soloGirl = inRect(cx, cy, r.girl);
    } else { hover.soloBoy = hover.soloGirl = false; }

    if (host.gs.phase === 'online_side_select') {
      const r = getOnlineSideSelectRects();
      hover.onlineBoy  = inRect(cx, cy, r.boy);
      hover.onlineGirl = inRect(cx, cy, r.girl);
    } else { hover.onlineBoy = hover.onlineGirl = false; }

    if (host.gs.phase === 'online_name_entry') {
      hover.nameContinue = inRect(cx, cy, getOnlineNameEntryButtonRects().continue);
    } else { hover.nameContinue = false; }

    if (host.gs.phase === 'online_lobby') {
      const r = getOnlineLobbyButtonRects(host.onlineLobbyPhase);
      hover.findMatch  = inRect(cx, cy, r.findMatch);
      hover.playFriend = inRect(cx, cy, r.playFriend);
      hover.cancel     = inRect(cx, cy, r.cancel);
      hover.create     = inRect(cx, cy, r.create);
      hover.join       = inRect(cx, cy, r.join);
      hover.joinSubmit = inRect(cx, cy, r.joinSubmit);
    } else {
      hover.findMatch = hover.playFriend = hover.cancel =
        hover.create = hover.join = hover.joinSubmit = false;
    }
  });

  canvas.addEventListener('click', e => {
    host.sounds.retryPendingMusic();
    if (host.gs.phase === 'menu_help') { host.gs = { ...host.gs, phase: 'menu' }; return; }
    const { cx, cy } = toCanvasCoords(e);

    if (host.gs.phase === 'menu') {
      if      (pointInRect(cx, cy, MAIN_MENU_RECTS.solo)) { host.soloCountdownTick = 0; host.gs = { ...host.gs, phase: 'solo_side_select' }; }
      else if (pointInRect(cx, cy, MAIN_MENU_RECTS.local)) { host.localCountdownTick = 0; host.gs = { ...host.gs, phase: 'local_countdown' }; }
      else if (pointInRect(cx, cy, MAIN_MENU_RECTS.online)) host.startRunnerOnlineFlow();
      else if (pointInRect(cx, cy, MAIN_MENU_RECTS.puzzle)) host.openPuzzleMenu();
      else if (pointInRect(cx, cy, MAIN_MENU_RECTS.help)) host.gs = { ...host.gs, phase: 'menu_help' };
      return;
    }
    if (host.gs.phase === 'puzzle_campaign_menu') {
      if (pointInRect(cx, cy, PUZZLE_MENU_RECTS.local)) host.gs = { ...host.gs, phase: 'puzzle_local_select' };
      else if (pointInRect(cx, cy, PUZZLE_MENU_RECTS.online)) host.startPuzzleOnlineFlow();
      else if (pointInRect(cx, cy, PUZZLE_MENU_RECTS.back)) host.returnToMenu();
      return;
    }
    if (host.gs.phase === 'puzzle_local_select') {
      if (pointInRect(cx, cy, PUZZLE_LOCAL_RECTS.solo)) host.startPuzzle('solo');
      else if (pointInRect(cx, cy, PUZZLE_LOCAL_RECTS.local)) host.startPuzzle('local');
      else if (pointInRect(cx, cy, PUZZLE_LOCAL_RECTS.back)) host.openPuzzleMenu();
      return;
    }
    if (host.gs.phase === 'puzzle_playing') {
      if (pointInRect(cx, cy, PUZZLE_PLAY_RECTS.menu)) host.openPuzzleMenu();
      else if (pointInRect(cx, cy, PUZZLE_PLAY_RECTS.reset)) host.resetPuzzle();
      return;
    }
    if (host.gs.phase === 'puzzle_complete') {
      if (pointInRect(cx, cy, PUZZLE_COMPLETE_RECTS.retry)) host.retryPuzzle();
      else if (pointInRect(cx, cy, PUZZLE_COMPLETE_RECTS.menu)) host.openPuzzleMenu();
      return;
    }
    if (host.gs.phase === 'solo_side_select') {
      const r = getOnlineSideSelectRects();
      if (inRect(cx, cy, r.boy))  { host.soloSide = 'boy';  host.soloCountdownTick = 0; host.gs = { ...host.gs, phase: 'solo_countdown' }; }
      if (inRect(cx, cy, r.girl)) { host.soloSide = 'girl'; host.soloCountdownTick = 0; host.gs = { ...host.gs, phase: 'solo_countdown' }; }
      return;
    }
    if (host.gs.phase === 'online_side_select') {
      const r = getOnlineSideSelectRects();
      if (inRect(cx, cy, r.boy))  host.enterOnlineNameEntry('boy');
      if (inRect(cx, cy, r.girl)) host.enterOnlineNameEntry('girl');
      return;
    }
    if (host.gs.phase === 'online_name_entry') {
      if (inRect(cx, cy, getOnlineNameEntryButtonRects().continue)) host.tryContinueNameEntry();
      else host.mobileNameInput.focus();
      return;
    }
    if (host.gs.phase === 'online_lobby') {
      const r = getOnlineLobbyButtonRects(host.onlineLobbyPhase);
      if (host.onlineLobbyPhase === 'main') {
        if (inRect(cx, cy, r.findMatch))  { host.onlineLobbyPhase = 'searching'; host.onlineSearchTick = 0; host.onlineClient.findMatch(host.onlineSide, host.onlineGameId); }
        if (inRect(cx, cy, r.playFriend)) { host.onlineLobbyPhase = 'friend_options'; }
      } else if (host.onlineLobbyPhase === 'searching') {
        if (inRect(cx, cy, r.cancel)) { host.cancelSearch(); host.onlineLobbyPhase = 'main'; }
      } else if (host.onlineLobbyPhase === 'friend_options') {
        if (inRect(cx, cy, r.create)) { host.onlineLobbyPhase = 'create'; host.onlineSearchTick = 0; host.onlineClient.createRoom(host.onlineSide, host.onlineGameId); }
        if (inRect(cx, cy, r.join))   { host.onlineLobbyPhase = 'join'; host.onlineCodeInput = ''; }
      } else if (host.onlineLobbyPhase === 'create') {
        if (inRect(cx, cy, r.cancel)) { host.cancelRoom(); host.onlineLobbyPhase = 'friend_options'; }
      } else if (host.onlineLobbyPhase === 'join') {
        if (inRect(cx, cy, r.joinSubmit)) host.tryJoinRoom();
        if (inRect(cx, cy, r.cancel))     { host.cancelRoom(); host.onlineLobbyPhase = 'friend_options'; }
      }
      return;
    }
  });
}

export { createMenuInteraction };
