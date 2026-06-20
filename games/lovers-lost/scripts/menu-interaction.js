// Pointer (hover + click) routing for Lovers Lost menus and lobbies.
//
// `createMenuInteraction` attaches the canvas `mousemove` and `click`
// listeners. Hover results are written to the shared `host.hover` object
// (read by the renderer dispatch); clicks drive phase changes and online
// actions through the shared `host` accessor object.
import {
  getOnlineSideSelectRects, getOnlineNameEntryButtonRects, getOnlineLobbyButtonRects,
} from './lobby-ui.js';

// Main-menu button bounds (canvas space).
const MENU_BTN0 = { x: 300, y: 148, w: 360, h: 56 }; // SINGLE PLAYER
const MENU_BTN1 = { x: 300, y: 216, w: 360, h: 56 }; // LOCAL MULTIPLAYER
const MENU_BTN2 = { x: 300, y: 284, w: 360, h: 56 }; // ONLINE MULTIPLAYER
const MENU_BTN3 = { x: 360, y: 360, w: 240, h: 44 }; // HOW TO PLAY

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
      hover.menu0 = inBtn(cx, cy, MENU_BTN0);
      hover.menu1 = inBtn(cx, cy, MENU_BTN1);
      hover.menu2 = inBtn(cx, cy, MENU_BTN2);
      hover.menu3 = inBtn(cx, cy, MENU_BTN3);
    } else { hover.menu0 = hover.menu1 = hover.menu2 = hover.menu3 = false; }

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
      if      (inBtn(cx, cy, MENU_BTN0)) { host.soloCountdownTick = 0; host.gs = { ...host.gs, phase: 'solo_side_select' }; }
      else if (inBtn(cx, cy, MENU_BTN1)) { host.localCountdownTick = 0; host.gs = { ...host.gs, phase: 'local_countdown' }; }
      else if (inBtn(cx, cy, MENU_BTN2)) { host.onlineSide = 'boy'; host.onlineLobbyPhase = 'main'; host.gs = { ...host.gs, phase: 'online_side_select' }; }
      else if (inBtn(cx, cy, MENU_BTN3)) host.gs = { ...host.gs, phase: 'menu_help' };
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
        if (inRect(cx, cy, r.findMatch))  { host.onlineLobbyPhase = 'searching'; host.onlineSearchTick = 0; host.onlineClient.findMatch(host.onlineSide); }
        if (inRect(cx, cy, r.playFriend)) { host.onlineLobbyPhase = 'friend_options'; }
      } else if (host.onlineLobbyPhase === 'searching') {
        if (inRect(cx, cy, r.cancel)) { host.cancelSearch(); host.onlineLobbyPhase = 'main'; }
      } else if (host.onlineLobbyPhase === 'friend_options') {
        if (inRect(cx, cy, r.create)) { host.onlineLobbyPhase = 'create'; host.onlineSearchTick = 0; host.onlineClient.createRoom(host.onlineSide); }
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
