'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshDb, sampleSpec, mockFetch } = require('./helpers');
const db = require('../src/lib/db');
const connections = require('../src/engine/connections');
const orchestrator = require('../src/engine/orchestrator');
const { normalizeSpec } = require('../src/engine/spec');

const USER = 'usr_test';

function setup(platforms, targets = {}) {
  freshDb();
  db.run("INSERT INTO users (id, email, password_hash) VALUES (?, 'u@example.com', 'x')", USER);
  for (const p of platforms) {
    connections.saveConnection(USER, p, { mode: 'live', accessToken: `tok-${p}`, accountId: p === 'meta' ? 'act_111' : '111', accountName: 'Test', currency: 'USD', settings: { targets: targets[p] || {} } });
  }
}

function createCampaign(spec) {
  const s = normalizeSpec(spec);
  db.run('INSERT INTO campaigns (id, user_id, name, goal, spec) VALUES (?,?,?,?,?)', 'cmp_t', USER, s.name, s.goal, JSON.stringify(s));
  return db.one("SELECT * FROM campaigns WHERE id = 'cmp_t'");
}

const has = (needle) => (m, u) => u.includes(needle);
const post = (needle) => (m, u) => m === 'POST' && u.includes(needle);

beforeEach(() => {});

test('Meta: uploads image, then creates campaign → ad set → creative → ad with chained ids', async () => {
  setup(['meta'], { meta: { pageId: 'page_9' } });
  const calls = mockFetch([
    [has('cdn.example.com'), () => ({ raw: 'IMAGEBYTES', headers: { 'content-type': 'image/jpeg' } })],
    [post('/adimages'), () => ({ json: { images: { bytes: { hash: 'hash_abc' } } } })],
    [post('/campaigns'), () => ({ json: { id: 'c_1' } })],
    [post('/adsets'), () => ({ json: { id: 'as_1' } })],
    [post('/adcreatives'), () => ({ json: { id: 'cr_1' } })],
    [post('/ads'), () => ({ json: { id: 'ad_1' } })],
  ]);
  try {
    const [dep] = await orchestrator.launchCampaign(USER, createCampaign(sampleSpec({ platforms: ['meta'] })));
    assert.equal(dep.status, 'paused', dep.error);
    assert.deepEqual(dep.externalIds, { imageHash: 'hash_abc', campaign: 'c_1', adset: 'as_1', creative: 'cr_1', ad: 'ad_1' });
    const graph = calls.filter((c) => c.url.includes('graph.facebook.com'));
    assert.equal(graph.length, 5);
    assert.equal(graph[0].headers.Authorization, 'Bearer tok-meta');
    const [, camp, adset, creative, ad] = graph.map((c) => c.body);
    assert.equal(camp.objective, 'OUTCOME_TRAFFIC');
    assert.equal(camp.status, 'PAUSED');
    assert.equal(adset.campaign_id, 'c_1');
    assert.equal(adset.daily_budget, 15000, 'single platform gets 100% of 150 USD = 15000 cents');
    assert.deepEqual(adset.targeting.geo_locations.countries, ['US', 'GB']);
    assert.deepEqual(adset.targeting.genders, [2]);
    assert.equal(creative.object_story_spec.page_id, 'page_9');
    assert.equal(creative.object_story_spec.link_data.image_hash, 'hash_abc');
    assert.equal(creative.object_story_spec.link_data.call_to_action.type, 'SHOP_NOW');
    assert.deepEqual(ad.creative, { creative_id: 'cr_1' });
  } finally { calls.restore(); }
});

test('Meta: failed step is reported and the launch resumes without duplicates', async () => {
  setup(['meta'], { meta: { pageId: 'page_9' } });
  let failCreative = true;
  const routes = [
    [has('cdn.example.com'), () => ({ raw: 'IMG' })],
    [post('/adimages'), () => ({ json: { images: { bytes: { hash: 'h' } } } })],
    [post('/campaigns'), () => ({ json: { id: 'c_1' } })],
    [post('/adsets'), () => ({ json: { id: 'as_1' } })],
    [post('/adcreatives'), () => (failCreative ? { status: 400, json: { error: { message: 'Invalid page', error_user_msg: 'The Page is not owned by this business.' } } } : { json: { id: 'cr_1' } })],
    [post('/ads'), () => ({ json: { id: 'ad_1' } })],
  ];
  let calls = mockFetch(routes);
  const campaign = createCampaign(sampleSpec({ platforms: ['meta'] }));
  try {
    const [dep] = await orchestrator.launchCampaign(USER, campaign);
    assert.equal(dep.status, 'failed');
    assert.match(dep.error, /not owned by this business/);
  } finally { calls.restore(); }
  failCreative = false;
  calls = mockFetch(routes);
  try {
    const [dep] = await orchestrator.launchCampaign(USER, campaign);
    assert.equal(dep.status, 'paused');
    assert.equal(calls.filter((c) => c.url.endsWith('/campaigns')).length, 0, 'campaign not re-created');
    assert.equal(dep.externalIds.ad, 'ad_1');
  } finally { calls.restore(); }
});

