'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { PlatformError } = require('../lib/apiClient');

/**
 * Loads creative media bytes. Files uploaded to Vendo are read from disk;
 * anything else is downloaded. Used by platforms that want raw bytes (Meta, LinkedIn).
 */
async function loadMedia(url, platform) {
  const local = `${config.publicBaseUrl}/uploads/`;
  if (url.startsWith(local) || url.startsWith('/uploads/')) {
    const name = path.basename(url.split('?')[0]);
    const file = path.join(config.uploadsDir, name);
    if (!fs.existsSync(file)) throw new PlatformError(platform, `Uploaded file not found: ${name}`);
    return { bytes: fs.readFileSync(file), filename: name };
  }
  const res = await fetch(url);
  if (!res.ok) throw new PlatformError(platform, `Could not download creative ${url} (HTTP ${res.status})`);
  return { bytes: Buffer.from(await res.arrayBuffer()), filename: path.basename(new URL(url).pathname) || 'creative' };
}

/** Absolute URL for media so platforms that fetch by URL (TikTok, Pinterest) can reach it. */
const absoluteUrl = (url) => (url.startsWith('/') ? `${config.publicBaseUrl}${url}` : url);

/** "2026-01-31" → unix seconds at 00:00 UTC (or 23:59:59 when endOfDay). */
const unixSeconds = (date, endOfDay = false) => Math.floor(new Date(`${date}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).getTime() / 1000);

/** Start time that is never in the past (platforms reject past start dates). */
function startMs(date) {
  const t = new Date(`${date}T00:00:00Z`).getTime();
  return Math.max(t, Date.now() + 5 * 60 * 1000);
}

const first = (arr, fallback = '') => (Array.isArray(arr) && arr.length ? arr[0] : fallback);

module.exports = { loadMedia, absoluteUrl, unixSeconds, startMs, first };
