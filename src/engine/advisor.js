'use strict';
/**
 * The Advisor turns numbers into plain-language guidance:
 *  - forecasts what a budget can buy on each platform,
 *  - recommends how to split a budget for a goal,
 *  - explains live results ("Is a 0.6% CTR good?") and what to do next.
 * Benchmarks are broad cross-industry averages (USD) meant for education;
 * real costs vary a lot by country, industry, season and creative quality.
 */
const { platformDailyBudget } = require('./spec');

const BENCHMARKS = {
  meta: { cpm: 9, cpc: 0.9, ctr: 1.0, cvr: 3.0, label: 'Meta' },
  google: { cpm: 110, cpc: 2.7, ctr: 4.5, cvr: 4.5, label: 'Google Search' },
  tiktok: { cpm: 7, cpc: 0.7, ctr: 0.9, cvr: 1.5, label: 'TikTok' },
  linkedin: { cpm: 35, cpc: 5.5, ctr: 0.5, cvr: 2.5, label: 'LinkedIn' },
  pinterest: { cpm: 4, cpc: 1.0, ctr: 0.4, cvr: 1.5, label: 'Pinterest' },
};

const GOAL_WEIGHTS = {
  awareness: { meta: 35, tiktok: 30, pinterest: 15, linkedin: 15, google: 5 },
  traffic: { meta: 30, google: 30, tiktok: 20, pinterest: 10, linkedin: 10 },
  engagement: { tiktok: 40, meta: 35, pinterest: 10, linkedin: 10, google: 5 },
  leads: { google: 35, meta: 30, linkedin: 20, tiktok: 10, pinterest: 5 },
  sales: { google: 35, meta: 35, tiktok: 15, pinterest: 10, linkedin: 5 },
};

const PLATFORM_FIT = {
  meta: 'Huge reach across Facebook and Instagram with strong automated targeting. Great all-rounder for consumer products and local businesses.',
  google: 'Reaches people at the moment they search for what you sell. Highest intent, so often the best for leads and sales — but clicks cost more.',
  tiktok: 'Short vertical video with very cheap reach, especially for under-35s. Needs native-feeling, entertaining video.',
  linkedin: 'Target by job title, industry and company. Expensive, but unmatched for B2B, recruiting and professional services.',
  pinterest: 'People plan purchases here (home, fashion, food, weddings, DIY). Pins keep getting discovered for months.',
};

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Recommend a budget split (percent) across the chosen platforms for a goal. */
function recommendSplit(goal, platforms, daily = 0) {
  const w = GOAL_WEIGHTS[goal] || GOAL_WEIGHTS.traffic;
  const minimum = { tiktok: 20, linkedin: 10 };
  const split = {};
  let total = 0;
  for (const p of platforms) total += w[p] || 1;
  for (const p of platforms) split[p] = ((w[p] || 1) / total) * 100;
  // Lift platforms with hard minimums if the budget allows it.
  if (daily > 0) {
    for (const p of platforms) {
      const need = minimum[p] ? (minimum[p] / daily) * 100 : 0;
      if (need > split[p] && need < 100) {
        const extra = need - split[p];
        split[p] = need;
        const others = platforms.filter((x) => x !== p);
        const otherTotal = others.reduce((s, x) => s + split[x], 0) || 1;
        for (const o of others) split[o] -= (split[o] / otherTotal) * extra;
      }
    }
  }
  for (const p of platforms) split[p] = round(Math.max(split[p], 0), 1);
  return split;
}

/** Rough daily outcome forecast per platform with a low–high range. */
function forecast(spec) {
  const rows = spec.platforms.map((p) => {
    const b = BENCHMARKS[p];
    const budget = platformDailyBudget(spec, p);
    const impressions = (budget / b.cpm) * 1000;
    const clicks = budget / b.cpc;
    const conversions = clicks * (b.cvr / 100);
    const range = (v) => ({ low: Math.round(v * 0.6), high: Math.round(v * 1.4) });
    return {
      platform: p,
      label: b.label,
      dailyBudget: budget,
      impressions: range(impressions),
      clicks: range(clicks),
      conversions: { low: round(conversions * 0.5, 1), high: round(conversions * 1.5, 1) },
      benchmark: b,
      fit: PLATFORM_FIT[p],
    };
  });
  const sum = (k) => ({ low: rows.reduce((s, r) => s + r[k].low, 0), high: rows.reduce((s, r) => s + r[k].high, 0) });
  return {
    rows,
    total: { dailyBudget: spec.budget.daily, impressions: sum('impressions'), clicks: sum('clicks'), conversions: sum('conversions') },
    disclaimer: 'Estimates use broad industry averages. Your results depend on country, industry, competition, season and — most of all — your creative.',
  };
}

