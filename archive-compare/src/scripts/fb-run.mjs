// Runs fairbench pages in real Chrome (GPU) and prints each __RESULT__ as one JSON line.
// Usage: node fb-run.mjs <baseUrl> <query> [<query> …]   e.g. "run.html?setup=rust-rapier&n=500&render=0"
import { chromium } from 'playwright-core';
const [base, ...queries] = process.argv.slice(2);
const headless = process.env.HEADED !== '1';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless, args: headless ? ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
for (const q of queries) {
  const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
  page.on('pageerror', (e) => console.error('pageerror', q, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', q, m.text().slice(0, 300)));
  await page.goto(`${base}/${q}`);
  const r = await page.waitForFunction(() => window.__RESULT__, null, { timeout: 1800000, polling: 1000 }).then((h) => h.jsonValue());
  if (process.env.SHOT) await page.locator('canvas').first().screenshot({ path: `${process.env.SHOT}/${r.setup}-${r.n}.png` });
  delete r.userAgent;
  console.log(JSON.stringify({ q, ...r }));
  await page.close();
}
await b.close();
