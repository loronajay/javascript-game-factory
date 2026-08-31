import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, normalizeSettings } from '../scripts/settings.js';
test('new players default to Arcade instead of treating missing storage as Casual', () => {
    const settings = loadSettings({ getItem: () => null });
    assert.equal(settings.cpuDifficulty, 1);
    assert.equal(settings.arenaId, 'hyper_arcade');
});
test('legacy cabinet preferences survive and malformed values are normalized', () => {
    const values = { 'tableHockey.playerColor': '#C24B86', 'tableHockey.cpuDifficulty': '2', 'tableHockey.arenaId': 'park_jam' };
    const settings = loadSettings({ getItem: key => values[key] ?? null });
    assert.equal(settings.playerColor, '#c24b86');
    assert.equal(settings.cpuDifficulty, 2);
    assert.equal(settings.arenaId, 'park_jam');
    const invalid = normalizeSettings({ playerColor: 'red', cpuDifficulty: 1.5, arenaId: 'constructor', targetScore: 0, mode: 'online' });
    assert.equal(invalid.cpuDifficulty, 1);
    assert.equal(invalid.arenaId, 'hyper_arcade');
    assert.equal(invalid.targetScore, 7);
    assert.equal(invalid.mode, 'cpu');
});
test('blocked storage never prevents a match', () => {
    const storage = { getItem() {
            throw Error('blocked');
        }, setItem() {
            throw Error('blocked');
        } };
    assert.equal(loadSettings(storage).cpuDifficulty, 1);
    assert.doesNotThrow(() => saveSettings(storage, normalizeSettings()));
});
