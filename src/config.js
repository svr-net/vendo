'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** Minimal .env loader (no dependency). Existing process.env values win. */
function loadDotEnv(file = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv();

const env = (k, d = '') => (process.env[k] ?? d).trim();

const config = {
  port: Number(env('PORT', '3000')),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  appSecret: env('APP_SECRET', 'dev-insecure-secret-change-me'),
  databasePath: env('DATABASE_PATH', path.join(__dirname, '..', 'data', 'vendo.db')),
  uploadsDir: path.join(__dirname, '..', 'data', 'uploads'),
  meta: {
    appId: env('META_APP_ID'),
    appSecret: env('META_APP_SECRET'),
    version: env('META_API_VERSION', 'v23.0'),
  },
  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
    developerToken: env('GOOGLE_ADS_DEVELOPER_TOKEN'),
    loginCustomerId: env('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/-/g, ''),
    version: env('GOOGLE_ADS_API_VERSION', 'v21'),
  },
  tiktok: {
    appId: env('TIKTOK_APP_ID'),
    appSecret: env('TIKTOK_APP_SECRET'),
  },
  linkedin: {
    clientId: env('LINKEDIN_CLIENT_ID'),
    clientSecret: env('LINKEDIN_CLIENT_SECRET'),
    version: env('LINKEDIN_API_VERSION', '202510'),
  },
  pinterest: {
    appId: env('PINTEREST_APP_ID'),
    appSecret: env('PINTEREST_APP_SECRET'),
  },
};

if (config.appSecret === 'dev-insecure-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('APP_SECRET must be set in production');
}

module.exports = config;