test('Google Ads: budget → campaign → criteria → ad group → keywords → RSA', async () => {
  setup(['google']);
  const rn = (type, n = 1) => ({ json: { results: Array.from({ length: n }, (_, i) => ({ resourceName: `customers/111/${type}/${i + 1}` })) } });
  const calls = mockFetch([
    [post('campaignBudgets:mutate'), () => rn('campaignBudgets')],
    [post('campaigns:mutate'), () => rn('campaigns')],
    [post('campaignCriteria:mutate'), (b) => rn('campaignCriteria', b.operations.length)],
    [post('adGroups:mutate'), () => rn('adGroups')],
    [post('adGroupCriteria:mutate'), (b) => rn('adGroupCriteria', b.operations.length)],
    [post('adGroupAds:mutate'), () => rn('adGroupAds')],
  ]);
  try {
    const [dep] = await orchestrator.launchCampaign(USER, createCampaign(sampleSpec({ platforms: ['google'] })));
    assert.equal(dep.status, 'paused', dep.error);
    const b = calls.map((c) => c.body);
    assert.equal(calls[0].headers['developer-token'], '');
    assert.equal(b[0].operations[0].create.amountMicros, '150000000');
    const camp = b[1].operations[0].create;
    assert.equal(camp.campaignBudget, 'customers/111/campaignBudgets/1');
    assert.equal(camp.advertisingChannelType, 'SEARCH');
    assert.equal(camp.status, 'PAUSED');
    assert.deepEqual(camp.targetSpend, {});
    const geos = b[2].operations.map((o) => o.create.location?.geoTargetConstant).filter(Boolean);
    assert.deepEqual(geos, ['geoTargetConstants/2840', 'geoTargetConstants/2826']);
    assert.equal(b[4].operations.length, 5);
    assert.equal(b[4].operations[0].create.keyword.matchType, 'PHRASE');
    const rsa = b[5].operations[0].create.ad.responsiveSearchAd;
    assert.equal(rsa.headlines.length, 3);
    assert.equal(rsa.descriptions.length, 2);
  } finally { calls.restore(); }
});

test('TikTok: video, cover, identity, campaign, ad group, ad; code != 0 is an error', async () => {
  setup(['tiktok']);
  const ok = (data) => ({ json: { code: 0, message: 'OK', data } });
  const calls = mockFetch([
    [post('/file/video/ad/upload/'), () => ok([{ video_id: 'v_1' }])],
    [post('/file/image/ad/upload/'), () => ok({ image_id: 'i_1' })],
    [post('/identity/create/'), () => ok({ identity_id: 'id_1' })],
    [post('/campaign/create/'), () => ok({ campaign_id: 'tc_1' })],
    [post('/adgroup/create/'), () => ok({ adgroup_id: 'ag_1' })],
    [post('/ad/create/'), () => ({ json: { code: 40002, message: 'Ad text contains prohibited words' } })],
  ]);
  try {
    const [dep] = await orchestrator.launchCampaign(USER, createCampaign(sampleSpec({ platforms: ['tiktok'], budget: { daily: 50, currency: 'USD' } })));
    assert.equal(dep.status, 'failed');
    assert.match(dep.error, /prohibited words \(code 40002\)/);
    assert.equal(dep.externalIds.adgroup, 'ag_1');
    const ag = calls.find((c) => c.url.includes('/adgroup/create/')).body;
    assert.equal(calls[0].headers['Access-Token'], 'tok-tiktok');
    assert.deepEqual(ag.location_ids, ['6252001', '2635167']);
    assert.equal(ag.gender, 'GENDER_FEMALE');
    assert.deepEqual(ag.age_groups, ['AGE_25_34', 'AGE_35_44', 'AGE_45_54']);
    assert.equal(ag.budget, 50);
    const ad = calls.find((c) => c.url.includes('/ad/create/')).body.creatives[0];
    assert.equal(ad.video_id, 'v_1');
    assert.deepEqual(ad.image_ids, ['i_1']);
    assert.equal(ad.identity_id, 'id_1');
  } finally { calls.restore(); }
});