/** Derived KPIs for a metrics object. */
function kpis(m) {
  m = m || {};
  const imp = m.impressions || 0;
  const clk = m.clicks || 0;
  const spend = m.spend || 0;
  const conv = m.conversions || 0;
  return {
    ...m,
    ctr: imp ? (clk / imp) * 100 : 0,
    cpc: clk ? spend / clk : 0,
    cpm: imp ? (spend / imp) * 1000 : 0,
    cvr: clk ? (conv / clk) * 100 : 0,
    cpa: conv ? spend / conv : 0,
    roas: spend && m.revenue ? m.revenue / spend : 0,
    frequency: m.reach ? imp / m.reach : 0,
  };
}

/** Plain-language insights for one deployment's results. */
function insights({ platform, goal, metrics, dailyBudget, active }) {
  const out = [];
  const b = BENCHMARKS[platform];
  const k = kpis(metrics);
  const add = (level, title, text) => out.push({ level, title, text });
  if (!metrics || !k.impressions) {
    add('info', 'Waiting for data', active
      ? 'New ads go through platform review (usually < 24h) and then a learning phase. Check back after a day.'
      : 'The campaign is paused. Activate it to start delivering — nothing is spent while paused.');
    return out;
  }
  if (k.impressions < 1000) add('info', 'Too early to judge', `Only ${k.impressions} impressions so far. Wait for at least 1,000 impressions (ideally a few days) before changing anything.`);

  if (k.ctr >= b.ctr * 1.2) add('good', `Strong click-through rate (${round(k.ctr)}%)`, `Above the typical ${b.ctr}% for ${b.label}. Your ad resonates — consider raising the budget by 20–30% every few days.`);
  else if (k.ctr < b.ctr * 0.6) add('warn', `Low click-through rate (${round(k.ctr)}%)`, `Typical for ${b.label} is about ${b.ctr}%. Test a new image or video and a clearer headline that states the benefit. The first 3 seconds / first line matter most.`);
  else add('info', `Average click-through rate (${round(k.ctr)}%)`, `In line with the ~${b.ctr}% benchmark. Testing 2–3 creative variations is the fastest way to improve.`);

  if (k.clicks >= 20) {
    if (k.cpc > b.cpc * 1.5) add('warn', `Clicks are expensive (${round(k.cpc)} per click)`, `About ${round(k.cpc / b.cpc, 1)}× the ${b.label} average of ${b.cpc}. Broaden your audience, improve CTR, or (Google) add more specific keywords.`);
    else if (k.cpc < b.cpc * 0.7) add('good', `Cheap clicks (${round(k.cpc)} per click)`, `Below the ${b.label} average of ${b.cpc}.`);
  }

  if (['leads', 'sales'].includes(goal)) {
    if (k.clicks >= 50 && !k.conversions) add('warn', 'Clicks but no conversions', 'People click but do not convert. Check your landing page: is it fast on mobile, does it match the ad\'s promise, is the form short? Also verify your pixel/tag fires.');
    else if (k.conversions) add(k.cvr >= b.cvr ? 'good' : 'info', `Conversion rate ${round(k.cvr)}%`, `Cost per result: ${round(k.cpa)}. Benchmark conversion rate is ~${b.cvr}%.${k.roas ? ` Return on ad spend: ${round(k.roas)}× (above 1× means revenue exceeds ad spend — but remember product costs).` : ''}`);
    if (platform === 'meta' && k.conversions > 0 && k.conversions < 50) add('info', 'Learning phase', 'Meta needs about 50 conversions per ad set per week to exit "learning". Avoid big edits until then; each significant edit restarts learning.');
  }

  if (k.frequency > 4) add('warn', `High frequency (${round(k.frequency, 1)})`, 'The same people see your ad many times. Expect fatigue: refresh the creative or widen the audience.');

  if (dailyBudget && metrics.days && metrics.spend < dailyBudget * metrics.days * 0.5) {
    add('info', 'Under-spending', 'The campaign spends well below its budget. The audience may be too narrow, bids too low, or the ad still in review.');
  }
  return out;
}

module.exports = { BENCHMARKS, PLATFORM_FIT, GOAL_WEIGHTS, recommendSplit, forecast, kpis, insights };
