import { mountNav, esc, fmt } from './common.js';
import { LESSONS } from './lessons.js';

mountNav('learn');

const KEY = 'vendo-academy-done';
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
const save = (set) => { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ } };
let done = load();

const WIDGETS = {
  budget: `
<div class="calc" id="w-budget">
  <h3>🧮 Budget calculator</h3>
  <div class="grid grid-3">
    <div class="field"><label>Daily budget ($)</label><input type="number" id="b-daily" value="30" min="1"></div>
    <div class="field"><label>Expected cost per click ($)</label><input type="number" id="b-cpc" value="0.9" step="0.1" min="0.05"></div>
    <div class="field"><label>Website conversion rate (%)</label><input type="number" id="b-cvr" value="3" step="0.5" min="0.1"></div>
  </div>
  <p class="out" id="b-out"></p>
  <p class="hint">Typical conversion rates: 1–3% for e-commerce, 5–15% for a free sign-up or quote form.</p>
</div>`,
  roas: `
<div class="calc" id="w-roas">
  <h3>🧮 Break-even calculator</h3>
  <div class="grid grid-3">
    <div class="field"><label>Average order value ($)</label><input type="number" id="r-aov" value="60" min="1"></div>
    <div class="field"><label>Profit margin before ads (%)</label><input type="number" id="r-margin" value="40" min="1" max="100"></div>
    <div class="field"><label>Your actual ROAS</label><input type="number" id="r-roas" value="2" step="0.1" min="0"></div>
  </div>
  <p class="out" id="r-out"></p>
</div>`,
  utm: `
<div class="calc" id="w-utm">
  <h3>🔗 UTM link builder</h3>
  <div class="grid grid-2">
    <div class="field"><label>Landing page</label><input type="url" id="u-url" value="https://example.com/shop"></div>
    <div class="field"><label>Source (platform)</label><select id="u-source"><option>facebook</option><option>google</option><option>tiktok</option><option>linkedin</option><option>pinterest</option></select></div>
    <div class="field"><label>Medium</label><input type="text" id="u-medium" value="paid_social"></div>
    <div class="field"><label>Campaign name</label><input type="text" id="u-campaign" value="spring_sale"></div>
  </div>
  <pre id="u-out"></pre>
  <button class="btn btn-sm" id="u-copy">Copy link</button>
</div>`,
};

function wireWidgets() {
  const $ = (id) => document.getElementById(id);
  if ($('w-budget')) {
    const calc = () => {
      const daily = +$('b-daily').value || 0;
      const cpc = +$('b-cpc').value || 1;
      const cvr = (+$('b-cvr').value || 0) / 100;
      const clicks = daily / cpc;
      const conv = clicks * cvr;
      $('b-out').innerHTML = `≈ ${fmt.num(clicks)} clicks/day → ≈ ${fmt.dec(conv, 1)} conversions/day (${fmt.num(conv * 30)} per month).<br><small class="muted">Cost per conversion ≈ ${conv ? fmt.money(daily / conv) : '—'}</small>`;
    };
    ['b-daily', 'b-cpc', 'b-cvr'].forEach((id) => $(id).addEventListener('input', calc));
    calc();
  }
  if ($('w-roas')) {
    const calc = () => {
      const aov = +$('r-aov').value || 0;
      const margin = (+$('r-margin').value || 0) / 100;
      const roas = +$('r-roas').value || 0;
      const breakEven = margin ? 1 / margin : Infinity;
      const maxCpa = aov * margin;
      const profitPer100 = 100 * roas * margin - 100;
      $('r-out').innerHTML = `Break-even ROAS: <strong>${fmt.dec(breakEven)}×</strong> · Max affordable cost per sale: <strong>${fmt.money(maxCpa)}</strong><br>
        At ${fmt.dec(roas, 1)}× ROAS, every $100 of ads ${profitPer100 >= 0 ? `earns <span style="color:var(--good)">${fmt.money(profitPer100)} profit</span>` : `<span style="color:var(--bad)">loses ${fmt.money(-profitPer100)}</span>`}.`;
    };
    ['r-aov', 'r-margin', 'r-roas'].forEach((id) => $(id).addEventListener('input', calc));
    calc();
  }
  if ($('w-utm')) {
    const calc = () => {
      try {
        const u = new URL($('u-url').value);
        u.searchParams.set('utm_source', $('u-source').value);
        u.searchParams.set('utm_medium', $('u-medium').value);
        u.searchParams.set('utm_campaign', $('u-campaign').value);
        $('u-out').textContent = u.toString();
      } catch { $('u-out').textContent = 'Enter a full URL starting with https://'; }
    };
    ['u-url', 'u-source', 'u-medium', 'u-campaign'].forEach((id) => $(id).addEventListener('input', calc));
    $('u-copy').addEventListener('click', () => navigator.clipboard?.writeText($('u-out').textContent));
    calc();
  }
}

