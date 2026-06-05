import { W, H, CX, MENU_BTNS, HTP_BTNS, END_BTNS_GAMEOVER, END_BTNS_CLEAR } from "../core/constants.mjs";
import { STAGES } from "../systems/stages.mjs";

export function renderMenuScreen(ctx, game, t) {
  ctx.save();

  const cardX = CX - 280;
  const cardY = 96;
  const cardW = 560;
  const cardH = 480;
  ctx.fillStyle = "rgba(2, 7, 16, 0.78)";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(52, 247, 255, 0.18)";
  ctx.fillRect(cardX + 60, cardY, cardW - 120, 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const glow = 14 + Math.sin(t * 0.0014) * 8;
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = glow;
  ctx.fillStyle = "#d8fbff";
  ctx.fillText("COCKPIT SWARM", CX, 130);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(52, 247, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 40, 226);
  ctx.lineTo(cardX + cardW - 40, 226);
  ctx.stroke();

  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
  ctx.fillText(`SECTOR DEFENSE SYSTEM  ·  ${STAGES.length} STAGES`, CX, 240);

  for (let i = 0; i < MENU_BTNS.length; i++) {
    drawMenuButton(ctx, MENU_BTNS[i], game.menu.selectedButton === i, t);
  }

  ctx.strokeStyle = "rgba(52, 247, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(cardX + 40, cardY + cardH - 44);
  ctx.lineTo(cardX + cardW - 40, cardY + cardH - 44);
  ctx.stroke();

  ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.28)";
  ctx.textBaseline = "bottom";
  ctx.fillText("↑ ↓  NAVIGATE    ENTER  CONFIRM    MOUSE  CLICK", CX, cardY + cardH - 12);

  ctx.restore();
}

export function renderHowToPlayScreen(ctx, game, t) {
  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "900 48px system-ui, sans-serif";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#d8fbff";
  ctx.fillText("HOW TO PLAY", CX, 52);
  ctx.shadowBlur = 0;

  const px = CX - 440;
  const py = 122;
  const pw = 880;
  const ph = 378;
  ctx.fillStyle = "rgba(3, 11, 20, 0.82)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const col1 = px + 46;
  const col2 = CX + 32;

  ctx.textAlign = "left";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.65)";
  ctx.fillText("CONTROLS", col1, py + 24);
  ctx.fillText("TIPS", col2, py + 24);

  ctx.strokeStyle = "rgba(52, 247, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 24, py + 50);
  ctx.lineTo(px + pw - 24, py + 50);
  ctx.stroke();

  const controls = [
    ["← / A",     "Strafe left"],
    ["→ / D",     "Strafe right"],
    ["SPACE / J", "Fire cannon"],
    ["ESC",       "Return to menu"],
  ];

  ctx.font = "700 17px system-ui, sans-serif";
  for (let i = 0; i < controls.length; i++) {
    const y = py + 68 + i * 56;
    ctx.fillStyle = "#34f7ff";
    ctx.fillText(controls[i][0], col1, y);
    ctx.fillStyle = "rgba(216, 251, 255, 0.78)";
    ctx.font = "500 17px system-ui, sans-serif";
    ctx.fillText(controls[i][1], col1 + 156, y);
    ctx.font = "700 17px system-ui, sans-serif";
  }

  const tips = [
    "Only the front enemy row fires back",
    "Strafe out of bullet lanes to dodge",
    ["RAPID", "hold fire for full-auto"],
    ["SPLASH", "shot hits nearby enemies"],
    ["BOOST", "move at double speed"],
    ["HEALTH", "restores one hull point"],
  ];

  ctx.font = "500 16px system-ui, sans-serif";
  for (let i = 0; i < tips.length; i++) {
    const y = py + 68 + i * 52;
    const tip = tips[i];
    if (Array.isArray(tip)) {
      ctx.fillStyle = "#78ff9d";
      ctx.font = "700 16px system-ui, sans-serif";
      ctx.fillText(tip[0], col2, y);
      ctx.fillStyle = "rgba(216, 251, 255, 0.62)";
      ctx.font = "500 16px system-ui, sans-serif";
      ctx.fillText("— " + tip[1], col2 + 84, y);
    } else {
      ctx.fillStyle = "rgba(216, 251, 255, 0.72)";
      ctx.fillText("• " + tip, col2, y);
    }
  }

  ctx.strokeStyle = "rgba(52, 247, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX + 8, py + 56);
  ctx.lineTo(CX + 8, py + ph - 20);
  ctx.stroke();

  drawMenuButton(ctx, HTP_BTNS[0], game.menu.selectedButton === 0, t);

  ctx.textAlign = "center";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.28)";
  ctx.textBaseline = "bottom";
  ctx.fillText("ENTER or ESC to go back", CX, H - 22);

  ctx.restore();
}

