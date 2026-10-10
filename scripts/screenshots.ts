/**
 * Screenshots at 1440 and 390: empty pyramid, 50 bricks, launch sheet, success.
 *   npm run build && npm run screenshots
 * Boots its own servers (memory store, SIM mode, DRY_RUN, PumpPortal pointed at nothing
 * so the launch runs the offline mock path). A Wallet Standard test wallet is injected;
 * it signs the dry-run message with junk bytes — no keys, nothing on-chain.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';

const OUT = path.resolve('docs/screenshots');
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function boot(port: number, env: Record<string, string>): Promise<ChildProcess> {
  const p = spawn('node', ['dist/server/server/index.js'], {
    env: { ...process.env, PORT: String(port), MEDIA_DIR: '/tmp/pyramid-shots-media', DRY_RUN: 'true', PUMPPORTAL_URL: 'http://127.0.0.1:9/none', PUMP_IPFS_URL: 'http://127.0.0.1:9/none', DEXSCREENER_URL: 'http://127.0.0.1:9', HELIUS_RPC_URL: '', ...env },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return p;
    } catch {
      /* booting */
    }
    await sleep(250);
  }
  throw new Error('server did not start');
}

// Wallet Standard test wallet (address of a never-funded throwaway key)
const TEST_WALLET = `(() => {
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const pk = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 255);
  const enc = (b) => { let n = 0n; for (const x of b) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of b) { if (x === 0) s = '1' + s; else break; } return s; };
  const account = { address: enc(pk), publicKey: pk, chains: ['solana:mainnet'], features: ['solana:signTransaction', 'solana:signMessage'] };
  const icon = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ffb52e"/></svg>');
  const wallet = {
    version: '1.0.0', name: 'Test Wallet', icon, chains: ['solana:mainnet'], accounts: [],
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => { console.log('test-wallet connect'); wallet.accounts = [account]; return { accounts: [account] }; } },
      'standard:disconnect': { version: '1.0.0', disconnect: async () => {} },
      'standard:events': { version: '1.0.0', on: () => () => {} },
      'solana:signMessage': { version: '1.0.0', signMessage: async (...inputs) => inputs.map((i) => ({ signedMessage: i.message, signature: new Uint8Array(64).fill(7) })) },
      'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signTransaction: async (...inputs) => inputs.map((i) => { const t = new Uint8Array(i.transaction); t.fill(9, 1, 65); return { signedTransaction: t }; }) },
    },
  };
  const register = ({ register }) => register(wallet);
  window.addEventListener('wallet-standard:app-ready', (e) => register(e.detail));
  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
})();`;

// 1x1-ish PNG test image (gold square with a dark mark), generated in-page
async function pickImage(page: Page) {
  const buf = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 512, 512);
    g.addColorStop(0, '#2f8b8b');
    g.addColorStop(1, '#0d1a2a');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512);
    x.fillStyle = '#ffd36e';
    x.beginPath();
    x.arc(256, 230, 120, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#0d1a2a';
    x.beginPath();
    x.ellipse(210, 210, 22, 30, 0, 0, Math.PI * 2);
    x.ellipse(302, 210, 22, 30, 0, 0, Math.PI * 2);
    x.fill();
    x.fillRect(150, 380, 212, 26);
    const b: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  const file = '/tmp/pyramid-shot-coin.png';
  writeFileSync(file, Buffer.from(buf));
  return file;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const sizes = [
  { name: '1440', viewport: { width: 1440, height: 900 }, mobile: false },
  { name: '390', viewport: { width: 390, height: 844 }, mobile: true },
];

async function addImage(page: Page) {
  const file = await pickImage(page);
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: /use image/i }).click();
  await page.getByRole('dialog', { name: /crop/i }).waitFor({ state: 'detached', timeout: 10_000 });
  await sleep(300);
}

async function shoot(port: number, label: string, fn?: (p: Page) => Promise<void>) {
  for (const s of sizes) {
    const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 2, isMobile: s.mobile, hasTouch: s.mobile });
    await ctx.addInitScript(TEST_WALLET);
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1800);
    page.on('console', (m) => m.type() === 'error' && console.log(`  [console] ${m.text().slice(0, 200)}`));
    if (fn) {
      try {
        await fn(page);
      } catch (e) {
        await page.screenshot({ path: path.join(OUT, `debug-${label}-${s.name}.png`) });
        throw e;
      }
    }
    await page.screenshot({ path: path.join(OUT, `${label}-${s.name}.png`) });
    console.log(`✓ ${label}-${s.name}.png`);
    await ctx.close();
  }
}

const only = process.argv[2];
if (!only || only === 'empty') {
  const empty = await boot(5101, { SIM_MODE: 'false' });
  await shoot(5101, '01-empty');
  empty.kill();
}

const sim = await boot(5102, { SIM_MODE: 'true', SIM_SEED: '50', SIM_INTERVAL_MS: '0' });
if (!only || only === 'bricks') await shoot(5102, '02-50-bricks');
if (!only || only === 'sheet') await shoot(5102, '03-launch-sheet', async (page) => {
  await page.getByRole('button', { name: /lay a brick/i }).first().click();
  await sleep(400);
  await page.getByPlaceholder('Sand Cat').fill('Oasis Owl');
  await page.getByPlaceholder('SCAT').fill('OWL');
  await page.getByPlaceholder('one more stone for the monument.').fill('a night bird that guards the bottom row.');
  await addImage(page);
});
if (!only || only === 'success') await shoot(5102, '04-success', async (page) => {
  // connect the test wallet first
  await page.getByRole('button', { name: /lay a brick/i }).first().click();
  await sleep(300);
  await page.getByPlaceholder('Sand Cat').fill('Oasis Owl');
  await page.getByPlaceholder('SCAT').fill('OWL');
  await addImage(page);
  await page.getByRole('button', { name: /connect wallet/i }).click();
  await page.getByRole('button', { name: /test wallet/i }).click();
  await sleep(700);
  await page.getByRole('button', { name: /lay a brick \(dry run\)/i }).click();
  await page.getByText(/your brick:/i).waitFor({ timeout: 20_000 });
  await sleep(1500);
});
if (only === 'pages') {
  const mint = ((await (await fetch('http://127.0.0.1:5102/api/pyramid')).json()) as { bricks: { mint: string; mcap: number }[] }).bricks.sort((a, b) => b.mcap - a.mcap)[0].mint;
  for (const [label, url] of [['05-brick', `/brick/${mint}`], ['06-leaderboard', '/leaderboard'], ['07-leaderboard-cracked', '/leaderboard?by=cracked']]) {
    for (const s of sizes) {
      const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 2, isMobile: s.mobile, hasTouch: s.mobile });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:5102${url}`, { waitUntil: 'networkidle' });
      await sleep(1200);
      await page.screenshot({ path: path.join(OUT, `${label}-${s.name}.png`) });
      console.log(`✓ ${label}-${s.name}.png`);
      await ctx.close();
    }
  }
}
sim.kill();
await browser.close();