test('LinkedIn: ids are read from x-restli-id and URNs chained', async () => {
  setup(['linkedin'], { linkedin: { organizationId: '555' } });
  let n = 0;
  const created = (id) => ({ status: 201, raw: '', headers: { 'x-restli-id': id } });
  const calls = mockFetch([
    [post('/adCampaignGroups'), () => created('900')],
    [post('/images?action=initializeUpload'), () => ({ json: { value: { uploadUrl: 'https://upload.linkedin.test/x', image: 'urn:li:image:img1' } } })],
    [has('cdn.example.com'), () => ({ raw: 'IMG' })],
    [(m, u) => m === 'PUT' && u.includes('upload.linkedin.test'), () => ({ status: 201, raw: '' })],
    [post('/adCampaigns'), () => created('901')],
    [post('/rest/posts'), () => created(encodeURIComponent('urn:li:share:777'))],
    [post('/creatives'), () => { n++; return created(encodeURIComponent('urn:li:sponsoredCreative:1')); }],
  ]);
  try {
    const [dep] = await orchestrator.launchCampaign(USER, createCampaign(sampleSpec({ platforms: ['linkedin'] })));
    assert.equal(dep.status, 'paused', dep.error);
    assert.equal(dep.externalIds.post, 'urn:li:share:777');
    const li = calls.filter((c) => c.url.includes('api.linkedin.com/rest'));
    assert.ok(li.every((c) => c.headers['LinkedIn-Version'] && c.headers['X-Restli-Protocol-Version'] === '2.0.0'));
    const camp = calls.find((c) => c.url.endsWith('/adCampaigns')).body;
    assert.equal(camp.campaignGroup, 'urn:li:sponsoredCampaignGroup:900');
    assert.equal(camp.dailyBudget.amount, '150');
    assert.equal(camp.objectiveType, 'WEBSITE_VISIT');
    const post = calls.find((c) => c.url.endsWith('/rest/posts')).body;
    assert.equal(post.author, 'urn:li:organization:555');
    assert.equal(post.content.article.thumbnail, 'urn:li:image:img1');
    const creative = calls.find((c) => c.url.endsWith('/creatives')).body;
    assert.equal(creative.campaign, 'urn:li:sponsoredCampaign:901');
    assert.equal(creative.content.reference, 'urn:li:share:777');
    assert.equal(n, 1);
  } finally { calls.restore(); }
});

test('Pinterest: pin → campaign → ad group → ad, bulk exceptions surface as errors', async () => {
  setup(['pinterest'], { pinterest: { boardId: 'b_1' } });
  const bulk = (id) => ({ json: { items: [{ data: { id } }] } });
  const calls = mockFetch([
    [post('/v5/pins'), () => ({ json: { id: 'pin_1' } })],
    [post('/campaigns'), () => bulk('pc_1')],
    [post('/ad_groups'), () => ({ json: { items: [{ exceptions: [{ code: 2604, message: 'Budget too low' }] }] } })],
  ]);
  try {
    const [dep] = await orchestrator.launchCampaign(USER, createCampaign(sampleSpec({ platforms: ['pinterest'] })));
    assert.equal(dep.status, 'failed');
    assert.match(dep.error, /Budget too low/);
    const pin = calls[0].body;
    assert.equal(pin.board_id, 'b_1');
    assert.equal(pin.media_source.url, 'https://cdn.example.com/shoe.jpg');
    const ag = calls.find((c) => c.url.endsWith('/ad_groups')).body[0];
    assert.equal(ag.campaign_id, 'pc_1');
    assert.equal(ag.budget_in_micro_currency, 150e6);
    assert.deepEqual(ag.targeting_spec.GENDER, ['female']);
  } finally { calls.restore(); }
});

test('Sandbox mode makes no network calls and simulates metrics', async () => {
  freshDb();
  db.run("INSERT INTO users (id, email, password_hash) VALUES (?, 'u@example.com', 'x')", USER);
  const calls = mockFetch([]);
  try {
    const deps = await orchestrator.launchCampaign(USER, createCampaign(sampleSpec({ activate: true })));
    assert.equal(calls.length, 0);
    assert.ok(deps.every((d) => d.mode === 'sandbox' && d.status === 'active'));
    const d = deps[0];
    d.externalIds.sim.activeSince = Date.now() - 12 * 60 * 1000; // 12 real minutes ≈ 1 simulated day
    const m = orchestrator.simulateMetrics(d, normalizeSpec(sampleSpec()));
    assert.ok(m.impressions > 0 && m.clicks > 0 && m.spend > 0);
    assert.ok(m.days >= 0.9 && m.days <= 1.1);
  } finally { calls.restore(); }
});
