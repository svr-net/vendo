'use strict';
/**
 * Pinterest API v5 (Ads).
 * Object hierarchy: Ad Account → Campaign (objective) → Ad Group (audience,
 * budget, schedule) → Ad (promotes a Pin saved to one of your boards).
 * Docs: https://developers.pinterest.com/docs/api/v5/
 */
const config = require('../config');
const { request, PlatformError } = require('../lib/apiClient');
const { micros, platformDailyBudget } = require('../engine/spec');
const { absoluteUrl, unixSeconds, startMs, first } = require('./common');

const NAME = 'Pinterest';
const BASE = 'https://api.pinterest.com/v5';
const SCOPES = ['ads:read', 'ads:write', 'boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read'];

const OBJECTIVES = {
  awareness: { objective_type: 'AWARENESS', billable_event: 'IMPRESSION' },
  traffic: { objective_type: 'CONSIDERATION', billable_event: 'CLICKTHROUGH' },
  engagement: { objective_type: 'CONSIDERATION', billable_event: 'CLICKTHROUGH' },
  leads: { objective_type: 'WEB_CONVERSION', billable_event: 'IMPRESSION', event: 'LEAD' },
  sales: { objective_type: 'WEB_CONVERSION', billable_event: 'IMPRESSION', event: 'CHECKOUT' },
};
const AGE_BUCKETS = [[18, 24, '18-24'], [25, 34, '25-34'], [35, 44, '35-44'], [45, 49, '45-49'], [50, 54, '50-54'], [55, 64, '55-64'], [65, 200, '65+']];

function objectiveFor(spec, tagId) {
  const o = OBJECTIVES[spec.goal];
  if (o.event && !tagId) return { ...OBJECTIVES.traffic, fallbackFrom: spec.goal };
  return o;
}

/** Bulk endpoints return { items: [{ data, exceptions }] }. */
function bulkId(d, platform = NAME) {
  const item = first(d.items, {});
  if (item.exceptions?.length) throw new PlatformError(platform, item.exceptions.map((e) => e.message).join('; '), { body: d });
  return item.data?.id;
}

function basicAuth() {
  return `Basic ${Buffer.from(`${config.pinterest.appId}:${config.pinterest.appSecret}`).toString('base64')}`;
}

