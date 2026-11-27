'use strict';
/**
 * A tiny HTTP toolkit on top of node:http: routing with params, JSON bodies,
 * cookies and static files. Keeps Vendo free of runtime dependencies.
 */
const fs = require('node:fs');
const path = require('node:path');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
    this.routes.push({ method, re, keys, handlers });
    return this;
  }
  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.re);
      if (m) return { handlers: r.handlers, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function enhance(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  req.cookies = parseCookies(req.headers.cookie);
  res.json = (status, data) => {
    if (typeof status !== 'number') { data = status; status = 200; }
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  };
  res.redirect = (location, status = 302) => { res.writeHead(status, { Location: location }); res.end(); };
  res.setCookie = (name, value, opts = {}) => {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, 'HttpOnly', 'SameSite=Lax'];
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.secure) parts.push('Secure');
    const prev = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [...[].concat(prev), parts.join('; ')]);
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(root, req, res, pathname) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(root, rel);
  if (!file.startsWith(root)) return false;
  try {
    let stat = fs.statSync(file);
    if (stat.isDirectory()) { file = path.join(file, 'index.html'); stat = fs.statSync(file); }
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    return true;
  } catch { return false; }
}

function createHandler({ router, staticDirs = [], pageAliases = {} }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    enhance(req, res, url);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const match = router.match(req.method, url.pathname);
      if (match) {
        req.params = match.params;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          const raw = await readBody(req);
          const type = req.headers['content-type'] || '';
          if (type.includes('application/json') && raw.length) {
            try { req.body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON body'); }
          } else if (type.includes('application/x-www-form-urlencoded')) {
            req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
          } else req.body = {};
        }
        for (const h of match.handlers) {
          let nextCalled = false;
          await h(req, res, () => { nextCalled = true; });
          if (!nextCalled || res.writableEnded) break;
        }
        if (!res.writableEnded && !res.headersSent) throw new HttpError(500, 'Handler did not respond');
        return;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const alias = Object.entries(pageAliases).find(([re]) => new RegExp(re).test(url.pathname));
        const target = alias ? alias[1] : url.pathname;
        for (const dir of staticDirs) {
          const [prefix, root] = Array.isArray(dir) ? dir : ['/', dir];
          if (!target.startsWith(prefix)) continue;
          if (serveStatic(root, req, res, target.slice(prefix.length - 1) || '/')) return;
        }
      }
      throw new HttpError(404, 'Not found');
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      if (res.headersSent) { res.end(); return; }
      if (url.pathname.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        res.json(status, { error: err.message || 'Server error', details: err.details });
      } else {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>${status}</title><link rel="stylesheet" href="/css/app.css"><main class="container narrow"><h1>${status}</h1><p>${escapeHtml(err.message)}</p><p><a href="/">Back to Vendo</a></p></main>`);
      }
    }
  };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { Router, HttpError, createHandler, parseCookies };
