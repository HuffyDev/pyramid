import { chromium } from 'playwright-core';
const SP = process.argv[2];
const base = 'http://localhost:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const text = (s) => p.locator(s).first().innerText();

await p.goto(base + '/');
// copy token id
await p.getByRole('button', { name: /Copy CA: CAV5/ }).click();
ok((await p.evaluate(() => navigator.clipboard.readText())) === 'CAV5LevZc5AonWsgRKEqjgEqXnptXFgudt52Mrxgpump', 'copy CA');
// token overview + escape
await p.getByRole('button', { name: 'Token overview' }).click();
ok(await p.getByRole('dialog').isVisible(), 'token overview opens');
await p.keyboard.press('Escape');
ok(await p.getByRole('dialog').count() === 0, 'escape closes');
// fill form before connecting
await p.fill('#f-name', 'Test Coin');
await p.fill('#f-ticker', 'tst$1');
ok((await p.inputValue('#f-ticker')) === 'TST1', 'ticker normalized');
await p.fill('#f-msg', 'visit https://x.com');
await p.locator('#f-msg').blur();
ok(await p.getByText('Links are not allowed').isVisible(), 'link rejected in message');
await p.fill('#f-msg', 'Thanks team');
// bad file
await p.setInputFiles('input[type=file]', SP + '/bad.txt');
ok(await p.getByText('Use a PNG, JPG, GIF or WebP').isVisible(), 'bad file rejected');
await p.setInputFiles('input[type=file]', SP + '/coin.png');
await p.getByAltText('Coin preview').waitFor();
ok(true, 'image preview');
// connect via modal
await p.getByRole('button', { name: 'Connect demo', exact: true }).click();
await p.getByRole('button', { name: /Use demo wallet/ }).click();
ok((await p.inputValue('#f-name')) === 'Test Coin', 'form preserved after connect');
// socials validation
await p.getByRole('button', { name: /Add socials/ }).click();
await p.fill('#f-x', 'not a url');
await p.getByRole('button', { name: /Review demo launch/ }).click();
ok(await p.getByText('Enter a full URL').isVisible(), 'url validated');
await p.fill('#f-x', 'https://x.com/testcoin');
await p.getByRole('tab', { name: 'Server treasury' }).click();
await p.selectOption('select[aria-label=Server]', 'srv-frog');
await p.getByRole('button', { name: /Review demo launch/ }).click();
await p.getByRole('dialog').waitFor();
await p.getByLabel('Simulate a failure').check();
await p.getByRole('button', { name: 'Simulate launch' }).click();
await p.getByRole('button', { name: /Retry from/ }).waitFor({ timeout: 8000 });
ok(true, 'simulated failure + retry shown');
await p.getByRole('button', { name: /Retry from/ }).click();
await p.waitForURL(/\/launches\/dm-/, { timeout: 10000 });
const url = p.url();
await p.getByRole('heading', { name: 'Test Coin' }).waitFor(); ok(true, 'navigated to new launch');
// fees then payout blocked (unclaimed)
await p.getByRole('button', { name: 'Generate sample fees' }).click();
await p.getByText(/SOL sample fees/).first().waitFor();
ok(await p.getByRole('button', { name: /Simulate payout/ }).isDisabled(), 'payout blocked for unclaimed server');
// reload persists
await p.reload();
ok(await p.getByRole('heading', { name: 'Test Coin' }).isVisible(), 'persisted across reload');
// Claim: frog with nova (ineligible) then raidleader
await p.getByRole('link', { name: 'Go to Claim' }).click();
await p.waitForURL(/\/claim/);
await p.getByRole('button', { name: 'Connect demo Discord' }).first().click();
await p.getByRole('button', { name: /Fill it in/ }).click();
await p.getByRole('button', { name: /Generate demo code/ }).click();
const code = await p.locator('span.font-mono.text-\\[18px\\]').innerText();
ok(/^DCM-DEMO-[0-9A-F]{4}$/.test(code), 'code generated ' + code);
await p.getByRole('button', { name: /Simulate verification/ }).click();
await p.getByText(/does not have the simulated Manage Server/).first().waitFor();
ok(true, 'ineligible admin refused');
await p.getByRole('button', { name: /raidleader/ }).click();
await p.getByRole('button', { name: /Simulate verification/ }).click();
await p.getByText(/treasury is claimed/).waitFor();
ok(true, 'eligible admin claims');
await p.goto(url);
const pay = p.getByRole('button', { name: /Simulate payout/ });
ok(!(await pay.isDisabled()), 'payout enabled after claim');
await pay.click();
await p.getByText(/Paid .* SOL \(simulated\)/).waitFor();
ok((await text('text=Pending for recipient >> xpath=..')).includes('0 SOL'), 'pending zero after payout');
// offers
await p.goto(base + '/offers');
await p.fill('#o-req', 'Moon Night');
await p.fill('#o-price', '2');
await p.getByRole('button', { name: 'Review offer' }).click();
await p.getByRole('button', { name: 'Simulate offer' }).click();
await p.getByText('Offer created (demo)').waitFor();
await p.getByRole('tab', { name: 'My offers' }).click();
await p.getByRole('button', { name: /Moon Night/ }).click();
await p.getByRole('button', { name: 'Accept as demo admin' }).click();
await p.fill('#msg-text', 'nothing relevant');
await p.getByRole('button', { name: 'Submit demo message' }).click();
await p.getByText('Message does not qualify').waitFor();
await p.fill('#msg-text', 'Join MOON night!');
await p.getByRole('button', { name: 'Submit demo message' }).click();
await p.getByText('Qualifying message submitted').first().waitFor();
ok(await p.getByRole('button', { name: /Process demo payout/ }).isDisabled(), 'payout locked during retention');
await p.getByRole('dialog').getByRole('button', { name: '+72h' }).click();
await p.getByRole('button', { name: /Process demo payout/ }).click();
await p.getByText('Demo payout processed (90/10)').waitFor();
ok(await p.getByRole('dialog').getByText(/Completed — 1.80 SOL released/).isVisible(), 'offer completed with 90/10');
await p.keyboard.press('Escape');
// launches search / filters
await p.goto(base + '/launches?q=frog');
const cnt = await p.getByText(/Showing/).innerText();
ok(/of 2 results/.test(cnt), 'search frog -> ' + cnt);
await p.goto(base + '/launches?q=zzzz');
ok(await p.getByText('No launches match').isVisible(), 'empty state');
await p.goto(base + '/launches?sort=mcap');
ok((await p.locator('article h3').first().innerText()) === 'Guild Cat', 'mcap sort');
// dashboard unknown wallet
await p.goto(base + '/dashboard');
await p.fill('input[aria-label="Developer demo wallet"]', 'UnknownWallet123');
await p.getByRole('button', { name: 'View', exact: true }).click();
ok(await p.getByText('No launches for this wallet').isVisible(), 'unknown wallet empty state');
// reset
await p.getByRole('button', { name: 'Reset demo' }).first().click();
await p.getByRole('dialog').getByRole('button', { name: 'Reset demo' }).click();
await p.goto(url);
ok(await p.getByText('Launch not found').isVisible(), 'reset removed created launch');
// corrupted storage
await p.evaluate(() => localStorage.setItem('discordmoney:demo', '{bad json'));
await p.goto(base + '/launches');
ok(await p.getByText('Saved demo data was unreadable').isVisible(), 'corrupt storage handled');
// mobile nav
await p.setViewportSize({ width: 390, height: 800 });
await p.getByRole('button', { name: 'Open menu' }).click();
await p.locator('#mobile-nav').getByRole('link', { name: 'Claim' }).click();
await p.waitForURL(/\/claim/);
ok(true, 'mobile nav works');
console.log('console errors:', errs.length ? errs : 'none');
await b.close();
