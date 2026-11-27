'use strict';
/**
 * TikTok API for Business (Marketing API v1.3).
 * Object hierarchy: Advertiser → Campaign (objective) → Ad Group (audience,
 * budget, schedule, placement, optimisation) → Ad (video + identity + text).
 * Docs: https://business-api.tiktok.com/portal/docs
 */
const config = require('../config');
const { request } = require('../lib/apiClient');
const { platformDailyBudget } = require('../engine/spec');
const geo = require('../engine/geo');
const { absoluteUrl, startMs, first } = require('./common');

const NAME = 'TikTok';
const BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const isError = (body) => typeof body?.code === 'number' && body.code !== 0;

const OBJECTIVES = {
  awareness: { objective_type: 'REACH', optimization_goal: 'REACH', billing_event: 'CPM' },
  traffic: { objective_type: 'TRAFFIC', optimization_goal: 'CLICK', billing_event: 'CPC' },
  engagement: { objective_type: 'VIDEO_VIEWS', optimization_goal: 'ENGAGED_VIEW', billing_event: 'OCPM' },
  leads: { objective_type: 'WEB_CONVERSIONS', optimization_goal: 'CONVERT', billing_event: 'OCPM', event: 'FORM' },
  sales: { objective_type: 'WEB_CONVERSIONS', optimization_goal: 'CONVERT', billing_event: 'OCPM', event: 'SHOPPING' },
};

const AGE_GROUPS = [[13, 17, 'AGE_13_17'], [18, 24, 'AGE_18_24'], [25, 34, 'AGE_25_34'], [35, 44, 'AGE_35_44'], [45, 54, 'AGE_45_54'], [55, 100, 'AGE_55_100']];
const CTA = { DOWNLOAD: 'DOWNLOAD_NOW' };

function objectiveFor(spec, pixelId) {
  const o = OBJECTIVES[spec.goal];
  if (o.event && !pixelId) return { ...OBJECTIVES.traffic, fallbackFrom: spec.goal };
  return o;
}

function ageGroups({ ageMin, ageMax }) {
  if (ageMin <= 18 && ageMax >= 65) return []; // empty = all ages 18+
  return AGE_GROUPS.filter(([lo, hi]) => hi >= ageMin && lo <= ageMax && lo >= 18).map((g) => g[2]);
}

/** TikTok expects "YYYY-MM-DD HH:MM:SS" in UTC. */
const tkTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

