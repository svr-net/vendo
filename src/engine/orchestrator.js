'use strict';
/**
 * The launch orchestrator. For every platform in a campaign it:
 *   1. asks the adapter for a plan (ordered API steps),
 *   2. executes the steps live — or simulates them in sandbox mode,
 *   3. stores created object ids and a readable log after every step,
 *   so a failed launch can be fixed and resumed without duplicating objects.
 */
const crypto = require('node:crypto');
const db = require('../lib/db');
const { id } = require('../lib/crypto');
const { getAdapter } = require('../platforms');
const { normalizeSpec, platformDailyBudget } = require('./spec');
const { validateSpec } = require('./validate');
const { BENCHMARKS, kpis, insights } = require('./advisor');
const connections = require('./connections');

const SANDBOX_SPEEDUP = 120; // 1 real minute = 2 simulated hours

const resolve = (v, refs) => (typeof v === 'function' ? v(refs) : v);
const placeholderRefs = () => new Proxy({}, { get: (_, k) => (typeof k === 'string' ? `{{${k}}}` : undefined) });

/** Target account + assets for a platform, from the user's connection (or sandbox defaults). */
function targetFor(userId, platform, spec) {
  const conn = connections.getConnection(userId, platform);
  const mode = conn?.mode || 'sandbox';
  return {
    conn,
    mode,
    target: {
      accountId: conn?.accountId || 'sandbox-account',
      currency: conn?.currency || spec.budget.currency,
      targets: { ...(conn?.settings?.targets || {}), ...(spec.targets?.[platform] || {}) },
    },
  };
}

/** Build a human-readable preview of every API call Vendo would make. */
function preview(userId, rawSpec) {
  const spec = normalizeSpec(rawSpec);
  const modes = {};
  const targets = {};
  const platforms = spec.platforms.map((p) => {
    const { mode, target, conn } = targetFor(userId, p, spec);
    modes[p] = mode;
    targets[p] = target.targets;
    const adapter = getAdapter(p);
    let plan;
    try { plan = adapter.plan(spec, target); } catch (e) { return { platform: p, name: adapter.name, mode, error: e.message, steps: [] }; }
    const refs = placeholderRefs();
    return {
      platform: p,
      name: adapter.name,
      mode,
      account: conn?.accountName || (mode === 'sandbox' ? 'Sandbox account (simulated)' : null),
      dailyBudget: platformDailyBudget(spec, p),
      notes: plan.notes,
      steps: plan.steps.map((s) => ({
        key: s.key, title: s.title, explain: s.explain, method: s.method,
        url: resolve(s.url, refs),
        body: s.preview || resolve(s.body, refs),
      })),
    };
  });
  const validation = validateSpec(spec, { modes, targets });
  for (const p of spec.platforms) {
    const conn = connections.getConnection(userId, p);
    if (conn?.mode === 'live' && !conn.accountId) {
      validation.errors.push({ platform: p, field: 'targets.accountId', message: `Choose a ${getAdapter(p).name} ad account on the Connect page.` });
    }
  }
  validation.ok = validation.errors.length === 0;
  return { spec, validation, platforms };
}

function logEntry(step, extra) {
  return { at: new Date().toISOString(), key: step.key, title: step.title, method: step.method, ...extra };
}

function saveDeployment(dep) {
  db.run(
    `UPDATE deployments SET status=?, external_ids=?, log=?, error=?, launched_at=?, updated_at=datetime('now') WHERE id=?`,
    dep.status, JSON.stringify(dep.externalIds), JSON.stringify(dep.log), dep.error, dep.launchedAt, dep.id,
  );
}

function hydrateDeployment(row) {
  if (!row) return null;
  return {
    id: row.id, campaignId: row.campaign_id, platform: row.platform, mode: row.mode, accountId: row.account_id,
    status: row.status, externalIds: db.parseJson(row.external_ids, {}), log: db.parseJson(row.log, []),
    error: row.error, metrics: db.parseJson(row.metrics, null), metricsUpdatedAt: row.metrics_updated_at,
    launchedAt: row.launched_at, createdAt: row.created_at,
  };
}

