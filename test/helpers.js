'use strict';
process.env.DATABASE_PATH = ':memory:';
process.env.APP_SECRET = 'test-secret';
process.env.PUBLIC_BASE_URL = 'http://localhost:0';

const db = require('../src/lib/db');

function freshDb() {
  db.open(':memory:');
}

const sampleSpec = (over = {}) => ({
  name: 'Trail shoes launch',
  goal: 'traffic',
  platforms: ['meta', 'google', 'tiktok', 'linkedin', 'pinterest'],
  budget: { daily: 150, currency: 'USD', split: { meta: 20, google: 20, tiktok: 20, linkedin: 20, pinterest: 20 } },
  schedule: { start: new Date().toISOString().slice(0, 10), end: '' },
  audience: { countries: ['US', 'GB'], ageMin: 25, ageMax: 54, gender: 'female', keywords: ['trail running shoes', 'buy trail shoes', 'waterproof running shoes', 'womens trail shoes', 'running shoes sale'] },
  creative: {
    brandName: 'Acme Outdoors',
    headlines: ['Trail Shoes Built to Grip', 'Free Shipping Over $50', '30-Day Free Returns'],
    descriptions: ['Lightweight, waterproof and made to last.', 'Order today, delivered in 2 days.'],
    primaryText: 'Our new trail shoes grip on any terrain. Try them free for 30 days.',
    url: 'https://example.com/trail',
    cta: 'SHOP_NOW',
    imageUrl: 'https://cdn.example.com/shoe.jpg',
    videoUrl: 'https://cdn.example.com/shoe.mp4',
  },
  ...over,
});

/**
 * Installs a fake global fetch. `routes` is a list of [matcher(method, url), responder(body, url)].
 * Every call is recorded in the returned array.
 */
function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    let body = init.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* keep string */ } }
    calls.push({ method, url: String(url), body, headers: init.headers || {} });
    for (const [match, respond] of routes) {
      if (match(method, String(url))) {
        const out = await respond(body, String(url));
        const { status = 200, json = {}, headers = {}, raw } = out;
        return new Response(raw ?? JSON.stringify(json), { status, headers: { 'content-type': 'application/json', ...headers } });
      }
    }
    return new Response(JSON.stringify({ error: { message: `No mock for ${method} ${url}` } }), { status: 404 });
  };
  calls.restore = () => { globalThis.fetch = original; };
  return calls;
}

module.exports = { freshDb, sampleSpec, mockFetch };
