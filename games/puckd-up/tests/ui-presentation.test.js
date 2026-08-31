import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../scripts/ui/controller.js', import.meta.url), 'utf8');

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
