import { api, mountNav, requireLogin, reference, toast, esc, platformIcon } from './common.js';

const SETUP = {
  meta: [
    'Create a Meta developer app (type "Business") at developers.facebook.com/apps.',
    'Add the "Marketing API" and "Facebook Login for Business" products.',
    'Add the redirect URI below to Facebook Login → Settings → Valid OAuth Redirect URIs.',
    'Request Advanced Access for ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_ads (App Review) to manage accounts of users other than app admins.',
    'Set META_APP_ID and META_APP_SECRET in .env and restart Vendo.',
  ],
  google: [
    'In a Google Ads manager (MCC) account, open Tools → API Center and apply for a developer token (test accounts work immediately; production needs Basic access approval).',
    'In Google Cloud Console enable the "Google Ads API" and create an OAuth client ID (Web application).',
    'Add the redirect URI below as an Authorized redirect URI.',
    'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN (and optionally GOOGLE_ADS_LOGIN_CUSTOMER_ID) in .env.',
  ],
  tiktok: [
    'Register as a developer at business-api.tiktok.com and create an app.',
    'Request the Ad Account Management, Ads Management, Reporting and Creative Management scopes.',
    'Set the app\'s Advertiser redirect URL to the redirect URI below.',
    'Set TIKTOK_APP_ID and TIKTOK_APP_SECRET in .env.',
  ],
  linkedin: [
    'Create an app at linkedin.com/developers and link it to your Company Page.',
    'Request the "Advertising API" product (Development tier is enough for your own ad accounts).',
    'Add the redirect URI below under Auth → Authorized redirect URLs.',
    'Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env.',
  ],
  pinterest: [
    'Create an app at developers.pinterest.com (requires a Pinterest business account).',
    'Request access to the ads:read and ads:write scopes (Standard access).',
    'Add the redirect URI below to the app\'s redirect URIs.',
    'Set PINTEREST_APP_ID and PINTEREST_APP_SECRET in .env.',
  ],
};

const params = new URLSearchParams(location.search);
const flash = document.getElementById('flash');
if (params.get('connected')) flash.innerHTML = `<div class="alert good"><strong>${esc(params.get('connected'))} connected.</strong> Now choose the ad account and assets below.</div>`;
if (params.get('error')) flash.innerHTML = `<div class="alert bad"><strong>Connection failed</strong>${esc(params.get('error'))}</div>`;
if (params.size) history.replaceState(null, '', 'connect');

let ref;

function statusOf(c) {
  if (!c.connection) return '<span class="badge">Not connected</span>';
  if (c.connection.mode === 'sandbox') return '<span class="badge info"><span class="dot"></span>Sandbox</span>';
  if (c.connection.expired) return '<span class="badge bad">Expired, reconnect</span>';
  if (!c.connection.accountId) return '<span class="badge warn">Choose ad account</span>';
  return '<span class="badge good"><span class="dot"></span>Live</span>';
}

function card(c) {
  const p = ref.platforms.find((x) => x.id === c.platform);
  const conn = c.connection;
  const connectBtn = c.configured
    ? `<a class="btn btn-primary" href="oauth/${c.platform}/start">${conn?.mode === 'live' ? 'Reconnect' : `Connect ${esc(p.name)}`}</a>`
    : `<button class="btn" disabled title="Server not configured for ${esc(p.name)}">Connect (setup required)</button>`;
  return `
  <div class="card" data-platform="${c.platform}">
    <div class="row spread">
      <div class="row">${platformIcon(c.platform)}<div><h3 style="margin:0">${esc(p.name)}</h3><small>${esc(p.products)}</small></div></div>
      ${statusOf(c)}
    </div>
    <div class="live-area" style="margin-top:16px">
      ${conn?.mode === 'live' ? '<div class="accounts"><span class="spinner"></span> Loading ad accounts…</div><div class="assets"></div>' : ''}
      ${conn?.mode === 'sandbox' ? `<p class="muted">Practising with a simulated account. Campaigns "launch" instantly and generate realistic fake results so you can learn the dashboard. No money is spent and nothing is sent to ${esc(p.name)}.</p>` : ''}
      ${!conn ? `<p class="muted">${esc(ref.fit[c.platform])}</p>` : ''}
    </div>
    <div class="row" style="margin-top:12px">
      ${connectBtn}
      ${conn?.mode !== 'sandbox' ? '<button class="btn" data-action="sandbox">Practise in sandbox</button>' : ''}
      ${conn ? '<button class="btn btn-danger btn-sm" data-action="disconnect">Disconnect</button>' : ''}
    </div>
    <details style="margin-top:14px">
      <summary class="muted" style="cursor:pointer">Developer setup for ${esc(p.name)} ${c.configured ? '(configured ✓)' : ''}</summary>
      <ol style="font-size:.92rem">${SETUP[c.platform].map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <label>Redirect URI</label><pre>${esc(p.redirectUri)}</pre>
      <a href="${esc(p.docsUrl)}" target="_blank" rel="noopener">Official API documentation ↗</a>
    </details>
  </div>`;
}