const adapter = {
  id: 'tiktok',
  name: NAME,
  products: 'TikTok, Pangle, CapCut placements',
  docsUrl: 'https://business-api.tiktok.com/portal/docs',
  assetFields: [
    { key: 'pixelId', label: 'TikTok Pixel (for leads/sales optimisation)', source: 'pixels', required: false },
  ],
  isConfigured: () => Boolean(config.tiktok.appId && config.tiktok.appSecret),

  authUrl({ state, redirectUri }) {
    return `https://business-api.tiktok.com/portal/auth?${new URLSearchParams({ app_id: config.tiktok.appId, state, redirect_uri: redirectUri })}`;
  },

  async exchangeCode({ code }) {
    const { data } = await request({
      platform: NAME, method: 'POST', url: `${BASE}/oauth2/access_token/`, isError,
      json: { app_id: config.tiktok.appId, secret: config.tiktok.appSecret, auth_code: code },
    });
    // Marketing API tokens do not expire unless revoked.
    return { accessToken: data.data.access_token, expiresAt: null, settings: { advertiserIds: data.data.advertiser_ids || [] } };
  },

  call(conn, opts) {
    return request({ platform: NAME, isError, ...opts, url: opts.url.startsWith('http') ? opts.url : `${BASE}${opts.url}`, headers: { 'Access-Token': conn.accessToken, ...opts.headers } });
  },

  async listAccounts(conn) {
    const q = new URLSearchParams({ app_id: config.tiktok.appId, secret: config.tiktok.appSecret });
    const { data } = await this.call(conn, { url: `/oauth2/advertiser/get/?${q}` });
    const list = data.data?.list || [];
    let info = [];
    if (list.length) {
      const ids = JSON.stringify(list.map((a) => String(a.advertiser_id)));
      info = await this.call(conn, { url: `/advertiser/info/?advertiser_ids=${encodeURIComponent(ids)}&fields=${encodeURIComponent('["advertiser_id","name","currency","status"]')}` })
        .then((r) => r.data.data?.list || []).catch(() => []);
    }
    return list.map((a) => {
      const i = info.find((x) => String(x.advertiser_id) === String(a.advertiser_id)) || {};
      return { id: String(a.advertiser_id), name: a.advertiser_name || i.name, currency: i.currency, active: !i.status || i.status === 'STATUS_ENABLE' };
    });
  },

  async listAssets(conn, accountId) {
    if (!accountId) return {};
    const pixels = await this.call(conn, { url: `/pixel/list/?advertiser_id=${accountId}&page_size=20` })
      .then((r) => r.data.data?.pixels || []).catch(() => []);
    return { pixels: pixels.map((p) => ({ id: String(p.pixel_id), name: p.pixel_name })) };
  },

  plan(spec, { accountId, targets = {} }) {
    const c = spec.creative;
    const pixelId = targets.pixelId || spec.tracking.tiktokPixelId;
    const o = objectiveFor(spec, pixelId);
    const advertiser_id = String(accountId);
    const steps = [
      {
        key: 'video',
        title: 'Upload video',
        explain: 'TikTok is a video-first platform: in-feed ads must be vertical video (9:16 recommended, 5–60 s). TikTok downloads the file from the URL you provide.',
        method: 'POST',
        url: '/file/video/ad/upload/',
        body: { advertiser_id, upload_type: 'UPLOAD_BY_URL', video_url: absoluteUrl(c.videoUrl), file_name: `vendo-${Date.now()}` },
        extract: (d) => (Array.isArray(d.data) ? d.data[0] : d.data).video_id,
      },
      {
        key: 'cover',
        title: 'Upload cover image',
        explain: 'Each video ad needs a cover (thumbnail) image shown before the video plays.',
        method: 'POST',
        url: '/file/image/ad/upload/',
        body: { advertiser_id, upload_type: 'UPLOAD_BY_URL', image_url: absoluteUrl(c.imageUrl), file_name: `vendo-cover-${Date.now()}` },
        extract: (d) => d.data.image_id,
      },
      {
        key: 'identity',
        title: 'Create ad identity',
        explain: 'The identity is the name shown on your ad (like the account name on an organic TikTok). Vendo creates a custom identity with your brand name.',
        method: 'POST',
        url: '/identity/create/',
        body: { advertiser_id, display_name: (c.brandName || spec.name).slice(0, 40) },
        extract: (d) => d.data.identity_id,
      },
      {
        key: 'campaign',
        title: 'Create campaign',
        explain: `Objective ${o.objective_type}. Budget is controlled on the ad group, so the campaign budget is unlimited. Created ${spec.activate ? 'enabled' : 'disabled'}.`,
        method: 'POST',
        url: '/campaign/create/',
        body: { advertiser_id, campaign_name: spec.name, objective_type: o.objective_type, budget_mode: 'BUDGET_MODE_INFINITE', operation_status: spec.activate ? 'ENABLE' : 'DISABLE' },
        extract: (d) => d.data.campaign_id,
      },
      {
        key: 'adgroup',
        title: 'Create ad group (audience, budget, schedule)',
        explain: `Automatic placement lets TikTok find the cheapest results across its apps. Daily budget ${platformDailyBudget(spec, 'tiktok')} ${spec.budget.currency} (TikTok's minimum is about 20 USD per ad group per day). Optimisation goal: ${o.optimization_goal}, no bid cap ("lowest cost").`,
        method: 'POST',
        url: '/adgroup/create/',
        body: (r) => {
          const start = startMs(spec.schedule.start);
          const b = {
            advertiser_id,
            campaign_id: r.campaign,
            adgroup_name: `${spec.name} – ad group`,
            promotion_type: 'WEBSITE',
            placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
            location_ids: spec.audience.countries.map((cc) => geo.lookup(cc, 'tiktok')).filter(Boolean).map(String),
            gender: spec.audience.gender === 'all' ? 'GENDER_UNLIMITED' : `GENDER_${spec.audience.gender.toUpperCase()}`,
            age_groups: ageGroups(spec.audience),
            budget_mode: 'BUDGET_MODE_DAY',
            budget: platformDailyBudget(spec, 'tiktok'),
            schedule_type: spec.schedule.end ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW',
            schedule_start_time: tkTime(start),
            optimization_goal: o.optimization_goal,
            billing_event: o.billing_event,
            bid_type: 'BID_TYPE_NO_BID',
            pacing: 'PACING_MODE_SMOOTH',
            operation_status: 'ENABLE',
          };
          if (spec.schedule.end) b.schedule_end_time = tkTime(new Date(`${spec.schedule.end}T23:59:59Z`).getTime());
          if (o.event) { b.pixel_id = pixelId; b.optimization_event = o.event; }
          if (!b.age_groups.length) delete b.age_groups;
          return b;
        },
        extract: (d) => d.data.adgroup_id,
      },
      {
        key: 'ad',
        title: 'Create ad',
        explain: 'The ad combines video, cover, identity, ad text (12–100 characters, emojis allowed) and a call-to-action button. TikTok reviews ads before delivery, typically within 24 hours.',
        method: 'POST',
        url: '/ad/create/',
        body: (r) => ({
          advertiser_id,
          adgroup_id: r.adgroup,
          creatives: [{
            ad_name: `${spec.name} – ad`,
            identity_type: 'CUSTOMIZED_USER',
            identity_id: r.identity,
            ad_format: 'SINGLE_VIDEO',
            video_id: r.video,
            image_ids: [r.cover],
            ad_text: (c.primaryText || first(c.headlines)).slice(0, 100),
            call_to_action: CTA[c.cta] || c.cta,
            landing_page_url: c.url,
          }],
        }),
        extract: (d) => first(d.data.ad_ids),
      },
    ];
    return { steps, notes: o.fallbackFrom ? [`No TikTok Pixel selected, so this "${o.fallbackFrom}" campaign is launched with the Traffic objective.`] : [] };
  },

  async setStatus(conn, { accountId, externalIds }, active) {
    await this.call(conn, { method: 'POST', url: '/campaign/status/update/', json: { advertiser_id: String(accountId), campaign_ids: [String(externalIds.campaign)], operation_status: active ? 'ENABLE' : 'DISABLE' } });
  },

  async fetchMetrics(conn, { accountId, externalIds }) {
    const q = new URLSearchParams({
      advertiser_id: String(accountId),
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: JSON.stringify(['campaign_id']),
      metrics: JSON.stringify(['spend', 'impressions', 'clicks', 'reach', 'conversion']),
      query_lifetime: 'true',
      filtering: JSON.stringify([{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([String(externalIds.campaign)]) }]),
    });
    const { data } = await this.call(conn, { url: `/report/integrated/get/?${q}` });
    const m = first(data.data?.list, {}).metrics || {};
    return { impressions: Number(m.impressions || 0), reach: Number(m.reach || 0), clicks: Number(m.clicks || 0), spend: Number(m.spend || 0), conversions: Number(m.conversion || 0), revenue: 0 };
  },
};

module.exports = adapter;
