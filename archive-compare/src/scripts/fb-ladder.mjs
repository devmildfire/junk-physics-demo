// Body-count ladder, physics-only mode: every setup at each count on seeds 1..3, appended as JSON lines.
// A setup stops climbing once its median step p95 (while spawning) passes 100 ms.
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const [base, out] = process.argv.slice(2);
const SETUPS = ['threejs', 'rust-jolt', 'godot', 'rust-rapier', 'rust-avian'];
const COUNTS = [1000, 2000, 4000, 6000, 8000, 10000];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
for (const setup of SETUPS) {
  for (const n of COUNTS) {
    const rows = [];
    for (const seed of [1, 2, 3]) {
      const q = `threads=4&n=${n}&seed=${seed}&render=0`;
      const url = setup === 'godot' ? `${base}/godot/index.html?${q}` : `${base}/run.html?setup=${setup}&${q}`;
      const page = await b.newPage();
      let r;
      try {
        await page.goto(url);
        r = await page.waitForFunction(() => window.__RESULT__, null, { timeout: 1800000, polling: 2000 }).then((h) => h.jsonValue());
      } catch (e) {
        r = { setup, n, seed, threads: 4, render: false, error: String(e.message || e).slice(0, 300), valid: false };
      }
      delete r.userAgent;
      fs.appendFileSync(out, JSON.stringify(r) + '\n');
      console.log(setup, n, seed, r.valid, r.throughFloor, r.offEdge, r.awakeAtEnd, r.spawnStepMs?.p95, r.settleStepMs?.p95, r.error ? r.error.slice(0, 80) : '');
      rows.push(r);
      await page.close();
    }
    const p95 = rows.map((r) => r.spawnStepMs?.p95 ?? Infinity).sort((a, c) => a - c)[1];
    if (p95 > 100) break;
  }
}
await b.close();
