import { CROUCH_HURTBUBBLE_Y_SCALE, getActiveHitbubbles, getHurtbubbles } from '../engine/combat.js';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export function createCanvasRenderer({ canvas, match }) {
  const ctx = canvas.getContext('2d');
  let scale = 1;

  function resize(windowRef = window) {
    scale = Math.min(windowRef.innerWidth / GAME_WIDTH, windowRef.innerHeight / GAME_HEIGHT);
    canvas.width = Math.floor(GAME_WIDTH * scale);
    canvas.height = Math.floor(GAME_HEIGHT * scale);
    ctx.imageSmoothingEnabled = false;
  }

  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawStage(ctx, match.stage);
    drawFighter(ctx, match, match.fighters.p1, '#f2d16b');
    drawFighter(ctx, match, match.fighters.p2, '#72d2ff');
    drawDebugBoxes(ctx, match);
    drawImpactFlash(ctx, match);
    drawHud(ctx, match);
  }

  return { render, resize };
}

function drawStage(ctx, stage) {
  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawPlatform(ctx, stage, stage.main, '#273247', '#3e536f');
  for (const platform of stage.platforms ?? []) {
    drawPlatform(ctx, stage, platform, '#2f3b50', '#6f8fb4');
  }
}

function drawPlatform(ctx, stage, platform, fill, lip) {
  const rect = worldRectToScreen(stage, platform);
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.w, platform.kind === 'solid' ? 24 : 10);
  ctx.fillStyle = lip;
  ctx.fillRect(rect.x + 6, rect.y, Math.max(0, rect.w - 12), 4);
}

function drawFighter(ctx, match, fighter, color) {
  const { x: stageX, y: stageY } = worldPointToScreen(match.stage, fighter.position.x, fighter.position.y);
  if (fighter.archetype.id === 'falcon') {
    drawFalconInspiredFighter(ctx, fighter, stageX, stageY);
    return;
  }

  drawBlockFighter(ctx, fighter, stageX, stageY, color);
}

