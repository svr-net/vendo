import { api, mountNav, requireLogin, reference, toast, esc, fmt, platformIcon, attachCounters } from './common.js';

const DRAFT_KEY = 'vendo-wizard-draft';
const STEPS = [
  { id: 'goal', label: '1. Goal' },
  { id: 'platforms', label: '2. Platforms' },
  { id: 'audience', label: '3. Audience' },
  { id: 'budget', label: '4. Budget' },
  { id: 'creative', label: '5. Ad' },
  { id: 'review', label: '6. Review & launch' },
];

const COACH = {
  goal: [
    'Choose the goal that matches what you <strong>really</strong> want. Platforms optimise for exactly what you pick.',
    'Leads and sales goals work best with a tracking pixel/tag on your website. If you don\'t have one yet, start with Traffic.',
    'Give the campaign a name you\'ll recognise later, e.g. "Spring sale – US – Nov".',
    '<a href="/learn#goals">Lesson: Pick the right goal →</a>',
  ],
  platforms: [
    'Small budget? Pick <strong>one or two</strong> platforms. Each needs enough data to learn.',
    'Platforms you haven\'t connected run in <strong>sandbox</strong>: a safe simulation for learning.',
    '<a href="/learn#platforms">Lesson: Choosing platforms →</a>',
  ],
  audience: [
    'Go broad. Modern algorithms find buyers within large audiences better than manual narrowing.',
    'Only add an age range if your product truly is for that group.',
    'Google keywords: write them how customers search ("emergency plumber london"), 5–20 per campaign.',
    '<a href="/learn#audience">Lesson: Targeting →</a>',
  ],
  budget: [
    'Rule of thumb: daily budget ≈ 50 × target cost per result ÷ 7 lets algorithms exit the learning phase within a week.',
    'Use <strong>Recommended split</strong> to divide the budget based on your goal.',
    'Forecasts use industry averages. Treat them as a ballpark, not a promise.',
    '<a href="/learn#budget">Lesson: Budgets & bidding →</a>',
  ],
  creative: [
    'Hook → benefit → proof → call to action.',
    'Google needs 3–15 headlines (30 chars each). Write different angles: price, benefit, brand, offer.',
    'Use your own photos or video where possible. Authentic beats stock.',
    'TikTok requires vertical video (9:16). Pinterest loves vertical 2:3 images.',
    '<a href="/learn#creative">Lesson: Ads people stop for →</a>',
  ],
  review: [
    'Open each step under "What Vendo will create" to see the exact API request and why it is needed.',
    'By default everything is created <strong>paused</strong>. Review it in each platform, then activate from your dashboard.',
    'New ads go through platform review, usually within 24 hours.',
  ],
};

const blank = () => ({
  name: '', goal: 'traffic', platforms: [],
  budget: { daily: 30, currency: 'USD', split: {} },
  schedule: { start: new Date().toISOString().slice(0, 10), end: '' },
  audience: { countries: ['US'], ageMin: 18, ageMax: 65, gender: 'all', keywords: [], language: 'en' },
  creative: { brandName: '', headlines: [], descriptions: [], primaryText: '', url: 'https://', cta: 'LEARN_MORE', imageUrl: '', videoUrl: '' },
  tracking: { metaPixelId: '', tiktokPixelId: '', googleConversions: false, linkedinConversionId: '', pinterestTagId: '' },
  activate: false,
});

let ref;
let conns = {};
let spec;
let stepIdx = 0;
let editId = null;
let lastPreview = null;

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}
const saveDraft = () => { if (!editId) try { localStorage.setItem(DRAFT_KEY, JSON.stringify(spec)); } catch { /* ignore */ } };
const lines = (s) => String(s).split('\n').map((x) => x.trim()).filter(Boolean);
const modeOf = (p) => (conns[p]?.mode === 'live' && conns[p]?.accountId ? 'live' : 'sandbox');

