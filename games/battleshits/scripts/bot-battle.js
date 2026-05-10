// bot-battle.js — local net facade that drives the bot turn loop in solo mode.
// createBotClient() returns an object shaped like the online `net` client so
// battle.js, handleTargetClick, and handleIncomingShot work without modification.

import {
  resolveIncomingShot, isFleetDestroyed, createTargetBoard, recordShotResult,
} from './board.js';
import {
  createBotFleet, createBotState, getBotDelay, botPickShot, updateBotState,
} from './bot.js';
import { SHOT_ANIMATION_MS } from './presentation.js';

let botThinkTimeout = null;

export function clearBotBattleTimers() {
  if (botThinkTimeout !== null) {
    clearTimeout(botThinkTimeout);
    botThinkTimeout = null;
  }
}

// gs must already have gs.botDifficulty set before calling this.
// Returns a net-like object. Wire cb.onShotResult and cb.onOpponentShot after
// calling this, then call client.startSolo() to initialise bot fleet and state.
export function createBotClient(gs) {
  const botState = createBotState();
  const cb = {};

  function fireBotShot() {
    botThinkTimeout = null;
    if (gs.phase !== 'battle') return;
    const { col, row } = botPickShot(gs.botTarget, gs.botDifficulty, botState);
    cb.onOpponentShot?.({ col, row });
  }

  function scheduleBotShot() {
    clearBotBattleTimers();
    botThinkTimeout = setTimeout(fireBotShot, getBotDelay(gs.botDifficulty));
  }

  return {
    cb,

    // Called by game.js / lockInSolo to initialise the hidden bot fleet.
    startSolo() {
      gs.botFleet = createBotFleet();
      gs.botTarget = createTargetBoard();
    },

    // Called by handleTargetClick when the player fires.
    // Resolves the shot against the bot fleet and returns the result via cb.onShotResult.
    // Also schedules the bot's first return shot after the player's animation completes.
    sendShot(col, row) {
      const { valid, board, hit, shipId, sunk } = resolveIncomingShot(gs.botFleet, col, row);
      if (!valid) return;
      gs.botFleet = board;
      const fleetDestroyed = isFleetDestroyed(gs.botFleet);
      // Synchronous — handleShotResult's own timer handles the 1200ms display delay.
      cb.onShotResult?.({ col, row, hit, sunk, shipId, fleetDestroyed });
      // Schedule the bot's reply after the player's animation finishes + thinking delay.
      // Without this the cycle never starts — sendShotResult is only reached after the
      // bot has already fired once, so the first shot would never be scheduled.
      if (!fleetDestroyed) {
        clearBotBattleTimers();
        botThinkTimeout = setTimeout(fireBotShot, SHOT_ANIMATION_MS + getBotDelay(gs.botDifficulty));
      }
    },

    // Called by handleIncomingShot after the bot's shot resolves against the player fleet.
    // Records the result in gs.botTarget and updates AI state only — does NOT schedule
    // the next bot shot. The schedule lives entirely in sendShot so the bot fires exactly
    // once per player turn.
    sendShotResult(col, row, hit, sunk, shipId, fleetDestroyed) {
      gs.botTarget = recordShotResult(gs.botTarget, col, row, hit, sunk, shipId);
      updateBotState(botState, col, row, hit, sunk, shipId);
    },

    // No-ops for methods battle.js / game.js may call on net in solo mode.
    sendPlacementReady() {},
    sendRematch() {},
    sendEmote() {},
    cancelSearch() {},
    cancelRoom() {},
    findMatch() {},
    disconnect() { clearBotBattleTimers(); },
  };
}