function drawBlockFighter(ctx, fighter, stageX, stageY, color) {
  const { width } = fighter.archetype;
  const height = fighter.state.name === 'crouch'
    ? Math.round(fighter.archetype.height * CROUCH_HURTBUBBLE_Y_SCALE)
    : fighter.archetype.height;
  const drawWidth = fighter.state.name === 'crouch' ? Math.round(width * 1.15) : width;

  ctx.fillStyle = '#090b10';
  ctx.fillRect(stageX - drawWidth / 2 - 2, stageY - height - 2, drawWidth + 4, height + 4);
  ctx.fillStyle = color;
  ctx.fillRect(stageX - drawWidth / 2, stageY - height, drawWidth, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(stageX + fighter.facing * 4, stageY - height + 8, 4, 4);
}

function drawFalconInspiredFighter(ctx, fighter, stageX, stageY) {
  const facing = fighter.facing;
  const attacking = fighter.attack && fighter.attack.frame >= fighter.attack.definition.startup;
  const crouching = fighter.state.name === 'crouch';
  const inHitstun = fighter.hitstunFrames > 0;
  const suit = inHitstun ? '#8740d8' : '#1e4dd8';
  const suitDark = '#12286f';
  const armor = '#f0c84b';
  const helmet = '#b91f35';
  const visor = '#fff2a0';
  const glove = '#f7e8bd';
  const boot = '#f0b13e';

  ctx.save();
  ctx.translate(stageX, stageY);
  ctx.scale(facing, 1);
  if (crouching) {
    ctx.scale(1.08, CROUCH_HURTBUBBLE_Y_SCALE);
  }

  // Shadow and boots.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.fillRect(-19, -3, 38, 5);
  ctx.fillStyle = boot;
  ctx.fillRect(-15, -8, 13, 8);
  ctx.fillRect(3, -8, 15, 8);
  ctx.fillStyle = '#21140d';
  ctx.fillRect(-17, -3, 17, 3);
  ctx.fillRect(3, -3, 18, 3);

  // Legs with a forward lean, because Falcon should look like he wants to explode off the line.
  ctx.fillStyle = suitDark;
  drawPixelPoly(ctx, [[-13, -31], [-3, -31], [-2, -8], [-14, -8]]);
  drawPixelPoly(ctx, [[4, -31], [15, -29], [17, -8], [5, -8]]);
  ctx.fillStyle = armor;
  ctx.fillRect(-13, -24, 10, 4);
  ctx.fillRect(6, -22, 10, 4);

  // Torso and shoulder armor.
  ctx.fillStyle = suit;
  drawPixelPoly(ctx, [[-16, -53], [14, -55], [18, -30], [-12, -28]]);
  ctx.fillStyle = armor;
  ctx.fillRect(-18, -51, 10, 12);
  ctx.fillRect(10, -53, 10, 12);
  ctx.fillRect(-8, -52, 16, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4, -48, 7, 4);

  // Arms, with attack extension when the active frames are out.
  ctx.fillStyle = suitDark;
  if (attacking) {
    drawPixelPoly(ctx, [[10, -49], [30, -45], [29, -36], [8, -39]]);
    ctx.fillStyle = glove;
    ctx.fillRect(28, -47, 15, 12);
    ctx.fillStyle = 'rgba(255, 232, 126, 0.48)';
    ctx.fillRect(40, -48, 16, 14);
  } else {
    drawPixelPoly(ctx, [[10, -49], [22, -41], [17, -33], [6, -40]]);
    ctx.fillStyle = glove;
    ctx.fillRect(15, -35, 10, 10);
  }
  ctx.fillStyle = suitDark;
  drawPixelPoly(ctx, [[-15, -49], [-24, -38], [-19, -31], [-9, -41]]);
  ctx.fillStyle = glove;
  ctx.fillRect(-26, -35, 10, 10);

  // Helmet, visor, and crest.
  ctx.fillStyle = helmet;
  ctx.fillRect(-12, -70, 24, 18);
  ctx.fillRect(-7, -76, 17, 7);
  ctx.fillStyle = '#6f0e22';
  ctx.fillRect(-13, -64, 5, 12);
  ctx.fillStyle = visor;
  ctx.fillRect(0, -67, 13, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(9, -66, 3, 2);

  ctx.restore();
}

function drawPixelPoly(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) {
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDebugBoxes(ctx, match) {
  for (const fighter of [match.fighters.p1, match.fighters.p2]) {
    for (const hurtbubble of getHurtbubbles(fighter)) {
      drawWorldBubble(ctx, match.stage, hurtbubble, 'rgba(255, 224, 64, 0.28)', 'rgba(255, 236, 92, 0.88)');
    }
  }
  for (const hitbubble of match.debugHitbubbles ?? []) {
    drawWorldBubble(ctx, match.stage, hitbubble, 'rgba(255, 48, 48, 0.36)', 'rgba(255, 64, 64, 0.95)');
  }
}

function drawWorldBubble(ctx, stage, bubble, fill, stroke) {
  const point = worldPointToScreen(stage, bubble.x, bubble.y);
  ctx.beginPath();
  if (bubble.rx && bubble.ry) {
    ctx.ellipse(point.x, point.y, bubble.rx, bubble.ry, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(point.x, point.y, bubble.radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function worldPointToScreen(stage, x, y) {
  return {
    x: GAME_WIDTH / 2 + x,
    y: 390 + (y - stage.main.y),
  };
}

function worldRectToScreen(stage, platform) {
  const point = worldPointToScreen(stage, platform.x, platform.y);
  return { x: point.x, y: point.y, w: platform.w };
}

function drawImpactFlash(ctx, match) {
  if (match.lastHits.length === 0) return;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function drawHud(ctx, match) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f5f7fb';
  ctx.font = "16px 'Segoe UI', system-ui, sans-serif";
  drawFighterHud(ctx, match.fighters.p1, 18, 28);
  drawFighterHud(ctx, match.fighters.p2, 18, 54);
}

function drawFighterHud(ctx, fighter, x, y) {
  const hitstun = fighter.hitstunFrames > 0 ? ` hitstun:${fighter.hitstunFrames}` : '';
  ctx.fillText(
    `${fighter.id.toUpperCase()} ${fighter.archetype.displayName} ${Math.round(fighter.damage)}% ${fighter.state.name}${hitstun}`,
    x,
    y,
  );
}
