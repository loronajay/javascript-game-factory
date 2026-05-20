import {
  GAME_STAGE,
  SCRATCH_STAGE,
  costumeDrawRect,
  scratchToCanvasPoint,
  scratchToGamePoint,
} from "./coordinates.js";
import { findCostume, findTarget, loadCostumeImage, loadImage, loadScratchImage } from "./assets.js";
import {
  MENU_BIRD_FRAME_FILES,
  MENU_BIRD_PLACEMENTS,
  getMenuBirdFrameIndex,
} from "./menu-birds.js";
import { getMenuButtonByAction } from "./menu-input.js";
import { buildMenuSprites } from "./menu-scene.js";
import { PLAYER_FRAME_FILES, PLAYER_RENDER_SCALE, getPlayerFrameIndex } from "./player.js";
import { POOP_RENDER_SCALE } from "./poop.js";
import { NPC_DEFINITIONS, getNpcFrameFile } from "./npcs.js";
import { TWO_PLAYER_BUTTONS } from "./two-player-menu.js";
import { HOTSEAT_PHASE, HOTSEAT_ROUNDS } from "./hotseat-session.js";

const HUD_TEXT_COLOR = "#ffffff";
const HUD_TEXT_SHADOW = "rgba(0, 0, 0, 0.35)";
const HUD_VALUE_FONT = "Arial, Helvetica, sans-serif";
const GAME_OVER_FONT = '"Moonlit Free", Georgia, serif';
const HUD_SHOTS_VALUE_X = 445;
const HUD_SCORE_VALUE_X = 795;
const HUD_VALUE_Y = 46;
const MENU_PERSONAL_BEST_VALUE_X = 400;
const MENU_PERSONAL_BEST_VALUE_Y = 154;
const MENU_PERSONAL_BEST_BOX = Object.freeze({
  x: 375,
  y: 139,
  width: 52,
  height: 26,
  radius: 4,
});

function resolveCostumeSize(image, costume) {
  return {
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0,
    rotationCenterX: costume.rotationCenterX,
    rotationCenterY: costume.rotationCenterY,
  };
}

export function buildCenteredImageRect(imageSize, sprite) {
  const center = scratchToGamePoint(sprite.x || 0, sprite.y || 0);
  const scale = sprite.scale || 1;
  return {
    x: center.x - (imageSize.width * scale) / 2,
    y: center.y - (imageSize.height * scale) / 2,
    width: imageSize.width * scale,
    height: imageSize.height * scale,
  };
}

