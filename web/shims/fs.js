'use strict';
// In-memory file system for the browser bundle (used for creative uploads).
// The Service Worker persists `files` to IndexedDB after each write.
const { Buffer } = require('buffer');
const path = require('./path');

const files = new Map();
let dirty = false;
const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: 'ENOENT' });
const isDir = (p) => { const d = path.normalize(p).replace(/\/$/, '') + '/'; for (const k of files.keys()) if (k.startsWith(d)) return true; return false; };

module.exports = {
  existsSync: (p) => files.has(path.normalize(p)) || isDir(p),
  readFileSync(p, enc) {
    const b = files.get(path.normalize(p));
    if (!b) throw enoent(p);
    const buf = Buffer.from(b);
    return typeof enc === 'string' || enc?.encoding ? buf.toString(enc.encoding || enc) : buf;
  },
  writeFileSync(p, data) { files.set(path.normalize(p), Uint8Array.from(Buffer.from(data))); dirty = true; },
  mkdirSync() {},
  statSync(p) {
    const b = files.get(path.normalize(p));
    if (b) return { isFile: () => true, isDirectory: () => false, size: b.length };
    if (isDir(p)) return { isFile: () => false, isDirectory: () => true, size: 0 };
    throw enoent(p);
  },
  createReadStream() { throw new Error('Streams are not available in the browser build'); },
  // --- persistence hooks for the Service Worker ---
  __files: files,
  __takeDirty() { const d = dirty; dirty = false; return d; },
};
