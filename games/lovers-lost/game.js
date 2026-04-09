const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = 800;
canvas.height = 450;
ctx.imageSmoothingEnabled = false;

// ─── Sprite config ─────────────────────────────────────────────────────────────
const FRAME_W  = 16;   // pixels per frame in sheet
const FRAME_H  = 16;
const FRAMES   = 6;    // frames per row (96 / 16 = 6)
const SCALE    = 3;    // render scale
const SW = FRAME_W * SCALE;   // 48px rendered width
const SH = FRAME_H * SCALE;   // 48px rendered height

// ─── Physics ──────────────────────────────────────────────────────────────────
const GRAVITY   =  0.55;
const JUMP      = -13;
const WALK      =  4;

// ─── Images ───────────────────────────────────────────────────────────────────
const boyImg  = new Image();  boyImg.src  = 'images/boy.png';
const girlImg = new Image();  girlImg.src = 'images/girl.png';

// ─── Levels ───────────────────────────────────────────────────────────────────
// Each platform: { x, y, w, h, color }
// Palette: deep purple / blue / forest
const LEVELS = [
  {
    bg:      '#18082e',
    accent:  '#b04eff',
    ground:  '#4a2060',
    plat:    '#6a3080',
    highlight: '#9050b0',
    playerStart: { x: 60,  y: 350 },
    girlPos:     { x: 700, y: 354 },
    platforms: [
      { x: 0,   y: 402, w: 800, h: 48 },   // ground
      { x: 140, y: 320, w: 120, h: 16 },
      { x: 340, y: 258, w: 120, h: 16 },
      { x: 540, y: 320, w: 140, h: 16 },
    ],
  },
  {
    bg:      '#081828',
    accent:  '#44aaff',
    ground:  '#1a4060',
    plat:    '#2a6090',
    highlight: '#3a80b0',
    playerStart: { x: 50,  y: 355 },
    girlPos:     { x: 680, y: 188 },
    platforms: [
      { x: 0,   y: 402, w: 280, h: 48 },
      { x: 370, y: 402, w: 430, h: 48 },
      { x: 100, y: 312, w: 100, h: 16 },
      { x: 270, y: 244, w: 100, h: 16 },
      { x: 440, y: 316, w: 100, h: 16 },
      { x: 610, y: 236, w: 120, h: 16 },
    ],
  },
  {
    bg:      '#081808',
    accent:  '#44ff88',
    ground:  '#1a4020',
    plat:    '#2a6030',
    highlight: '#3a8040',
    playerStart: { x: 40,  y: 355 },
    girlPos:     { x: 700, y: 164 },
    platforms: [
      { x: 0,   y: 402, w: 160, h: 48 },
      { x: 230, y: 374, w:  90, h: 76 },
      { x: 390, y: 346, w:  90, h: 104 },
      { x: 550, y: 318, w:  90, h: 132 },
      { x: 680, y: 210, w: 120, h: 240 },
      { x:  90, y: 298, w:  80, h: 16 },
      { x: 310, y: 244, w:  80, h: 16 },
      { x: 480, y: 196, w:  80, h: 16 },
    ],
  },
];

// ─── Game state ───────────────────────────────────────────────────────────────
let gameState  = 'menu';   // menu | playing | levelClear | win | over
let levelIndex = 0;
let lives      = 3;

// ─── Player ───────────────────────────────────────────────────────────────────
let player = {};

function resetPlayer() {
  const { x, y } = LEVELS[levelIndex].playerStart;
  player = { x, y, vx: 0, vy: 0, w: SW, h: SH, onGround: false,
             frame: 0, frameTick: 0, facing: 1 };
}

// ─── Girl ─────────────────────────────────────────────────────────────────────
let girl = {};

function resetGirl() {
  const { x, y } = LEVELS[levelIndex].girlPos;
  girl = { x, y, w: SW, h: SH, frame: 0, frameTick: 0 };
}

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  handleMenuKeys(e.key);
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

function handleMenuKeys(key) {
  if (key !== 'Enter') return;
  if (gameState === 'menu') {
    levelIndex = 0; lives = 3;
    resetPlayer(); resetGirl();
    gameState = 'playing';
  } else if (gameState === 'levelClear') {
    resetPlayer(); resetGirl();
    gameState = 'playing';
  } else if (gameState === 'win' || gameState === 'over') {
    levelIndex = 0; lives = 3;
    gameState = 'menu';
  }
}