/** Execute one platform deployment, resuming after the last successful step. */
async function runDeployment(userId, spec, dep) {
  const adapter = getAdapter(dep.platform);
  let { conn, mode, target } = targetFor(userId, dep.platform, spec);
  dep.mode = dep.mode || mode;
  if (dep.mode === 'live') {
    if (!conn || conn.mode !== 'live') throw new Error(`${adapter.name} is not connected.`);
    if (!conn.accountId) throw new Error(`Choose a ${adapter.name} ad account on the Connect page.`);
    conn = await connections.ensureFresh(conn);
  }
  const { steps, notes } = adapter.plan(spec, target);
  const refs = { ...dep.externalIds };
  dep.status = 'launching';
  dep.error = null;
  for (const n of notes || []) if (!dep.log.some((l) => l.note === n)) dep.log.push({ at: new Date().toISOString(), note: n });
  saveDeployment(dep);

  for (const step of steps) {
    if (refs[step.key] !== undefined) continue; // already created in an earlier attempt
    const url = resolve(step.url, refs);
    const body = step.preview || resolve(step.body, refs);
    try {
      let value;
      if (dep.mode === 'sandbox') {
        value = `sbx_${step.key}_${crypto.randomBytes(4).toString('hex')}`;
      } else if (step.run) {
        value = await step.run({ conn, call: (opts) => adapter.call(conn, opts) }, refs);
      } else {
        const res = await adapter.call(conn, { method: step.method, url, json: body });
        value = step.extract ? step.extract(res.data, res.headers) : res.data?.id;
      }
      if (value === undefined || value === null || value === '') throw new Error('The platform did not return an id for this object.');
      refs[step.key] = value;
      dep.externalIds = { ...refs };
      dep.log.push(logEntry(step, { ok: true, url, body, result: value }));
      saveDeployment(dep);
    } catch (err) {
      dep.status = 'failed';
      dep.error = err.message;
      dep.log.push(logEntry(step, { ok: false, url, body, error: err.message, response: err.body }));
      saveDeployment(dep);
      return dep;
    }
  }
  dep.status = spec.activate ? 'active' : 'paused';
  dep.launchedAt = new Date().toISOString();
  if (dep.mode === 'sandbox') dep.externalIds.sim = { activeMs: 0, activeSince: spec.activate ? Date.now() : null, seed: crypto.randomBytes(4).readUInt32BE() };
  saveDeployment(dep);
  return dep;
}

function campaignStatus(deps) {
  if (!deps.length) return 'draft';
  if (deps.some((d) => d.status === 'launching')) return 'launching';
  if (deps.every((d) => d.status === 'failed')) return 'failed';
  if (deps.some((d) => d.status === 'failed')) return 'partial';
  if (deps.some((d) => d.status === 'active')) return 'active';
  return 'paused';
}

function refreshCampaignStatus(campaignId) {
  const deps = listDeployments(campaignId);
  const status = campaignStatus(deps);
  db.run(`UPDATE campaigns SET status=?, updated_at=datetime('now') WHERE id=?`, status, campaignId);
  return status;
}

const listDeployments = (campaignId) => db.all('SELECT * FROM deployments WHERE campaign_id = ? ORDER BY created_at', campaignId).map(hydrateDeployment);
const getDeployment = (depId) => hydrateDeployment(db.one('SELECT * FROM deployments WHERE id = ?', depId));

/** Launch (or resume) a saved campaign on all of its platforms. */
async function launchCampaign(userId, campaign) {
  const spec = normalizeSpec(db.parseJson(campaign.spec, {}));
  const { validation } = preview(userId, spec);
  if (!validation.ok) {
    const e = new Error('Please fix the highlighted problems before launching.');
    e.status = 400;
    e.details = validation;
    throw e;
  }
  const existing = listDeployments(campaign.id);
  const results = [];
  for (const p of spec.platforms) {
    let dep = existing.find((d) => d.platform === p);
    if (dep && ['active', 'paused'].includes(dep.status)) { results.push(dep); continue; }
    if (!dep) {
      const { mode, target } = targetFor(userId, p, spec);
      const depId = id('dep');
      db.run('INSERT INTO deployments (id, campaign_id, platform, mode, account_id) VALUES (?,?,?,?,?)', depId, campaign.id, p, mode, target.accountId);
      dep = getDeployment(depId);
    }
    try {
      results.push(await runDeployment(userId, spec, dep));
    } catch (err) {
      dep.status = 'failed';
      dep.error = err.message;
      saveDeployment(dep);
      results.push(dep);
    }
  }
  refreshCampaignStatus(campaign.id);
  return results;
}