export function renderEndScreen(ctx, game, t, isGameOver) {
  ctx.save();

  ctx.fillStyle = isGameOver ? "rgba(0,0,0,0.78)" : "rgba(0,0,0,0.66)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const bossRush = game.mode === "bossRush";
  const title = isGameOver
    ? "COCKPIT BREACHED"
    : (bossRush ? "BOSS RUSH CLEAR" : "SECTOR CLEAR");
  const accentColor = isGameOver ? "#ff365d" : "#78ff9d";
  ctx.font = "900 64px system-ui, sans-serif";
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 24 + Math.sin(t * 0.002) * 8;
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(title, CX, 150);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(4, 12, 22, 0.76)";
  ctx.beginPath();
  ctx.roundRect(CX - 290, 244, 580, 164, 10);
  ctx.fill();
  ctx.strokeStyle = `rgba(${isGameOver ? "255,54,93" : "120,255,157"},0.25)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = "800 48px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(game.score.toLocaleString(), CX, 266);

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.58)";
  ctx.fillText("SCORE", CX, 326);

  const accuracy = game.shotsFired ? Math.round((game.shotsHit / game.shotsFired) * 100) : 0;
  ctx.font = "500 17px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.textBaseline = "middle";

  const stageLabel = isGameOver
    ? (bossRush ? "BOSS RUSH" : `STAGE ${game.wave.stageIndex + 1} / ${STAGES.length}`)
    : (bossRush ? "ALL BOSSES DOWN" : "ALL STAGES CLEARED");

  drawStatRow(ctx, CX, 370, [
    ["COMBO",    String(game.combo)],
    ["ACC",      `${accuracy}%`],
    ["STAGE",    stageLabel],
  ]);

  const btns = isGameOver ? END_BTNS_GAMEOVER : END_BTNS_CLEAR;
  for (let i = 0; i < btns.length; i++) {
    drawMenuButton(ctx, btns[i], game.menu.selectedButton === i, t);
  }

  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(216, 251, 255, 0.28)";
  ctx.fillText("↑ ↓  NAVIGATE    ENTER  CONFIRM    ESC  MAIN MENU", CX, H - 22);

  ctx.restore();
}

function drawStatRow(ctx, cx, y, stats) {
  const colW = 186;
  const startX = cx - colW * (stats.length - 1) * 0.5;

  for (let i = 0; i < stats.length; i++) {
    const x = startX + i * colW;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillStyle = "#d8fbff";
    ctx.textAlign = "center";
    ctx.fillText(stats[i][1], x, y - 10);

    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
    ctx.fillText(stats[i][0], x, y + 14);
  }
}

export function drawMenuButton(ctx, btn, selected, t) {
  ctx.save();

  const pulse = selected ? (Math.sin(t * 0.004) * 0.5 + 0.5) : 0;

  ctx.shadowBlur  = selected ? 14 + pulse * 10 : 0;
  ctx.shadowColor = "#34f7ff";
  ctx.fillStyle   = selected ? "rgba(52, 247, 255, 0.13)" : "rgba(4, 14, 26, 0.68)";
  ctx.strokeStyle = selected
    ? `rgba(52, 247, 255, ${0.68 + pulse * 0.32})`
    : "rgba(52, 247, 255, 0.26)";
  ctx.lineWidth = selected ? 2 : 1;

  ctx.beginPath();
  ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = selected ? 6 : 0;
  ctx.font = `${selected ? "700" : "600"} 20px system-ui, sans-serif`;
  ctx.fillStyle = selected ? "#d8fbff" : "rgba(216, 251, 255, 0.44)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5);

  ctx.restore();
}
