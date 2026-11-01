import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

test('housing stays upright and stable through ticks, selections, moves and drag cancellation', { skip: !existsSync(executablePath) }, async () => {
  const root = resolve('.');
  const server = createServer(async (req, res) => {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/js/farm-livestock-panel.mjs`);
    const result = await page.evaluate(async () => {
      const { createLivestockPanel } = await import('/js/farm-livestock-panel.mjs');
      const { normalizeLivestockAnimal } = await import('/js/farm-livestock.mjs');
      const { newLivestockCare } = await import('/js/farm-livestock-care.mjs');
      document.body.innerHTML = '<link rel="stylesheet" href="/farm/farm.css"><div id="root"><button id="open">Open</button><button id="close">Close</button><div id="count"></div><div id="status"></div><div id="list" style="width:650px;height:700px;overflow:auto"></div></div>';
      await new Promise(done => document.querySelector('link').addEventListener('load', done));
      const homes = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rotationY, i) => ({ id: `home-${i}`, instanceId: `pen-${i}`, kind: 'pen', title: `Pen ${i}`, slots: 4, roam: true, species: null, x: i * 8, z: i * 8, width: 5, depth: 4, rotationY }));
      const animal = normalizeLivestockAnimal({ id: 'stock-12345678', name: 'Daisy', speciesId: 'livestock.cow', gender: 'female', stats: { yield: 50, quality: 50, growth: 50, hardiness: 50 }, bornAt: -20000, homeId: 'home-0', care: newLivestockCare(0) });
      let view = { herd: [animal], homes, clockMinutes: 0, husbandryLevel: 10, canBreed: true, supplies: {}, feedWords: () => '', canManage: true, note: '' };
      const moves = [];
      let finish;
      const elements = Object.fromEntries(['root', 'count', 'status', 'list'].map(id => [id, document.getElementById(id)]));
      elements.openButton = document.getElementById('open'); elements.closeButton = document.getElementById('close');
      const panel = createLivestockPanel(elements, { move: async (id, homeId) => {
        moves.push([id, homeId]);
        await new Promise(done => { finish = done; });
        view = { ...view, herd: [{ ...view.herd[0], homeId }] }; panel.render(view);
        return 'Moved';
      } });
      panel.render(view); panel.open();
      document.querySelector('#root-housing-tab').click();
      const check = (condition, message) => { if (!condition) throw Error(message); };
      const boxes = [...document.querySelectorAll('.livestock-map-home:not(.livestock-map-field)')];
      check(boxes.every(box => !box.style.transform.includes('rotate')), 'home contents must remain upright at every rotation');
      check(document.querySelectorAll('.livestock-map-footprint').length === 4, 'all rotated floor plans rendered');
      const scroll = document.querySelector('.livestock-map-scroll'); scroll.scrollLeft = 150; scroll.scrollTop = 120;
      const tile = document.querySelector('[data-animal-id]');
      view = { ...view, clockMinutes: 0.01 }; panel.render(view);
      check(document.querySelector('[data-animal-id]') === tile, 'clock tick replaced the animal DOM');
      tile.focus(); tile.click();
      const selected = document.querySelector('[data-animal-id]');
      check(document.activeElement === selected, 'selection lost keyboard focus');
      check(selected.getAttribute('aria-pressed') === 'true', 'selection lost');
      check(document.querySelector('.livestock-map-scroll').scrollLeft === 150 && document.querySelector('.livestock-map-scroll').scrollTop === 120, 'selection reset map scroll');
      const destination = [...document.querySelectorAll('.livestock-map-destination')].find(el => el.textContent.startsWith('Pen 2'));
      destination.click(); destination.click();
      check(moves.length === 1 && moves[0][1] === 'home-2', 'move duplicated or sent wrong home');
      finish(); await new Promise(done => setTimeout(done, 0));
      check(document.querySelector('[data-animal-id]').closest('section').getAttribute('aria-label') === 'Pen 2', 'saved move not reflected');
      check(document.querySelector('.livestock-map-scroll').scrollLeft === 150, 'save reset map position');
      const moved = document.querySelector('[data-animal-id]');
      moved.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      view = { ...view, herd: [{ ...view.herd[0], name: 'Daisy renamed' }] }; panel.render(view);
      check(document.querySelector('[data-animal-id]') === moved, 'refresh destroyed active drag');
      moved.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      check(moves.length === 1, 'cancelled drag moved an animal');
      check(document.querySelector('[data-animal-id]').textContent.includes('Daisy renamed'), 'cancelled drag did not apply deferred refresh');
      const dragged = document.querySelector('[data-animal-id]');
      dragged.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      const field = document.querySelector('.livestock-map-field');
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
      field.dispatchEvent(over);
      check(over.defaultPrevented, 'valid drop target refused drag');
      field.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      dragged.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      check(moves.length === 2 && moves[1][1] === null, 'drop failed to unhouse animal');
      finish(); await new Promise(done => setTimeout(done, 0));
      check(document.querySelector('.livestock-map-field [data-animal-id]'), 'field did not show saved resident');
      view = { ...view, homes: homes.map(home => ({ ...home, species: ['livestock.chicken'] })) }; panel.render(view);
      document.querySelector('[data-animal-id]').click();
      check([...document.querySelectorAll('.livestock-map-home:not(.livestock-map-field) .livestock-map-destination')].every(el => el.disabled), 'cow can select chicken-only homes');
      view = { ...view, canManage: false }; panel.render(view);
      check(document.querySelector('[data-animal-id]').disabled && !document.querySelector('[data-animal-id]').draggable, 'visitor can manipulate livestock');
      return { moves: moves.length };
    });
    assert.equal(result.moves, 2);
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
