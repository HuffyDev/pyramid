// Minimal in-memory API used only by the e2e test (node scripts/mock-api.mjs <port>).
import { createServer } from 'node:http';
const port = Number(process.argv[2] || 4999);
const db = { launches: [], fees: [], payouts: [], buybacks: [], offers: [], claims: {}, notices: [] };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (code, obj) => res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (req.url === '/snapshot') return send(200, db);
    if (req.url === '/launches' && req.method === 'POST') {
      const i = JSON.parse(body);
      const l = { id: `lc-${db.launches.length + 1}`, mint: `Mint${Date.now()}`, name: i.name, ticker: i.ticker, description: i.description, imageUrl: i.image, createdAt: Date.now(), devWallet: i.devWallet, recipient: i.recipient, payoutMessage: i.payoutMessage, devBuy: i.devBuy, socials: i.socials, mcap: [], failure: null };
      db.launches.unshift(l);
      return send(200, l);
    }
    send(404, { error: 'Not found' });
  });
}).listen(port, () => console.log('mock api on', port));
