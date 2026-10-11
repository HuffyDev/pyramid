// Production server for the built SPA in ./dist. No dependencies.
// Serves static files, falls back to index.html for client-side routes.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function fileAt(urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const full = normalize(join(DIST, rel));
  if (full !== DIST && !full.startsWith(DIST + sep)) return null; // path traversal
  try {
    const s = await stat(full);
    return s.isFile() ? { path: full, size: s.size } : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const url = req.url || '/';
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  let file = await fileAt(url);
  const isAsset = /\.[a-z0-9]+$/i.test(url.split('?')[0]);
  if (!file && isAsset) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  if (!file) file = await fileAt('/index.html'); // SPA fallback
  if (!file) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Build missing: run "npm run build" first.');
    return;
  }
  const ext = extname(file.path).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': file.path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file.path).pipe(res);
});

server.listen(PORT, HOST, () => console.log(`DiscordMoney serving ${DIST} on http://${HOST}:${PORT}`));
