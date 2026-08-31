import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaylist, shuffle } from '../scripts/audio/playlist.js';
import { SOUNDTRACK } from '../scripts/audio/catalog.js';
test('shuffle returns every track once without changing the catalog', () => {
    const original = [...SOUNDTRACK], order = shuffle(SOUNDTRACK, () => 0);
    assert.deepEqual(SOUNDTRACK, original);
    assert.deepEqual([...order].sort(), [...original].sort());
    assert.notDeepEqual(order, original);
});
test('each boot draws one order and both subsequent loops repeat the complete order', () => {
    let draws = 0;
    const playlist = createPlaylist({ ids: SOUNDTRACK, random: () => {
            draws++;
            return .2;
        } });
    const order = playlist.order();
    for (let i = 0; i < 18; i++) {
        assert.equal(playlist.current(), order[i % 6]);
        playlist.advance();
    }
    assert.equal(draws, 5, 'Only shuffle at boot, not on wrap or rematch');
    const otherBoot = createPlaylist({ ids: SOUNDTRACK, random: () => .8 });
    assert.notDeepEqual(otherBoot.order(), order);
    order.reverse();
    assert.notDeepEqual(playlist.order(), order, 'Callers cannot mutate the running order');
});
test('empty and single-track playlists loop safely', () => {
    const empty = createPlaylist();
    assert.equal(empty.current(), null);
    assert.equal(empty.advance(), null);
    const single = createPlaylist({ ids: ['only'] });
    assert.equal(single.advance(), 'only');
});
