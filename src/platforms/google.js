'use strict';
/**
 * Google Ads API (REST interface). Vendo launches Search campaigns: ads shown
 * on Google Search to people actively searching for your keywords.
 * Object hierarchy: Customer → Campaign Budget + Campaign → Campaign criteria
 * (locations, languages) → Ad Group → Keywords + Responsive Search Ad.
 * Docs: https://developers.google.com/google-ads/api/rest/overview
 */
const config = require('../config');
const { request } = require('../lib/apiClient');
const { micros, platformDailyBudget } = require('../engine/spec');
const geo = require('../engine/geo');

const NAME = 'Google Ads';
const base = () => `https://googleads.googleapis.com/${config.google.version}`;
const LANGUAGES = { en: 1000, de: 1001, fr: 1002, es: 1003, it: 1004, ja: 1005, nl: 1010, pt: 1014, sv: 1015, pl: 1030 };

/** Bidding strategy per goal. Conversion bidding needs conversion tracking set up in Google Ads. */
function bidding(spec) {
  if (['leads', 'sales'].includes(spec.goal) && spec.tracking.googleConversions) {
    return { field: 'maximizeConversions', value: {}, label: 'Maximize conversions' };
  }
  return { field: 'targetSpend', value: {}, label: 'Maximize clicks' };
}

const customer = (accountId) => String(accountId).replace(/\D/g, '');

