import { COLORS } from './config.js';
import { drawScreenSpriteContain, getScreenSpriteContainRect } from './assets.js';
import { resizeCanvasToDisplaySize } from './renderer-primitives.js';
import {
  UI,
  drawDarkBg,
  drawButton,
  drawRoleCard,
  drawScreenFrame,
  drawSectionHeading,
  getMapCardGridLayout,
} from './renderer-ui.js';

export function renderMenu(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  const hasSplash = drawScreenSpriteContain(ctx, 'menuSplash', width, height);
  if (hasSplash) {
    const shade = ctx.createLinearGradient(0, height * 0.35, 0, height);
    shade.addColorStop(0, 'rgba(0, 8, 14, 0.02)');
    shade.addColorStop(0.68, 'rgba(0, 8, 14, 0.18)');
    shade.addColorStop(1, 'rgba(0, 5, 9, 0.82)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  } else {
    drawDarkBg(ctx, width, height);
  }

  drawScreenFrame(ctx, width, height, 'BEACON EXPEDITION // READY');

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(32, Math.floor(Math.min(width, height) * 0.1));
  const splashRect = hasSplash ? getScreenSpriteContainRect('menuSplash', width, height) : null;

  if (!hasSplash) {
    ctx.save();
    ctx.shadowColor = 'rgba(118, 244, 255, 0.55)';
    ctx.shadowBlur = Math.floor(titleSize * 0.85);
    ctx.fillStyle = '#76f4ff';
    ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ILLUMINAUTS', cx, cy * 0.54);
    ctx.restore();

    ctx.fillStyle = '#4a6a7a';
    ctx.font = `${Math.max(13, Math.floor(titleSize * 0.3))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2-Player Online Maze Race', cx, cy * 0.54 + titleSize * 0.84);
  }

  const btnW = Math.min(340, width * 0.48);
  const btnH = Math.max(52, Math.floor(Math.min(width, height) * 0.076));
  const btnX = cx - btnW / 2;

  const onlineY = hasSplash ? height * 0.745 : cy * 0.88;
  const soloY   = onlineY + btnH + Math.floor(btnH * 0.24);
  drawButton(ctx, 'RIVAL EXPEDITION', btnX, onlineY, btnW, btnH, registerButton, 'btn_play_online', hoveredButtonId === 'btn_play_online', { kicker: 'ONLINE // TWO SUITS' });
  drawButton(ctx, 'SOLO DESCENT', btnX, soloY, btnW, btnH, registerButton, 'btn_solo', hoveredButtonId === 'btn_solo', { kicker: 'TRAINING // TIMED RUN' });

  const controlsY = splashRect && splashRect.y + splashRect.h < height - 18
    ? splashRect.y + splashRect.h + (height - splashRect.y - splashRect.h) / 2
    : height - Math.max(12, height * 0.018);
  ctx.fillStyle = hasSplash ? 'rgba(169, 222, 222, 0.62)' : UI.textDim;
  ctx.font = `${Math.max(9, Math.floor(Math.min(width, height) * 0.018))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WASD  MOVE     MOUSE / ARROWS  LOOK     SHIFT  SPRINT', cx, controlsY);
}

export function renderSideSelect(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  const hasSplash = drawScreenSpriteContain(ctx, 'lobbySplash', width, height);
  if (hasSplash) {
    ctx.fillStyle = 'rgba(0, 8, 14, 0.62)';
    ctx.fillRect(0, 0, width, height);
  } else {
    drawDarkBg(ctx, width, height);
  }

  drawScreenFrame(ctx, width, height, 'ONLINE EXPEDITION // DEPLOYMENT');

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.06));
  const layoutOffset = hasSplash ? height * 0.12 : 0;

  drawSectionHeading(ctx, '02 // SELECT SUIT', 'Deployment Vector', 'Same facility. Opposing entrances. First suit to the beacon wins.', cx, cy * 0.3 + layoutOffset);

  const cardW = Math.min(270, width * 0.34);
  const cardH = Math.max(190, Math.min(height * 0.39, cardW * 0.9));
  const gap   = Math.max(24, width * 0.035);
  const cardY = cy * 0.55 + layoutOffset;

  const alphaX = cx - gap / 2 - cardW;
  const betaX  = cx + gap / 2;
  const alphaHov = hoveredButtonId === 'btn_side_alpha';
  const betaHov  = hoveredButtonId === 'btn_side_beta';

  drawRoleCard(ctx, alphaX, cardY, cardW, cardH, 'ALPHA', '', 'West entrance', '#76f4ff', alphaHov);
  drawRoleCard(ctx, betaX,  cardY, cardW, cardH, 'BETA',  '', 'East entrance', '#ff8c42', betaHov);

  registerButton('btn_side_alpha', alphaX, cardY, cardW, cardH);
  registerButton('btn_side_beta',  betaX,  cardY, cardW, cardH);

  ctx.fillStyle = UI.textDim;
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.28))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC — back to menu', cx, height - Math.max(18, height * 0.038));
}

