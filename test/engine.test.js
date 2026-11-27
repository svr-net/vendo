'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sampleSpec } = require('./helpers');
const { normalizeSpec, platformDailyBudget, minorUnits } = require('../src/engine/spec');
const { validateSpec } = require('../src/engine/validate');
const advisor = require('../src/engine/advisor');
const { encrypt, decrypt, hashPassword, verifyPassword } = require('../src/lib/crypto');

test('normalizeSpec fills defaults and normalises split to 100%', () => {
  const s = normalizeSpec({ platforms: ['meta', 'google', 'bogus'], budget: { daily: 100, split: { meta: 3, google: 1 } } });
  assert.deepEqual(s.platforms, ['meta', 'google']);
  assert.equal(s.goal, 'traffic');
  assert.equal(Math.round(s.budget.split.meta), 75);
  assert.equal(platformDailyBudget(s, 'google'), 25);
  assert.equal(s.activate, false, 'campaigns are paused unless explicitly activated');
  assert.equal(s.audience.ageMin, 18);
});

test('normalizeSpec keeps commas inside headline arrays but splits keyword strings', () => {
  const s = normalizeSpec({ creative: { headlines: ['Fast, free shipping'] }, audience: { keywords: 'a, b\nc' } });
  assert.deepEqual(s.creative.headlines, ['Fast, free shipping']);
  assert.deepEqual(s.audience.keywords, ['a', 'b', 'c']);
});

test('minor units respect zero-decimal currencies', () => {
  assert.equal(minorUnits(12.5, 'USD'), 1250);
  assert.equal(minorUnits(1000, 'JPY'), 1000);
});

test('a complete spec passes validation', () => {
  const v = validateSpec(normalizeSpec(sampleSpec()));
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test('validation catches platform-specific problems', () => {
  const spec = normalizeSpec(sampleSpec({
    budget: { daily: 20, currency: 'USD', split: { meta: 20, google: 20, tiktok: 20, linkedin: 20, pinterest: 20 } },
    creative: { ...sampleSpec().creative, headlines: ['This headline is far too long for Google Ads'], videoUrl: '' },
    audience: { countries: ['US'], keywords: [] },
  }));
  const v = validateSpec(spec);
  const has = (p, field) => v.errors.some((e) => e.platform === p && e.field === field);
  assert.equal(v.ok, false);
  assert.ok(has('google', 'audience.keywords'));
  assert.ok(has('google', 'creative.headlines'));
  assert.ok(has('tiktok', 'creative.videoUrl'));
  assert.ok(has('tiktok', 'budget.split'), 'TikTok needs ~20 USD/day');
  assert.ok(has('linkedin', 'budget.split'), 'LinkedIn needs ~10 USD/day');
});

test('live mode requires platform assets (page, organisation, board)', () => {
  const spec = normalizeSpec(sampleSpec());
  const modes = { meta: 'live', linkedin: 'live', pinterest: 'live' };
  const v = validateSpec(spec, { modes, targets: {} });
  for (const f of ['targets.pageId', 'targets.organizationId', 'targets.boardId']) assert.ok(v.errors.some((e) => e.field === f), f);
});

test('recommended split sums to ~100 and honours TikTok minimum', () => {
  const split = advisor.recommendSplit('awareness', ['meta', 'tiktok', 'google'], 40);
  const total = Object.values(split).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 100) < 0.5, `total ${total}`);
  assert.ok((split.tiktok / 100) * 40 >= 19.9, 'TikTok gets at least 20/day');
});

test('forecast returns per-platform ranges', () => {
  const f = advisor.forecast(normalizeSpec(sampleSpec()));
  assert.equal(f.rows.length, 5);
  for (const r of f.rows) assert.ok(r.clicks.high >= r.clicks.low);
});

test('insights explain results in plain language', () => {
  const low = advisor.insights({ platform: 'meta', goal: 'traffic', metrics: { impressions: 20000, clicks: 60, spend: 150 }, active: true });
  assert.ok(low.some((i) => i.level === 'warn' && /click-through/i.test(i.title)));
  const none = advisor.insights({ platform: 'google', goal: 'leads', metrics: null, active: false });
  assert.match(none[0].text, /paused/);
});

test('token encryption round-trips and passwords verify', () => {
  const enc = encrypt('secret-token');
  assert.notEqual(enc, 'secret-token');
  assert.equal(decrypt(enc), 'secret-token');
  const h = hashPassword('hunter22!');
  assert.ok(verifyPassword('hunter22!', h));
  assert.ok(!verifyPassword('wrong', h));
});
