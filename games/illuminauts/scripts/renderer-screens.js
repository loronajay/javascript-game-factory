import { COLORS } from './config.js';
import { resizeCanvasToDisplaySize } from './renderer-primitives.js';
import { drawDarkBg, drawButton, drawRoleCard } from './renderer-ui.js';

export function renderMenu(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(32, Math.floor(Math.min(width, height) * 0.1));

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

  const btnW = Math.min(300, width * 0.44);
  const btnH = Math.max(50, Math.floor(Math.min(width, height) * 0.072));
  const btnX = cx - btnW / 2;

  drawButton(ctx, 'PLAY ONLINE', btnX, cy * 0.9, btnW, btnH, registerButton, 'btn_play_online', hoveredButtonId === 'btn_play_online');

  ctx.fillStyle = '#1e2e38';
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.18))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WASD / Arrows — move  |  Shift — sprint', cx, height - Math.max(18, height * 0.035));
}

export function renderSideSelect(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.06));

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.4)';
  ctx.shadowBlur = titleSize * 0.6;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHOOSE YOUR SUIT', cx, cy * 0.46);
  ctx.restore();

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(11, Math.floor(titleSize * 0.35))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Your suit determines your starting position — queue joins your preferred side', cx, cy * 0.46 + titleSize * 0.9);

  const cardW = Math.min(230, width * 0.3);
  const cardH = Math.max(190, cardW * 0.95);
  const gap   = Math.max(24, width * 0.035);
  const cardY = cy * 0.6;

  const alphaX = cx - gap / 2 - cardW;
  const betaX  = cx + gap / 2;
  const alphaHov = hoveredButtonId === 'btn_side_alpha';
  const betaHov  = hoveredButtonId === 'btn_side_beta';

  drawRoleCard(ctx, alphaX, cardY, cardW, cardH, 'ALPHA', 'Suit Alpha', 'West entrance', '#76f4ff', alphaHov);
  drawRoleCard(ctx, betaX,  cardY, cardW, cardH, 'BETA',  'Suit Beta', 'East entrance', '#ff8c42', betaHov);

  registerButton('btn_side_alpha', alphaX, cardY, cardW, cardH);
  registerButton('btn_side_beta',  betaX,  cardY, cardW, cardH);

  ctx.fillStyle = '#1e2e38';
  ctx.font = `${Math.max(10, Math.floor(titleSize * 0.28))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC — back to menu', cx, height - Math.max(18, height * 0.038));
}

function _renderLobbyMain(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton) {
  const btnW = Math.min(300, width * 0.44);
  const btnX = cx - btnW / 2;
  const gap  = Math.floor(btnH * 0.4);

  drawButton(ctx, 'Find Match',       btnX, cy * 0.78,            btnW, btnH, registerButton, 'btn_find_match',  hoveredButtonId === 'btn_find_match');
  drawButton(ctx, 'Play With Friend', btnX, cy * 0.78 + btnH + gap, btnW, btnH, registerButton, 'btn_play_friend', hoveredButtonId === 'btn_play_friend');
}

function _renderLobbySearching(ctx, cx, cy, width, height, btnH, searchTick, hoveredButtonId, registerButton) {
  const dots = '.'.repeat(1 + Math.floor(searchTick / 35) % 3);
  const textSize = Math.max(18, Math.floor(Math.min(width, height) * 0.046));

  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${textSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Searching for opponent' + dots, cx, cy * 0.8);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(11, Math.floor(textSize * 0.58))}px system-ui, sans-serif`;
  ctx.fillText('Waiting in public queue', cx, cy * 0.8 + textSize * 1.1);

  const btnW = Math.min(200, width * 0.3);
  drawButton(ctx, 'Cancel', cx - btnW / 2, cy * 1.28, btnW, btnH, registerButton, 'btn_cancel', hoveredButtonId === 'btn_cancel');
}

function _renderLobbyFriendOptions(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton) {
  const labelSize = Math.max(14, Math.floor(Math.min(width, height) * 0.036));

  ctx.fillStyle = '#a8c8d8';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('How would you like to connect?', cx, cy * 0.72);

  const btnW = Math.min(280, width * 0.42);
  const btnX = cx - btnW / 2;
  const gap  = Math.floor(btnH * 0.4);

  drawButton(ctx, 'Create Room', btnX, cy * 0.84,            btnW, btnH, registerButton, 'btn_create_room', hoveredButtonId === 'btn_create_room');
  drawButton(ctx, 'Enter Code',  btnX, cy * 0.84 + btnH + gap, btnW, btnH, registerButton, 'btn_enter_code',  hoveredButtonId === 'btn_enter_code');
}

function _renderLobbyCreate(ctx, cx, cy, width, height, btnH, hostCode, searchTick, hoveredButtonId, registerButton) {
  const codeSize  = Math.max(36, Math.floor(Math.min(width, height) * 0.1));
  const labelSize = Math.max(13, Math.floor(codeSize * 0.3));

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Share this code with your partner:', cx, cy * 0.58);

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.5)';
  ctx.shadowBlur = codeSize * 0.5;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${codeSize}px ui-monospace, Consolas, monospace`;
  ctx.fillText(hostCode || '···', cx, cy * 0.86);
  ctx.restore();

  const dots = '.'.repeat(1 + Math.floor(searchTick / 35) % 3);
  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(12, Math.floor(labelSize * 0.9))}px system-ui, sans-serif`;
  ctx.fillText('Waiting for partner' + dots, cx, cy * 1.06);

  const btnW = Math.min(200, width * 0.3);
  drawButton(ctx, 'Cancel', cx - btnW / 2, cy * 1.28, btnW, btnH, registerButton, 'btn_cancel', hoveredButtonId === 'btn_cancel');
}

