'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { sampleSpec } = require('./helpers');
const { createServer } = require('../src/server');

let server;
let base;
let cookie = '';

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'vendo', Cookie: cookie, ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('pages are served', async () => {
  for (const p of ['/', '/learn', '/connect', '/campaigns', '/campaigns/new', '/campaigns/cmp_x', '/login']) {
    const r = await call(p);
    assert.equal(r.status, 200, p);
    assert.match(r.data, /<!doctype html>/i);
  }
});

test('API requires auth and CSRF header', async () => {
  assert.equal((await call('/api/campaigns')).status, 401);
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: {}, headers: { 'X-Requested-With': '' } })).status, 403);
});

test('full sandbox flow: signup → sandbox connections → preview → save → launch → activate → sync', async () => {
  const s = await call('/api/auth/signup', { method: 'POST', body: { email: 'new@example.com', password: 'longpassword' } });
  assert.equal(s.status, 201);
  for (const p of ['meta', 'google', 'tiktok', 'linkedin', 'pinterest']) {
    assert.equal((await call(`/api/connections/${p}/sandbox`, { method: 'POST' })).status, 200);
  }
  const conns = await call('/api/connections');
  assert.ok(conns.data.connections.every((c) => c.connection.mode === 'sandbox'));
  assert.ok(!JSON.stringify(conns.data).includes('accessToken'), 'tokens never leave the server');

  const preview = await call('/api/campaigns/preview', { method: 'POST', body: { spec: sampleSpec() } });
  assert.equal(preview.data.validation.ok, true, JSON.stringify(preview.data.validation.errors));
  assert.equal(preview.data.platforms.length, 5);
  assert.ok(preview.data.platforms[0].steps[0].explain.length > 20);

  const created = await call('/api/campaigns', { method: 'POST', body: { spec: sampleSpec() } });
  assert.equal(created.status, 201);
  const id = created.data.campaign.id;

  const launched = await call(`/api/campaigns/${id}/launch`, { method: 'POST' });
  assert.equal(launched.status, 200);
  assert.equal(launched.data.campaign.status, 'paused');
  const dep = launched.data.campaign.deployments[0];

  const act = await call(`/api/deployments/${dep.id}/status`, { method: 'POST', body: { active: true } });
  assert.equal(act.data.campaign.status, 'active');

  const sync = await call(`/api/campaigns/${id}/sync`, { method: 'POST' });
  assert.equal(sync.status, 200);
  assert.ok(sync.data.campaign.deployments[0].insights.length > 0);

  const edit = await call(`/api/campaigns/${id}`, { method: 'PUT', body: { spec: sampleSpec() } });
  assert.equal(edit.status, 409, 'launched campaigns cannot be edited in place');
});

test('launch is refused when validation fails', async () => {
  const created = await call('/api/campaigns', { method: 'POST', body: { spec: sampleSpec({ creative: { headlines: [] } }) } });
  const r = await call(`/api/campaigns/${created.data.campaign.id}/launch`, { method: 'POST' });
  assert.equal(r.status, 400);
  assert.ok(r.data.details.errors.length > 0);
});

test('OAuth start redirects to the platform login only when configured', async () => {
  const r = await call('/oauth/meta/start');
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^\/connect\?error=/);
});

test('uploads accept images and reject other types', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ok = await call('/api/uploads', { method: 'POST', body: { dataUrl: png } });
  assert.equal(ok.status, 201);
  const file = await fetch(base + ok.data.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  const bad = await call('/api/uploads', { method: 'POST', body: { dataUrl: 'data:text/html;base64,PGgxPg==' } });
  assert.equal(bad.status, 400);
});