async function loadLive(el, c) {
  const accEl = el.querySelector('.accounts');
  const assetsEl = el.querySelector('.assets');
  try {
    const { accounts } = await api(`/api/connections/${c.platform}/accounts`);
    if (!accounts.length) { accEl.innerHTML = '<div class="alert warn">No ad accounts found for this login. Create one on the platform first, then reconnect.</div>'; return; }
    accEl.innerHTML = `<div class="field"><label>Ad account</label><select class="acct">
      ${!c.connection.accountId ? '<option value="">Choose…</option>' : ''}
      ${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === c.connection.accountId ? 'selected' : ''}>${esc(a.name)}${a.currency ? ` · ${esc(a.currency)}` : ''}${a.active === false ? ' (inactive)' : ''}</option>`).join('')}
    </select><div class="hint">Budgets are entered in this account's currency.</div></div>`;
    accEl.querySelector('.acct').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      await api(`/api/connections/${c.platform}/account`, { method: 'POST', body: { accountId: e.target.value } });
      toast('Ad account saved');
      render();
    });
    if (!c.connection.accountId) return;
    const fields = ref.platforms.find((p) => p.id === c.platform).assetFields;
    if (!fields.length) return;
    assetsEl.innerHTML = '<span class="spinner"></span> Loading pages and assets…';
    const { assets } = await api(`/api/connections/${c.platform}/assets`);
    assetsEl.innerHTML = fields.map((f) => {
      const opts = assets[f.source] || [];
      return `<div class="field"><label>${esc(f.label)}${f.required ? '' : ' <small>(optional)</small>'}</label>
        <select data-target="${f.key}"><option value="">${opts.length ? 'Choose…' : 'None found'}</option>
        ${opts.map((o) => `<option value="${esc(o.id)}" ${c.connection.targets[f.key] === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>`;
    }).join('');
    assetsEl.querySelectorAll('select').forEach((s) => s.addEventListener('change', async () => {
      const targets = Object.fromEntries([...assetsEl.querySelectorAll('select')].map((x) => [x.dataset.target, x.value]).filter(([, v]) => v));
      await api(`/api/connections/${c.platform}/targets`, { method: 'POST', body: { targets } });
      toast('Saved');
    }));
  } catch (e) {
    accEl.innerHTML = `<div class="alert bad"><strong>Could not load accounts</strong>${esc(e.message)}</div>`;
  }
}

async function render() {
  const { connections } = await api('/api/connections');
  const root = document.getElementById('platforms');
  root.innerHTML = connections.map(card).join('');
  for (const c of connections) {
    const el = root.querySelector(`[data-platform="${c.platform}"]`);
    el.querySelector('[data-action="sandbox"]')?.addEventListener('click', async () => {
      await api(`/api/connections/${c.platform}/sandbox`, { method: 'POST' });
      toast(`${c.name} sandbox ready`);
      render();
    });
    el.querySelector('[data-action="disconnect"]')?.addEventListener('click', async () => {
      if (!confirm(`Disconnect ${c.name}? Campaigns already launched keep running on the platform.`)) return;
      await api(`/api/connections/${c.platform}`, { method: 'DELETE' });
      render();
    });
    if (c.connection?.mode === 'live') loadLive(el, c);
  }
}

(async () => {
  await requireLogin();
  mountNav('connect');
  ref = await reference();
  render();
})();
