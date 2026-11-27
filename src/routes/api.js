'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { id } = require('../lib/crypto');
const { HttpError } = require('../lib/http');
const { adapters, getAdapter } = require('../platforms');
const connections = require('../engine/connections');
const orchestrator = require('../engine/orchestrator');
const advisor = require('../engine/advisor');
const geo = require('../engine/geo');
const { GOALS, CTAS, PLATFORMS, normalizeSpec } = require('../engine/spec');
const { redirectUri } = require('./oauth');

const user = [auth.requireUser];
const mutate = [auth.requireSameOrigin, auth.requireUser];

function platformOr404(req) {
  if (!adapters[req.params.platform]) throw new HttpError(404, 'Unknown platform');
  return getAdapter(req.params.platform);
}

function ownCampaign(req) {
  const row = db.one('SELECT * FROM campaigns WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw new HttpError(404, 'Campaign not found');
  return row;
}

function presentCampaign(row, withDeployments = true) {
  const spec = normalizeSpec(db.parseJson(row.spec, {}));
  const out = { id: row.id, name: row.name, goal: row.goal, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, spec };
  if (withDeployments) {
    out.deployments = orchestrator.listDeployments(row.id).map((d) => orchestrator.present(d, spec));
    const totals = out.deployments.reduce((t, d) => {
      for (const k of ['impressions', 'clicks', 'spend', 'conversions', 'revenue']) t[k] = (t[k] || 0) + (d.metrics?.[k] || 0);
      return t;
    }, {});
    out.totals = advisor.kpis(totals);
  }
  return out;
}

const UPLOAD_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/quicktime': '.mov' };

function register(router) {
  // ---------- Auth ----------
  router.post('/api/auth/signup', auth.requireSameOrigin, (req, res) => {
    const u = auth.createUser(req.body || {});
    auth.startSession(res, u);
    res.json(201, { user: u });
  });
  router.post('/api/auth/login', auth.requireSameOrigin, (req, res) => {
    const u = auth.authenticate(req.body || {});
    auth.startSession(res, u);
    res.json({ user: u });
  });
  router.post('/api/auth/logout', auth.requireSameOrigin, (req, res) => {
    auth.endSession(req, res);
    res.json({ ok: true });
  });
  router.get('/api/me', (req, res) => res.json({ user: auth.currentUser(req) }));

  // ---------- Reference data ----------
  router.get('/api/reference', (req, res) => {
    res.json({
      goals: GOALS,
      ctas: CTAS,
      countries: geo.countryList(),
      benchmarks: advisor.BENCHMARKS,
      fit: advisor.PLATFORM_FIT,
      sandboxSpeedup: orchestrator.SANDBOX_SPEEDUP,
      platforms: PLATFORMS.map((p) => {
        const a = getAdapter(p);
        return { id: p, name: a.name, products: a.products, docsUrl: a.docsUrl, configured: a.isConfigured(), assetFields: a.assetFields, redirectUri: redirectUri(p) };
      }),
    });
  });

  // ---------- Connections ----------
  router.get('/api/connections', ...user, (req, res) => {
    const mine = connections.listConnections(req.user.id);
    res.json({
      connections: PLATFORMS.map((p) => ({
        platform: p,
        name: getAdapter(p).name,
        configured: getAdapter(p).isConfigured(),
        connection: connections.toPublic(mine.find((c) => c.platform === p)),
      })),
    });
  });

  router.post('/api/connections/:platform/sandbox', ...mutate, (req, res) => {
    const adapter = platformOr404(req);
    const conn = connections.saveConnection(req.user.id, adapter.id, {
      mode: 'sandbox', accessToken: null, refreshToken: null, expiresAt: null,
      accountId: 'sandbox-account', accountName: `${adapter.name} sandbox (simulated)`, currency: 'USD', settings: { targets: {} },
    });
    res.json({ connection: connections.toPublic(conn) });
  });

  router.delete('/api/connections/:platform', ...mutate, (req, res) => {
    platformOr404(req);
    connections.deleteConnection(req.user.id, req.params.platform);
    res.json({ ok: true });
  });

  async function liveConnection(req) {
    const adapter = platformOr404(req);
    const conn = connections.getConnection(req.user.id, adapter.id);
    if (!conn || conn.mode !== 'live') throw new HttpError(400, `${adapter.name} is not connected with a real account.`);
    return { adapter, conn: await connections.ensureFresh(conn) };
  }

  router.get('/api/connections/:platform/accounts', ...user, async (req, res) => {
    const { adapter, conn } = await liveConnection(req);
    res.json({ accounts: await adapter.listAccounts(conn) });
  });

  router.post('/api/connections/:platform/account', ...mutate, async (req, res) => {
    const { adapter, conn } = await liveConnection(req);
    const accounts = await adapter.listAccounts(conn);
    const acct = accounts.find((a) => a.id === String(req.body?.accountId));
    if (!acct) throw new HttpError(400, 'That ad account is not available for this login.');
    const saved = connections.saveConnection(req.user.id, adapter.id, { accountId: acct.id, accountName: acct.name, currency: acct.currency, settings: { targets: {} } });
    res.json({ connection: connections.toPublic(saved) });
  });

  router.get('/api/connections/:platform/assets', ...user, async (req, res) => {
    const { adapter, conn } = await liveConnection(req);
    res.json({ assets: await adapter.listAssets(conn, conn.accountId), fields: adapter.assetFields });
  });

  router.post('/api/connections/:platform/targets', ...mutate, (req, res) => {
    const adapter = platformOr404(req);
    const conn = connections.getConnection(req.user.id, adapter.id);
    if (!conn) throw new HttpError(400, 'Connect the platform first.');
    const allowed = adapter.assetFields.map((f) => f.key);
    const targets = Object.fromEntries(Object.entries(req.body?.targets || {}).filter(([k, v]) => allowed.includes(k) && typeof v === 'string'));
    const saved = connections.saveConnection(req.user.id, adapter.id, { settings: { ...conn.settings, targets } });
    res.json({ connection: connections.toPublic(saved) });
  });

  // ---------- Advisor ----------
  router.post('/api/advisor/forecast', ...mutate, (req, res) => {
    const spec = normalizeSpec(req.body?.spec || {});
    res.json({ recommendedSplit: advisor.recommendSplit(spec.goal, spec.platforms, spec.budget.daily), forecast: advisor.forecast(spec) });
  });

  // ---------- Uploads (creative media) ----------
  router.post('/api/uploads', ...mutate, (req, res) => {
    const m = String(req.body?.dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
    if (!m || !UPLOAD_TYPES[m[1]]) throw new HttpError(400, 'Upload a JPG, PNG, WEBP, GIF image or an MP4/MOV video.');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 10 * 1024 * 1024) throw new HttpError(413, 'Files must be under 10 MB.');
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const name = `${crypto.randomBytes(12).toString('hex')}${UPLOAD_TYPES[m[1]]}`;
    fs.writeFileSync(path.join(config.uploadsDir, name), bytes);
    res.json(201, { url: `/uploads/${name}`, size: bytes.length, type: m[1] });
  });

  // ---------- Campaigns ----------
  router.post('/api/campaigns/preview', ...mutate, (req, res) => {
    res.json(orchestrator.preview(req.user.id, req.body?.spec || {}));
  });

  router.get('/api/campaigns', ...user, (req, res) => {
    const rows = db.all('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC', req.user.id);
    res.json({ campaigns: rows.map((r) => presentCampaign(r)) });
  });

  router.post('/api/campaigns', ...mutate, (req, res) => {
    const spec = normalizeSpec(req.body?.spec || {});
    const cid = id('cmp');
    db.run('INSERT INTO campaigns (id, user_id, name, goal, spec) VALUES (?,?,?,?,?)', cid, req.user.id, spec.name, spec.goal, JSON.stringify(spec));
    res.json(201, { campaign: presentCampaign(db.one('SELECT * FROM campaigns WHERE id = ?', cid)) });
  });

  router.get('/api/campaigns/:id', ...user, (req, res) => {
    res.json({ campaign: presentCampaign(ownCampaign(req)) });
  });

  router.put('/api/campaigns/:id', ...mutate, (req, res) => {
    const row = ownCampaign(req);
    const deps = orchestrator.listDeployments(row.id);
    if (deps.some((d) => ['active', 'paused', 'launching'].includes(d.status))) {
      throw new HttpError(409, 'This campaign is already live on at least one platform. Duplicate it to make changes.');
    }
    const spec = normalizeSpec(req.body?.spec || {});
    db.run(`UPDATE campaigns SET name=?, goal=?, spec=?, updated_at=datetime('now') WHERE id=?`, spec.name, spec.goal, JSON.stringify(spec), row.id);
    db.run("DELETE FROM deployments WHERE campaign_id = ? AND status = 'failed' AND external_ids = '{}'", row.id);
    res.json({ campaign: presentCampaign(db.one('SELECT * FROM campaigns WHERE id = ?', row.id)) });
  });

  router.delete('/api/campaigns/:id', ...mutate, (req, res) => {
    const row = ownCampaign(req);
    db.run('DELETE FROM campaigns WHERE id = ?', row.id);
    res.json({ ok: true });
  });

  router.post('/api/campaigns/:id/launch', ...mutate, async (req, res) => {
    const row = ownCampaign(req);
    await orchestrator.launchCampaign(req.user.id, row);
    res.json({ campaign: presentCampaign(db.one('SELECT * FROM campaigns WHERE id = ?', row.id)) });
  });

  router.post('/api/campaigns/:id/sync', ...mutate, async (req, res) => {
    const row = ownCampaign(req);
    const spec = normalizeSpec(db.parseJson(row.spec, {}));
    const errors = [];
    for (const dep of orchestrator.listDeployments(row.id)) {
      try { await orchestrator.syncMetrics(req.user.id, dep, spec); } catch (e) { errors.push({ platform: dep.platform, error: e.message }); }
    }
    res.json({ campaign: presentCampaign(db.one('SELECT * FROM campaigns WHERE id = ?', row.id)), errors });
  });

  router.post('/api/deployments/:id/status', ...mutate, async (req, res) => {
    const dep = orchestrator.getDeployment(req.params.id);
    if (!dep || !db.one('SELECT id FROM campaigns WHERE id = ? AND user_id = ?', dep.campaignId, req.user.id)) throw new HttpError(404, 'Not found');
    await orchestrator.setDeploymentStatus(req.user.id, dep, Boolean(req.body?.active));
    res.json({ campaign: presentCampaign(db.one('SELECT * FROM campaigns WHERE id = ?', dep.campaignId)) });
  });
}

module.exports = { register };