export async function createBirdDutyRenderer(canvas, manifest) {
  const ctx = canvas.getContext("2d");
  const stageTarget = findTarget(manifest, "Stage");
  const menuCostume = findCostume(stageTarget, "menu");
  const menuBackdrop = await loadCostumeImage(menuCostume);
  const multiplayerMenuBackdrop = await loadScratchImage("assets/scratch/menu-blank.svg");
  const multiplayerTitleImage = await loadScratchImage("assets/scratch/multiplayer-title.svg");
  const multiplayerButtonImage = await loadScratchImage("assets/scratch/multiplayer.svg");
  const twoPlayerButtonImages = new Map();
  await Promise.all(
    TWO_PLAYER_BUTTONS.filter((button) => button.asset).map(async (button) => {
      twoPlayerButtonImages.set(button.asset, await loadScratchImage(button.asset));
    })
  );
  const menuSize = resolveCostumeSize(menuBackdrop, menuCostume);
  const gameBackdrop = await loadImage("assets/scratch/pngs/game-bg.png");
  const menuBirdFrames = await Promise.all(MENU_BIRD_FRAME_FILES.map(loadImage));
  const playerFrames = await Promise.all(PLAYER_FRAME_FILES.map(loadImage));
  const poopImage = await loadImage("assets/scratch/pngs/shit.png");
  const splatImage = await loadImage("assets/scratch/pngs/splatter.png");
  const npcImages = new Map();
  const npcFrameFiles = new Set();
  for (const def of Object.values(NPC_DEFINITIONS)) {
    for (const file of [...def.frames, ...def.poseFrames]) {
      npcFrameFiles.add(`assets/scratch/pngs/${file}`);
    }
  }
  await Promise.all(
    [...npcFrameFiles].map(async (file) => {
      npcImages.set(file, await loadImage(file));
    })
  );
  const menuSprites = await Promise.all(
    buildMenuSprites(manifest).map(async (sprite) => {
      const target = findTarget(manifest, sprite.targetName);
      const costume = target.costumes[target.currentCostume || 0];
      const image = target.name === "MULTIPLAYER" ? multiplayerButtonImage : await loadCostumeImage(costume);
      return {
        ...sprite,
        costume,
        image,
        imageSize: resolveCostumeSize(image, costume),
      };
    })
  );

  function resize() {
    canvas.width = SCRATCH_STAGE.width;
    canvas.height = SCRATCH_STAGE.height;
    ctx.imageSmoothingEnabled = false;
  }

  function resizeForStage(stage) {
    if (canvas.width !== stage.width) canvas.width = stage.width;
    if (canvas.height !== stage.height) canvas.height = stage.height;
    canvas.style.setProperty("--bird-duty-aspect", String(stage.width / stage.height));
    ctx.imageSmoothingEnabled = false;
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawCostume(image, costume, size, sprite = {}, options = {}) {
    const rect = costumeDrawRect({
      x: sprite.x || 0,
      y: sprite.y || 0,
      width: size.width,
      height: size.height,
      rotationCenterX: costume.rotationCenterX,
      rotationCenterY: costume.rotationCenterY,
      size: sprite.size || 100,
    });
    if (!options.glowGrow) {
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      return;
    }

    const grow = 1.06;
    const grownWidth = rect.width * grow;
    const grownHeight = rect.height * grow;
    const grownX = rect.x - (grownWidth - rect.width) / 2;
    const grownY = rect.y - (grownHeight - rect.height) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(255, 130, 20, 0.95)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(image, grownX, grownY, grownWidth, grownHeight);
    ctx.shadowColor = "rgba(255, 0, 112, 0.75)";
    ctx.shadowBlur = 5;
    ctx.drawImage(image, grownX, grownY, grownWidth, grownHeight);
    ctx.restore();
  }

  function drawMenuBird(image, placement) {
    const rect = costumeDrawRect({
      x: placement.x,
      y: placement.y,
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
      rotationCenterX: (image.naturalWidth || image.width || 0) / 2,
      rotationCenterY: (image.naturalHeight || image.height || 0) / 2,
      size: placement.size,
    });

    ctx.save();
    if (placement.mirrored) {
      ctx.translate(rect.x + rect.width, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, rect.width, rect.height);
    } else {
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    ctx.restore();
  }

  function drawFullCanvasImage(image) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  function drawScratchImageCentered(image, sprite) {
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    const rect = buildCenteredImageRect({ width, height }, sprite);

    ctx.save();
    if (sprite.mirrored) {
      ctx.translate(rect.x + rect.width, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, rect.width, rect.height);
    } else {
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    ctx.restore();
  }

  function drawCanvasImageCentered(image, sprite) {
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    const scale = sprite.scale || 1;
    ctx.drawImage(
      image,
      sprite.x - (width * scale) / 2,
      sprite.y - (height * scale) / 2,
      width * scale,
      height * scale
    );
  }

  function drawScratchAsset(image, sprite = {}, options = {}) {
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    const rect = costumeDrawRect({
      x: sprite.x || 0,
      y: sprite.y || 0,
      width,
      height,
      rotationCenterX: sprite.rotationCenterX ?? width / 2,
      rotationCenterY: sprite.rotationCenterY ?? height / 2,
      size: sprite.size || 100,
    });
    const grow = options.glowGrow ? 1.06 : 1;
    const drawWidth = rect.width * grow;
    const drawHeight = rect.height * grow;
    const drawX = rect.x - (drawWidth - rect.width) / 2;
    const drawY = rect.y - (drawHeight - rect.height) / 2;

    ctx.save();
    if (options.glowGrow) {
      ctx.shadowColor = "rgba(255, 130, 20, 0.95)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawNpc(entity) {
    const def = NPC_DEFINITIONS[entity.type];
    const file = getNpcFrameFile(entity.type, entity.animationTick || 0, entity.poseTicks || 0);
    const image = npcImages.get(file);
    if (!def || !image) return;

    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    const drawWidth = width * def.scale;
    const drawHeight = height * def.scale;
    const x = entity.x - drawWidth / 2;
    const y = entity.y - drawHeight;

    ctx.save();
    if (entity.direction < 0) {
      ctx.translate(x + drawWidth, y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
    } else {
      ctx.drawImage(image, x, y, drawWidth, drawHeight);
    }
    ctx.restore();
  }

  function drawHudNumber(value, x, y) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `44px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = HUD_TEXT_SHADOW;
    ctx.fillText(String(value), x + 2, y + 2);
    ctx.fillStyle = HUD_TEXT_COLOR;
    ctx.fillText(String(value), x, y);
    ctx.restore();
  }

  function drawMenuPersonalBest(value) {
    ctx.save();
    ctx.fillStyle = "#ff861a";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(
      MENU_PERSONAL_BEST_BOX.x,
      MENU_PERSONAL_BEST_BOX.y,
      MENU_PERSONAL_BEST_BOX.width,
      MENU_PERSONAL_BEST_BOX.height,
      MENU_PERSONAL_BEST_BOX.radius
    );
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `24px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(value ?? 0), MENU_PERSONAL_BEST_VALUE_X, MENU_PERSONAL_BEST_VALUE_Y);
    ctx.restore();
  }

  function drawMenuButton(button, hot = false, disabled = false) {
    const image = button.asset ? twoPlayerButtonImages.get(button.asset) : null;
    if (image) {
      drawScratchAsset(image, {
        x: button.x,
        y: button.y,
        size: button.size || 120,
        rotationCenterX: 53.5,
        rotationCenterY: 23.5,
      }, {
        glowGrow: hot && !disabled,
      });
      return;
    }

    const center = scratchToCanvasPoint(button.x, button.y);
    const grow = hot && !disabled ? 1.06 : 1;
    const width = button.width * grow;
    const height = button.height * grow;
    const x = center.x - width / 2;
    const y = center.y - height / 2;

    ctx.save();
    if (hot && !disabled) {
      ctx.shadowColor = "rgba(255, 130, 20, 0.95)";
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = disabled ? "#b43535" : "#ff4a17";
    ctx.strokeStyle = "#b50000";
    ctx.lineWidth = 7;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = disabled ? "#d8d8d8" : "#b8ff00";
    ctx.strokeStyle = "#8b0000";
    ctx.lineWidth = 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `24px ${GAME_OVER_FONT}`;
    ctx.strokeText(button.label, center.x, center.y + 1);
    ctx.fillText(button.label, center.x, center.y + 1);
    ctx.restore();
  }

  function drawGameOver(session) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `72px ${GAME_OVER_FONT}`;
    ctx.fillStyle = "#b8ff00";
    ctx.strokeStyle = "#b50000";
    ctx.lineWidth = 5;
    ctx.strokeText("GAME OVER", GAME_STAGE.width / 2, 310);
    ctx.fillText("GAME OVER", GAME_STAGE.width / 2, 310);
    ctx.font = `42px ${HUD_VALUE_FONT}`;
    ctx.strokeText(`FINAL SCORE: ${session.finalScore ?? session.score ?? 0}`, GAME_STAGE.width / 2, 380);
    ctx.fillText(`FINAL SCORE: ${session.finalScore ?? session.score ?? 0}`, GAME_STAGE.width / 2, 380);
    ctx.restore();
  }

  function playerLabel(player) {
    return player === "p2" ? "P2" : "P1";
  }

  function drawHotseatHud(hotseat) {
    if (!hotseat) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (hotseat.currentPlayer === "p1") {
      ctx.strokeStyle = "#b8ff00";
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 100, 142, 88);
    } else {
      ctx.strokeStyle = "#b8ff00";
      ctx.lineWidth = 4;
      ctx.strokeRect(1138, 100, 142, 88);
    }
    ctx.font = `36px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#36ff36";
    ctx.fillText("P1", 88, 132);
    ctx.fillStyle = "#ffffff";
    ctx.font = `28px ${HUD_VALUE_FONT}`;
    ctx.fillText(String(hotseat.scores.p1), 88, 165);
    ctx.fillStyle = "#ffb136";
    ctx.font = `36px ${HUD_VALUE_FONT}`;
    ctx.fillText("P2", 1217, 132);
    ctx.fillStyle = "#ffffff";
    ctx.font = `28px ${HUD_VALUE_FONT}`;
    ctx.fillText(String(hotseat.scores.p2), 1217, 165);
    ctx.font = `30px ${HUD_VALUE_FONT}`;
    ctx.fillText(`ROUND ${hotseat.round}/${HOTSEAT_ROUNDS}`, 1060, 46);
    ctx.restore();
  }

  function drawHotseatOverlay(hotseat) {
    if (!hotseat || hotseat.phase === HOTSEAT_PHASE.PLAYING) return;
    const isFinal = hotseat.phase === HOTSEAT_PHASE.MATCH_OVER;
    const title = isFinal
      ? hotseat.winner === "tie"
        ? "TIE GAME"
        : `${playerLabel(hotseat.winner)} WINS`
      : `${playerLabel(hotseat.currentPlayer)} READY`;
    const subtitle = isFinal
      ? `P1: ${hotseat.scores.p1}  -  P2: ${hotseat.scores.p2}`
      : `ROUND ${hotseat.round} - PRESS SPACE`;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 72px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "#b8ff00";
    ctx.strokeStyle = "#b50000";
    ctx.lineWidth = 5;
    ctx.strokeText(title, GAME_STAGE.width / 2, 310);
    ctx.fillText(title, GAME_STAGE.width / 2, 310);
    ctx.font = `42px ${HUD_VALUE_FONT}`;
    ctx.strokeText(subtitle, GAME_STAGE.width / 2, 380);
    ctx.fillText(subtitle, GAME_STAGE.width / 2, 380);
    if (isFinal) {
      ctx.font = `30px ${HUD_VALUE_FONT}`;
      ctx.strokeText("PRESS SPACE", GAME_STAGE.width / 2, 438);
      ctx.fillText("PRESS SPACE", GAME_STAGE.width / 2, 438);
    }
    ctx.restore();
  }

  function renderMenu(state = {}) {
    resizeForStage(SCRATCH_STAGE);
    clear();
    drawCostume(menuBackdrop, menuCostume, menuSize);
    for (const sprite of menuSprites) {
      drawCostume(sprite.image, sprite.costume, sprite.imageSize, sprite, {
        glowGrow: getMenuButtonByAction(state.hoverAction || null)?.action === sprite.action,
      });
    }
    const frame = menuBirdFrames[getMenuBirdFrameIndex(state.menuBirdTick || 0, menuBirdFrames.length)];
    for (const placement of MENU_BIRD_PLACEMENTS) {
      drawMenuBird(frame, placement);
    }
    drawMenuPersonalBest(state.personalBest);
  }

  function renderTwoPlayerMenu(state = {}) {
    resizeForStage(SCRATCH_STAGE);
    clear();
    drawCostume(multiplayerMenuBackdrop, menuCostume, {
      width: multiplayerMenuBackdrop.naturalWidth || multiplayerMenuBackdrop.width || 0,
      height: multiplayerMenuBackdrop.naturalHeight || multiplayerMenuBackdrop.height || 0,
      rotationCenterX: menuCostume.rotationCenterX,
      rotationCenterY: menuCostume.rotationCenterY,
    });
    drawScratchAsset(multiplayerTitleImage, {
      x: 0,
      y: 94,
      size: 92,
      rotationCenterX: 278.3742776184082,
      rotationCenterY: 62.0448,
    });
    for (const button of TWO_PLAYER_BUTTONS) {
      drawMenuButton(button, state.hoverAction === button.action, false);
    }
  }

  function renderPlay() {
    resizeForStage(GAME_STAGE);
    clear();
    drawFullCanvasImage(gameBackdrop);
  }

  function render(state = {}) {
    if (state.screen === "play" || state.screen === "hotseat-play") {
      renderPlay(state);
      if (state.poop?.phase === "splat") {
        drawCanvasImageCentered(splatImage, {
          x: state.poop.x,
          y: state.poop.y,
          scale: POOP_RENDER_SCALE,
        });
      }
      for (const npc of state.npcs || []) {
        drawNpc(npc);
      }
      const player = state.player;
      if (player) {
        const frame = playerFrames[getPlayerFrameIndex(player.animationTick || 0, playerFrames.length)];
        drawScratchImageCentered(frame, {
          x: player.x,
          y: player.y,
          scale: PLAYER_RENDER_SCALE,
          mirrored: player.facing === "left",
        });
      }
      if (state.poop?.phase === "airborne") {
        drawCanvasImageCentered(poopImage, {
          x: state.poop.x,
          y: state.poop.y,
          scale: POOP_RENDER_SCALE,
        });
      }
      if (state.playSession) {
        drawHudNumber(state.playSession.shotsRemaining, HUD_SHOTS_VALUE_X, HUD_VALUE_Y);
        const scoreValue = state.hotseat ? state.hotseat.scores[state.hotseat.currentPlayer] : state.playSession.score;
        drawHudNumber(scoreValue, HUD_SCORE_VALUE_X, HUD_VALUE_Y);
        if (state.playSession.phase === "game-over") {
          drawGameOver(state.playSession);
        }
      }
      if (state.screen === "hotseat-play") {
        drawHotseatHud(state.hotseat);
        drawHotseatOverlay(state.hotseat);
      }
      return;
    }

    if (state.screen === "two-player-menu") {
      renderTwoPlayerMenu(state);
      return;
    }

    renderMenu(state);
  }

  resize();

  return {
    render,
    resize,
  };
}
