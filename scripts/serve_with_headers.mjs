// Serve site/dist with the headers from site/dist/_headers applied, the way Cloudflare Pages does,
// so the Content-Security-Policy can be tested locally. Usage: node scripts/serve_with_headers.mjs [port]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site', 'dist');
const port = Number(process.argv[2] || 5176);
const headers = {};
for (const line of (await fs.readFile(path.join(dist, '_headers'), 'utf8')).split('\n')) {
  const m = line.match(/^\s+([\w-]+):\s*(.+)$/);
  if (m) headers[m[1]] = m[2].trim();
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(dist, path.normalize(p));
  if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', ...headers });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(await fs.readFile(path.join(dist, '404.html')));
  }
}).listen(port, '127.0.0.1', () => console.log(`serving site/dist with _headers on http://127.0.0.1:${port}`));
