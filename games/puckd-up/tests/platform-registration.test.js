import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCADE_GAME_SLUGS, normalizeGameEntry } from '../../../js/arcade-catalog.mjs';

test('cabinet registration includes metadata, source/runtime catalog and existing preview', () => {
    const metadata = JSON.parse(readFileSync(new URL('../game.json', import.meta.url)));
    assert.equal(metadata.title, "Puck'd Up");
    assert.equal(metadata.order, 17);
    assert.equal(metadata.players, '1-2');
    assert.match(metadata.status, /CPU/);
    assert.ok(ARCADE_GAME_SLUGS.includes('puckd-up'));
    assert.match(readFileSync(new URL('../../../js/arcade-catalog.mts', import.meta.url), 'utf8'), /"puckd-up"/);
    const entry = normalizeGameEntry('puckd-up', metadata);
    assert.equal(entry.href, 'games/puckd-up/index.html');
    const image = readFileSync(new URL(`../../../${entry.previewImage}`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
});
