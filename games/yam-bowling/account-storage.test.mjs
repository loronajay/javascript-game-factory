import test from 'node:test';
import assert from 'node:assert/strict';
import { clearYamAccountStorage } from './ui/account-dialog.mjs';

test('changing Yam accounts clears account caches while preserving unrelated game data and preferences', () => {
  const values = new Map([
    ['yam-bowling.campaign.v1', 'old-campaign'],
    ['yam-bowling.loadout.v1', 'old-cosmetics'],
    ['yam-bowling.pendingVoucherCheckoutSessionId', 'old-checkout'],
    ['javascript-game-factory.factoryProfile', 'old-account'],
    ['tactical-arena.campaign', 'other-game-save'],
    ['yam-bowling-audio', 'muted'],
    ['javascript-game-factory.authToken', 'new-server-token'],
  ]);
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], removeItem: key => values.delete(key) };
  clearYamAccountStorage(storage);
  assert.equal(values.has('yam-bowling.campaign.v1'), false);
  assert.equal(values.has('yam-bowling.loadout.v1'), false);
  assert.equal(values.has('yam-bowling.pendingVoucherCheckoutSessionId'), false);
  assert.equal(values.has('javascript-game-factory.factoryProfile'), false);
  assert.equal(values.get('tactical-arena.campaign'), 'other-game-save');
  assert.equal(values.get('yam-bowling-audio'), 'muted');
  assert.equal(values.get('javascript-game-factory.authToken'), 'new-server-token');
});
