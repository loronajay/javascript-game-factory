import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

test('compact housing moves animals without dragging or navigating a map', { skip: !existsSync(executablePath) }, async () => {
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
      document.body.innerHTML = '<link rel="stylesheet" href="/farm/farm.css"><div id="root"><button id="open">Open</button><button id="close">Close</button><div id="count"></div><div id="status"></div><div id="list" style="width:min(650px, 100%);height:700px;overflow:auto"></div></div>';
      await new Promise(done => document.querySelector('link').addEventListener('load', done));
      const homes = Array.from({length: 20}, (_, i) => i * Math.PI / 2).map((rotationY, i) => ({ id: `home-${i}`, instanceId: `pen-${i}`, kind: 'pen', title: `Pen ${i}`, slots: 4, roam: true, species: null, x: i * 8, z: i * 8, width: 5, depth: 4, rotationY }));
      const animal = normalizeLivestockAnimal({ id: 'stock-12345678', name: 'Daisy', speciesId: 'livestock.cow', gender: 'female', stats: { yield: 50, quality: 50, growth: 50, hardiness: 50 }, bornAt: -20000, homeId: 'home-0', care: newLivestockCare(0) });
      let view = { herd: Array.from({length: 50}, (_, i) => ({ ...animal, id: 'stock-' + String(i).padStart(8, '0'), name: i === 0 ? 'Daisy' : 'Cow ' + i, homeId: null })), homes, clockMinutes: 0, husbandryLevel: 10, canBreed: true, supplies: {}, feedWords: () => '', canManage: true, note: '' };
      const moves = [];
      let finish;
      const elements = Object.fromEntries(['root', 'count', 'status', 'list'].map(id => [id, document.getElementById(id)]));
      elements.openButton = document.getElementById('open'); elements.closeButton = document.getElementById('close');
      const panel = createLivestockPanel(elements, { move: async (id, homeId) => {
        moves.push([id, homeId]);
        await new Promise(done => { finish = done; });
        view = { ...view, herd: view.herd.map(animal => animal.id === id ? { ...animal, homeId } : animal) }; panel.render(view);
        return 'Moved';
      } });
      panel.render(view); panel.open();
      document.querySelector('#root-housing-tab').click();
      const check = (condition, message) => { if (!condition) throw Error(message); };
      check(!document.querySelector('.livestock-map'), 'oversized map remains');
      check(document.querySelectorAll('[data-animal-id]').length === 50, 'herd missing');
      const animals = document.querySelector('[data-scroll-key="animals"]');
      const homesList = document.querySelector('[data-scroll-key="homes"]');
      check(animals.clientHeight <= 360 && homesList.clientHeight <= 360, 'organizer is not compact');
      check(document.documentElement.scrollWidth <= innerWidth, 'horizontal scrolling required');
      const tile = document.querySelector('[data-animal-id]');
      view = { ...view, clockMinutes: 0.01 }; panel.render(view);
      check(document.querySelector('[data-animal-id]') === tile, 'clock tick replaced the animal DOM');
      tile.focus(); tile.click();
      check(document.activeElement === document.querySelector('[data-animal-id]'), 'selection lost focus');
      const roster = document.querySelector('[data-scroll-key="animals"]'); roster.scrollTop = 180;
      const destinationList = document.querySelector('[data-scroll-key="homes"]'); destinationList.scrollTop = 200;
      const destination = document.querySelector('[data-home-id="home-2"]');
      destination.click(); destination.click();
      check(moves.length === 1 && moves[0][1] === 'home-2', 'move duplicated or sent wrong home');
      finish(); await new Promise(done => setTimeout(done, 0));
      check(document.querySelector('[data-home-id="home-2"]').getAttribute('aria-current') === 'true', 'saved home missing');
      check(document.querySelector('[data-scroll-key="animals"]').scrollTop === 180, 'save reset animal list');
      check(document.querySelector('[data-scroll-key="homes"]').scrollTop === 200, 'save reset destination list');
      document.querySelector('[data-home-id="field"]').click();
      check(moves.length === 2 && moves[1][1] === null, 'field move failed');
      finish(); await new Promise(done => setTimeout(done, 0));
      view = { ...view, homes: homes.map(home => ({ ...home, species: ['livestock.chicken'] })) }; panel.render(view);
      check([...document.querySelectorAll('[data-home-id]')].filter(el => el.dataset.homeId !== 'field').every(el => el.disabled), 'cow allowed in chicken home');
      view = { ...view, homes: homes.map(home => ({ ...home, slots: 0 })) }; panel.render(view);
      check(document.querySelector('[data-home-id="home-0"]').textContent.includes('Not enough space'), 'capacity restriction missing');
      const search = document.querySelector('[aria-label="Find an animal to move"]');
      search.value = 'Daisy'; search.dispatchEvent(new Event('input'));
      check(document.querySelectorAll('[data-animal-id]').length === 1, 'search did not filter');
      view = { ...view, canManage: false }; panel.render(view);
      check(document.querySelector('[data-animal-id]').disabled, 'visitor can move animals');
      check(document.querySelector('[aria-label="Find an animal to move"]').value === 'Daisy', 'search reset');
      window.testPanel = panel; window.testView = view;
      return { moves: moves.length };
    });
    assert.equal(result.moves, 2);
    await page.setViewport({width: 390, height: 800});
    assert.equal(await page.evaluate(() => {
      const box = document.querySelector('.livestock-housing').getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && document.querySelector('.livestock-housing').scrollWidth <= box.width + 1;
    }), true, 'mobile layout overflows');
    if (process.env.HOUSING_SCREENSHOT) await page.screenshot({path: process.env.HOUSING_SCREENSHOT});
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