const adapter = {
  id: 'pinterest',
  name: NAME,
  products: 'Pinterest home feed, search and related Pins',
  docsUrl: 'https://developers.pinterest.com/docs/api/v5/',
  assetFields: [
    { key: 'boardId', label: 'Board where the ad Pin is saved', source: 'boards', required: true },
  ],
  isConfigured: () => Boolean(config.pinterest.appId && config.pinterest.appSecret),

  authUrl({ state, redirectUri }) {
    return `https://www.pinterest.com/oauth/?${new URLSearchParams({ client_id: config.pinterest.appId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(','), state })}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { data } = await request({
      platform: NAME, method: 'POST', url: `${BASE}/oauth/token`, headers: { Authorization: basicAuth() },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  async refresh(conn) {
    const { data } = await request({
      platform: NAME, method: 'POST', url: `${BASE}/oauth/token`, headers: { Authorization: basicAuth() },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken }),
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token || conn.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  call(conn, opts) {
    return request({ platform: NAME, ...opts, url: opts.url.startsWith('http') ? opts.url : `${BASE}${opts.url}`, headers: { Authorization: `Bearer ${conn.accessToken}`, ...opts.headers } });
  },

  async listAccounts(conn) {
    const { data } = await this.call(conn, { url: '/ad_accounts?page_size=100' });
    return (data.items || []).map((a) => ({ id: String(a.id), name: a.name, currency: a.currency, active: true }));
  },

  async listAssets(conn) {
    const { data } = await this.call(conn, { url: '/boards?page_size=100' }).catch(() => ({ data: {} }));
    return { boards: (data.items || []).map((b) => ({ id: String(b.id), name: b.name })) };
  },

  plan(spec, { accountId, targets = {} }) {
    const c = spec.creative;
    const tagId = targets.tagId || spec.tracking.pinterestTagId;
    const o = objectiveFor(spec, tagId);
    const acct = String(accountId);
    const start = Math.floor(startMs(spec.schedule.start) / 1000);
    const end = spec.schedule.end ? unixSeconds(spec.schedule.end, true) : undefined;
    const steps = [
      {
        key: 'pin',
        title: 'Create Pin',
        explain: 'Every Pinterest ad promotes a Pin. Vendo creates a new Pin on your board with your image, title, description and destination link. Vertical 2:3 images (e.g. 1000×1500) perform best.',
        method: 'POST',
        url: '/pins',
        body: {
          board_id: targets.boardId || '<board id>',
          title: first(c.headlines).slice(0, 100),
          description: (c.primaryText || first(c.descriptions)).slice(0, 500),
          link: c.url,
          media_source: { source_type: 'image_url', url: absoluteUrl(c.imageUrl) },
        },
        extract: (d) => d.id,
      },
      {
        key: 'campaign',
        title: 'Create campaign',
        explain: `Objective ${o.objective_type}. Created ${spec.activate ? 'ACTIVE' : 'PAUSED'}.`,
        method: 'POST',
        url: `/ad_accounts/${acct}/campaigns`,
        body: [{ ad_account_id: acct, name: spec.name, status: spec.activate ? 'ACTIVE' : 'PAUSED', objective_type: o.objective_type, start_time: start, ...(end ? { end_time: end } : {}) }],
        extract: (d) => bulkId(d),
      },
      {
        key: 'adGroup',
        title: 'Create ad group (audience, budget, schedule)',
        explain: 'Budgets are in micro-currency (1 unit = 1,000,000). Automatic bidding and "auto targeting" let Pinterest expand to people likely to engage based on your Pin content — the recommended setup for new advertisers.',
        method: 'POST',
        url: `/ad_accounts/${acct}/ad_groups`,
        body: (r) => {
          const { ageMin, ageMax, gender, countries } = spec.audience;
          const targeting_spec = { GEO: countries };
          if (ageMin > 18 || ageMax < 65) targeting_spec.AGE_BUCKET = AGE_BUCKETS.filter(([lo, hi]) => hi >= ageMin && lo <= ageMax).map((b) => b[2]);
          if (gender !== 'all') targeting_spec.GENDER = [gender];
          const g = {
            ad_account_id: acct,
            campaign_id: r.campaign,
            name: `${spec.name} – ad group`,
            status: 'ACTIVE',
            budget_type: 'DAILY',
            budget_in_micro_currency: micros(platformDailyBudget(spec, 'pinterest')),
            billable_event: o.billable_event,
            bid_strategy_type: 'AUTOMATIC_BID',
            auto_targeting_enabled: true,
            targeting_spec,
            start_time: start,
            ...(end ? { end_time: end } : {}),
          };
          if (o.event) {
            g.optimization_goal_metadata = { conversion_tag_v3_goal_metadata: { conversion_tag_id: tagId, conversion_event: o.event, attribution_windows: { click: 30, engagement: 30, view: 1 } } };
          }
          return [g];
        },
        extract: (d) => bulkId(d),
      },
      {
        key: 'ad',
        title: 'Create ad',
        explain: 'The ad promotes your Pin within the ad group. Pinterest reviews ads before they run.',
        method: 'POST',
        url: `/ad_accounts/${acct}/ads`,
        body: (r) => [{ ad_group_id: r.adGroup, creative_type: 'REGULAR', pin_id: r.pin, name: `${spec.name} – ad`, status: 'ACTIVE', destination_url: c.url }],
        extract: (d) => bulkId(d),
      },
    ];
    return { steps, notes: o.fallbackFrom ? [`No Pinterest tag configured, so this "${o.fallbackFrom}" campaign is launched with the Consideration (traffic) objective.`] : [] };
  },

  async setStatus(conn, { accountId, externalIds }, active) {
    const { data } = await this.call(conn, { method: 'PATCH', url: `/ad_accounts/${accountId}/campaigns`, json: [{ id: externalIds.campaign, ad_account_id: String(accountId), status: active ? 'ACTIVE' : 'PAUSED' }] });
    bulkId(data);
  },

  async fetchMetrics(conn, { accountId, externalIds, launchedAt }) {
    const end = new Date();
    const start = new Date(Math.max(new Date(launchedAt || end).getTime(), end.getTime() - 89 * 864e5));
    const q = new URLSearchParams({
      start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10),
      campaign_ids: externalIds.campaign, granularity: 'TOTAL',
      columns: 'SPEND_IN_MICRO_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,TOTAL_CONVERSIONS,TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR',
    });
    const { data } = await this.call(conn, { url: `/ad_accounts/${accountId}/campaigns/analytics?${q}` });
    const m = first(data, {});
    return {
      impressions: Number(m.IMPRESSION_1 || 0), clicks: Number(m.CLICKTHROUGH_1 || 0), spend: Number(m.SPEND_IN_MICRO_DOLLAR || 0) / 1e6,
      conversions: Number(m.TOTAL_CONVERSIONS || 0), revenue: Number(m.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) / 1e6,
    };
  },
};

module.exports = adapter;
