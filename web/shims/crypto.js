'use strict';
// The subset of node:crypto Vendo uses, implemented with audited pure-JS libraries
// (@noble/hashes, @noble/ciphers) so the synchronous Node API keeps working.
const { Buffer } = require('buffer');
const { sha256 } = require('@noble/hashes/sha2');
const { scrypt } = require('@noble/hashes/scrypt');
const { gcm } = require('@noble/ciphers/aes');

const toBytes = (d, enc) => Uint8Array.from(typeof d === 'string' ? Buffer.from(d, enc || 'utf8') : Buffer.from(d));

function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Buffer.from(b);
}

function createHash(alg) {
  if (alg !== 'sha256') throw new Error(`Hash ${alg} not available in the browser build`);
  const chunks = [];
  return {
    update(d, enc) { chunks.push(toBytes(d, enc)); return this; },
    digest(enc) { const h = Buffer.from(sha256(Buffer.concat(chunks))); return enc ? h.toString(enc) : h; },
  };
}

function scryptSync(password, salt, keylen, opts = {}) {
  const N = opts.N || opts.cost || 16384; // Node defaults
  const r = opts.r || opts.blockSize || 8;
  const p = opts.p || opts.parallelization || 1;
  return Buffer.from(scrypt(toBytes(password), toBytes(salt), { N, r, p, dkLen: keylen }));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function cipher(mode, alg, key, iv) {
  if (alg !== 'aes-256-gcm') throw new Error(`Cipher ${alg} not available in the browser build`);
  const chunks = [];
  let tag;
  return {
    update(d, enc) { chunks.push(toBytes(d, enc)); return Buffer.alloc(0); },
    final() {
      const data = Buffer.concat(chunks);
      const g = gcm(toBytes(key), toBytes(iv));
      if (mode === 'enc') {
        const out = g.encrypt(data);
        tag = Buffer.from(out.slice(out.length - 16));
        return Buffer.from(out.slice(0, out.length - 16));
      }
      return Buffer.from(g.decrypt(Buffer.concat([data, tag])));
    },
    getAuthTag: () => tag,
    setAuthTag(t) { tag = Buffer.from(t); return this; },
  };
}

module.exports = {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
  createCipheriv: (alg, key, iv) => cipher('enc', alg, key, iv),
  createDecipheriv: (alg, key, iv) => cipher('dec', alg, key, iv),
};
