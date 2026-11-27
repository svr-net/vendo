'use strict';
/**
 * The unified Vendo campaign spec. Ordinary users describe WHAT they want
 * (a goal, a budget, an audience, an ad) once; each platform adapter
 * translates it into that platform's objects (campaign → ad set/group → ad).
 */

const GOALS = {
  awareness: {
    label: 'Get seen (awareness)',
    summary: 'Show your ad to as many relevant people as possible. Paid per 1,000 impressions (CPM).',
    primaryMetric: 'cpm',
  },
  traffic: {
    label: 'Get website visits (traffic)',
    summary: 'Drive people to your website or landing page. Optimised for link clicks (CPC).',
    primaryMetric: 'cpc',
  },
  engagement: {
    label: 'Get engagement',
    summary: 'Get likes, comments, shares and video views to build social proof.',
    primaryMetric: 'cpe',
  },
  leads: {
    label: 'Get leads (sign-ups, enquiries)',
    summary: 'Collect contact details. Needs conversion tracking (pixel/tag) to optimise properly.',
    primaryMetric: 'cpa',
  },
  sales: {
    label: 'Get sales',
    summary: 'Drive purchases. Needs conversion tracking (pixel/tag) so platforms can find buyers.',
    primaryMetric: 'roas',
  },
};

const CTAS = ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'DOWNLOAD', 'GET_QUOTE', 'APPLY_NOW'];
const PLATFORMS = ['meta', 'google', 'tiktok', 'linkedin', 'pinterest'];

/** Currencies whose minor unit is not 1/100. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'COP', 'IDR', 'PYG', 'UGX']);
const minorUnits = (amount, currency) => Math.round(Number(amount) * (ZERO_DECIMAL.has(String(currency).toUpperCase()) ? 1 : 100));
const micros = (amount) => Math.round(Number(amount) * 1e6);

const today = () => new Date().toISOString().slice(0, 10);
const clean = (s) => String(s ?? '').trim();
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\n|,/)).map(clean).filter(Boolean);

/** Turn raw user input into a well-formed spec with sane defaults. */
function normalizeSpec(input = {}) {
  const platforms = [...new Set(list(input.platforms))].filter((p) => PLATFORMS.includes(p));
  const daily = Number(input.budget?.daily) || 0;
  const rawSplit = input.budget?.split || {};
  const split = {};
  let total = 0;
  for (const p of platforms) { split[p] = Math.max(0, Number(rawSplit[p] ?? 0)); total += split[p]; }
  if (!total) for (const p of platforms) split[p] = 100 / platforms.length;
  else for (const p of platforms) split[p] = (split[p] / total) * 100;

  const ageMin = Math.min(Math.max(Number(input.audience?.ageMin) || 18, 18), 65);
  const ageMax = Math.max(Math.min(Number(input.audience?.ageMax) || 65, 65), ageMin);

  return {
    name: clean(input.name) || `Campaign ${today()}`,
    goal: GOALS[input.goal] ? input.goal : 'traffic',
    platforms,
    budget: {
      daily,
      currency: clean(input.budget?.currency || 'USD').toUpperCase(),
      split,
    },
    schedule: {
      start: clean(input.schedule?.start) || today(),
      end: clean(input.schedule?.end) || null,
    },
    audience: {
      countries: [...new Set(list(input.audience?.countries).map((c) => c.toUpperCase()))],
      ageMin,
      ageMax,
      gender: ['male', 'female'].includes(input.audience?.gender) ? input.audience.gender : 'all',
      keywords: list(input.audience?.keywords).slice(0, 50),
      language: clean(input.audience?.language || 'en').toLowerCase(),
    },
    creative: {
      brandName: clean(input.creative?.brandName),
      headlines: list(input.creative?.headlines).slice(0, 15),
      descriptions: list(input.creative?.descriptions).slice(0, 4),
      primaryText: clean(input.creative?.primaryText),
      url: clean(input.creative?.url),
      cta: CTAS.includes(input.creative?.cta) ? input.creative.cta : 'LEARN_MORE',
      imageUrl: clean(input.creative?.imageUrl),
      videoUrl: clean(input.creative?.videoUrl),
      logoUrl: clean(input.creative?.logoUrl),
    },
    tracking: {
      metaPixelId: clean(input.tracking?.metaPixelId),
      tiktokPixelId: clean(input.tracking?.tiktokPixelId),
      googleConversions: Boolean(input.tracking?.googleConversions),
      linkedinConversionId: clean(input.tracking?.linkedinConversionId),
      pinterestTagId: clean(input.tracking?.pinterestTagId),
    },
    // Per-platform destinations chosen on the Connect page (page, organisation, board, …)
    targets: typeof input.targets === 'object' && input.targets ? input.targets : {},
    // Safety default: everything is created PAUSED unless the user explicitly activates.
    activate: input.activate === true,
  };
}

/** Daily budget (account currency, major units) allotted to one platform. */
const platformDailyBudget = (spec, platform) =>
  Math.round(((spec.budget.daily * (spec.budget.split[platform] ?? 0)) / 100) * 100) / 100;

module.exports = { GOALS, CTAS, PLATFORMS, normalizeSpec, platformDailyBudget, minorUnits, micros, today };
