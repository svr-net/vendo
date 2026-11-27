import { api, mountNav, requireLogin, reference, toast, esc, fmt, statusBadge, platformIcon } from './common.js';

const id = location.pathname.split('/').filter(Boolean).pop();
const root = document.getElementById('root');
let ref;
let campaign;
let autoTimer;

const GLOSSARY = {
  Impressions: 'How many times your ad was shown.',
  Clicks: 'Clicks to your website (link clicks).',
  CTR: 'Click-through rate = clicks ÷ impressions. Shows how interesting your ad is.',
  CPC: 'Cost per click = spend ÷ clicks.',
  CPM: 'Cost per 1,000 impressions. Driven by competition for your audience.',
  Spend: 'Money spent so far, billed by the platform.',
  Conversions: 'Leads or purchases tracked by your pixel/tag.',
  CPA: 'Cost per acquisition = spend ÷ conversions.',
  ROAS: 'Return on ad spend = revenue ÷ spend.',
};

const kpi = (label, value) => `<div class="kpi"><div class="l">${label} <span class="tip-q" title="${esc(GLOSSARY[label] || '')}">?</span></div><div class="v">${value}</div></div>`;

function kpiGrid(k, cur) {
  if (!k) return '';
  return `<div class="kpis">
    ${kpi('Impressions', fmt.num(k.impressions))}${kpi('Clicks', fmt.num(k.clicks))}${kpi('CTR', fmt.pct(k.ctr))}
    ${kpi('CPC', fmt.money(k.cpc, cur))}${kpi('CPM', fmt.money(k.cpm, cur))}${kpi('Spend', fmt.money(k.spend, cur))}
    ${kpi('Conversions', fmt.num(k.conversions))}${k.conversions ? kpi('CPA', fmt.money(k.cpa, cur)) : ''}${k.roas ? kpi('ROAS', `${fmt.dec(k.roas)}×`) : ''}
  </div>`;
}

function logView(d) {
  if (!d.log.length) return '<p class="muted">No activity yet.</p>';
  return d.log.map((l) => l.note
    ? `<div class="alert info" style="margin-bottom:8px">${esc(l.note)} <small>${fmt.date(l.at)}</small></div>`
    : `<details class="step"><summary>${l.ok ? '✅' : '❌'} ${esc(l.title)} <span class="method">${esc(l.method)}</span> <small class="muted">${fmt.date(l.at)}</small></summary>
        <div class="endpoint" style="margin-top:8px">${esc(l.method)} ${esc(l.url)}</div>
        <pre>${esc(JSON.stringify(l.body, null, 2))}</pre>
        ${l.ok ? `<p>Created: <code>${esc(typeof l.result === 'object' ? JSON.stringify(l.result) : l.result)}</code></p>`
    : `<div class="alert bad"><strong>Error</strong>${esc(l.error)}</div>${l.response ? `<pre>${esc(JSON.stringify(l.response, null, 2))}</pre>` : ''}`}
      </details>`).join('');
}