// ---------- Step renderers ----------
const R = {
  goal() {
    return `
    <h2>What do you want to achieve?</h2>
    <div class="field"><label for="name">Campaign name</label><input id="name" type="text" data-path="name" placeholder="e.g. Spring sale – US" value="${esc(spec.name)}"></div>
    <div class="choice-grid">${Object.entries(ref.goals).map(([k, g]) => `
      <label class="choice"><input type="radio" name="goal" value="${k}" data-path="goal" ${spec.goal === k ? 'checked' : ''}>
      <strong>${esc(g.label)}</strong><small class="muted">${esc(g.summary)}</small></label>`).join('')}
    </div>
    <div id="tracking" class="${['leads', 'sales'].includes(spec.goal) ? '' : 'hidden'}" style="margin-top:20px">
      <h3>Conversion tracking <small class="muted">(optional, recommended)</small></h3>
      <p class="hint">Enter the IDs of tracking codes installed on your website so platforms can optimise for real conversions. You can also pick Meta and TikTok pixels on the Connect page.</p>
      <div class="grid grid-2">
        <div class="field"><label>Meta Pixel ID</label><input type="text" data-path="tracking.metaPixelId" value="${esc(spec.tracking.metaPixelId)}" placeholder="e.g. 123456789012345"></div>
        <div class="field"><label>TikTok Pixel ID</label><input type="text" data-path="tracking.tiktokPixelId" value="${esc(spec.tracking.tiktokPixelId)}"></div>
        <div class="field"><label>LinkedIn conversion ID</label><input type="text" data-path="tracking.linkedinConversionId" value="${esc(spec.tracking.linkedinConversionId)}"></div>
        <div class="field"><label>Pinterest Tag ID</label><input type="text" data-path="tracking.pinterestTagId" value="${esc(spec.tracking.pinterestTagId)}"></div>
      </div>
      <label class="switch"><input type="checkbox" data-path="tracking.googleConversions" ${spec.tracking.googleConversions ? 'checked' : ''}> Google Ads conversion tracking is set up in my account</label>
    </div>`;
  },

  platforms() {
    return `
    <h2>Where should your ads run?</h2>
    <p class="muted">Pick one or more. <a href="/connect">Manage connections →</a></p>
    <div class="choice-grid">${ref.platforms.map((p) => {
      const m = modeOf(p.id);
      return `<label class="choice"><input type="checkbox" value="${p.id}" data-list="platforms" ${spec.platforms.includes(p.id) ? 'checked' : ''}>
        <div class="row spread" style="margin-bottom:6px"><div class="row">${platformIcon(p.id)}<strong style="margin:0">${esc(p.name)}</strong></div>
        ${m === 'live' ? '<span class="badge good">Live</span>' : '<span class="badge info">Sandbox</span>'}</div>
        <small class="muted">${esc(ref.fit[p.id])}</small>
        ${m === 'live' ? `<small>Account: ${esc(conns[p.id].accountName)}</small>` : ''}</label>`;
    }).join('')}</div>`;
  },

  audience() {
    const google = spec.platforms.includes('google');
    return `
    <h2>Who should see your ads?</h2>
    <div class="field"><label>Countries</label>
      <div class="chips">${ref.countries.map((c) => `<label class="chip"><input type="checkbox" value="${c.code}" data-list="audience.countries" ${spec.audience.countries.includes(c.code) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
    </div>
    <div class="grid grid-3">
      <div class="field"><label>Minimum age</label><input type="number" min="18" max="65" data-path="audience.ageMin" data-num value="${spec.audience.ageMin}"></div>
      <div class="field"><label>Maximum age</label><input type="number" min="18" max="65" data-path="audience.ageMax" data-num value="${spec.audience.ageMax}"><div class="hint">65 means 65 and older.</div></div>
      <div class="field"><label>Gender</label><select data-path="audience.gender">
        ${['all', 'female', 'male'].map((g) => `<option value="${g}" ${spec.audience.gender === g ? 'selected' : ''}>${g === 'all' ? 'Everyone' : g[0].toUpperCase() + g.slice(1)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Ad language</label><select data-path="audience.language">
      ${[['en', 'English'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['it', 'Italian'], ['nl', 'Dutch'], ['pt', 'Portuguese'], ['sv', 'Swedish'], ['pl', 'Polish'], ['ja', 'Japanese']].map(([k, l]) => `<option value="${k}" ${spec.audience.language === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select></div>
    <div class="field ${google ? '' : 'hidden'}"><label>Google search keywords <small class="muted">(one per line)</small></label>
      <textarea data-lines="audience.keywords" placeholder="running shoes for women\nbuy trail running shoes\nlightweight running shoes">${esc(spec.audience.keywords.join('\n'))}</textarea>
      <div class="hint">Phrase match: your ad can show when someone's search includes the meaning of these words.</div></div>`;
  },

  budget() {
    const currency = spec.budget.currency;
    return `
    <h2>How much do you want to spend?</h2>
    <div class="grid grid-2">
      <div class="field"><label>Total daily budget</label><input type="number" min="1" step="1" data-path="budget.daily" data-num value="${spec.budget.daily}"><div class="hint">Average per day across all platforms.</div></div>
      <div class="field"><label>Currency</label><select data-path="budget.currency">${['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'PLN', 'RSD', 'INR', 'BRL', 'MXN', 'JPY'].map((c) => `<option ${c === currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <div class="hint">Must match your ad accounts' currency for live launches.</div></div>
    </div>
    <div class="row spread"><h3 style="margin:0">Split between platforms</h3><button class="btn btn-sm" id="rec-split">Use recommended split</button></div>
    <div id="split" style="margin-top:12px">${spec.platforms.map((p) => `
      <div class="split-row"><div class="row">${platformIcon(p)}<span>${esc(ref.platforms.find((x) => x.id === p).name)}</span></div>
      <input type="range" min="0" max="100" step="1" data-split="${p}" value="${Math.round(spec.budget.split[p] ?? 100 / spec.platforms.length)}">
      <strong data-split-out="${p}"></strong></div>`).join('') || '<p class="muted">Choose platforms first.</p>'}</div>
    <div class="grid grid-2" style="margin-top:12px">
      <div class="field"><label>Start date</label><input type="date" data-path="schedule.start" value="${esc(spec.schedule.start)}"></div>
      <div class="field"><label>End date <small class="muted">(optional)</small></label><input type="date" data-path="schedule.end" value="${esc(spec.schedule.end || '')}"><div class="hint">Leave empty to run until you pause it.</div></div>
    </div>
    <h3>What could this budget get you per day?</h3>
    <div id="forecast"><span class="spinner"></span></div>`;
  },

  creative() {
    const c = spec.creative;
    const has = (p) => spec.platforms.includes(p);
    return `
    <h2>Create your ad</h2>
    <div class="grid grid-2">
      <div class="field"><label>Brand / business name</label><input type="text" data-path="creative.brandName" data-max="40" value="${esc(c.brandName)}"></div>
      <div class="field"><label>Landing page URL</label><input type="url" data-path="creative.url" value="${esc(c.url)}" placeholder="https://yourshop.com/offer"><div class="hint">Where people go when they click. Must load fast on mobile.</div></div>
    </div>
    <div class="field"><label>Headlines <small class="muted">(one per line${has('google') ? ', 3–15 for Google' : ''})</small></label>
      <textarea data-lines="creative.headlines" data-max="${has('google') ? 30 : 40}" data-per-line="1" placeholder="Trail Shoes Built to Grip\nFree Shipping Over $50\n30-Day Free Returns">${esc(c.headlines.join('\n'))}</textarea>
      <div class="hint">The first headline is used on Meta, LinkedIn and Pinterest. ${has('google') ? 'Google mixes all of them, max 30 characters each.' : ''}</div></div>
    <div class="field"><label>Main ad text</label><textarea data-path="creative.primaryText" data-max="${has('tiktok') ? 100 : 125}" placeholder="Hook → benefit → proof → call to action">${esc(c.primaryText)}</textarea></div>
    <div class="field"><label>Descriptions <small class="muted">(one per line${has('google') ? ', 2–4 for Google, max 90 chars' : ''})</small></label>
      <textarea data-lines="creative.descriptions" data-max="90" data-per-line="1" placeholder="Lightweight, waterproof and made to last.\nOrder today, delivered in 2 days.">${esc(c.descriptions.join('\n'))}</textarea></div>
    <div class="field"><label>Call-to-action button</label><select data-path="creative.cta">${ref.ctas.map((x) => `<option value="${x}" ${c.cta === x ? 'selected' : ''}>${x.replace(/_/g, ' ').toLowerCase().replace(/^./, (s) => s.toUpperCase())}</option>`).join('')}</select></div>
    <div class="grid grid-2">
      <div class="field"><label>Image ${has('meta') || has('pinterest') || has('tiktok') ? '' : '<small class="muted">(recommended)</small>'}</label>
        <input type="file" accept="image/*" data-upload="creative.imageUrl"><input type="url" data-path="creative.imageUrl" value="${esc(c.imageUrl)}" placeholder="…or paste an image URL" style="margin-top:6px">
        <div class="hint">Square 1080×1080 works everywhere; 1000×1500 is best for Pinterest.</div></div>
      <div class="field ${has('tiktok') ? '' : 'hidden'}"><label>Video (TikTok)</label>
        <input type="file" accept="video/mp4,video/quicktime" data-upload="creative.videoUrl"><input type="url" data-path="creative.videoUrl" value="${esc(c.videoUrl)}" placeholder="…or paste a video URL" style="margin-top:6px">
        <div class="hint">Vertical 9:16, 5–60 s, under 10 MB for upload here.</div></div>
    </div>
    <h3>Live preview</h3>
    <div class="previews" id="previews"></div>`;
  },

  review() {
    return `
    <h2>Review &amp; launch</h2>
    <div id="review"><span class="spinner"></span> Checking your campaign against each platform's rules…</div>`;
  },
};

// ---------- Previews ----------
function previews() {
  const c = spec.creative;
  const brand = esc(c.brandName || 'Your brand');
  const h = esc(c.headlines[0] || 'Your headline');
  const text = esc(c.primaryText || 'Your main ad text appears here.');
  const d = esc(c.descriptions[0] || '');
  const domain = (() => { try { return new URL(c.url).hostname; } catch { return 'yourwebsite.com'; } })();
  const img = c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="">` : '<span>Image</span>';
  const cta = esc(c.cta.replace(/_/g, ' ').toLowerCase().replace(/^./, (s) => s.toUpperCase()));
  const out = [];
  for (const p of spec.platforms) {
    if (p === 'meta') out.push(`<div><small class="muted">Meta feed</small><div class="ad-preview"><div class="ap-head"><div class="ap-avatar">${brand[0] || 'B'}</div><div><strong>${brand}</strong><br><small class="muted">Sponsored</small></div></div>
      <div class="ap-body" style="padding-top:0">${text.length > 125 ? `${text.slice(0, 125)}… <span class="muted">See more</span>` : text}</div><div class="ap-media">${img}</div>
      <div class="ap-cta"><div><small class="muted">${esc(domain.toUpperCase())}</small><br><strong>${h}</strong></div><span class="btn">${cta}</span></div></div></div>`);
    if (p === 'google') out.push(`<div><small class="muted">Google search result</small><div class="ad-preview ap-google"><div class="g-url"><strong>Sponsored</strong> · ${esc(domain)}</div>
      <div class="g-title">${c.headlines.slice(0, 3).map(esc).join(' | ') || h}</div><div>${(c.descriptions.length ? c.descriptions : [c.primaryText]).slice(0, 2).map(esc).join(' ') || 'Your description.'}</div></div></div>`);
    if (p === 'tiktok') out.push(`<div><small class="muted">TikTok For You feed</small><div class="ad-preview ap-tiktok">${c.videoUrl ? `<video src="${esc(c.videoUrl)}" muted autoplay loop playsinline></video>` : c.imageUrl ? `<img src="${esc(c.imageUrl)}" alt="">` : ''}
      <div class="tt-overlay"><strong>@${brand}</strong> <small>Sponsored</small><div>${esc((c.primaryText || c.headlines[0] || '').slice(0, 100))}</div><div class="tt-cta">${cta}</div></div></div></div>`);
    if (p === 'linkedin') out.push(`<div><small class="muted">LinkedIn feed</small><div class="ad-preview"><div class="ap-head"><div class="ap-avatar">${brand[0] || 'B'}</div><div><strong>${brand}</strong><br><small class="muted">Promoted</small></div></div>
      <div class="ap-body" style="padding-top:0">${text.length > 150 ? `${text.slice(0, 150)}… <span class="muted">more</span>` : text}</div><div class="ap-media" style="aspect-ratio:1.91/1">${img}</div>
      <div class="ap-cta"><div><strong>${h}</strong><br><small class="muted">${esc(domain)}</small></div><span class="btn">${cta}</span></div></div></div>`);
    if (p === 'pinterest') out.push(`<div><small class="muted">Pinterest home feed</small><div class="ad-preview ap-pinterest"><div class="ap-media">${img}</div>
      <div class="ap-body"><strong>${h}</strong><br><small class="muted">Promoted by ${brand}</small>${d ? `<br><small>${d}</small>` : ''}</div></div></div>`);
  }
  const el = document.getElementById('previews');
  if (el) el.innerHTML = out.join('') || '<p class="muted">Choose platforms to see previews.</p>';
}

// ---------- Budget helpers ----------
function normalizedSplit() {
  const raw = spec.platforms.map((p) => Number(spec.budget.split[p] ?? 100 / spec.platforms.length));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(spec.platforms.map((p, i) => [p, (raw[i] / total) * 100]));
}

function updateSplitLabels() {
  const s = normalizedSplit();
  for (const p of spec.platforms) {
    const out = document.querySelector(`[data-split-out="${p}"]`);
    if (out) out.textContent = `${Math.round(s[p])}% · ${fmt.money((spec.budget.daily * s[p]) / 100, spec.budget.currency)}`;
  }
}

let forecastTimer;
function refreshForecast() {
  clearTimeout(forecastTimer);
  forecastTimer = setTimeout(async () => {
    const el = document.getElementById('forecast');
    if (!el || !spec.platforms.length) { if (el) el.innerHTML = ''; return; }
    const { forecast } = await api('/api/advisor/forecast', { method: 'POST', body: { spec } });
    const range = (r) => `${fmt.num(r.low)}–${fmt.num(r.high)}`;
    el.innerHTML = `<div class="table-wrap"><table class="forecast-table"><thead><tr><th>Platform</th><th>Budget/day</th><th>Impressions</th><th>Clicks</th><th>Conversions*</th></tr></thead><tbody>
      ${forecast.rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${fmt.money(r.dailyBudget, spec.budget.currency)}</td><td>${range(r.impressions)}</td><td>${range(r.clicks)}</td><td>${r.conversions.low}–${r.conversions.high}</td></tr>`).join('')}
      <tr><th>Total</th><th>${fmt.money(forecast.total.dailyBudget, spec.budget.currency)}</th><th>${range(forecast.total.impressions)}</th><th>${range(forecast.total.clicks)}</th><th>${fmt.dec(forecast.total.conversions.low, 1)}–${fmt.dec(forecast.total.conversions.high, 1)}</th></tr>
    </tbody></table></div><p class="hint">*If conversion tracking is set up. ${esc(forecast.disclaimer)}</p>`;
  }, 300);
}

// ---------- Review ----------
function issueList(items, kind) {
  if (!items.length) return '';
  const name = (p) => (p ? ref.platforms.find((x) => x.id === p)?.name : 'General');
  return `<div class="alert ${kind}"><strong>${kind === 'bad' ? 'Must fix before launch' : 'Recommendations'}</strong><ul class="issues" style="margin:6px 0 0;padding-left:18px">
    ${items.map((i) => `<li><strong>${esc(name(i.platform))}:</strong> ${esc(i.message)}</li>`).join('')}</ul></div>`;
}

async function renderReview() {
  const el = document.getElementById('review');
  const data = await api('/api/campaigns/preview', { method: 'POST', body: { spec } });
  lastPreview = data;
  const v = data.validation;
  const anyLive = data.platforms.some((p) => p.mode === 'live');
  el.innerHTML = `
    ${v.ok ? '<div class="alert good"><strong>Ready to launch 🎉</strong>Your campaign passes every platform check.</div>' : ''}
    ${issueList(v.errors, 'bad')}${issueList(v.warnings, 'warn')}
    ${v.tips.map((t) => `<div class="callout tip">${esc(t)}</div>`).join('')}
    <h3 style="margin-top:20px">What Vendo will create</h3>
    <p class="muted">These are the real API requests, in order. Values like <code>{{campaign}}</code> are filled in with IDs returned by earlier steps.</p>
    ${data.platforms.map((p) => `
      <div class="card" style="box-shadow:none">
        <div class="row spread"><div class="row">${platformIcon(p.platform)}<div><strong>${esc(p.name)}</strong><br><small>${esc(p.account || 'No ad account selected')} · ${fmt.money(p.dailyBudget, spec.budget.currency)}/day</small></div></div>
        ${p.mode === 'live' ? '<span class="badge good">Live: real API calls</span>' : '<span class="badge info">Sandbox: simulated</span>'}</div>
        ${(p.notes || []).map((n) => `<div class="alert info" style="margin-top:10px">${esc(n)}</div>`).join('')}
        <div style="margin-top:12px">${p.steps.map((s, i) => `
          <details class="step"><summary>${i + 1}. ${esc(s.title)} <span class="method">${esc(s.method)}</span></summary>
            <p style="margin-top:8px">${esc(s.explain)}</p>
            <div class="endpoint">${esc(s.method)} ${esc(s.url)}</div>
            <pre>${esc(JSON.stringify(s.body, null, 2))}</pre>
          </details>`).join('')}</div>
      </div>`).join('')}
    <div class="card" style="box-shadow:none;margin-top:16px">
      <label class="switch"><input type="checkbox" id="activate" ${spec.activate ? 'checked' : ''}> Start delivering immediately after launch</label>
      <p class="hint" id="activate-hint">${spec.activate
        ? `⚠️ Ads will start spending ${anyLive ? 'real money ' : ''}as soon as the platforms approve them.`
        : 'Recommended: campaigns are created <strong>paused</strong>. Check them, then activate from your dashboard.'}</p>
    </div>
    <div class="wizard-nav">
      <button class="btn" id="save-draft">Save as draft</button>
      <button class="btn btn-primary btn-lg" id="launch" ${v.ok ? '' : 'disabled'}>🚀 Launch on ${data.platforms.length} platform${data.platforms.length === 1 ? '' : 's'}</button>
    </div>`;
  el.querySelector('#activate').addEventListener('change', (e) => { spec.activate = e.target.checked; saveDraft(); renderReview(); });
  el.querySelector('#save-draft').addEventListener('click', () => persist(false));
  el.querySelector('#launch').addEventListener('click', () => {
    if (anyLive && !confirm(`This creates real campaigns${spec.activate ? ' that start spending' : ' (paused)'} on: ${data.platforms.filter((p) => p.mode === 'live').map((p) => p.name).join(', ')}. Continue?`)) return;
    persist(true);
  });
}

async function persist(launch) {
  const btn = document.getElementById(launch ? 'launch' : 'save-draft');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Working…';
  try {
    const { campaign } = editId
      ? await api(`/api/campaigns/${editId}`, { method: 'PUT', body: { spec } })
      : await api('/api/campaigns', { method: 'POST', body: { spec } });
    editId = campaign.id;
    if (launch) await api(`/api/campaigns/${campaign.id}/launch`, { method: 'POST' });
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    location.href = `/campaigns/${campaign.id}${launch ? '?launched=1' : ''}`;
  } catch (e) {
    toast(e.message, 'bad');
    btn.disabled = false;
    btn.textContent = launch ? '🚀 Launch' : 'Save as draft';
  }
}

// ---------- Live readiness panel ----------
let checkTimer;
function refreshCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(async () => {
    if (!spec.platforms.length) { document.getElementById('check').innerHTML = '<small class="muted">Pick at least one platform.</small>'; return; }
    try {
      const { validation: v } = await api('/api/campaigns/preview', { method: 'POST', body: { spec } });
      const stepOf = (f = '') => (f.startsWith('creative') ? 'creative' : f.startsWith('audience') ? 'audience' : f.startsWith('budget') || f.startsWith('schedule') ? 'budget' : f.startsWith('targets') ? 'connect' : f === 'platforms' ? 'platforms' : 'goal');
      document.getElementById('check').innerHTML = v.ok
        ? `<div class="alert good" style="margin:0">All checks pass.${v.warnings.length ? ` ${v.warnings.length} suggestion(s) on the review step.` : ''}</div>`
        : `<p><strong>${v.errors.length}</strong> thing${v.errors.length === 1 ? '' : 's'} to fix:</p><ul style="padding-left:18px;margin:0;font-size:.9rem">${v.errors.slice(0, 6).map((e) => `<li>${esc(e.message)} <small class="muted">(${stepOf(e.field)})</small></li>`).join('')}</ul>`;
    } catch { /* ignore transient errors */ }
  }, 500);
}

// ---------- Rendering & binding ----------
function render() {
  document.getElementById('stepper').innerHTML = STEPS.map((s, i) => `<button class="${i === stepIdx ? 'active' : i < stepIdx ? 'done' : ''}" data-go="${i}">${s.label}</button>`).join('');
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { stepIdx = +b.dataset.go; render(); }));
  const step = STEPS[stepIdx];
  const el = document.getElementById('step');
  el.innerHTML = R[step.id]() + (step.id === 'review' ? '' : `
    <div class="wizard-nav">
      <button class="btn" id="prev" ${stepIdx === 0 ? 'disabled' : ''}>← Back</button>
      <button class="btn btn-primary" id="next">Next: ${STEPS[stepIdx + 1].label.replace(/^\d+\.\s*/, '')} →</button>
    </div>`);
  document.getElementById('coach').innerHTML = `<ul>${COACH[step.id].map((t) => `<li>${t}</li>`).join('')}</ul>`;
  el.querySelector('#prev')?.addEventListener('click', () => { stepIdx--; render(); });
  el.querySelector('#next')?.addEventListener('click', () => {
    if (step.id === 'platforms' && !spec.platforms.length) return toast('Choose at least one platform', 'bad');
    stepIdx++; render();
  });
  bind(el);
  attachCounters(el);
  if (step.id === 'budget') { updateSplitLabels(); refreshForecast(); }
  if (step.id === 'creative') previews();
  if (step.id === 'review') renderReview().catch((e) => toast(e.message, 'bad'));
  refreshCheck();
  window.scrollTo({ top: 0 });
}

function onChange() {
  saveDraft();
  refreshCheck();
  const step = STEPS[stepIdx].id;
  if (step === 'goal') document.getElementById('tracking')?.classList.toggle('hidden', !['leads', 'sales'].includes(spec.goal));
  if (step === 'budget') { updateSplitLabels(); refreshForecast(); }
  if (step === 'creative') previews();
}

function bind(root) {
  root.querySelectorAll('[data-path]').forEach((input) => {
    const ev = input.type === 'radio' || input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(ev, () => {
      if (input.type === 'radio' && !input.checked) return;
      let v = input.type === 'checkbox' ? input.checked : input.value;
      if (input.dataset.num !== undefined) v = Number(v);
      setPath(spec, input.dataset.path, v);
      onChange();
    });
  });
  root.querySelectorAll('[data-lines]').forEach((ta) => ta.addEventListener('input', () => { setPath(spec, ta.dataset.lines, lines(ta.value)); onChange(); }));
  root.querySelectorAll('[data-list]').forEach((cb) => cb.addEventListener('change', () => {
    const path = cb.dataset.list;
    const set = new Set(getPath(spec, path));
    if (cb.checked) set.add(cb.value); else set.delete(cb.value);
    setPath(spec, path, [...set]);
    if (path === 'platforms') spec.budget.split = {};
    onChange();
  }));
  root.querySelectorAll('[data-split]').forEach((r) => r.addEventListener('input', () => { spec.budget.split = { ...normalizedSplit(), [r.dataset.split]: Number(r.value) }; onChange(); }));
  root.querySelector('#rec-split')?.addEventListener('click', async () => {
    const { recommendedSplit } = await api('/api/advisor/forecast', { method: 'POST', body: { spec } });
    spec.budget.split = recommendedSplit;
    saveDraft();
    render();
    toast('Recommended split applied for your goal');
  });
  root.querySelectorAll('[data-upload]').forEach((fileInput) => fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('Files must be under 10 MB', 'bad');
    const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    try {
      const { url } = await api('/api/uploads', { method: 'POST', body: { dataUrl } });
      setPath(spec, fileInput.dataset.upload, url);
      const urlInput = root.querySelector(`[data-path="${fileInput.dataset.upload}"]`);
      if (urlInput) urlInput.value = url;
      toast('Uploaded');
      onChange();
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

(async () => {
  await requireLogin();
  mountNav('new');
  ref = await reference();
  const { connections } = await api('/api/connections');
  conns = Object.fromEntries(connections.filter((c) => c.connection).map((c) => [c.platform, c.connection]));
  const params = new URLSearchParams(location.search);
  const source = params.get('edit') || params.get('from');
  if (source) {
    const { campaign } = await api(`/api/campaigns/${source}`);
    spec = { ...blank(), ...campaign.spec, schedule: { ...campaign.spec.schedule, end: campaign.spec.schedule.end || '' } };
    if (params.get('edit')) { editId = source; document.getElementById('title').textContent = `Edit: ${campaign.name}`; }
    else { spec.name = `${spec.name} (copy)`; spec.schedule.start = new Date().toISOString().slice(0, 10); }
  } else {
    try { spec = { ...blank(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') }; } catch { spec = blank(); }
    if (spec.schedule.start < new Date().toISOString().slice(0, 10)) spec.schedule.start = new Date().toISOString().slice(0, 10);
  }
  // Use a live account's currency by default.
  const liveCurrency = Object.values(conns).find((c) => c.mode === 'live' && c.currency)?.currency;
  if (liveCurrency && !source) spec.budget.currency = liveCurrency;
  document.getElementById('reset').addEventListener('click', () => {
    if (!confirm('Clear the form and start over?')) return;
    spec = blank(); editId = null; stepIdx = 0; saveDraft(); history.replaceState(null, '', '/campaigns/new'); render();
  });
  render();
})();
