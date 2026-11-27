'use strict';
// Minimal POSIX `path` for the browser bundle.
function normalize(p) {
  const abs = p.startsWith('/');
  const out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); } else out.push(part);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
}
const join = (...parts) => normalize(parts.filter(Boolean).join('/'));
const basename = (p, ext) => { const b = p.replace(/\/+$/, '').split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
const dirname = (p) => { const i = p.replace(/\/+$/, '').lastIndexOf('/'); return i <= 0 ? (p.startsWith('/') ? '/' : '.') : p.slice(0, i); };
const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
const resolve = (...parts) => normalize(['/', ...parts].join('/'));
module.exports = { normalize, join, basename, dirname, extname, resolve, sep: '/', posix: null };
module.exports.posix = module.exports;
