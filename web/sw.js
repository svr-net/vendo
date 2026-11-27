'use strict';
/**
 * Vendo in the browser. This Service Worker runs the same server code as `npm start`
 * (router, API routes, campaign engine, platform adapters) with:
 *   - SQLite compiled to WebAssembly (sql.js) instead of node:sqlite,
 *   - IndexedDB persistence for the database, uploads and session cookie,
 *   - fetch interception instead of node:http.
 * Only sandbox mode is possible here: real platform OAuth needs server-side secrets.
 */
const initSqlJs = require('sql.js/dist/sql-wasm.js');
const sqlite = require('./shims/sqlite');
const fs = require('./shims/fs');
const pages = require('../src/pages');

const scope = new URL(self.registration.scope);
const DB_NAME = 'vendo-demo';

// ---------- IndexedDB key/value ----------
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function kv(mode, key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite');
    const req = mode === 'get' ? tx.objectStore('kv').get(key) : tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Boot the "server" ----------
let handler;
let cookies = {};
const ready = (async () => {
  const SQL = await initSqlJs({ locateFile: (f) => new URL(f, scope).href });
  const [bytes, files, jar] = await Promise.all([kv('get', 'db'), kv('get', 'files'), kv('get', 'cookies')]);
  sqlite.configure({ SQL, bytes });
  for (const [k, v] of Object.entries(files || {})) fs.__files.set(k, v);
  cookies = jar || {};
  const db = require('../src/lib/db');
  db.open();
  const { Router, createHandler } = require('../src/lib/http');
  const router = new Router();
  router.get('/healthz', (req, res) => res.json({ ok: true, runtime: 'browser', sqlite: 'wasm' }));
  require('../src/routes/api').register(router);
  handler = createHandler({ router, staticDirs: [] });
})();

async function persist() {
  const writes = [];
  const snap = sqlite.takeSnapshot();
  if (snap) writes.push(kv('put', 'db', snap));
  if (fs.__takeDirty()) writes.push(kv('put', 'files', Object.fromEntries(fs.__files)));
  writes.push(kv('put', 'cookies', cookies));
  await Promise.all(writes);
}

/** Run one request through the Node-style handler with minimal req/res objects. */
async function runServer(request, pathAndQuery) {
  await ready;
  const body = request.method === 'GET' || request.method === 'HEAD' ? new Uint8Array() : new Uint8Array(await request.arrayBuffer());
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  headers.cookie = Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  const listeners = {};
  const req = {
    method: request.method,
    url: pathAndQuery,
    headers,
    destroy() {},
    on(ev, cb) {
      listeners[ev] = cb;
      if (ev === 'end') queueMicrotask(() => { if (body.length) listeners.data?.(Buffer.from(body)); listeners.end?.(); });
      return req;
    },
  };
  const out = await new Promise((resolve) => {
    const h = {};
    const chunks = [];
    let status = 200;
    const res = {
      headersSent: false,
      writableEnded: false,
      setHeader(k, v) { h[k.toLowerCase()] = v; },
      getHeader(k) { return h[k.toLowerCase()]; },
      writeHead(s, hd = {}) { status = s; for (const [k, v] of Object.entries(hd)) h[k.toLowerCase()] = v; this.headersSent = true; },
      end(data) {
        if (data) chunks.push(Buffer.from(data));
        this.writableEnded = true;
        resolve({ status, headers: h, body: Buffer.concat(chunks) });
      },
    };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 500, headers: {}, body: Buffer.from(JSON.stringify({ error: e.message })) }));
  });
  // Browsers drop Set-Cookie on Service Worker responses, so the worker keeps the session cookie itself.
  for (const c of [].concat(out.headers['set-cookie'] || [])) {
    const [pair, ...attrs] = c.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    if (attrs.some((a) => /max-age=0/i.test(a.trim()))) delete cookies[name];
    else cookies[name] = decodeURIComponent(pair.slice(i + 1));
  }
  delete out.headers['set-cookie'];
  if (request.method !== 'GET') await persist();
  return new Response(request.method === 'HEAD' ? null : out.body, { status: out.status, headers: out.headers });
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin) return;
  const rel = url.pathname.startsWith(scope.pathname) ? `/${url.pathname.slice(scope.pathname.length)}` : url.pathname;
  if (rel.startsWith('/api/')) {
    event.respondWith(runServer(event.request, rel + url.search));
  } else if (rel.startsWith('/uploads/')) {
    event.respondWith(serveUpload(rel));
  } else if (event.request.mode === 'navigate' && url.pathname.startsWith(scope.pathname)) {
    const page = Object.entries(pages).find(([re]) => new RegExp(re).test(rel));
    if (page) event.respondWith(fetch(new URL(page[1].slice(1), scope).href));
  }
});

async function serveUpload(rel) {
  await ready;
  const config = require('../src/config');
  const file = `${config.uploadsDir}/${rel.split('/').pop()}`;
  if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
  const ext = file.split('.').pop();
  const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime' }[ext] || 'application/octet-stream';
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type } });
}