/** Simulated metrics for sandbox deployments, deterministic per deployment. */
function simulateMetrics(dep, spec) {
  const sim = dep.externalIds.sim || { activeMs: 0, activeSince: null, seed: 1 };
  const activeMs = sim.activeMs + (sim.activeSince ? Date.now() - sim.activeSince : 0);
  const days = (activeMs * SANDBOX_SPEEDUP) / 864e5;
  const b = BENCHMARKS[dep.platform];
  const rnd = (n) => { const x = Math.sin(sim.seed * (n + 1)) * 10000; return x - Math.floor(x); };
  const quality = 0.6 + rnd(1) * 0.9; // creative quality factor 0.6–1.5
  const daily = platformDailyBudget(spec, dep.platform);
  const spend = daily * days * (0.85 + rnd(2) * 0.15);
  const impressions = Math.round((spend / (b.cpm * (0.8 + rnd(3) * 0.4))) * 1000);
  const clicks = Math.round(impressions * (b.ctr / 100) * quality);
  const convRate = ['leads', 'sales'].includes(spec.goal) ? (b.cvr / 100) * (0.5 + rnd(4)) : (b.cvr / 400);
  const conversions = Math.round(clicks * convRate);
  const revenue = spec.goal === 'sales' ? Math.round(conversions * (40 + rnd(5) * 80) * 100) / 100 : 0;
  const reach = Math.round(impressions / (1 + Math.min(days, 14) * 0.18));
  return { impressions, reach, clicks, spend: Math.round(spend * 100) / 100, conversions, revenue, days: Math.round(days * 10) / 10, simulated: true };
}

async function syncMetrics(userId, dep, spec) {
  if (!['active', 'paused'].includes(dep.status)) return dep;
  let metrics;
  if (dep.mode === 'sandbox') metrics = simulateMetrics(dep, spec);
  else {
    const adapter = getAdapter(dep.platform);
    const conn = await connections.ensureFresh(connections.getConnection(userId, dep.platform));
    metrics = await adapter.fetchMetrics(conn, dep);
    if (dep.launchedAt) metrics.days = Math.max(1, Math.round((Date.now() - new Date(dep.launchedAt)) / 864e5));
  }
  db.run(`UPDATE deployments SET metrics=?, metrics_updated_at=datetime('now') WHERE id=?`, JSON.stringify(metrics), dep.id);
  return { ...dep, metrics };
}

async function setDeploymentStatus(userId, dep, active) {
  if (!['active', 'paused'].includes(dep.status)) throw new Error('Only launched campaigns can be paused or activated.');
  if (dep.mode === 'live') {
    const adapter = getAdapter(dep.platform);
    const conn = await connections.ensureFresh(connections.getConnection(userId, dep.platform));
    await adapter.setStatus(conn, dep, active);
  } else {
    const sim = dep.externalIds.sim || { activeMs: 0, activeSince: null, seed: 1 };
    if (active && !sim.activeSince) sim.activeSince = Date.now();
    if (!active && sim.activeSince) { sim.activeMs += Date.now() - sim.activeSince; sim.activeSince = null; }
    dep.externalIds.sim = sim;
  }
  dep.status = active ? 'active' : 'paused';
  dep.log.push({ at: new Date().toISOString(), note: `Campaign ${active ? 'activated' : 'paused'} from Vendo.` });
  saveDeployment(dep);
  refreshCampaignStatus(dep.campaignId);
  return dep;
}

/** Deployment enriched with KPIs and advisor insights for the UI. */
function present(dep, spec) {
  return {
    ...dep,
    dailyBudget: platformDailyBudget(spec, dep.platform),
    kpis: dep.metrics ? kpis(dep.metrics) : null,
    insights: insights({ platform: dep.platform, goal: spec.goal, metrics: dep.metrics, dailyBudget: platformDailyBudget(spec, dep.platform), active: dep.status === 'active' }),
  };
}

module.exports = { preview, launchCampaign, listDeployments, getDeployment, syncMetrics, setDeploymentStatus, refreshCampaignStatus, present, simulateMetrics, SANDBOX_SPEEDUP };
