// Smoke test of the main page: run one setup through the UI and print the results table text.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const p = await b.newPage();
p.on('pageerror', (e) => console.error('pageerror', e.message));
await p.goto(process.argv[2]);
await p.selectOption('#setup', 'godot');
await p.selectOption('#n', '500');
await p.click('#run');
await p.waitForFunction(() => document.querySelectorAll('#mine tbody tr').length > 0, null, { timeout: 300000 });
console.log(await p.locator('#mine').innerText());
console.log('isolated', await p.evaluate(() => crossOriginIsolated));
await b.close();
