'use strict';
/**
 * Validates a normalised spec against each platform's rules before anything
 * is sent. Errors block launch; warnings and tips teach best practice.
 */
const geo = require('./geo');
const { platformDailyBudget, today } = require('./spec');

// Minimum daily budgets in USD (rough equivalents are applied for other currencies).
const MIN_DAILY = { meta: 1, google: 1, tiktok: 20, linkedin: 10, pinterest: 1 };

const LIMITS = {
  meta: { primaryText: [125, 2200], headline: [40, 255], description: [30, 255] },
  google: { headline: 30, description: 90, minHeadlines: 3, minDescriptions: 2 },
  tiktok: { adText: [12, 100], brandName: 40 },
  linkedin: { primaryText: [150, 600], headline: [70, 200] },
  pinterest: { title: 100, description: 500 },
};

function isUrl(s) {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

/**
 * @param {object} spec normalised spec
 * @param {object} ctx { modes: {platform: 'live'|'sandbox'}, targets: {platform: {...}} }
 */
function validateSpec(spec, ctx = {}) {
  const errors = [];
  const warnings = [];
  const tips = [];
  const err = (platform, field, message) => errors.push({ platform, field, message });
  const warn = (platform, field, message) => warnings.push({ platform, field, message });
  const c = spec.creative;
  const h1 = c.headlines[0] || '';
  const d1 = c.descriptions[0] || '';

  // ---- General ----
  if (!spec.platforms.length) err(null, 'platforms', 'Choose at least one platform.');
  if (!(spec.budget.daily > 0)) err(null, 'budget.daily', 'Set a daily budget greater than zero.');
  if (!spec.audience.countries.length) err(null, 'audience.countries', 'Choose at least one country.');
  const unknown = spec.audience.countries.filter((cc) => !geo.lookup(cc));
  if (unknown.length) err(null, 'audience.countries', `Unsupported country codes: ${unknown.join(', ')}.`);
  if (!isUrl(c.url)) err(null, 'creative.url', 'Enter the full landing page address, starting with https://');
  else if (c.url.startsWith('http://')) warn(null, 'creative.url', 'Your landing page is not HTTPS. Many platforms reject or penalise non-secure pages.');
  if (!h1) err(null, 'creative.headlines', 'Write at least one headline.');
  if (!c.primaryText) err(null, 'creative.primaryText', 'Write the main ad text.');
  if (spec.schedule.start < today()) err(null, 'schedule.start', 'Start date cannot be in the past.');
  if (spec.schedule.end && spec.schedule.end < spec.schedule.start) err(null, 'schedule.end', 'End date must be after the start date.');
  if (spec.audience.ageMax - spec.audience.ageMin < 10) warn(null, 'audience.age', 'A very narrow age range raises costs. Modern algorithms usually find the right people within broad audiences.');
  if (['leads', 'sales'].includes(spec.goal)) {
    tips.push('Conversion goals work best with tracking installed: Meta Pixel, Google Ads conversion tag, TikTok Pixel, LinkedIn Insight Tag, Pinterest Tag. Without it, Vendo optimises for clicks instead.');
  }
  if (spec.budget.daily > 0 && spec.budget.daily < 10 * spec.platforms.length) {
    tips.push('Small budgets spread across many platforms learn slowly. With under ~10/day per platform, consider focusing on one or two.');
  }

  const fx = spec.budget.currency === 'USD' ? 1 : null; // other currencies: only warn
  for (const p of spec.platforms) {
    const daily = platformDailyBudget(spec, p);
    const min = MIN_DAILY[p];
    if (daily <= 0) err(p, 'budget.split', 'This platform has no budget allocated.');
    else if (fx && daily < min) err(p, 'budget.split', `Minimum daily budget is about ${min} USD (you allocated ${daily}).`);
    else if (!fx && daily < min) warn(p, 'budget.split', `Check the minimum daily budget (about ${min} USD equivalent).`);

    const live = ctx.modes?.[p] === 'live';
    const t = ctx.targets?.[p] || spec.targets?.[p] || {};

    if (p === 'meta') {
      const L = LIMITS.meta;
      if (!c.imageUrl) err(p, 'creative.imageUrl', 'Meta ads need an image (1080×1080 or 1080×1350 recommended).');
      if (c.primaryText.length > L.primaryText[1]) err(p, 'creative.primaryText', `Primary text is limited to ${L.primaryText[1]} characters.`);
      else if (c.primaryText.length > L.primaryText[0]) warn(p, 'creative.primaryText', `Primary text over ${L.primaryText[0]} characters gets cut off with "See more".`);
      if (h1.length > L.headline[0]) warn(p, 'creative.headlines', `Headlines over ${L.headline[0]} characters may be truncated on mobile.`);
      if (live && !t.pageId) err(p, 'targets.pageId', 'Select the Facebook Page the ads will run under (Connect page).');
    }

    if (p === 'google') {
      const L = LIMITS.google;
      const descs = c.descriptions.length ? c.descriptions : [c.primaryText];
      if (!spec.audience.keywords.length) err(p, 'audience.keywords', 'Google Search needs keywords: the searches you want to appear for.');
      else if (spec.audience.keywords.length < 5) warn(p, 'audience.keywords', 'Add 5–20 closely related keywords for enough search volume.');
      if (c.headlines.length < L.minHeadlines) err(p, 'creative.headlines', `Responsive search ads need at least ${L.minHeadlines} headlines (up to 15).`);
      const longH = c.headlines.filter((h) => h.length > L.headline);
      if (longH.length) err(p, 'creative.headlines', `Google headlines are max ${L.headline} characters: "${longH[0]}" has ${longH[0].length}.`);
      if (descs.length < L.minDescriptions) err(p, 'creative.descriptions', `Responsive search ads need at least ${L.minDescriptions} descriptions.`);
      const longD = descs.filter((d) => d.length > L.description);
      if (longD.length) err(p, 'creative.descriptions', `Google descriptions are max ${L.description} characters (one has ${longD[0].length}).`);
      if (c.headlines.length < 8 && c.headlines.length >= L.minHeadlines) tips.push('Google: give 8–15 distinct headlines. More variety lets Google test more combinations ("Ad strength").');
      if (spec.goal === 'awareness' || spec.goal === 'engagement') warn(p, 'goal', 'Google Search reaches people actively searching — it is best for traffic, leads and sales rather than awareness.');
    }

    if (p === 'tiktok') {
      const L = LIMITS.tiktok;
      const text = c.primaryText || h1;
      if (!c.videoUrl) err(p, 'creative.videoUrl', 'TikTok needs a vertical video (9:16, 5–60 seconds).');
      if (!c.imageUrl) err(p, 'creative.imageUrl', 'TikTok needs a cover image for the video.');
      if (text.length < L.adText[0] || text.length > L.adText[1]) err(p, 'creative.primaryText', `TikTok ad text must be ${L.adText[0]}–${L.adText[1]} characters (yours: ${text.length}).`);
      if ((c.brandName || spec.name).length > L.brandName) err(p, 'creative.brandName', `TikTok display name is max ${L.brandName} characters.`);
      if (!c.brandName) warn(p, 'creative.brandName', 'Set a brand name; it is shown as the ad\'s account name on TikTok.');
      if (spec.audience.ageMin < 18) warn(p, 'audience.ageMin', 'Vendo targets adults only (18+).');
    }

    if (p === 'linkedin') {
      const L = LIMITS.linkedin;
      if (c.primaryText.length > L.primaryText[1]) err(p, 'creative.primaryText', `LinkedIn intro text is limited to ${L.primaryText[1]} characters.`);
      else if (c.primaryText.length > L.primaryText[0]) warn(p, 'creative.primaryText', `Intro text over ${L.primaryText[0]} characters is truncated in the feed.`);
      if (h1.length > L.headline[1]) err(p, 'creative.headlines', `LinkedIn headlines are limited to ${L.headline[1]} characters.`);
      else if (h1.length > L.headline[0]) warn(p, 'creative.headlines', `Headlines over ${L.headline[0]} characters may be truncated.`);
      if (live && !t.organizationId) err(p, 'targets.organizationId', 'Select the LinkedIn Company Page that will post the ad (Connect page).');
      if (!c.imageUrl) warn(p, 'creative.imageUrl', 'Posts with an image (1200×627) get far more clicks than link-only posts.');
    }

    if (p === 'pinterest') {
      const L = LIMITS.pinterest;
      if (!c.imageUrl) err(p, 'creative.imageUrl', 'Pinterest ads need an image (2:3 vertical, e.g. 1000×1500, recommended).');
      if (h1.length > L.title) err(p, 'creative.headlines', `Pin titles are max ${L.title} characters.`);
      if ((c.primaryText || d1).length > L.description) err(p, 'creative.primaryText', `Pin descriptions are max ${L.description} characters.`);
      if (live && !t.boardId) err(p, 'targets.boardId', 'Select the Pinterest board for the ad Pin (Connect page).');
      if (c.imageUrl.startsWith('/uploads/') && live) warn(p, 'creative.imageUrl', 'Pinterest downloads the image from your PUBLIC_BASE_URL. Make sure this server is reachable from the internet, or use a public image URL.');
    }
  }
  if (spec.platforms.includes('tiktok') && ctx.modes?.tiktok === 'live' && (c.videoUrl.startsWith('/uploads/') || c.imageUrl.startsWith('/uploads/'))) {
    warn('tiktok', 'creative.videoUrl', 'TikTok downloads media from your PUBLIC_BASE_URL. Make sure this server is reachable from the internet, or use public URLs.');
  }

  return { ok: errors.length === 0, errors, warnings, tips: [...new Set(tips)] };
}

module.exports = { validateSpec, MIN_DAILY, LIMITS };
