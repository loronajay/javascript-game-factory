import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintSurface, SURFACE_PAINTER_IDS, SURFACE_TEXTURE_SIZE } from '../scripts/render/table-surface.js';
import { TABLE_PATTERNS, TABLE_SURFACE_PRESETS } from '../scripts/cosmetics/catalog.js';
import { defaultLoadout } from '../scripts/cosmetics/loadout.js';

/**
 * A recording 2D context. The painters only ever call canvas methods, so this
 * is enough to exercise every one of them under node — and to prove they are
 * deterministic, which is what lets two clients draw the same half the same way.
 */
function recordingContext() {
    const calls = [];
    // Gradients are fresh objects every call, so they are recorded by name
    // rather than by reference — otherwise two identical paints never compare
    // equal and the determinism check can never pass.
    const plain = (value) => {
        if (typeof value === 'number') return Number(value.toFixed(4));
        if (value && typeof value === 'object') return '<gradient>';
        return value;
    };
    const record = (name) => (...args) => { calls.push([name, ...args.map(plain)]); };
    return new Proxy({ calls }, {
        get(target, key) {
            if (key === 'calls') return calls;
            if (key === 'createLinearGradient') return () => ({ addColorStop: record('addColorStop') });
            if (typeof key === 'string') return record(key);
            return undefined;
        },
        set(target, key, value) {
            calls.push(['set', key, plain(value)]);
            return true;
        },
    });
}

const { width, height } = SURFACE_TEXTURE_SIZE;

test('every catalog pattern has a painter and every painter is in the catalog', () => {
    assert.deepEqual([...SURFACE_PAINTER_IDS].sort(), TABLE_PATTERNS.map(pattern => pattern.id).sort());
});

test('every shipped surface preset paints', () => {
    for (const preset of TABLE_SURFACE_PRESETS) {
        const ctx = recordingContext();
        paintSurface(ctx, width, height, { ...preset.surface });
        assert.ok(ctx.calls.length > 4, `${preset.id} drew nothing`);
    }
});

test('painting is deterministic: the same surface draws the same pixels twice', () => {
    for (const preset of TABLE_SURFACE_PRESETS) {
        const first = recordingContext(), second = recordingContext();
        paintSurface(first, width, height, { ...preset.surface });
        paintSurface(second, width, height, { ...preset.surface });
        assert.deepEqual(first.calls, second.calls, `${preset.id} is not deterministic`);
    }
});

test('the base colour is always laid down, so a half is never transparent', () => {
    const ctx = recordingContext();
    paintSurface(ctx, width, height, { ...defaultLoadout().tableHalf.surface });
    assert.ok(ctx.calls.some(call => call[0] === 'set' && call[1] === 'fillStyle' && call[2] === '#1b2229'));
    assert.ok(ctx.calls.some(call => call[0] === 'fillRect' && call[3] === width && call[4] === height));
});

test('a pattern at zero strength is skipped rather than drawn invisibly', () => {
    const surface = { ...defaultLoadout().tableHalf.surface, patternOpacity: 0 };
    const quiet = recordingContext(), loud = recordingContext();
    paintSurface(quiet, width, height, surface);
    paintSurface(loud, width, height, { ...surface, patternOpacity: 0.4 });
    assert.ok(loud.calls.length > quiet.calls.length);
});

test('an unknown pattern id paints the base and stops, rather than throwing', () => {
    const ctx = recordingContext();
    paintSurface(ctx, width, height, { ...defaultLoadout().tableHalf.surface, patternId: 'table.pattern.graffiti' });
    assert.ok(ctx.calls.length > 0);
});

test('nothing solid is painted across the middle of a half', () => {
    // The readability rule the prototype's designs broke. A pattern that is not
    // allowed in the `field` zone must either CLIP itself to the perimeter and
    // rear, or draw with strokes only — either way there is no filled shape
    // sitting under live play for the puck to disappear into.
    const surface = defaultLoadout().tableHalf.surface;
    // The base wash is painted first and always the same; paint it alone once so
    // the pattern's own calls can be isolated from it.
    const base = recordingContext();
    paintSurface(base, width, height, { ...surface, patternOpacity: 0 });

    for (const pattern of TABLE_PATTERNS.filter(entry => entry.zones.length && !entry.zones.includes('field'))) {
        const ctx = recordingContext();
        paintSurface(ctx, width, height, { ...surface, patternId: pattern.id, patternOpacity: 0.5 });
        const patternCalls = ctx.calls.slice(base.calls.length);
        const clipped = patternCalls.some(call => call[0] === 'clip');
        const strokesOnly = !patternCalls.some(call => call[0] === 'fill' || call[0] === 'fillRect');
        assert.ok(clipped || strokesOnly, `${pattern.id} paints across the playing centre`);
    }
});

test('pattern scale actually changes the drawing', () => {
    const surface = { ...defaultLoadout().tableHalf.surface, patternId: 'table.pattern.vector-grid', patternOpacity: 0.5 };
    const small = recordingContext(), large = recordingContext();
    paintSurface(small, width, height, { ...surface, patternScale: 0.5 });
    paintSurface(large, width, height, { ...surface, patternScale: 2.4 });
    assert.notDeepEqual(small.calls, large.calls);
});

test('the canvas is wider than it is tall, matching a real half', () => {
    assert.ok(width > height);
    assert.ok(Math.abs(width / height - 9.68 / 7.29) < 0.2);
});