function _fmtMs(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function _fmtMsDetailed(ms) {
  if (!ms) return '--:--.--';
  const s = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function _drawToggleBtn(ctx, label, x, y, w, h, active, hovered, registerButton, id) {
  ctx.save();
  if (active) {
    ctx.shadowColor = 'rgba(118, 244, 255, 0.55)';
    ctx.shadowBlur = 12;
  } else if (hovered) {
    ctx.shadowColor = 'rgba(118, 244, 255, 0.3)';
    ctx.shadowBlur = 8;
  }
  ctx.fillStyle = active ? 'rgba(20, 60, 67, 0.97)' : 'rgba(4, 15, 21, 0.92)';
  ctx.strokeStyle = active ? UI.cyan : (hovered ? UI.cyanDim : 'rgba(103,245,242,0.2)');
  ctx.lineWidth = active ? 2 : 1;
  ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = active ? UI.cyan : UI.cyanDim;
  ctx.fillRect(x, y, active ? 4 : 2, h);
  ctx.restore();
  ctx.fillStyle = active ? '#ffffff' : (hovered ? UI.text : UI.textDim);
  ctx.font = `800 ${Math.floor(h * 0.34)}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  if (registerButton) registerButton(id, x, y, w, h);
}

export function renderMapSelect(canvas, { mode, side, hoveredButtonId, personalBests = {}, mapConfigs = [] }, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);
  drawScreenFrame(ctx, width, height, 'SOLO EXPEDITION // MISSION SELECT');

  const cx = width / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.062));
  const subSize   = Math.max(11, Math.floor(titleSize * 0.36));

  drawSectionHeading(ctx, 'MISSION ARCHIVE // SIX DESCENTS', 'Choose Your Descent', 'Configure the objective, entry vector, and facility sector.', cx, height * 0.075);

  // Mode toggle
  const toggleH = Math.max(30, Math.floor(Math.min(width, height) * 0.048));
  const toggleW = Math.min(130, width * 0.17);
  const toggleGap = 10;
  const toggleY   = height * 0.205;
  _drawToggleBtn(ctx, 'SPRINT', cx - toggleW - toggleGap / 2, toggleY, toggleW, toggleH,
    mode === 'sprint', hoveredButtonId === 'btn_mode_sprint', registerButton, 'btn_mode_sprint');
  _drawToggleBtn(ctx, 'SWEEP',  cx + toggleGap / 2,           toggleY, toggleW, toggleH,
    mode === 'sweep',  hoveredButtonId === 'btn_mode_sweep',  registerButton, 'btn_mode_sweep');

  // Mode description
  const modeDesc = mode === 'sweep'
    ? 'Collect all Data Cores, then reach the Beacon Core'
    : 'Race to the Beacon Core as fast as possible';
  ctx.fillStyle = UI.textDim;
  ctx.font = `${subSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(modeDesc, cx, toggleY + toggleH + Math.floor(toggleH * 0.6));

  // Side toggle
  const sideH  = Math.max(26, Math.floor(toggleH * 0.8));
  const sideW  = Math.min(100, width * 0.13);
  const sideY  = height * 0.36;
  ctx.fillStyle = UI.textDim;
  ctx.font = `${subSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START SIDE', cx, sideY - sideH * 0.7);
  _drawToggleBtn(ctx, 'ALPHA', cx - sideW - toggleGap / 2, sideY, sideW, sideH,
    side === 'alpha', hoveredButtonId === 'btn_solo_alpha', registerButton, 'btn_solo_alpha');
  _drawToggleBtn(ctx, 'BETA',  cx + toggleGap / 2,         sideY, sideW, sideH,
    side === 'beta',  hoveredButtonId === 'btn_solo_beta',  registerButton, 'btn_solo_beta');

  // Map cards
  const cardCount = mapConfigs.length;
  const { columns, rows, cardW, cardGap, cardStartX } = getMapCardGridLayout(width, cardCount);
  const gridTop = height * 0.43;
  const gridBottom = height * 0.91;
  const rowGap = Math.max(8, Math.floor(height * 0.016));
  const cardH = Math.max(105, Math.min(190, Math.floor((gridBottom - gridTop - rowGap * (rows - 1)) / rows)));

  for (let i = 0; i < cardCount; i++) {
    const cfg = mapConfigs[i];
    const column = i % columns;
    const row = Math.floor(i / columns);
    const cx_c = cardStartX + column * (cardW + cardGap);
    const cardY = gridTop + row * (cardH + rowGap);
    const btnId = `btn_map_${i}`;
    const isHov = hoveredButtonId === btnId;
    const parMs = mode === 'sprint' ? cfg.sprintParMs : cfg.sweepParMs;
    const pbKey = `${mode}_${cfg.id}`;
    const pbMs  = personalBests[pbKey] || 0;

    ctx.save();
    if (isHov) { ctx.shadowColor = 'rgba(118, 244, 255, 0.45)'; ctx.shadowBlur = 18; }
    ctx.fillStyle   = isHov ? 'rgba(12, 48, 55, 0.98)' : 'rgba(4, 15, 21, 0.94)';
    ctx.strokeStyle = isHov ? UI.cyan : 'rgba(103, 245, 242, 0.22)';
    ctx.lineWidth   = isHov ? 2 : 1;
    ctx.fillRect(cx_c, cardY, cardW, cardH); ctx.strokeRect(cx_c, cardY, cardW, cardH);
    ctx.fillStyle = isHov ? UI.cyan : UI.cyanDim;
    ctx.fillRect(cx_c, cardY, cardW, 3);
    ctx.restore();

    const nameSize  = Math.max(13, Math.floor(cardH * 0.12));
    const metaSize  = Math.max(9, Math.floor(cardH * 0.075));

    ctx.fillStyle = isHov ? UI.cyan : UI.textDim;
    ctx.font = `800 ${metaSize}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`SECTOR ${String(i + 1).padStart(2, '0')}`, cx_c + cardW * 0.08, cardY + cardH * 0.14);

    ctx.fillStyle = isHov ? '#ffffff' : UI.text;
    ctx.font = `900 ${nameSize}px "Arial Narrow", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.name.toUpperCase(), cx_c + cardW * 0.08, cardY + cardH * 0.34, cardW * 0.84);

    ctx.fillStyle = UI.textDim;
    ctx.font = `${metaSize}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('TARGET', cx_c + cardW * 0.08, cardY + cardH * 0.52);
    ctx.textAlign = 'right';
    ctx.fillText(_fmtMs(parMs), cx_c + cardW * 0.92, cardY + cardH * 0.52);

    const pbColor = pbMs && pbMs <= parMs ? '#4dff91' : (pbMs ? '#ffd166' : '#2a4a5e');
    ctx.fillStyle = pbColor;
    ctx.textAlign = 'left';
    ctx.fillText('PERSONAL', cx_c + cardW * 0.08, cardY + cardH * 0.66);
    ctx.textAlign = 'right';
    ctx.fillText(pbMs ? _fmtMs(pbMs) : '--:--', cx_c + cardW * 0.92, cardY + cardH * 0.66);

    ctx.fillStyle = isHov ? UI.cyan : UI.textDim;
    ctx.font = `800 ${metaSize}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(isHov ? 'DEPLOY  ›' : 'SELECT  ›', cx_c + cardW * 0.08, cardY + cardH * 0.85);

    registerButton(btnId, cx_c, cardY, cardW, cardH);
  }

  // Back hint
  ctx.fillStyle = UI.textDim;
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.26))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC — back to menu', cx, height - Math.max(18, height * 0.038));
}

function _renderLobbyMain(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton) {
  const btnW = Math.min(340, width * 0.46);
  const btnX = cx - btnW / 2;
  const gap  = Math.floor(btnH * 0.4);

  drawButton(ctx, 'OPEN FREQUENCY', btnX, cy * 0.78, btnW, btnH, registerButton, 'btn_find_match', hoveredButtonId === 'btn_find_match', { kicker: 'PUBLIC MATCHMAKING' });
  drawButton(ctx, 'PRIVATE UPLINK', btnX, cy * 0.78 + btnH + gap, btnW, btnH, registerButton, 'btn_play_friend', hoveredButtonId === 'btn_play_friend', { kicker: 'ROOM CODE' });
}

function _renderLobbySearching(ctx, cx, cy, width, height, btnH, searchTick, hoveredButtonId, registerButton) {
  const dots = '.'.repeat(1 + Math.floor(searchTick / 35) % 3);
  const textSize = Math.max(18, Math.floor(Math.min(width, height) * 0.046));

  ctx.fillStyle = UI.cyan;
  ctx.font = `800 ${textSize}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCANNING OPEN FREQUENCIES' + dots, cx, cy * 0.8);

  ctx.fillStyle = UI.textDim;
  ctx.font = `${Math.max(11, Math.floor(textSize * 0.5))}px ui-monospace, Consolas, monospace`;
  ctx.fillText('RELAY ONLINE  //  SUIT SIGNAL BROADCASTING', cx, cy * 0.8 + textSize * 1.1);

  const btnW = Math.min(200, width * 0.3);
  drawButton(ctx, 'CANCEL SCAN', cx - btnW / 2, cy * 1.28, btnW, btnH, registerButton, 'btn_cancel', hoveredButtonId === 'btn_cancel');
}

function _renderLobbyFriendOptions(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton) {
  const labelSize = Math.max(14, Math.floor(Math.min(width, height) * 0.036));

  ctx.fillStyle = UI.textDim;
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SELECT PRIVATE RELAY PROTOCOL', cx, cy * 0.72);

  const btnW = Math.min(280, width * 0.42);
  const btnX = cx - btnW / 2;
  const gap  = Math.floor(btnH * 0.4);

  drawButton(ctx, 'HOST RELAY', btnX, cy * 0.84, btnW, btnH, registerButton, 'btn_create_room', hoveredButtonId === 'btn_create_room', { kicker: 'GENERATE ROOM CODE' });
  drawButton(ctx, 'JOIN RELAY', btnX, cy * 0.84 + btnH + gap, btnW, btnH, registerButton, 'btn_enter_code', hoveredButtonId === 'btn_enter_code', { kicker: 'ENTER ROOM CODE' });
}

function _renderLobbyCreate(ctx, cx, cy, width, height, btnH, hostCode, searchTick, hoveredButtonId, registerButton) {
  const codeSize  = Math.max(36, Math.floor(Math.min(width, height) * 0.1));
  const labelSize = Math.max(13, Math.floor(codeSize * 0.3));

  ctx.fillStyle = UI.textDim;
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRIVATE RELAY IDENTIFIER', cx, cy * 0.58);

  ctx.save();
  ctx.shadowColor = 'rgba(103, 245, 242, 0.5)';
  ctx.shadowBlur = codeSize * 0.5;
  ctx.fillStyle = UI.cyan;
  ctx.font = `bold ${codeSize}px ui-monospace, Consolas, monospace`;
  ctx.fillText(hostCode || '···', cx, cy * 0.86);
  ctx.restore();

  const dots = '.'.repeat(1 + Math.floor(searchTick / 35) % 3);
  ctx.fillStyle = UI.textDim;
  ctx.font = `${Math.max(12, Math.floor(labelSize * 0.8))}px ui-monospace, Consolas, monospace`;
  ctx.fillText('AWAITING SECOND SUIT' + dots, cx, cy * 1.06);

  const btnW = Math.min(200, width * 0.3);
  drawButton(ctx, 'CLOSE RELAY', cx - btnW / 2, cy * 1.28, btnW, btnH, registerButton, 'btn_cancel', hoveredButtonId === 'btn_cancel');
}

function _renderLobbyJoin(ctx, cx, cy, width, height, btnH, codeInput, now, hoveredButtonId, registerButton) {
  const codeSize  = Math.max(28, Math.floor(Math.min(width, height) * 0.072));
  const labelSize = Math.max(13, Math.floor(codeSize * 0.48));

  ctx.fillStyle = UI.textDim;
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ENTER PRIVATE RELAY IDENTIFIER', cx, cy * 0.58);

  const boxW = Math.min(320, width * 0.52);
  const boxH = Math.max(52, codeSize * 1.5);
  const boxX = cx - boxW / 2;
  const boxY = cy * 0.7;

  ctx.fillStyle = 'rgba(3, 14, 20, 0.96)';
  ctx.strokeStyle = UI.cyan;
  ctx.lineWidth = 2;
  ctx.fillRect(boxX, boxY, boxW, boxH); ctx.strokeRect(boxX, boxY, boxW, boxH);

  const cursorOn = Math.floor(now / 500) % 2 === 0;
  ctx.fillStyle = UI.cyan;
  ctx.font = `bold ${codeSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((codeInput || '') + (cursorOn ? '|' : ' '), cx, boxY + boxH / 2);

  ctx.fillStyle = UI.textDim;
  ctx.font = `${Math.max(11, Math.floor(labelSize * 0.72))}px system-ui, sans-serif`;
  ctx.fillText('TYPE CODE  //  ENTER TO CONNECT', cx, boxY + boxH + labelSize * 0.9);

  const btnW = Math.min(180, width * 0.27);
  const btnY  = cy * 1.28;

  drawButton(ctx, 'CONNECT', cx - btnW - 10, btnY, btnW, btnH, registerButton, 'btn_join_submit', hoveredButtonId === 'btn_join_submit');
  drawButton(ctx, 'BACK', cx + 10, btnY, btnW, btnH, registerButton, 'btn_back', hoveredButtonId === 'btn_back');
}

export function renderLobby(canvas, { lobbyPhase, side, hostCode, codeInput, searchTick }, hoveredButtonId, now, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  const hasSplash = drawScreenSpriteContain(ctx, 'lobbySplash', width, height);
  if (hasSplash) {
    ctx.fillStyle = 'rgba(0, 8, 14, 0.62)';
    ctx.fillRect(0, 0, width, height);
  } else {
    drawDarkBg(ctx, width, height);
  }

  drawScreenFrame(ctx, width, height, 'ONLINE EXPEDITION // RELAY CONTROL');

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(20, Math.floor(Math.min(width, height) * 0.052));
  const btnH = Math.max(44, Math.floor(Math.min(width, height) * 0.065));

  const sideColor = side === 'alpha' ? '#76f4ff' : '#ff8c42';
  const sideLabel = side === 'alpha' ? 'ALPHA' : 'BETA';

  drawSectionHeading(ctx, 'RELAY CONTROL // LINK TWO SUITS', 'Establish Uplink', 'Match with another explorer and race opposing routes to the beacon.', cx, hasSplash ? height * 0.21 : height * 0.12);

  ctx.fillStyle  = sideColor;
  ctx.font       = `bold ${Math.max(11, Math.floor(titleSize * 0.42))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SUIT ${sideLabel}  //  ${side === 'alpha' ? 'WEST VECTOR' : 'EAST VECTOR'}  //  LOCKED`, cx, hasSplash ? height * 0.35 : height * 0.27);

  if (lobbyPhase === 'main')                _renderLobbyMain(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'searching')      _renderLobbySearching(ctx, cx, cy, width, height, btnH, searchTick, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'friend_options') _renderLobbyFriendOptions(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'create')         _renderLobbyCreate(ctx, cx, cy, width, height, btnH, hostCode, searchTick, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'join')           _renderLobbyJoin(ctx, cx, cy, width, height, btnH, codeInput, now, hoveredButtonId, registerButton);

  ctx.fillStyle = hasSplash ? 'rgba(168, 210, 214, 0.7)' : UI.textDim;
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.26))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC — back', cx, height - Math.max(18, height * 0.038));
}

export function renderCountdown(canvas, seconds, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height, 'rgba(118, 244, 255, 0.05)');
  drawScreenFrame(ctx, width, height, 'EXPEDITION CONTROL // LAUNCH SEQUENCE');

  const cx = width / 2;
  const cy = height / 2;
  const numSize = Math.max(72, Math.floor(Math.min(width, height) * 0.22));
  const labelSize = Math.max(14, Math.floor(numSize * 0.22));

  ctx.fillStyle = UI.textDim;
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUIT LINKED  //  FACILITY SEALED  //  LAUNCH IN', cx, cy * 0.62);

  ctx.save();
  ctx.strokeStyle = 'rgba(103,245,242,0.2)';
  ctx.lineWidth = Math.max(1, numSize * 0.012);
  ctx.beginPath(); ctx.arc(cx, cy, numSize * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = UI.cyan;
  ctx.beginPath(); ctx.arc(cx, cy, numSize * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * (0.8 + Math.sin(now / 280) * 0.12)); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(103, 245, 242, 0.7)';
  ctx.shadowBlur = numSize * 0.5;
  ctx.fillStyle = UI.cyan;
  ctx.font = `900 ${numSize}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(seconds > 0 ? String(seconds) : 'GO!', cx, cy * 1.0);
  ctx.restore();
}

export function renderDisconnected(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height, 'rgba(255, 80, 80, 0.05)');
  drawScreenFrame(ctx, width, height, 'RELAY CONTROL // LINK FAILURE', UI.red);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.06));

  ctx.fillStyle = UI.red;
  ctx.font = `900 ${titleSize}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SECOND SUIT SIGNAL LOST', cx, cy * 0.8);

  ctx.fillStyle = UI.textDim;
  ctx.font = `${Math.max(12, Math.floor(titleSize * 0.42))}px ui-monospace, Consolas, monospace`;
  ctx.fillText('RELAY CLOSED  //  EXPEDITION ABORTED', cx, cy * 0.8 + titleSize * 1.1);

  const btnW = Math.min(220, width * 0.34);
  const btnH = Math.max(42, Math.floor(Math.min(width, height) * 0.062));
  drawButton(ctx, 'RETURN TO CONTROL', cx - btnW / 2, cy * 1.2, btnW, btnH, registerButton, 'btn_back_to_menu', hoveredButtonId === 'btn_back_to_menu', { accent: UI.red });
}

export function renderWinScreen(canvas, state, now, winnerIsLocal = true, winnerName = '', soloInfo = null) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  drawScreenFrame(ctx, width, height, 'EXPEDITION DEBRIEF // RUN COMPLETE', winnerIsLocal ? UI.green : UI.red);

  const cx = width / 2;
  const cy = height / 2;
  const isOnline = state?.online?.enabled;

  const glowColor = winnerIsLocal ? 'rgba(125, 242, 154, 0.2)' : 'rgba(255, 100, 100, 0.15)';
  const glow = ctx.createRadialGradient(cx, cy * 0.82, 0, cx, cy * 0.82, Math.min(width, height) * 0.52);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const titleSize = Math.max(26, Math.floor(Math.min(width, height) * 0.08));
  const titleColor = winnerIsLocal ? '#7df29a' : '#ff8080';
  const shadowColor = winnerIsLocal ? 'rgba(125, 242, 154, 0.65)' : 'rgba(255, 100, 100, 0.5)';

  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = Math.floor(titleSize * 0.9);
  ctx.fillStyle = titleColor;
  ctx.font = `900 ${titleSize}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const headline = isOnline
    ? (winnerIsLocal ? 'BEACON CONTACT CONFIRMED' : `${winnerName || 'OPPONENT'} REACHED THE CORE`)
    : 'BEACON CONTACT CONFIRMED';
  ctx.fillText(headline, cx, cy * 0.8);
  ctx.restore();

  const subText = isOnline
    ? (winnerIsLocal ? 'Your suit established the first stable beacon link.' : 'Their route reached the beacon before yours.')
    : (soloInfo ? (soloInfo.mode === 'sweep' ? 'All data cores secured. Facility sweep complete.' : 'Navigation trial complete. Route telemetry archived.') : 'Navigation trial complete.');
  ctx.fillStyle = '#7da8b0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.3))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subText, cx, cy * 0.8 + titleSize * 0.9);

  if (soloInfo) {
    const timeStr = _fmtMsDetailed(soloInfo.timeMs);
    const timeSize = Math.max(20, Math.floor(titleSize * 0.6));
    ctx.save();
    ctx.shadowColor = 'rgba(118, 244, 255, 0.4)';
    ctx.shadowBlur = timeSize * 0.5;
    ctx.fillStyle = '#76f4ff';
    ctx.font = `bold ${timeSize}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, cx, cy * 0.8 + titleSize * 1.9);
    ctx.restore();

    const pbSize = Math.max(12, Math.floor(titleSize * 0.3));
    if (soloInfo.isNewPb) {
      ctx.fillStyle = '#4dff91';
      ctx.font = `bold ${pbSize}px system-ui, sans-serif`;
      ctx.fillText('NEW ROUTE RECORD', cx, cy * 0.8 + titleSize * 1.9 + timeSize * 1.1);
    } else if (soloInfo.pbMs) {
      ctx.fillStyle = '#4a6a7a';
      ctx.font = `${pbSize}px ui-monospace, Consolas, monospace`;
      ctx.fillText(`Best  ${_fmtMsDetailed(soloInfo.pbMs)}`, cx, cy * 0.8 + titleSize * 1.9 + timeSize * 1.1);
    }
  } else if (state) {
    const doorsDisabled = state.map.doors.filter((d) => d.open).length;
    ctx.fillStyle = COLORS.chip;
    ctx.font = `${Math.max(11, Math.floor(titleSize * 0.28))}px ui-monospace, Consolas, monospace`;
    ctx.fillText(
      `Laser Doors disabled: ${doorsDisabled}  |  Chips remaining: ${state.player.chips}`,
      cx, cy * 0.8 + titleSize * 1.8
    );
  }

  const pulse = 0.5 + Math.sin(now / 620) * 0.5;
  ctx.globalAlpha = Math.max(0.08, pulse);
  ctx.fillStyle = '#a8d4e0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.28))}px system-ui, sans-serif`;
  ctx.fillText('PRESS ANY KEY  //  CLOSE DEBRIEF', cx, cy * 1.42);
  ctx.globalAlpha = 1;
}
