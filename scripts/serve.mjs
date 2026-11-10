#!/usr/bin/env node
/**
 * A tiny static file server for local development of the web app.
 *
 *   node scripts/serve.mjs [dir] [--port 4173]
 *
 * Zero dependencies, localhost only, read-only.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = Number(portFlag !== -1 ? args[portFlag + 1] : process.env.PORT) || 4173;
const dirArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const base = path.resolve(ROOT, dirArg || 'docs');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  let file = path.join(base, pathname);
  if (!file.startsWith(base)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${path.relative(ROOT, base) || '.'} at http://localhost:${port}`);
});