const adapter = {
  id: 'google',
  name: NAME,
  products: 'Google Search (Search Network)',
  docsUrl: 'https://developers.google.com/google-ads/api/docs/start',
  assetFields: [],
  isConfigured: () => Boolean(config.google.clientId && config.google.clientSecret && config.google.developerToken),

  authUrl({ state, redirectUri }) {
    const q = new URLSearchParams({
      client_id: config.google.clientId, redirect_uri: redirectUri, response_type: 'code', state,
      scope: 'https://www.googleapis.com/auth/adwords', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { data } = await request({
      platform: NAME, method: 'POST', url: 'https://oauth2.googleapis.com/token',
      body: new URLSearchParams({ code, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  async refresh(conn) {
    const { data } = await request({
      platform: NAME, method: 'POST', url: 'https://oauth2.googleapis.com/token',
      body: new URLSearchParams({ refresh_token: conn.refreshToken, client_id: config.google.clientId, client_secret: config.google.clientSecret, grant_type: 'refresh_token' }),
    });
    return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  call(conn, opts) {
    const headers = { Authorization: `Bearer ${conn.accessToken}`, 'developer-token': config.google.developerToken, ...opts.headers };
    const loginCustomer = conn.settings?.loginCustomerId || config.google.loginCustomerId;
    if (loginCustomer) headers['login-customer-id'] = loginCustomer;
    return request({ platform: NAME, ...opts, url: opts.url.startsWith('http') ? opts.url : `${base()}${opts.url}`, headers });
  },

  async listAccounts(conn) {
    const { data } = await this.call(conn, { url: '/customers:listAccessibleCustomers' });
    const ids = (data.resourceNames || []).map((r) => r.split('/')[1]);
    const query = 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.test_account FROM customer LIMIT 1';
    const rows = await Promise.all(ids.map((id) => this.call(conn, { method: 'POST', url: `/customers/${id}/googleAds:search`, json: { query } })
      .then((r) => r.data.results?.[0]?.customer).catch(() => ({ id, descriptiveName: `Customer ${id}` }))));
    return rows.filter((c) => c && !c.manager).map((c) => ({
      id: String(c.id), name: `${c.descriptiveName || 'Unnamed account'} (${String(c.id).replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')})${c.testAccount ? ' [test]' : ''}`,
      currency: c.currencyCode, active: true,
    }));
  },

  async listAssets() { return {}; },

  plan(spec, { accountId }) {
    const cid = customer(accountId);
    const c = spec.creative;
    const bid = bidding(spec);
    const status = spec.activate ? 'ENABLED' : 'PAUSED';
    const stamp = Date.now().toString(36);
    const steps = [
      {
        key: 'budget',
        title: 'Create campaign budget',
        explain: 'In Google Ads the budget is its own object. Amounts are in "micros" (1 unit of currency = 1,000,000 micros). Google may spend up to 2× the daily budget on a busy day but never more than 30.4× daily budget in a month.',
        method: 'POST',
        url: `/customers/${cid}/campaignBudgets:mutate`,
        body: { operations: [{ create: { name: `${spec.name} budget ${stamp}`, amountMicros: String(micros(platformDailyBudget(spec, 'google'))), deliveryMethod: 'STANDARD', explicitlyShared: false } }] },
        extract: (d) => d.results[0].resourceName,
      },
      {
        key: 'campaign',
        title: 'Create Search campaign',
        explain: `A Search campaign shows text ads on Google results when people search for your keywords — people with intent. Bidding strategy: ${bid.label} (Smart Bidding sets bids automatically in each auction). It is created ${status} so nothing spends until you enable it.`,
        method: 'POST',
        url: `/customers/${cid}/campaigns:mutate`,
        body: (r) => ({
          operations: [{
            create: {
              name: `${spec.name} ${stamp}`,
              status,
              advertisingChannelType: 'SEARCH',
              campaignBudget: r.budget,
              [bid.field]: bid.value,
              networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false },
              containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
            },
          }],
        }),
        extract: (d) => d.results[0].resourceName,
      },
      {
        key: 'criteria',
        title: 'Target locations and language',
        explain: 'Campaign criteria restrict where ads can appear. Locations use Google\'s geo target constants; the language criterion matches the user\'s Google language setting.',
        method: 'POST',
        url: `/customers/${cid}/campaignCriteria:mutate`,
        body: (r) => {
          const ops = spec.audience.countries.map((cc) => geo.lookup(cc, 'google')).filter(Boolean)
            .map((id) => ({ create: { campaign: r.campaign, location: { geoTargetConstant: `geoTargetConstants/${id}` } } }));
          const lang = LANGUAGES[spec.audience.language];
          if (lang) ops.push({ create: { campaign: r.campaign, language: { languageConstant: `languageConstants/${lang}` } } });
          return { operations: ops };
        },
        extract: (d) => d.results.map((x) => x.resourceName),
      },
      {
        key: 'adGroup',
        title: 'Create ad group',
        explain: 'Ad groups bundle a theme of keywords with the ads that should show for them. Tight themes = more relevant ads = better Quality Score = cheaper clicks.',
        method: 'POST',
        url: `/customers/${cid}/adGroups:mutate`,
        body: (r) => ({ operations: [{ create: { name: `${spec.name} – ad group`, campaign: r.campaign, status: 'ENABLED', type: 'SEARCH_STANDARD' } }] }),
        extract: (d) => d.results[0].resourceName,
      },
      {
        key: 'keywords',
        title: 'Add keywords',
        explain: 'Keywords are what people type into Google. Vendo uses PHRASE match: your ad can show when the search includes the meaning of your keyword — broader than exact match, safer than broad match for beginners.',
        method: 'POST',
        url: `/customers/${cid}/adGroupCriteria:mutate`,
        body: (r) => ({ operations: spec.audience.keywords.map((text) => ({ create: { adGroup: r.adGroup, status: 'ENABLED', keyword: { text, matchType: 'PHRASE' } } })) }),
        extract: (d) => d.results.map((x) => x.resourceName),
      },
      {
        key: 'ad',
        title: 'Create responsive search ad',
        explain: 'Responsive search ads take 3–15 headlines (max 30 characters) and 2–4 descriptions (max 90 characters). Google tests combinations and learns which perform best.',
        method: 'POST',
        url: `/customers/${cid}/adGroupAds:mutate`,
        body: (r) => ({
          operations: [{
            create: {
              adGroup: r.adGroup,
              status: 'ENABLED',
              ad: {
                finalUrls: [c.url],
                responsiveSearchAd: {
                  headlines: c.headlines.map((text) => ({ text })),
                  descriptions: (c.descriptions.length ? c.descriptions : [c.primaryText]).map((text) => ({ text })),
                },
              },
            },
          }],
        }),
        extract: (d) => d.results[0].resourceName,
      },
    ];
    const notes = [];
    if (['leads', 'sales'].includes(spec.goal) && !spec.tracking.googleConversions) notes.push('Conversion tracking not confirmed, so Google uses "Maximize clicks" bidding.');
    if (spec.schedule.end) notes.push(`Google campaign has no end date set via Vendo; pause it from the dashboard on ${spec.schedule.end} or set an end date in Google Ads.`);
    return { steps, notes };
  },

  async setStatus(conn, { accountId, externalIds }, active) {
    await this.call(conn, {
      method: 'POST',
      url: `/customers/${customer(accountId)}/campaigns:mutate`,
      json: { operations: [{ update: { resourceName: externalIds.campaign, status: active ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' }] },
    });
  },

  async fetchMetrics(conn, { accountId, externalIds }) {
    const query = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.resource_name = '${externalIds.campaign}'`;
    const { data } = await this.call(conn, { method: 'POST', url: `/customers/${customer(accountId)}/googleAds:search`, json: { query } });
    const m = data.results?.[0]?.metrics || {};
    return {
      impressions: Number(m.impressions || 0),
      clicks: Number(m.clicks || 0),
      spend: Number(m.costMicros || 0) / 1e6,
      conversions: Number(m.conversions || 0),
      revenue: Number(m.conversionsValue || 0),
    };
  },
};

module.exports = adapter;
