import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
test('harbor loads its real boat, rows, anchors, recovers and fits a phone screen', { skip: !existsSync(executablePath) }, async () => {
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
    await page.goto(`http://127.0.0.1:${server.address().port}/farm/harbor/index.html?farm=friend&property=lot.estate`, { waitUntil: 'networkidle0' });
    assert.deepEqual(responses, [200]);
    assert.deepEqual(errors, []);
    assert.equal(await page.$eval('#useDock', button => button.disabled), false);
    assert.equal(await page.$eval('#backToCove', link => new URL(link.href).searchParams.get('property')), 'lot.estate');
    await page.click('#useDock');
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => Number(document.getElementById('boatSpeed').textContent) > 1);
    await page.keyboard.up('KeyW');
    await page.click('#toggleAnchor');
    await page.waitForFunction(() => document.getElementById('boatMode').textContent === 'At anchor');
    const position = await page.$eval('#chartBoat', node => node.getAttribute('transform'));
    await page.keyboard.down('KeyW');
    await new Promise(done => setTimeout(done, 250));
    await page.keyboard.up('KeyW');
    assert.equal(await page.$eval('#chartBoat', node => node.getAttribute('transform')), position);
    assert.equal(await page.$eval('#boatSpeed', node => node.textContent), '0.0');
    if (process.env.HARBOR_SCREENSHOT) await page.screenshot({ path: process.env.HARBOR_SCREENSHOT });
    await page.click('#returnHarbor');
    await page.waitForFunction(() => document.getElementById('boatMode').textContent === 'Mainland Harbor');
    assert.match(await page.$eval('#harborStatus', node => node.textContent), /Back safely/);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const fits = await page.evaluate(() => ['.harbor-header', '.voyage-card', '.helm'].every(selector => {
      const box = document.querySelector(selector).getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    }));
    assert.equal(fits, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); await new Promise(done => server.close(done));
  }
});
