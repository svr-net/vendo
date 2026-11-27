'use strict';
/**
 * Meta Marketing API (Facebook, Instagram, Messenger, Audience Network).
 * Object hierarchy: Ad Account → Campaign (objective) → Ad Set (budget, audience,
 * schedule, optimisation) → Ad (references an Ad Creative).
 * Docs: https://developers.facebook.com/docs/marketing-apis
 */
const config = require('../config');
const { request } = require('../lib/apiClient');
const { minorUnits, platformDailyBudget } = require('../engine/spec');
const { loadMedia, startMs, first } = require('./common');

const NAME = 'Meta';
const graph = () => `https://graph.facebook.com/${config.meta.version}`;
const SCOPES = ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads'];

const OBJECTIVES = {
  awareness: { objective: 'OUTCOME_AWARENESS', optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' },
  traffic: { objective: 'OUTCOME_TRAFFIC', optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS', destination_type: 'WEBSITE' },
  engagement: { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' },
  leads: { objective: 'OUTCOME_LEADS', optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS', event: 'LEAD', destination_type: 'WEBSITE' },
  sales: { objective: 'OUTCOME_SALES', optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS', event: 'PURCHASE', destination_type: 'WEBSITE' },
};

/** Conversion goals need a pixel; without one we fall back to traffic (validator warns the user). */
function objectiveFor(spec) {
  const o = OBJECTIVES[spec.goal];
  if (o.event && !spec.tracking.metaPixelId) return { ...OBJECTIVES.traffic, fallbackFrom: spec.goal };
  return o;
}

function targeting(spec) {
  const t = {
    geo_locations: { countries: spec.audience.countries },
    age_min: spec.audience.ageMin,
    age_max: spec.audience.ageMax,
    // Respect the user's age/gender as hard limits instead of letting Advantage+ audience expand them.
    targeting_automation: { advantage_audience: 0 },
  };
  if (spec.audience.gender !== 'all') t.genders = [spec.audience.gender === 'male' ? 1 : 2];
  return t;
}

const adapter = {
  id: 'meta',
  name: NAME,
  products: 'Facebook, Instagram, Messenger, Audience Network',
  docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
  assetFields: [
    { key: 'pageId', label: 'Facebook Page (ads run under its name)', source: 'pages', required: true },
    { key: 'pixelId', label: 'Meta Pixel (for leads/sales optimisation)', source: 'pixels', required: false },
  ],
  isConfigured: () => Boolean(config.meta.appId && config.meta.appSecret),

  authUrl({ state, redirectUri }) {
    const q = new URLSearchParams({ client_id: config.meta.appId, redirect_uri: redirectUri, state, scope: SCOPES.join(','), response_type: 'code' });
    return `https://www.facebook.com/${config.meta.version}/dialog/oauth?${q}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const short = await request({ platform: NAME, url: `${graph()}/oauth/access_token?${new URLSearchParams({ client_id: config.meta.appId, client_secret: config.meta.appSecret, redirect_uri: redirectUri, code })}` });
    // Swap for a long-lived (~60 day) user token.
    const long = await request({ platform: NAME, url: `${graph()}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: config.meta.appId, client_secret: config.meta.appSecret, fb_exchange_token: short.data.access_token })}` });
    return { accessToken: long.data.access_token, expiresAt: long.data.expires_in ? Date.now() + long.data.expires_in * 1000 : null };
  },

  call(conn, opts) {
    return request({ platform: NAME, ...opts, url: opts.url.startsWith('http') ? opts.url : `${graph()}${opts.url}`, headers: { Authorization: `Bearer ${conn.accessToken}`, ...opts.headers } });
  },

  async listAccounts(conn) {
    const { data } = await this.call(conn, { url: '/me/adaccounts?fields=id,name,currency,account_status&limit=200' });
    return (data.data || []).map((a) => ({ id: a.id, name: a.name, currency: a.currency, active: a.account_status === 1 }));
  },

  async listAssets(conn, accountId) {
    const [pages, pixels] = await Promise.all([
      this.call(conn, { url: '/me/accounts?fields=id,name&limit=200' }).then((r) => r.data.data || []).catch(() => []),
      accountId ? this.call(conn, { url: `/${accountId}/adspixels?fields=id,name&limit=100` }).then((r) => r.data.data || []).catch(() => []) : [],
    ]);
    return { pages: pages.map((p) => ({ id: p.id, name: p.name })), pixels: pixels.map((p) => ({ id: p.id, name: p.name })) };
  },

  plan(spec, { accountId, currency, targets = {} }) {
    const o = objectiveFor(spec);
    const c = spec.creative;
    const pixelId = targets.pixelId || spec.tracking.metaPixelId;
    const steps = [];
    if (c.imageUrl) {
      steps.push({
        key: 'imageHash',
        title: 'Upload ad image',
        explain: 'Images are uploaded to the ad account\'s image library once and referenced by a hash. The same image can be reused across many ads.',
        method: 'POST',
        url: `/${accountId}/adimages`,
        preview: { bytes: '<base64 image bytes>' },
        async run(ctx) {
          const media = await loadMedia(c.imageUrl, NAME);
          const { data } = await ctx.call({ method: 'POST', url: `/${accountId}/adimages`, json: { bytes: media.bytes.toString('base64') } });
          return first(Object.values(data.images || {}), {}).hash;
        },
      });
    }
    steps.push({
      key: 'campaign',
      title: 'Create campaign',
      explain: `The campaign holds the objective (${o.objective}). Meta's algorithm optimises delivery for this outcome. It is created ${spec.activate ? 'ACTIVE' : 'PAUSED'} so nothing spends until you switch it on.`,
      method: 'POST',
      url: `/${accountId}/campaigns`,
      body: {
        name: spec.name,
        objective: o.objective,
        status: spec.activate ? 'ACTIVE' : 'PAUSED',
        buying_type: 'AUCTION',
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
      },
      extract: (d) => d.id,
    });
    steps.push({
      key: 'adset',
      title: 'Create ad set (audience, budget, schedule)',
      explain: `The ad set decides WHO sees the ad (${spec.audience.countries.join(', ')}, ages ${spec.audience.ageMin}-${spec.audience.ageMax}), HOW MUCH to spend per day, and WHAT to optimise for (${o.optimization_goal}). Budgets are sent in the currency's minor unit (e.g. cents). Placements are automatic (Advantage+ placements), which usually gives the lowest cost.`,
      method: 'POST',
      url: `/${accountId}/adsets`,
      body: (r) => {
        const b = {
          name: `${spec.name} – ad set`,
          campaign_id: r.campaign,
          daily_budget: minorUnits(platformDailyBudget(spec, 'meta'), currency || spec.budget.currency),
          billing_event: o.billing_event,
          optimization_goal: o.optimization_goal,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: targeting(spec),
          start_time: new Date(startMs(spec.schedule.start)).toISOString(),
          status: 'ACTIVE',
        };
        if (o.destination_type) b.destination_type = o.destination_type;
        if (spec.schedule.end) b.end_time = new Date(`${spec.schedule.end}T23:59:59Z`).toISOString();
        if (o.event && pixelId) b.promoted_object = { pixel_id: pixelId, custom_event_type: o.event };
        return b;
      },
      extract: (d) => d.id,
    });
    steps.push({
      key: 'creative',
      title: 'Create ad creative',
      explain: 'The creative is the ad people see: primary text above the image, the image, a headline and a call-to-action button. It is published under your Facebook Page (and its linked Instagram account).',
      method: 'POST',
      url: `/${accountId}/adcreatives`,
      body: (r) => ({
        name: `${spec.name} – creative`,
        object_story_spec: {
          page_id: targets.pageId || '<page id>',
          link_data: {
            link: c.url,
            message: c.primaryText,
            name: first(c.headlines),
            description: first(c.descriptions),
            ...(c.imageUrl ? { image_hash: r.imageHash } : {}),
            call_to_action: { type: c.cta, value: { link: c.url } },
          },
        },
      }),
      extract: (d) => d.id,
    });
    steps.push({
      key: 'ad',
      title: 'Create ad',
      explain: 'The ad links the creative to the ad set. Ads go through Meta\'s automated review (usually within 24 hours) before delivering.',
      method: 'POST',
      url: `/${accountId}/ads`,
      body: (r) => ({ name: `${spec.name} – ad`, adset_id: r.adset, creative: { creative_id: r.creative }, status: 'ACTIVE' }),
      extract: (d) => d.id,
    });
    return { steps, notes: o.fallbackFrom ? [`No Meta Pixel selected, so this "${o.fallbackFrom}" campaign is launched with the Traffic objective.`] : [] };
  },

  async setStatus(conn, { externalIds }, active) {
    await this.call(conn, { method: 'POST', url: `/${externalIds.campaign}`, json: { status: active ? 'ACTIVE' : 'PAUSED' } });
  },

  async fetchMetrics(conn, { externalIds }) {
    const fields = 'impressions,reach,clicks,inline_link_clicks,spend,actions,action_values';
    const { data } = await this.call(conn, { url: `/${externalIds.campaign}/insights?fields=${fields}&date_preset=maximum` });
    const row = first(data.data, {});
    const actions = row.actions || [];
    const sum = (list, types) => list.filter((a) => types.some((t) => a.action_type.includes(t))).reduce((s, a) => s + Number(a.value), 0);
    return {
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      clicks: Number(row.inline_link_clicks || row.clicks || 0),
      spend: Number(row.spend || 0),
      conversions: sum(actions, ['purchase', 'lead']),
      revenue: sum(row.action_values || [], ['purchase']),
    };
  },
};

module.exports = adapter;
