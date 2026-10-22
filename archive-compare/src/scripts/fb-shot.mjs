// Screenshots the main page (full height) for a visual check.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
for (const [w, scheme] of [[1200, 'light'], [390, 'dark']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  await p.goto(process.argv[2]);
  await p.waitForFunction(() => document.querySelectorAll('#ref tbody tr').length > 0);
  await p.screenshot({ path: `${process.argv[3]}/page-${w}.png`, fullPage: true });
  console.log(w, 'scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
}
await b.close();
