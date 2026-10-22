// Static server with COOP/COEP so SharedArrayBuffer (wasm threads) works. Usage: node serve-coi.mjs <root> <port>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [, , root, port] = process.argv;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.pck': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(Number(port), '127.0.0.1');
