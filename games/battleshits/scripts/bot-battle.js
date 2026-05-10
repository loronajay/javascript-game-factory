// bot-battle.js — local net facade that drives the bot turn loop in solo mode.
// createBotClient() returns an object shaped like the online `net` client so
// battle.js, handleTargetClick, and handleIncomingShot work without modification.

import {
  resolveIncomingShot, isFleetDestroyed, createTargetBoard, recordShotResult,
} from './board.js';
import {
  createBotFleet, createBotState, getBotDelay, botPickShot, updateBotState,
} from './bot.js';

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
    sendShot(col, row) {
      const { valid, board, hit, shipId, sunk } = resolveIncomingShot(gs.botFleet, col, row);
      if (!valid) return;
      gs.botFleet = board;
      const fleetDestroyed = isFleetDestroyed(gs.botFleet);
      // Call synchronously — handleShotResult's animation timer handles the display delay.
      cb.onShotResult?.({ col, row, hit, sunk, shipId, fleetDestroyed });
    },

    // Called by handleIncomingShot after the bot's shot resolves against the player fleet.
    // Records the result in gs.botTarget, updates AI state, then schedules next bot shot.
    sendShotResult(col, row, hit, sunk, shipId, fleetDestroyed) {
      gs.botTarget = recordShotResult(gs.botTarget, col, row, hit, sunk, shipId);
      updateBotState(botState, col, row, hit, sunk, shipId);
      if (!fleetDestroyed) scheduleBotShot();
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
