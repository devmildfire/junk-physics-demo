// Render-mode runs in a visible Chrome window (headless caps frames at ~30 fps), appended as JSON lines.
// Usage: node fb-render.mjs <baseUrl> <out.jsonl> <n> [<n> …]
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const [base, out, ...counts] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false });
for (const n of counts) for (const setup of ['threejs', 'rust-jolt', 'godot', 'rust-rapier', 'rust-avian']) {
  const q = `threads=4&n=${n}&seed=1&render=1`;
  const page = await b.newPage({ viewport: { width: 1000, height: 640 } });
  await page.goto(setup === 'godot' ? `${base}/godot/index.html?${q}` : `${base}/run.html?setup=${setup}&${q}`);
  const r = await page.waitForFunction(() => window.__RESULT__, null, { timeout: 3600000, polling: 2000 }).then((h) => h.jsonValue());
  delete r.userAgent;
  fs.appendFileSync(out, JSON.stringify(r) + '\n');
  console.log(setup, n, r.valid, 'frame', r.frameMs?.p50, r.frameMs?.p95, 'draw', r.drawMs?.p95, 'sync', r.syncMs?.p95);
  await page.close();
}
await b.close();