// ─── AABB collision ───────────────────────────────────────────────────────────
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolvePlatforms(platforms) {
  player.onGround = false;
  for (const p of platforms) {
    if (!overlap(player, p)) continue;

    const left  = (player.x + player.w) - p.x;
    const right = (p.x + p.w) - player.x;
    const top   = (player.y + player.h) - p.y;
    const bot   = (p.y + p.h) - player.y;
    const min   = Math.min(left, right, top, bot);

    if (min === top && player.vy >= 0) {
      player.y        = p.y - player.h;
      player.vy       = 0;
      player.onGround = true;
    } else if (min === bot && player.vy < 0) {
      player.y  = p.y + p.h;
      player.vy = 0;
    } else if (min === left) {
      player.x  = p.x - player.w;
      player.vx = 0;
    } else if (min === right) {
      player.x  = p.x + p.w;
      player.vx = 0;
    }
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update() {
  if (gameState !== 'playing') return;

  const lvl  = LEVELS[levelIndex];
  const left  = keys['ArrowLeft']  || keys['a'] || keys['A'];
  const right = keys['ArrowRight'] || keys['d'] || keys['D'];
  const jump  = keys['ArrowUp']    || keys['w'] || keys['W'] || keys[' '];

  player.vx = right ? WALK : left ? -WALK : 0;
  if (right) player.facing = 1;
  if (left)  player.facing = -1;
  if (jump && player.onGround) player.vy = JUMP;

  player.vy += GRAVITY;
  player.x  += player.vx;
  player.y  += player.vy;
  resolvePlatforms(lvl.platforms);

  // Fell off screen
  if (player.y > canvas.height + 60) {
    lives--;
    if (lives <= 0) { gameState = 'over'; return; }
    resetPlayer();
  }

  // Player animation
  player.frameTick++;
  if (!player.onGround) {
    player.frame = 4;                        // jump frame
  } else if (player.vx !== 0) {
    if (player.frameTick >= 7) {             // walk cycle: frames 1-3
      player.frame = (((player.frame - 1 + 1) % 3) + 1);
      player.frameTick = 0;
    }
  } else {
    player.frame     = 0;                    // idle
    player.frameTick = 0;
  }

  // Girl idle bob animation (frames 0 and 5)
  girl.frameTick++;
  if (girl.frameTick >= 30) {
    girl.frame     = girl.frame === 0 ? 5 : 0;
    girl.frameTick = 0;
  }

  // Reached girl?
  if (overlap(player, girl)) {
    if (levelIndex < LEVELS.length - 1) {
      levelIndex++;
      gameState = 'levelClear';
    } else {
      gameState = 'win';
    }
  }
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawSprite(img, frame, x, y, flipX = false) {
  ctx.save();
  if (flipX) {
    ctx.translate(x + SW, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, SW, SH);
  } else {
    ctx.drawImage(img, frame * FRAME_W, 0, FRAME_W, FRAME_H, x, y, SW, SH);
  }
  ctx.restore();
}

function drawStars(seed) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 50; i++) {
    const sx = ((i * 139 + seed * 37) % 790) + 5;
    const sy = ((i * 97  + seed * 23) % 400) + 5;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
}

function drawHUD() {
  ctx.textAlign = 'left';
  ctx.font      = 'bold 16px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Level ${levelIndex + 1} / ${LEVELS.length}`, 12, 24);

  // Hearts
  ctx.fillStyle = '#ff4466';
  ctx.font      = '20px sans-serif';
  for (let i = 0; i < lives; i++) {
    ctx.fillText('♥', canvas.width - 34 - i * 26, 26);
  }
}

// ─── Screen draw functions ────────────────────────────────────────────────────
function drawMenu() {
  ctx.fillStyle = '#18082e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars(0);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffaadd';
  ctx.font      = 'bold 58px serif';
  ctx.fillText('Lovers Lost', canvas.width / 2, 155);

  if (boyImg.complete && girlImg.complete) {
    const cx = canvas.width / 2;
    drawSprite(boyImg,  0, cx - 90, 190);
    drawSprite(girlImg, 0, cx + 42, 190, true);
  }

  ctx.fillStyle = '#cc88ff';
  ctx.font      = '21px monospace';
  ctx.fillText('Press  ENTER  to start', canvas.width / 2, 325);

  ctx.fillStyle = '#7755aa';
  ctx.font      = '14px monospace';
  ctx.fillText('Arrow Keys / WASD  ·  Space to jump', canvas.width / 2, 360);
}

function drawLevelClear() {
  const lvl = LEVELS[levelIndex];
  ctx.fillStyle = lvl.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars(levelIndex);

  ctx.textAlign = 'center';
  ctx.fillStyle = lvl.accent;
  ctx.font      = 'bold 46px serif';
  ctx.fillText('Found her!', canvas.width / 2, 180);

  ctx.fillStyle = '#ffffff';
  ctx.font      = '20px monospace';
  ctx.fillText(`Level ${levelIndex}  complete!`, canvas.width / 2, 248);

  ctx.fillStyle = '#888888';
  ctx.font      = '15px monospace';
  ctx.fillText('Press ENTER to continue', canvas.width / 2, 300);
}

function drawWin() {
  ctx.fillStyle = '#08040f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars(99);

  // Pulsing glow
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  ctx.save();
  ctx.globalAlpha = pulse * 0.25;
  const grad = ctx.createRadialGradient(canvas.width/2, 230, 0, canvas.width/2, 230, 150);
  grad.addColorStop(0, '#ff88cc');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(canvas.width/2 - 150, 80, 300, 300);
  ctx.restore();

  if (boyImg.complete && girlImg.complete) {
    const cx = canvas.width / 2;
    drawSprite(boyImg,  0, cx - 78, 200);
    drawSprite(girlImg, 0, cx + 30, 200, true);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffaadd';
  ctx.font      = 'bold 52px serif';
  ctx.fillText('Together Again', canvas.width / 2, 158);

  ctx.fillStyle = '#ff88cc';
  ctx.font      = '20px monospace';
  ctx.fillText('You reunited the lovers  ♥', canvas.width / 2, 340);

  ctx.fillStyle = '#666666';
  ctx.font      = '14px monospace';
  ctx.fillText('Press ENTER to play again', canvas.width / 2, 385);
}

function drawGameOver() {
  ctx.fillStyle = '#0a0005';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars(42);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3355';
  ctx.font      = 'bold 56px serif';
  ctx.fillText('Lost...', canvas.width / 2, 185);

  ctx.fillStyle = '#cc7788';
  ctx.font      = '20px monospace';
  ctx.fillText('The lovers never found each other.', canvas.width / 2, 255);

  ctx.fillStyle = '#666666';
  ctx.font      = '15px monospace';
  ctx.fillText('Press ENTER to try again', canvas.width / 2, 315);
}

function drawLevel() {
  const lvl = LEVELS[levelIndex];
  ctx.fillStyle = lvl.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars(levelIndex);

  // Platforms
  for (const p of lvl.platforms) {
    ctx.fillStyle = lvl.plat;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = lvl.highlight;
    ctx.fillRect(p.x, p.y, p.w, 3);
  }

  // Girl glow
  const pulse = 0.35 + 0.25 * Math.sin(Date.now() / 450);
  ctx.save();
  ctx.globalAlpha = pulse;
  const g = ctx.createRadialGradient(girl.x + SW/2, girl.y + SH/2, 2, girl.x + SW/2, girl.y + SH/2, SW);
  g.addColorStop(0, lvl.accent);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(girl.x - SW, girl.y - SW, SW * 3, SH * 3);
  ctx.restore();

  drawSprite(girlImg, girl.frame,   girl.x,   girl.y,   girl.facing !== undefined ? girl.facing === -1 : true);
  drawSprite(boyImg,  player.frame, player.x, player.y, player.facing === -1);

  drawHUD();
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (gameState === 'menu')       { drawMenu();     return; }
  if (gameState === 'levelClear') { drawLevelClear(); return; }
  if (gameState === 'win')        { drawWin();      return; }
  if (gameState === 'over')       { drawGameOver(); return; }
  drawLevel();
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

let loaded = 0;
function onLoad() { if (++loaded === 2) loop(); }
boyImg.onload   = onLoad;
girlImg.onload  = onLoad;
boyImg.onerror  = onLoad;
girlImg.onerror = onLoad;