function _renderLobbyJoin(ctx, cx, cy, width, height, btnH, codeInput, now, hoveredButtonId, registerButton) {
  const codeSize  = Math.max(28, Math.floor(Math.min(width, height) * 0.072));
  const labelSize = Math.max(13, Math.floor(codeSize * 0.48));

  ctx.fillStyle = '#a8c8d8';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText("Enter your partner's room code:", cx, cy * 0.58);

  const boxW = Math.min(320, width * 0.52);
  const boxH = Math.max(52, codeSize * 1.5);
  const boxX = cx - boxW / 2;
  const boxY = cy * 0.7;

  ctx.fillStyle = 'rgba(10, 24, 40, 0.9)';
  ctx.strokeStyle = '#76f4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  const cursorOn = Math.floor(now / 500) % 2 === 0;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${codeSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((codeInput || '') + (cursorOn ? '|' : ' '), cx, boxY + boxH / 2);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(11, Math.floor(labelSize * 0.72))}px system-ui, sans-serif`;
  ctx.fillText('Type code — Enter or click Join', cx, boxY + boxH + labelSize * 0.9);

  const btnW = Math.min(180, width * 0.27);
  const btnY  = cy * 1.28;

  drawButton(ctx, 'Join', cx - btnW - 10, btnY, btnW, btnH, registerButton, 'btn_join_submit', hoveredButtonId === 'btn_join_submit');
  drawButton(ctx, 'Back', cx + 10,        btnY, btnW, btnH, registerButton, 'btn_back',        hoveredButtonId === 'btn_back');
}

export function renderLobby(canvas, { lobbyPhase, side, hostCode, codeInput, searchTick }, hoveredButtonId, now, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(20, Math.floor(Math.min(width, height) * 0.052));
  const btnH = Math.max(44, Math.floor(Math.min(width, height) * 0.065));

  const sideColor = side === 'alpha' ? '#76f4ff' : '#ff8c42';
  const sideLabel = side === 'alpha' ? 'ALPHA' : 'BETA';

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.3)';
  ctx.shadowBlur  = titleSize * 0.5;
  ctx.fillStyle   = '#76f4ff';
  ctx.font        = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ILLUMINAUTS — ONLINE', cx, cy * 0.34);
  ctx.restore();

  ctx.fillStyle  = sideColor;
  ctx.font       = `bold ${Math.max(11, Math.floor(titleSize * 0.42))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SUIT ${sideLabel} LOCKED`, cx, cy * 0.34 + titleSize * 0.88);

  if (lobbyPhase === 'main')                _renderLobbyMain(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'searching')      _renderLobbySearching(ctx, cx, cy, width, height, btnH, searchTick, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'friend_options') _renderLobbyFriendOptions(ctx, cx, cy, width, height, btnH, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'create')         _renderLobbyCreate(ctx, cx, cy, width, height, btnH, hostCode, searchTick, hoveredButtonId, registerButton);
  else if (lobbyPhase === 'join')           _renderLobbyJoin(ctx, cx, cy, width, height, btnH, codeInput, now, hoveredButtonId, registerButton);

  ctx.fillStyle = '#1e2e38';
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

  const cx = width / 2;
  const cy = height / 2;
  const numSize = Math.max(72, Math.floor(Math.min(width, height) * 0.22));
  const labelSize = Math.max(14, Math.floor(numSize * 0.22));

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${labelSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Match starting in…', cx, cy * 0.68);

  ctx.save();
  ctx.shadowColor = 'rgba(118, 244, 255, 0.7)';
  ctx.shadowBlur = numSize * 0.5;
  ctx.fillStyle = '#76f4ff';
  ctx.font = `bold ${numSize}px system-ui, sans-serif`;
  ctx.fillText(seconds > 0 ? String(seconds) : 'GO!', cx, cy * 1.0);
  ctx.restore();
}

export function renderDisconnected(canvas, hoveredButtonId, registerButton) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  drawDarkBg(ctx, width, height, 'rgba(255, 80, 80, 0.05)');

  const cx = width / 2;
  const cy = height / 2;
  const titleSize = Math.max(22, Math.floor(Math.min(width, height) * 0.06));

  ctx.fillStyle = '#ff8080';
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Opponent disconnected', cx, cy * 0.8);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(12, Math.floor(titleSize * 0.55))}px system-ui, sans-serif`;
  ctx.fillText('The match has ended.', cx, cy * 0.8 + titleSize * 1.1);

  const btnW = Math.min(220, width * 0.34);
  const btnH = Math.max(42, Math.floor(Math.min(width, height) * 0.062));
  drawButton(ctx, 'Return to Menu', cx - btnW / 2, cy * 1.2, btnW, btnH, registerButton, 'btn_back_to_menu', hoveredButtonId === 'btn_back_to_menu');
}

export function renderWinScreen(canvas, state, now, winnerIsLocal = true, winnerName = '') {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

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
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const headline = isOnline
    ? (winnerIsLocal ? 'BEACON CORE REACHED' : `${winnerName || 'OPPONENT'} WINS`)
    : 'BEACON CORE REACHED';
  ctx.fillText(headline, cx, cy * 0.8);
  ctx.restore();

  const subText = isOnline
    ? (winnerIsLocal ? 'You reached the core first!' : 'They found a faster route.')
    : 'Suit navigation successful.';
  ctx.fillStyle = '#7da8b0';
  ctx.font = `${Math.max(13, Math.floor(titleSize * 0.36))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subText, cx, cy * 0.8 + titleSize * 0.9);

  if (state) {
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
  ctx.fillText('Press any key to return', cx, cy * 1.42);
  ctx.globalAlpha = 1;
}
