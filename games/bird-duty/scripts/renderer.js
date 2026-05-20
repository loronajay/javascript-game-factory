import {
  GAME_STAGE,
  SCRATCH_STAGE,
  costumeDrawRect,
  scratchToGamePoint,
} from "./coordinates.js";
import { findCostume, findTarget, loadCostumeImage, loadImage } from "./assets.js";
import {
  MENU_BIRD_FRAME_FILES,
  MENU_BIRD_PLACEMENTS,
  getMenuBirdFrameIndex,
} from "./menu-birds.js";
import { getMenuButtonByAction } from "./menu-input.js";
import { buildMenuSprites } from "./menu-scene.js";
import { PLAYER_FRAME_FILES, PLAYER_RENDER_SCALE, getPlayerFrameIndex } from "./player.js";
import { POOP_RENDER_SCALE } from "./poop.js";

const HUD_TEXT_COLOR = "#ffffff";
const HUD_TEXT_SHADOW = "rgba(0, 0, 0, 0.35)";
const HUD_VALUE_FONT = "Arial, Helvetica, sans-serif";
const GAME_OVER_FONT = '"Moonlit Free", Georgia, serif';
const HUD_SHOTS_VALUE_X = 445;
const HUD_SCORE_VALUE_X = 795;
const HUD_VALUE_Y = 46;

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
  const menuSize = resolveCostumeSize(menuBackdrop, menuCostume);
  const gameBackdrop = await loadImage("assets/scratch/pngs/game-bg.png");
  const menuBirdFrames = await Promise.all(MENU_BIRD_FRAME_FILES.map(loadImage));
  const playerFrames = await Promise.all(PLAYER_FRAME_FILES.map(loadImage));
  const poopImage = await loadImage("assets/scratch/pngs/shit.png");
  const splatImage = await loadImage("assets/scratch/pngs/splatter.png");
  const menuSprites = await Promise.all(
    buildMenuSprites(manifest).map(async (sprite) => {
      const target = findTarget(manifest, sprite.targetName);
      const costume = target.costumes[target.currentCostume || 0];
      const image = await loadCostumeImage(costume);
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
  }

  function renderPlay() {
    resizeForStage(GAME_STAGE);
    clear();
    drawFullCanvasImage(gameBackdrop);
  }

  function render(state = {}) {
    if (state.screen === "play") {
      renderPlay(state);
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
      } else if (state.poop?.phase === "splat") {
        drawCanvasImageCentered(splatImage, {
          x: state.poop.x,
          y: state.poop.y,
          scale: POOP_RENDER_SCALE,
        });
      }
      if (state.playSession) {
        drawHudNumber(state.playSession.shotsRemaining, HUD_SHOTS_VALUE_X, HUD_VALUE_Y);
        drawHudNumber(state.playSession.score, HUD_SCORE_VALUE_X, HUD_VALUE_Y);
        if (state.playSession.phase === "game-over") {
          drawGameOver(state.playSession);
        }
      }
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
