// Browser smoke test. Usage: node scripts/e2e.mjs <baseUrl> [withApi]
// withApi: expects the site built with VITE_API_BASE_URL pointing at scripts/mock-api.mjs.
import { chromium } from 'playwright-core';
const [base = 'http://localhost:4173', withApi] = process.argv.slice(2);
const exe = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exe });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
// Stand-in for a browser wallet extension (Phantom's provider interface).
await ctx.addInitScript(() => {
  const pk = { toString: () => '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' };
  window.phantom = { solana: { isPhantom: true, publicKey: null, connect: async () => ({ publicKey: pk }), disconnect: async () => {}, on: () => {} } };
});
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
p.on('pageerror', (e) => errs.push(e.message));

for (const path of ['/', '/launches', '/dashboard', '/offers', '/claim', '/launches/nope', '/zzz']) {
  await p.goto(base + path, { waitUntil: 'networkidle' });
  const txt = await p.locator('body').innerText();
  ok(!/\b(demo|sample|simulat|fake|fictional)/i.test(txt), `no demo wording on ${path}`);
  ok(txt.length > 200, `${path} renders content`);
}
// nav clicks keep content
await p.goto(base + '/');
for (const name of ['Launches', 'Dashboard', 'Posts', 'Claim', 'Launch']) {
  await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
  await p.waitForTimeout(150);
  ok((await p.locator('main').innerText()).length > 50, `nav → ${name} shows content`);
}
// connect wallet
await p.getByRole('button', { name: 'Connect', exact: true }).click();
await p.getByRole('button', { name: /Phantom/ }).click();
await p.getByText('Phantom connected').waitFor();
ok(true, 'wallet connects');
// launch form validation + submit
await p.goto(base + '/');
await p.getByRole('button', { name: /Review launch/ }).click();
ok(await p.getByText('Add a coin image.').isVisible(), 'validation shows');
await p.setInputFiles('input[type=file]', { name: 'c.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
await p.getByAltText('Coin preview').waitFor();
await p.fill('#f-name', 'Test Coin');
await p.fill('#f-ticker', 'test');
await p.fill('#f-mname', 'somebody');
await p.getByRole('button', { name: 'Use mine' }).click();
await p.getByRole('button', { name: /Review launch/ }).click();
await p.getByRole('button', { name: 'Launch coin' }).click();
if (withApi) {
  await p.waitForURL(/\/launches\/lc-/, { timeout: 8000 });
  await p.getByRole('heading', { name: 'Test Coin' }).waitFor();
  ok(true, 'launch created via API and detail page shown');
  await p.goto(base + '/launches');
  ok(await p.getByText('Test Coin').first().isVisible(), 'new launch listed');
} else {
  await p.getByText('Launch failed.').waitFor();
  ok(await p.getByText('Launching is not available yet.').isVisible(), 'clear message when API not configured');
}
// mobile
await p.setViewportSize({ width: 390, height: 800 });
for (const path of ['/', '/offers', '/claim', '/dashboard']) {
  await p.goto(base + path, { waitUntil: 'networkidle' });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 391, `no horizontal scroll on mobile ${path} (${sw})`);
}
ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
