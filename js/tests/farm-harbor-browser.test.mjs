import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
test('walk the coast path, board, row bow-first, disembark, and cast from an anchored boat', { skip: !existsSync(executablePath) }, async () => {
  const root = resolve('.');
  const server = createServer(async (req, res) => {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      const extension = path.split('.').at(-1);
      res.setHeader('Content-Type', ({ html: 'text/html', css: 'text/css', mjs: 'text/javascript', js: 'text/javascript', glb: 'model/gltf-binary' })[extension] ?? 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    const errors = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().endsWith('boat.glb')) responses.push(response.status()); });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/farm/cove/index.html?at=harbor-trail&farm=friend&property=lot.estate', { waitUntil: 'networkidle0' });
    assert.equal(await page.$('#visitHarbor'), null, 'harbor is reached through the world');
    await page.click('#enterCove');
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => location.pathname.includes('/harbor/'), { timeout: 10000 });
    await page.keyboard.up('KeyW');
    await page.waitForSelector('#enterCove');
    await page.waitForFunction(() => typeof window.__cove !== 'undefined');
    assert.equal(new URL(page.url()).searchParams.get('property'), 'lot.estate');
    await page.click('#enterCove');
    assert.equal(await page.evaluate(() => __cove.aboard()), false, 'arrive on foot');
    const start = await page.evaluate(() => __cove.pose());
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => __cove.pose().z < 13.2, { timeout: 15000 });
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyD');
    await page.waitForFunction(() => __cove.pose().x > 3, { timeout: 5000 });
    await page.keyboard.up('KeyD');
    assert.ok(start.z > await page.evaluate(() => __cove.pose().z), 'walk to the actual pier');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __cove.aboard());
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !__cove.aboard());
    const onPier = await page.evaluate(() => __cove.pose());
    assert.equal(onPier.y, 0.87);
    await page.keyboard.down('KeyS'); await new Promise(done => setTimeout(done, 150)); await page.keyboard.up('KeyS');
    assert.ok(await page.evaluate(() => __cove.pose().x) < onPier.x, 'disembarking restores walking');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => __cove.aboard());
    const beforeRow = await page.evaluate(() => __cove.boat());
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => __cove.boat().speed > 1);
    await page.keyboard.up('KeyW');
    assert.ok(await page.evaluate(() => __cove.boat().z) < beforeRow.z);
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => __cove.boat().mode === 'anchored' && __cove.atWater());
    const anchored = await page.evaluate(() => __cove.boat());
    await page.keyboard.down('Space');
    await page.waitForFunction(() => __cove.fishing().phase === 'charging');
    await new Promise(done => setTimeout(done, 400)); await page.keyboard.up('Space');
    await page.waitForFunction(() => ['flight', 'waiting', 'fighting'].includes(__cove.fishing().phase));
    assert.deepEqual(await page.evaluate(() => __cove.boat()), anchored, 'the boat stays anchored through a cast');
    assert.ok(await page.evaluate(() => __cove.fishing().landing), 'fishing has a real water landing');
    if (process.env.HARBOR_SCREENSHOT) await page.screenshot({ path: process.env.HARBOR_SCREENSHOT });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => __cove.fishing().phase === 'idle');
    await page.click('#returnHarbor');
    assert.equal(await page.evaluate(() => __cove.aboard()), false);
    assert.equal(await page.evaluate(() => __cove.pose().y), 0.87);
    await page.keyboard.down('KeyS');
    await page.waitForFunction(() => __cove.pose().x < 1.5);
    await page.keyboard.up('KeyS');
    await page.keyboard.down('KeyD');
    await page.waitForFunction(() => location.pathname.includes('/cove/'), { timeout: 18000 });
    await page.keyboard.up('KeyD');
    assert.equal(new URL(page.url()).searchParams.get('from'), 'harbor');
    assert.equal(new URL(page.url()).searchParams.get('property'), 'lot.estate');
    assert.ok(responses.includes(200));
    assert.deepEqual(errors, []);

  } finally {
    await browser?.close(); await new Promise(done => server.close(done));
  }
});
