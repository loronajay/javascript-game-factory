import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
test('property office permits smaller farms and retries selection without charging twice', { skip: !existsSync(executablePath) }, async () => {
  const root = resolve('.');
  const server = createServer(async (req, res) => {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/js/farm-properties-panel.mjs`);
    const result = await page.evaluate(async () => {
      const { createPropertiesPanel } = await import('/js/farm-properties-panel.mjs');
      document.body.innerHTML = '<div class="farm-shell"></div>';
      const purchases = [], selections = [];
      let refuse = true;
      let defaultProperty = 'lot.estate';
      const panel = createPropertiesPanel({ canBuy: true, farm: () => ({ lot: 'lot.estate', defaultProperty }), balance: () => 100000,
        shop: async () => ({ ownedIds: ['lot.estate'], items: [] }),
        purchase: async id => { purchases.push(id); return { ok: true, balance: 75000 }; },
        selectProperty: async id => { selections.push(id); return { ok: !refuse }; },
        setDefaultProperty: async id => { defaultProperty = id; return { ok: true }; },
        takeBalance() {}, onClose() {} });
      await panel.open();
      const find = text => [...panel.root.querySelectorAll('button')].find(button => button.textContent.includes(text));
      const meadowEnabled = !find('Return to Meadow').disabled;
      const buy = find('Buy a separate farm');
      const smallerEnabled = !buy.disabled;
      buy.click(); buy.click();
      await new Promise(done => setTimeout(done, 0));
      const retry = find('Switch to this farm');
      const retryEnabled = retry && !retry.disabled;
      refuse = false; retry.click();
      await new Promise(done => setTimeout(done, 0));
      find('Return to Meadow').click();
      await new Promise(done => setTimeout(done, 0));
      find('Set as default farm').click();
      await new Promise(done => setTimeout(done, 0));
      return { meadowEnabled, smallerEnabled, retryEnabled, purchases, selections, defaultProperty };
    });
    assert.equal(result.meadowEnabled, true);
    assert.equal(result.smallerEnabled, true);
    assert.equal(result.retryEnabled, true);
    assert.deepEqual(result.purchases, ['lot.smallholding']);
    assert.deepEqual(result.selections, ['lot.smallholding', 'lot.smallholding', 'meadow']);
    assert.equal(result.defaultProperty, 'meadow');
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
});
