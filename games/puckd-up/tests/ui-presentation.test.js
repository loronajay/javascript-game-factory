import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visiblePlayerColors } from '../scripts/render/view.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../scripts/ui/controller.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../scripts/render/view.js', import.meta.url), 'utf8');
const cabinet = readFileSync(new URL('../scripts/cabinet.js', import.meta.url), 'utf8');
const zeroG = readFileSync(new URL('../scripts/render/venues/zero-g-arena.js', import.meta.url), 'utf8');

test('menu screens use the finished splash art and canonical logo', () => {
    assert.match(html, /assets\/logos\/canon\.png/);
    assert.match(html, /id="menuScreen"[^>]*data-splash="main-menu"/);
    assert.match(html, /id="setupScreen"[^>]*data-splash="settings"/);
    assert.match(html, /id="onlineScreen"[^>]*data-splash="online-lobby"/);
    for (const image of ['main-menu.png', 'settings.png', 'online-lobby.png'])
        assert.match(css, new RegExp(image.replace('.', '\\.')));
});

test('presentation has deliberate command hierarchy and responsive accessibility', () => {
    for (const className of ['brandLockup', 'commandRail', 'commandIndex', 'screenKicker', 'matchChrome'])
        assert.match(html, new RegExp(`class="[^"]*${className}`), className);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /@media\s*\(max-width:\s*760px\)/);
    assert.match(css, /focus-visible/);
});

test('unsupported local multiplayer is not advertised', () => {
    assert.doesNotMatch(html, /local (versus|multiplayer)/i);
    assert.doesNotMatch(html, /second[- ]player/i);
});

test('UI controller exposes the current screen to the visual shell', () => {
    assert.match(controller, /el\.app\.dataset\.screen\s*=\s*screen/);
});

test('puck presentation includes velocity-sensitive trail and impact feedback', () => {
    assert.match(view, /table\.tickFeedback/);
    assert.match(cabinet, /speed/);
});

test('online presentation uses both seat-specific custom colors', () => {
    assert.deepEqual(visiblePlayerColors({ playerColor: '#a14848' }, { mode: 'online', playerColors: ['#c24b86', '#38bdf8'] }), ['#c24b86', '#38bdf8']);
    assert.deepEqual(visiblePlayerColors({ playerColor: '#c24b86', rivalId: 'switch' }, { mode: 'campaign' }), ['#c24b86', '#d75c91']);
});

test('setup presents real 3D venue previews in the cards and dedicated right rail', () => {
    assert.match(html, /<aside[^>]*class="[^"]*stagePreview/);
    assert.match(html, /<canvas[^>]*id="setupStagePreview"/);
    assert.equal((html.match(/class="arenaThumbnail"/g) || []).length, 8);
    assert.match(css, /\.stagePreviewCanvas/);
    assert.match(css, /\.arenaThumbnail/);
    assert.match(controller, /stagePreview\.configure\(match\.config\)/);
    assert.match(cabinet, /createVenuePreview/);
    assert.match(cabinet, /stagePreview\.render/);
});

test('main menu exposes a portrait-driven twelve-stop Arcade Circuit', () => {
    assert.match(html, /id="circuitModeBtn"/);
    assert.match(html, /id="circuitScreen"[^>]*data-splash="campaign"/);
    assert.match(html, /id="circuitGrid"/);
    assert.match(html, /id="rivalPortrait"/);
    assert.match(css, /campaign\.png/);
    assert.match(controller, /CIRCUIT_STOPS/);
    assert.match(controller, /--portrait-focus[^\n]+rival\.portraitFocus/);
    assert.match(css, /object-position:var\(--portrait-focus/);
});

test('Zero-G Arena keeps station ribs and light channels out of the table view corridor', () => {
    assert.doesNotMatch(zeroG, /for \(const z of \[-13, -8, -3, 2, 7\]\)/);
    assert.doesNotMatch(zeroG, /\[-10\.5, -5\.25, 0, 5\.25, 10\.5\]/);
    assert.match(zeroG, /rear observation ring/i);
});