function deploymentCard(d) {
  const p = ref.platforms.find((x) => x.id === d.platform);
  const cur = campaign.spec.budget.currency;
  const launched = ['active', 'paused'].includes(d.status);
  return `<div class="card" data-dep="${d.id}">
    <div class="row spread">
      <div class="row">${platformIcon(d.platform)}<div><h3 style="margin:0">${esc(p.name)}</h3><small>${d.mode === 'sandbox' ? 'Sandbox (simulated)' : `Account ${esc(d.accountId)}`} · ${fmt.money(d.dailyBudget, cur)}/day</small></div></div>
      <div class="row">${statusBadge(d.status)}${launched ? `<label class="switch"><input type="checkbox" data-toggle ${d.status === 'active' ? 'checked' : ''}> ${d.status === 'active' ? 'On' : 'Off'}</label>` : ''}</div>
    </div>
    ${d.error ? `<div class="alert bad" style="margin-top:12px"><strong>Launch stopped</strong>${esc(d.error)}<br><small>Fix the issue (e.g. on the Connect page or by editing the campaign), then press "Retry launch". Objects already created are reused, not duplicated.</small></div>` : ''}
    ${d.mode === 'sandbox' && launched ? `<p class="hint" style="margin-top:8px">Sandbox time runs ${ref.sandboxSpeedup}× faster: 1 minute ≈ ${ref.sandboxSpeedup / 60} hours of delivery while the switch is on.${d.metrics?.days ? ` Simulated ${d.metrics.days} days so far.` : ''}</p>` : ''}
    ${launched ? `<div style="margin-top:14px">${kpiGrid(d.kpis, cur)}</div>
      <h4 style="margin-top:16px">What this means</h4>
      ${d.insights.map((i) => `<div class="insight ${i.level}"><strong>${esc(i.title)}</strong>${esc(i.text)}</div>`).join('')}
      <small class="muted">Metrics updated: ${fmt.date(d.metricsUpdatedAt)}</small>` : ''}
    <details style="margin-top:14px"><summary class="muted" style="cursor:pointer">Launch log &amp; API calls (${d.log.filter((l) => !l.note).length})</summary><div style="margin-top:10px">${logView(d)}</div></details>
    ${d.mode === 'live' && Object.keys(d.externalIds).length ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Platform object IDs</summary><pre>${esc(JSON.stringify(d.externalIds, null, 2))}</pre></details>` : ''}
  </div>`;
}

function render() {
  const c = campaign;
  const cur = c.spec.budget.currency;
  const failed = c.deployments.some((d) => d.status === 'failed');
  const notLaunched = c.spec.platforms.filter((p) => !c.deployments.find((d) => d.platform === p));
  const editable = !c.deployments.some((d) => ['active', 'paused', 'launching'].includes(d.status));
  document.title = `${c.name} – Vendo`;
  root.innerHTML = `
    <div class="row spread">
      <div><a href="campaigns" class="muted">← My campaigns</a><h1 style="margin-top:6px">${esc(c.name)}</h1>
        <div class="row">${statusBadge(c.status)}<span class="badge">${esc(ref.goals[c.goal]?.label || c.goal)}</span><span class="badge">${fmt.money(c.spec.budget.daily, cur)}/day</span><span class="badge">${esc(c.spec.audience.countries.join(', '))}</span></div></div>
      <div class="row">
        ${c.deployments.length ? '<button class="btn" id="sync">↻ Refresh results</button>' : ''}
        ${failed || notLaunched.length ? `<button class="btn btn-primary" id="launch">${c.deployments.length ? 'Retry launch' : '🚀 Launch'}</button>` : ''}
        ${editable ? `<a class="btn" href="campaigns/new?edit=${c.id}">Edit</a>` : ''}
        <a class="btn" href="campaigns/new?from=${c.id}">Duplicate</a>
        <button class="btn btn-danger btn-sm" id="delete">Delete</button>
      </div>
    </div>
    ${new URLSearchParams(location.search).get('launched') ? `<div class="alert good" style="margin-top:16px"><strong>Launch complete.</strong>${c.spec.activate ? 'Your ads are submitted for review and will start delivering once approved.' : 'Everything was created <strong>paused</strong>. Flip the switch on each platform when you are ready to start spending.'}</div>` : ''}
    ${c.deployments.length ? `<div class="card" style="margin-top:16px"><h3>All platforms</h3>${kpiGrid(c.totals, cur)}</div>` : '<div class="card empty" style="margin-top:16px"><h2>Draft</h2><p>This campaign hasn\'t been launched yet.</p></div>'}
    <div style="margin-top:16px">${c.deployments.map(deploymentCard).join('')}</div>
    <div class="card" style="margin-top:16px"><h3>🎓 What to do next</h3><ul>
      <li>Give new campaigns <strong>3–7 days</strong> before judging them; the first days are a learning phase.</li>
      <li>Check comments on your ads (Meta, TikTok, LinkedIn): replying builds trust and improves performance.</li>
      <li>Winning? Raise budget ~20–30% every few days. Losing? Change <strong>one</strong> thing: usually the creative first.</li>
      <li><a href="learn#metrics">Lesson: Reading your results →</a></li>
    </ul></div>`;

  root.querySelector('#sync')?.addEventListener('click', () => sync(true));
  root.querySelector('#launch')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span> Launching…';
    try { campaign = (await api(`/api/campaigns/${id}/launch`, { method: 'POST' })).campaign; toast('Launch finished'); }
    catch (err) { toast(err.details?.errors?.[0]?.message || err.message, 'bad'); }
    render();
  });
  root.querySelector('#delete').addEventListener('click', async () => {
    const live = c.deployments.some((d) => d.mode === 'live' && ['active', 'paused'].includes(d.status));
    if (!confirm(live ? 'Delete from Vendo? Live campaigns are NOT deleted on the platforms. Pause them first if you want them to stop.' : 'Delete this campaign?')) return;
    await api(`/api/campaigns/${id}`, { method: 'DELETE' });
    location.href = 'campaigns';
  });
  root.querySelectorAll('[data-toggle]').forEach((t) => t.addEventListener('change', async () => {
    const depId = t.closest('[data-dep]').dataset.dep;
    const d = campaign.deployments.find((x) => x.id === depId);
    if (t.checked && d.mode === 'live' && !confirm(`Activate on ${ref.platforms.find((p) => p.id === d.platform).name}? Ads will start spending real money once approved.`)) { t.checked = false; return; }
    try {
      campaign = (await api(`/api/deployments/${depId}/status`, { method: 'POST', body: { active: t.checked } })).campaign;
      toast(t.checked ? 'Activated' : 'Paused');
    } catch (e) { toast(e.message, 'bad'); }
    render();
  }));
}

async function sync(manual) {
  try {
    const r = await api(`/api/campaigns/${id}/sync`, { method: 'POST' });
    campaign = r.campaign;
    if (manual) toast(r.errors.length ? `Some platforms failed: ${r.errors.map((e) => e.error).join('; ')}` : 'Results updated', r.errors.length ? 'bad' : '');
    render();
  } catch (e) { if (manual) toast(e.message, 'bad'); }
}

(async () => {
  await requireLogin();
  mountNav('campaigns');
  ref = await reference();
  campaign = (await api(`/api/campaigns/${id}`)).campaign;
  render();
  if (campaign.deployments.length) await sync(false);
  // Sandbox campaigns update often so learners can watch results evolve.
  autoTimer = setInterval(() => {
    if (document.hidden) return;
    if (campaign.deployments.some((d) => d.status === 'active' && d.mode === 'sandbox')) sync(false);
  }, 15000);
})();
window.addEventListener('beforeunload', () => clearInterval(autoTimer));
