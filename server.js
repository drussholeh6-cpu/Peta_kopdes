// Server lokal Peta Kopdes. Endpoint API digunakan bersama oleh deployment Vercel.
const http = require('http');
const fs = require('fs');
const path = require('path');
const handleApi = require('./lib/api');

const PORT = process.env.PORT || 8000;
const PUB = __dirname;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/octet-stream') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res);
  let file = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUB)) return send(res, 403, 'Dilarang', 'text/plain');
  fs.readFile(file, (err, buf) => err ? send(res, 404, 'Halaman tidak ditemukan', 'text/plain; charset=utf-8') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
}).listen(PORT, () => console.log(`Peta Kopdes jalan di http://localhost:${PORT}`));
