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
import {
  ONLINE_JOIN_BUTTONS,
  ONLINE_LOBBY_BUTTONS,
  ONLINE_MENU_BUTTONS,
  shouldShowJoinCodeCursor,
} from "./online-menu.js";
import { HOTSEAT_PHASE, HOTSEAT_ROUNDS } from "./hotseat-session.js";
import { ONLINE_MATCH_PHASE } from "./online-match.js";

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

  function drawMainMenuControls({ mobileControlsActive = false } = {}) {
    const controlsText = mobileControlsActive
      ? "TAP PAD: LEFT / RIGHT   DROP BUTTON"
      : "MOVE: ARROWS / A-D   DROP: SPACE";
    const controlsY = mobileControlsActive ? 334 : 348;
    const boxY = mobileControlsActive ? 318 : 330;
    const boxH = mobileControlsActive ? 30 : 34;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fillRect(186, boxY, 294, boxH);
    ctx.strokeRect(186, boxY, 294, boxH);
    ctx.font = `${mobileControlsActive ? 13 : 16}px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(controlsText, SCRATCH_STAGE.width / 2, controlsY);
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

  function drawOnlineHud(match, myClientId = null) {
    if (!match?.players?.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const slotWidth = GAME_STAGE.width / Math.max(2, match.players.length);
    for (let index = 0; index < match.players.length; index++) {
      const player = match.players[index];
      const x = slotWidth * index + slotWidth / 2;
      const active = index === match.activeIndex;
      ctx.fillStyle = player.clientId === myClientId ? "#ff861a" : "#ff0b67";
      ctx.strokeStyle = active ? "#b8ff00" : "#b50000";
      ctx.lineWidth = active ? 5 : 3;
      ctx.fillRect(x - 72, 100, 144, 50);
      ctx.strokeRect(x - 72, 100, 144, 50);
      ctx.fillStyle = "#ffffff";
      ctx.font = `15px ${HUD_VALUE_FONT}`;
      ctx.fillText(player.name, x, 116);
      ctx.font = `22px ${HUD_VALUE_FONT}`;
      ctx.fillText(String(match.scores?.[player.clientId] || 0), x, 138);
    }
    ctx.font = `28px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`ROUND ${match.round}/${HOTSEAT_ROUNDS}`, 1090, 46);
    ctx.restore();
  }

  function drawOnlineOverlay(match, myClientId = null) {
    if (!match || match.phase === ONLINE_MATCH_PHASE.PLAYING) return;
    const active = match.players?.[match.activeIndex] || null;
    const isMine = active?.clientId === myClientId;
    const isFinal = match.phase === ONLINE_MATCH_PHASE.MATCH_OVER;
    const winner = match.winnerClientId === "tie"
      ? null
      : match.players?.find((player) => player.clientId === match.winnerClientId);
    const title = isFinal
      ? winner
        ? `${winner.name} WINS`
        : "TIE GAME"
      : `${active?.name || "PLAYER"} READY`;
    const subtitle = isFinal
      ? formatOnlineScoreboard(match)
      : isMine
        ? `ROUND ${match.round} - PRESS SPACE`
        : `WAITING FOR ${active?.name || "PLAYER"}`;
    const helper = isFinal
      ? "PRESS SPACE"
      : isMine
        ? "ARROWS/A-D MOVE  SPACE DROPS"
        : "WATCHING CURRENT TURN";

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 56px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "#b8ff00";
    ctx.strokeStyle = "#b50000";
    ctx.lineWidth = 5;
    ctx.strokeText(title, GAME_STAGE.width / 2, 310);
    ctx.fillText(title, GAME_STAGE.width / 2, 310);
    ctx.font = `36px ${HUD_VALUE_FONT}`;
    ctx.strokeText(subtitle, GAME_STAGE.width / 2, 380);
    ctx.fillText(subtitle, GAME_STAGE.width / 2, 380);
    ctx.font = `24px ${HUD_VALUE_FONT}`;
    ctx.strokeText(helper, GAME_STAGE.width / 2, 430);
    ctx.fillText(helper, GAME_STAGE.width / 2, 430);
    ctx.restore();
  }

  function formatOnlineScoreboard(match) {
    return (match.players || [])
      .map((player) => `${player.name}: ${match.scores?.[player.clientId] || 0}`)
      .join("  -  ");
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
    drawMainMenuControls({ mobileControlsActive: state.mobileControlsActive === true });
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

  function drawOnlinePanelTitle(title, subtitle) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#b8ff00";
    ctx.strokeStyle = "#b50000";
    ctx.lineWidth = 5;
    ctx.font = `48px ${GAME_OVER_FONT}`;
    ctx.strokeText(title, SCRATCH_STAGE.width / 2, 92);
    ctx.fillText(title, SCRATCH_STAGE.width / 2, 92);
    if (subtitle) {
      ctx.font = `20px ${HUD_VALUE_FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(subtitle, SCRATCH_STAGE.width / 2, 128);
    }
    ctx.restore();
  }

  function drawOnlineMenuButton(button, hot = false, disabled = false) {
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
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, disabled ? "#9a4b36" : "#ff4a17");
    gradient.addColorStop(1, disabled ? "#74314f" : "#ff0b67");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#b50000";
    ctx.lineWidth = 7;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = disabled ? "#d8d8d8" : "#b8ff00";
    ctx.strokeStyle = "#8b0000";
    ctx.lineWidth = Math.max(2, 2 * grow);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const hasDigits = /\d/.test(button.label);
    const fontSize = (button.label.length > 7 ? 18 : 24) * grow;
    ctx.font = hasDigits
      ? `bold ${Math.max(18, fontSize)}px ${HUD_VALUE_FONT}`
      : `${fontSize}px ${GAME_OVER_FONT}`;
    if (hot && !disabled) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }
    ctx.strokeText(button.label, center.x, center.y + 1);
    ctx.fillText(button.label, center.x, center.y + 1);
    ctx.restore();
  }

  function renderOnlineMenu(state = {}) {
    resizeForStage(SCRATCH_STAGE);
    clear();
    drawCostume(multiplayerMenuBackdrop, menuCostume, {
      width: multiplayerMenuBackdrop.naturalWidth || multiplayerMenuBackdrop.width || 0,
      height: multiplayerMenuBackdrop.naturalHeight || multiplayerMenuBackdrop.height || 0,
      rotationCenterX: menuCostume.rotationCenterX,
      rotationCenterY: menuCostume.rotationCenterY,
    });
    drawOnlinePanelTitle("ONLINE", "PUBLIC MATCHMAKING");
    for (const button of ONLINE_MENU_BUTTONS) {
      drawOnlineMenuButton(button, state.hoverAction === button.action, false);
    }
  }

  function renderOnlineJoin(state = {}) {
    const code = String(state.onlineJoinCode || "");
    const showCursor = shouldShowJoinCodeCursor(state.menuBirdTick || 0);
    resizeForStage(SCRATCH_STAGE);
    clear();
    drawCostume(multiplayerMenuBackdrop, menuCostume, {
      width: multiplayerMenuBackdrop.naturalWidth || multiplayerMenuBackdrop.width || 0,
      height: multiplayerMenuBackdrop.naturalHeight || multiplayerMenuBackdrop.height || 0,
      rotationCenterX: menuCostume.rotationCenterX,
      rotationCenterY: menuCostume.rotationCenterY,
    });
    drawOnlinePanelTitle("JOIN ROOM", "ENTER ROOM CODE");

    ctx.save();
    const boxX = SCRATCH_STAGE.width / 2 - 132;
    const boxY = 164;
    const boxW = 264;
    const boxH = 62;
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
    gradient.addColorStop(0, "#ff4a17");
    gradient.addColorStop(1, "#ff0b67");
    ctx.shadowColor = "rgba(255, 130, 20, 0.95)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#b8ff00";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 8, boxY + 8, boxW - 16, boxH - 16);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 38px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#ffffff";
    if (code) {
      ctx.fillText(code, SCRATCH_STAGE.width / 2, boxY + boxH / 2 + 1);
    }
    if (showCursor) {
      const cursorX = SCRATCH_STAGE.width / 2 + ctx.measureText(code || "").width / 2 + 8;
      ctx.fillStyle = "#b8ff00";
      ctx.fillRect(Math.min(cursorX, boxX + boxW - 30), boxY + 14, 4, boxH - 28);
    }
    ctx.font = `15px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("TYPE ROOM CODE - ENTER TO JOIN", SCRATCH_STAGE.width / 2, 246);
    ctx.restore();

    for (const button of ONLINE_JOIN_BUTTONS) {
      drawOnlineMenuButton(button, state.hoverAction === button.action, button.action.includes("submit") && code.length === 0);
    }
  }

  function memberId(member) {
    if (typeof member === "string") return member;
    return member?.clientId || member?.id || "";
  }

  function renderOnlineLobby(state = {}) {
    const lobby = state.onlineLobby || {};
    const members = Array.isArray(lobby.members) ? lobby.members : [];
    const profiles = lobby.profiles || {};
    resizeForStage(SCRATCH_STAGE);
    clear();
    drawCostume(multiplayerMenuBackdrop, menuCostume, {
      width: multiplayerMenuBackdrop.naturalWidth || multiplayerMenuBackdrop.width || 0,
      height: multiplayerMenuBackdrop.naturalHeight || multiplayerMenuBackdrop.height || 0,
      rotationCenterX: menuCostume.rotationCenterX,
      rotationCenterY: menuCostume.rotationCenterY,
    });
    drawOnlinePanelTitle("ONLINE LOBBY", lobby.status || "Connecting...");

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `24px ${HUD_VALUE_FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`ROOM: ${lobby.roomCode || "-----"}`, SCRATCH_STAGE.width / 2, 152);
    ctx.fillText(
      `${lobby.playerCount || members.length || 0}/${lobby.maxPlayers || 4} PLAYERS`,
      SCRATCH_STAGE.width / 2,
      184
    );

    const startY = 218;
    const slotWidth = 132;
    const firstX = SCRATCH_STAGE.width / 2 - ((Math.max(lobby.maxPlayers || 4, 2) - 1) * slotWidth) / 2;
    for (let index = 0; index < Math.max(lobby.maxPlayers || 4, 2); index++) {
      const id = memberId(members[index]);
      const name = id ? profiles[id]?.displayName || (id === lobby.clientId ? lobby.identityName : "") || id.slice(0, 6) : "WAITING";
      const x = firstX + index * slotWidth;
      ctx.fillStyle = id === lobby.clientId ? "#ff861a" : "#ff0b67";
      ctx.strokeStyle = "#b50000";
      ctx.lineWidth = 5;
      ctx.fillRect(x - 54, startY - 20, 108, 40);
      ctx.strokeRect(x - 54, startY - 20, 108, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = `16px ${HUD_VALUE_FONT}`;
      ctx.fillText(String(name).slice(0, 12), x, startY + 1);
    }
    ctx.restore();

    for (const button of ONLINE_LOBBY_BUTTONS) {
      const disabled = button.action.includes("start") && !lobby.canStart;
      drawOnlineMenuButton(button, state.hoverAction === button.action, disabled);
    }
  }

  function renderPlay() {
    resizeForStage(GAME_STAGE);
    clear();
    drawFullCanvasImage(gameBackdrop);
  }

  function render(state = {}) {
    if (state.screen === "play" || state.screen === "hotseat-play" || state.screen === "online-play") {
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
      if (state.screen === "online-play") {
        drawOnlineHud(state.onlineMatch, state.onlineClientId);
        drawOnlineOverlay(state.onlineMatch, state.onlineClientId);
      }
      return;
    }

    if (state.screen === "two-player-menu") {
      renderTwoPlayerMenu(state);
      return;
    }

    if (state.screen === "online-menu") {
      renderOnlineMenu(state);
      return;
    }

    if (state.screen === "online-join") {
      renderOnlineJoin(state);
      return;
    }

    if (state.screen === "online-lobby") {
      renderOnlineLobby(state);
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
