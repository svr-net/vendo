// Shared client helpers: API calls, nav, toasts, formatting.
export const PLATFORM_LETTER = { meta: 'f', google: 'G', tiktok: '♪', linkedin: 'in', pinterest: 'P' };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'vendo', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth')) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

let referenceCache;
export const reference = () => (referenceCache ||= api('/api/reference'));

export function toast(message, kind = '') {
  let box = document.getElementById('toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = message;
  box.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? (values[i]?.__html ?? esc(values[i])) : ''), '');
}
export const raw = (s) => ({ __html: s });

export const fmt = {
  num: (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  money: (n, cur = 'USD') => Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }),
  pct: (n) => `${Number(n || 0).toFixed(2)}%`,
  dec: (n, d = 2) => Number(n || 0).toFixed(d),
  date: (s) => (s ? new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).toLocaleString() : '—'),
};

export const STATUS = {
  draft: ['Draft', ''], launching: ['Launching…', 'info'], active: ['Active', 'good'], paused: ['Paused', 'warn'],
  failed: ['Failed', 'bad'], partial: ['Partly launched', 'warn'], pending: ['Pending', ''],
};
export const statusBadge = (s) => { const [l, k] = STATUS[s] || [s, '']; return `<span class="badge ${k}"><span class="dot"></span>${esc(l)}</span>`; };
export const platformIcon = (p) => `<span class="platform-icon ${p}" aria-hidden="true">${PLATFORM_LETTER[p] || '?'}</span>`;

export async function currentUser() {
  try { return (await api('/api/me')).user; } catch { return null; }
}

export async function requireLogin() {
  const user = await currentUser();
  if (!user) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; throw new Error('redirecting'); }
  return user;
}

/** Renders the top navigation bar into <header id="nav">. */
export async function mountNav(active) {
  const el = document.getElementById('nav');
  if (!el) return null;
  const user = await currentUser();
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  el.className = 'nav';
  el.innerHTML = `<div class="nav-inner">
    <a class="logo" href="/"><span class="logo-mark">V</span>Vendo</a>
    <nav class="nav-links">
      ${link('/learn', 'Learn', 'learn')}
      ${link('/connect', 'Connect', 'connect')}
      ${link('/campaigns/new', 'New campaign', 'new')}
      ${link('/campaigns', 'My campaigns', 'campaigns')}
    </nav>
    <div class="nav-user">${user
    ? `<span class="muted">${esc(user.name)}</span><button class="btn btn-sm" id="logout">Sign out</button>`
    : '<a class="btn btn-sm" href="/login">Sign in</a><a class="btn btn-sm btn-primary" href="/login#signup">Get started</a>'}</div>
  </div>`;
  el.querySelector('#logout')?.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
  return user;
}

/** Character counter for inputs with data-max. */
export function attachCounters(root = document) {
  root.querySelectorAll('[data-max]').forEach((input) => {
    if (input.dataset.counted) return;
    input.dataset.counted = '1';
    const counter = document.createElement('span');
    counter.className = 'counter';
    const label = input.closest('.field')?.querySelector('label');
    (label || input.parentElement).append(counter);
    const update = () => {
      const max = Number(input.dataset.max);
      const lines = input.dataset.perLine ? input.value.split('\n') : [input.value];
      const longest = Math.max(0, ...lines.map((l) => l.trim().length));
      counter.textContent = input.dataset.perLine ? `longest line ${longest}/${max}` : `${longest}/${max}`;
      counter.classList.toggle('over', longest > max);
    };
    input.addEventListener('input', update);
    update();
  });
}
