import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createDefaultFarmLayout } from '../farm-layout.mjs';
import { normalizeFarmGarage, selectFarmProperty } from '../../platform-api/src/services/farm-loadout-catalog.mjs';
import { farmMarketBoard, farmMarketDay } from '../../platform-api/src/services/farm-market-day.mjs';

const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
test('ferry to a working island, meet its market, purchase a home, walk to it, and visit neighbors', { skip: !existsSync(executablePath), timeout: 240000 }, async () => {
  const root = resolve('.');
  const server = createServer(async (req, res) => {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ html: 'text/html', css: 'text/css', mjs: 'text/javascript', js: 'text/javascript', glb: 'model/gltf-binary' })[path.split('.').at(-1)] ?? 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser; let stage = "launch";
  try {
    browser = await puppeteer.launch({ executablePath, dumpio: process.env.BROWSER_DEBUG === "1", headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    browser.process()?.on("exit", (code, signal) => { console.error("Edge exit:", code, signal); });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    const errors = [], requests = [], owned = new Set();
    let farm = normalizeFarmGarage({ ...createDefaultFarmLayout(() => .5), onboarding: { status: 'complete' } });
    const originalPets = farm.pets;
    page.on('pageerror', error => { errors.push(error.message); console.error('Island page error:', error.message); });
    // All API traffic is intercepted: this journey never writes to a real account.
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.origin === base || !url.protocol.startsWith('http')) { await request.continue(); return; }
      requests.push(url.pathname);
      const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' };
      let body = {};
      if (url.pathname === '/games/farm/garage') {
        if (request.method() === 'PUT') {
          const submitted = JSON.parse(request.postData()).garage;
          if (submitted.selectProperty) farm = selectFarmProperty(farm, submitted.selectProperty, { ownedEntitlementIds: owned, propertyRevision: submitted.propertyRevision, now: Date.now() });
          body = { ok: true, garage: farm };
        } else body = { garage: farm };
      } else if (url.pathname === '/tickets/shops/farm/purchases' && request.method() === 'POST') {
        owned.add(JSON.parse(request.postData()).itemId); body = { purchase: { ok: true, balance: 65000 } };
      } else if (url.pathname === '/tickets/shops/farm') body = { shop: { ownedIds: [...owned], items: [{ id: 'lot.orchard', price: 35000 }] } };
      else if (url.pathname === '/tickets/wallet') body = { wallet: { balance: 100000 } };
      else if (url.pathname === '/games/farm/market/prices') body = { market: farmMarketBoard(farmMarketDay(Date.now()), url.searchParams.get("region") ?? "mainland") };
      else if (url.pathname === '/games/farm/residents') body = { directory: { residents: [{ playerId: 'neighbor', name: 'Lina', propertyId: 'lot.orchard' }], next: null } };
      await request.respond({ status: 200, headers, body: JSON.stringify(body) });
    });
    const enterHarbor = async () => { await page.waitForFunction(() => window.__cove && !document.querySelector('#enterCove').disabled); await page.click('#enterCove'); };
    stage = 'initial ferry';
    await page.goto(base + '/farm/harbor/index.html?at=ferry', { waitUntil: 'networkidle0' });
    await enterHarbor();
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => new URLSearchParams(location.search).get('region') === 'orchard-isle' && window.__cove);
    await enterHarbor();
    assert.equal(await page.$eval('.hud-place__name h1', node => node.textContent), 'Orchard Harbor');
    assert.ok(await page.evaluate(() => __cove.pose().z < 22), 'arrive at the dock, not at a menu');
    if (process.env.ISLAND_QA_DIR) await page.screenshot({ path: process.env.ISLAND_QA_DIR + '/orchard-harbor.png' });
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => location.pathname.includes('/market/'), { timeout: 20000 });
    await page.keyboard.up('KeyW');
    stage = 'market scene ready';
    await page.waitForFunction(() => window.__market);
    assert.equal(await page.$eval('.hud-place__name h1', node => node.textContent), 'Orchard Market');
    stage = 'market account';
    // Sign in only against the intercepted account API, then buy a separate home.
    await page.evaluate(() => localStorage.setItem('javascript-game-factory.authToken', 'island-browser-test'));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__market);
    await page.click('#enterMarket'); await page.click('#openProperties');
    await page.waitForFunction(() => [...document.querySelectorAll('#propertiesPanel button')].some(button => button.textContent.includes('Buy a separate farm') && !button.disabled));
    assert.equal(await page.$$eval('.property-card', nodes => nodes.length), 1, 'island office sells island property');
    await page.evaluate(() => [...document.querySelectorAll('#propertiesPanel button')].find(button => button.textContent.includes('Buy a separate farm')).click());
    await page.waitForFunction(() => window.__market && document.querySelector('#propertiesPanel')?.hidden);
    await page.waitForFunction(() => document.querySelector('.hud-place__name h1')?.textContent === 'Orchard Market');
    assert.equal(farm.lot, 'lot.orchard');
    assert.deepEqual(farm.properties.meadow.pets, originalPets, 'buying on the island preserves the original herd/pets');
    if (process.env.ISLAND_QA_DIR) { await page.click('#enterMarket'); await page.screenshot({ path: process.env.ISLAND_QA_DIR + '/orchard-market.png' }); }
    stage = 'homestead entrance';
    await page.click('#marketHomeLink'); await enterHarbor();
    await page.keyboard.down('KeyD'); await page.waitForFunction(() => __cove.pose().x > 23, { timeout: 15000 }); await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyS'); await page.waitForFunction(() => __cove.pose().z > 37.5); await page.keyboard.up('KeyS');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => location.pathname === '/farm/index.html' && window.__farm, { timeout: 20000 });
    assert.equal(await page.evaluate(() => __farm.layout().lot), 'lot.orchard');
    assert.equal(await page.evaluate(() => __farm.layout().pets.length), 0, 'new island farm has independent residents');
    stage = 'resident board';
    await page.goto(base + '/farm/harbor/index.html?region=orchard-isle&at=residents', { waitUntil: 'networkidle0' }); await enterHarbor();
    await page.keyboard.press('KeyE');
    await page.waitForSelector('#islandResidents a');
    const visit = await page.$eval('#islandResidents a', node => node.href);
    assert.equal(new URL(visit).searchParams.get('id'), 'neighbor');
    assert.equal(new URL(visit).searchParams.get('property'), 'lot.orchard');
    assert.ok(requests.includes('/games/farm/residents'));
    assert.deepEqual(errors, []);
    stage = 'return ferry';
    await page.goto(base + '/farm/harbor/index.html?region=orchard-isle&at=ferry', { waitUntil: 'domcontentloaded' }); await enterHarbor();
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => new URLSearchParams(location.search).get('region') === 'mainland' && window.__cove);
    await enterHarbor();
    assert.equal(await page.evaluate(() => __cove.aboard()), false, 'return ferry leaves the player safely on foot');
    stage = 'boat crossing';
    await page.keyboard.press('KeyE'); await page.waitForFunction(() => __cove.aboard());
    await page.keyboard.down('KeyW'); await page.waitForFunction(() => __cove.boat().z < -74, { timeout: 40000 }); await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => new URLSearchParams(location.search).get('region') === 'orchard-isle' && window.__cove);
    await enterHarbor();
    assert.equal(await page.evaluate(() => __cove.aboard()), false, 'boat voyage also arrives at a safe disembarked dock');
    assert.deepEqual(errors, []);
    stage = 'property preview';
    if (process.env.ISLAND_PROPERTY_PREVIEW) {
      await page.goto(base + '/farm/tour.html?property=lot.orchard', { waitUntil: 'networkidle0' });
      await page.click('[data-view="overview"]'); await page.waitForNetworkIdle();
      await (await page.$('#tourCanvas')).screenshot({ path: process.env.ISLAND_PROPERTY_PREVIEW });
    }
  } catch (error) { console.error("Island browser stage:", stage); console.error("Open pages:", (await browser?.pages().catch(() => []) ?? []).map(page => page.url())); throw error; } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
