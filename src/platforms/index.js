'use strict';
const meta = require('./meta');
const google = require('./google');
const tiktok = require('./tiktok');
const linkedin = require('./linkedin');
const pinterest = require('./pinterest');

const adapters = { meta, google, tiktok, linkedin, pinterest };

function getAdapter(id) {
  const a = adapters[id];
  if (!a) throw new Error(`Unknown platform: ${id}`);
  return a;
}

module.exports = { adapters, getAdapter };