function renderNav(activeId) {
  document.getElementById('lesson-nav').innerHTML = LESSONS.map((l, i) => `
    <a href="#${l.id}" class="${l.id === activeId ? 'active' : ''} ${done.has(l.id) ? 'done' : ''}">
      <span class="check"></span><span>${i + 1}. ${esc(l.title)}<br><small>${l.minutes} min</small></span>
    </a>`).join('');
  const pct = Math.round((done.size / LESSONS.length) * 100);
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-label').textContent = `${pct}% complete (${done.size}/${LESSONS.length} lessons)`;
}

function renderLesson(id) {
  const idx = Math.max(0, LESSONS.findIndex((l) => l.id === id));
  const l = LESSONS[idx];
  const next = LESSONS[idx + 1];
  const el = document.getElementById('lesson');
  el.innerHTML = `
    <small class="muted">Lesson ${idx + 1} of ${LESSONS.length} · ${l.minutes} min read</small>
    <h1 style="font-size:1.9rem;margin-top:6px">${esc(l.title)}</h1>
    ${l.body}
    ${l.widget ? WIDGETS[l.widget] : ''}
    <div class="quiz">
      <h2>Quick check</h2>
      ${l.quiz.map((q, qi) => `<div class="q" data-q="${qi}"><strong>${qi + 1}. ${esc(q.q)}</strong>
        ${q.options.map((o, oi) => `<label class="opt"><input type="radio" name="q${qi}" value="${oi}" hidden> ${esc(o)}</label>`).join('')}
        <div class="hint why hidden"></div></div>`).join('')}
    </div>
    <div class="row spread" style="margin-top:24px">
      <span class="muted" id="quiz-status"></span>
      ${next ? `<a class="btn btn-primary" href="#${next.id}">Next: ${esc(next.title)} →</a>` : '<a class="btn btn-primary" href="/campaigns/new">Build your first campaign →</a>'}
    </div>`;
  const answered = new Set();
  el.querySelectorAll('.q').forEach((qEl) => {
    const q = l.quiz[+qEl.dataset.q];
    qEl.querySelectorAll('.opt').forEach((opt) => opt.addEventListener('click', () => {
      const choice = +opt.querySelector('input').value;
      qEl.querySelectorAll('.opt').forEach((o, oi) => { o.classList.remove('correct', 'wrong'); if (oi === q.answer) o.classList.add('correct'); });
      if (choice !== q.answer) opt.classList.add('wrong');
      const why = qEl.querySelector('.why');
      why.textContent = `${choice === q.answer ? '✅ Correct. ' : '❌ Not quite. '}${q.why}`;
      why.classList.remove('hidden');
      if (choice === q.answer) answered.add(qEl.dataset.q);
      if (answered.size === l.quiz.length) {
        done.add(l.id); save(done); renderNav(l.id);
        document.getElementById('quiz-status').textContent = '🎉 Lesson complete!';
      }
    }));
  });
  wireWidgets();
  renderNav(l.id);
  window.scrollTo({ top: 0 });
}

const route = () => renderLesson(location.hash.slice(1) || LESSONS[0].id);
window.addEventListener('hashchange', route);
route();
