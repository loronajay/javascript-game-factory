import { STATE, H } from "../core/constants.mjs";
import { rand } from "../core/math.mjs";
import { renderBoss, renderBossHud } from "./boss-scene.mjs";
import { renderMpLobby, renderMpCountdown, renderMpWorld, renderMpFighting, renderMpResult } from "./mp-scene.mjs";
import { renderBackground, renderDepthGrid, renderMenuAtmosphere } from "./background.mjs";
import { renderMenuScreen, renderHowToPlayScreen, renderEndScreen } from "./menus.mjs";
import { renderEnemies, renderOverseerLasers, renderEnemyBullets } from "./enemies.mjs";
import { renderPowerups, renderPlayerFire, renderParticles } from "./world.mjs";
import { renderRunners, renderRunnerKillMessage } from "./runners.mjs";
import { renderCockpit } from "./cockpit.mjs";
import { renderHud, drawHealth, drawPowerupHud, drawScore, drawRailGauge, renderCenterMessage } from "./hud.mjs";

export function renderGame(ctx, game, t) {
  // ── Multiplayer screens ───────────────────────────────────────────────────
  if (game.state === STATE.MP_LOBBY || game.state === STATE.MP_RESULT) {
    renderBackground(ctx, game, t);
    renderMenuAtmosphere(ctx, t);
    if (game.state === STATE.MP_LOBBY) renderMpLobby(ctx, game, t);
    else renderMpResult(ctx, game, t);
    return;
  }

  if (game.state === STATE.MP_COUNTDOWN || game.state === STATE.MP_FIGHTING) {
    ctx.save();
    const sx = game.shake ? rand(-game.shake, game.shake) : 0;
    const sy = game.shake ? rand(-game.shake, game.shake) : 0;
    ctx.translate(sx, sy);
    renderBackground(ctx, game, t);
    renderDepthGrid(ctx, game);
    if (game.state === STATE.MP_FIGHTING) renderMpWorld(ctx, game, t);
    renderCockpit(ctx, game, t);
    ctx.restore();
    if (game.state === STATE.MP_COUNTDOWN) renderMpCountdown(ctx, game, t);
    else renderMpFighting(ctx, game, t);
    return;
  }

  // ── Campaign / solo screens ───────────────────────────────────────────────
  if (game.state === STATE.MENU || game.state === STATE.HOW_TO_PLAY) {
    renderBackground(ctx, game, t);
    renderMenuAtmosphere(ctx, t);
    if (game.state === STATE.MENU) renderMenuScreen(ctx, game, t);
    else renderHowToPlayScreen(ctx, game, t);
    return;
  }

  ctx.save();
  const sx = game.shake ? rand(-game.shake, game.shake) : 0;
  const sy = game.shake ? rand(-game.shake, game.shake) : 0;
  ctx.translate(sx, sy);

  renderBackground(ctx, game, t);
  renderDepthGrid(ctx, game);

  if (game.state === STATE.BOSS) {
    renderBoss(ctx, game, t);
    renderRunners(ctx, game, t);
    renderPlayerFire(ctx, game);
    renderParticles(ctx, game);
    renderCockpit(ctx, game, t);
    drawHealth(ctx, game, 34, H - 82);
    drawPowerupHud(ctx, game, 34, H - 155);
    drawScore(ctx, game);
    drawRailGauge(ctx, game);
    renderBossHud(ctx, game, t);
  } else {
    renderPowerups(ctx, game, t);
    renderEnemies(ctx, game);
    renderOverseerLasers(ctx, game, t);
    renderRunners(ctx, game, t);
    renderEnemyBullets(ctx, game);
    renderPlayerFire(ctx, game);
    renderParticles(ctx, game);
    renderCockpit(ctx, game, t);
    if (game.state === STATE.PLAYING || game.state === STATE.STAGE_CLEAR) {
      renderHud(ctx, game);
    }
  }

  ctx.restore(); // end shake transform — overlays render shake-free

  renderRunnerKillMessage(ctx, game);

  if (game.state === STATE.STAGE_CLEAR) {
    const next = game.wave.stageIndex + 2;
    renderCenterMessage(ctx, "STAGE CLEAR", `Loading Stage ${next}`);
  } else if (game.state === STATE.CLEAR) {
    renderEndScreen(ctx, game, t, false);
  } else if (game.state === STATE.GAME_OVER) {
    renderEndScreen(ctx, game, t, true);
  }
}
