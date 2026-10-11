import { chromium } from 'playwright-core';
const OUT = process.argv[2];
const base = 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return p;
}
const p = await page(1280, 900);
for (const [name, path] of [['home', '/'], ['launches', '/launches'], ['detail', '/launches/dm-1a2b'], ['dashboard', '/dashboard'], ['offers', '/offers'], ['claim', '/claim'], ['404', '/nope']]) {
  await p.goto(base + path, { waitUntil: 'networkidle' });
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}
const m = await page(390, 844);
for (const [name, path] of [['m-home', '/'], ['m-launches', '/launches'], ['m-offers', '/offers']]) {
  await m.goto(base + path, { waitUntil: 'networkidle' });
  await m.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 390) errors.push(`horizontal overflow on ${path}: ${sw}`);
}
const t = await page(820, 1100);
await t.goto(base + '/dashboard', { waitUntil: 'networkidle' });
await t.screenshot({ path: `${OUT}/t-dashboard.png`, fullPage: true });
console.log(errors.join('\n') || 'no console errors');
await browser.close();
