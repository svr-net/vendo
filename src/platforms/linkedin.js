'use strict';
/**
 * LinkedIn Marketing API (versioned REST, /rest/*).
 * Object hierarchy: Ad Account → Campaign Group → Campaign (objective, audience,
 * budget, bid) → Creative (references a sponsored Post from your Company Page).
 * Docs: https://learn.microsoft.com/linkedin/marketing/
 */
const config = require('../config');
const { request } = require('../lib/apiClient');
const { platformDailyBudget } = require('../engine/spec');
const geo = require('../engine/geo');
const { loadMedia, startMs, first } = require('./common');

const NAME = 'LinkedIn';
const BASE = 'https://api.linkedin.com/rest';
const SCOPES = ['r_ads', 'rw_ads', 'r_ads_reporting', 'r_organization_social', 'w_organization_social'];

const OBJECTIVES = {
  awareness: { objectiveType: 'BRAND_AWARENESS', costType: 'CPM', unitCost: 30 },
  traffic: { objectiveType: 'WEBSITE_VISIT', costType: 'CPC', unitCost: 6 },
  engagement: { objectiveType: 'ENGAGEMENT', costType: 'CPC', unitCost: 5 },
  leads: { objectiveType: 'WEBSITE_CONVERSION', costType: 'CPC', unitCost: 8, needsConversion: true },
  sales: { objectiveType: 'WEBSITE_CONVERSION', costType: 'CPC', unitCost: 8, needsConversion: true },
};
const AGE_RANGES = [[18, 24, '(18,24)'], [25, 34, '(25,34)'], [35, 54, '(35,54)'], [55, 200, '(55,2147483647)']];

function objectiveFor(spec, conversionId) {
  const o = OBJECTIVES[spec.goal];
  if (o.needsConversion && !conversionId) return { ...OBJECTIVES.traffic, fallbackFrom: spec.goal };
  return o;
}

/** LinkedIn returns created ids in the x-restli-id header. */
const restliId = (headers) => decodeURIComponent(headers.get('x-restli-id') || '');
const accountUrn = (id) => `urn:li:sponsoredAccount:${id}`;

function targetingCriteria(spec) {
  const and = [
    { or: { 'urn:li:adTargetingFacet:locations': spec.audience.countries.map((cc) => geo.lookup(cc, 'linkedin')).filter(Boolean).map((id) => `urn:li:geo:${id}`) } },
    { or: { 'urn:li:adTargetingFacet:interfaceLocales': [`urn:li:locale:${spec.audience.language}_${spec.audience.language === 'en' ? 'US' : spec.audience.language.toUpperCase()}`] } },
  ];
  const { ageMin, ageMax } = spec.audience;
  if (ageMin > 18 || ageMax < 65) {
    const ranges = AGE_RANGES.filter(([lo, hi]) => hi >= ageMin && lo <= ageMax).map((r) => `urn:li:ageRange:${r[2]}`);
    and.push({ or: { 'urn:li:adTargetingFacet:ageRanges': ranges } });
  }
  return { include: { and } };
}

const adapter = {
  id: 'linkedin',
  name: NAME,
  products: 'LinkedIn feed (Sponsored Content)',
  docsUrl: 'https://learn.microsoft.com/linkedin/marketing/integrations/ads/getting-started',
  assetFields: [
    { key: 'organizationId', label: 'Company Page (the ad is posted by this page)', source: 'organizations', required: true },
  ],
  isConfigured: () => Boolean(config.linkedin.clientId && config.linkedin.clientSecret),

  authUrl({ state, redirectUri }) {
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: config.linkedin.clientId, redirect_uri: redirectUri, state, scope: SCOPES.join(' ') })}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { data } = await request({
      platform: NAME, method: 'POST', url: 'https://www.linkedin.com/oauth/v2/accessToken',
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: config.linkedin.clientId, client_secret: config.linkedin.clientSecret }),
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token || null, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  async refresh(conn) {
    if (!conn.refreshToken) throw new Error('LinkedIn token expired. Please reconnect LinkedIn.');
    const { data } = await request({
      platform: NAME, method: 'POST', url: 'https://www.linkedin.com/oauth/v2/accessToken',
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken, client_id: config.linkedin.clientId, client_secret: config.linkedin.clientSecret }),
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token || conn.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
  },

  call(conn, opts) {
    return request({
      platform: NAME, ...opts,
      url: opts.url.startsWith('http') ? opts.url : `${BASE}${opts.url}`,
      headers: { Authorization: `Bearer ${conn.accessToken}`, 'LinkedIn-Version': config.linkedin.version, 'X-Restli-Protocol-Version': '2.0.0', ...opts.headers },
    });
  },

  async listAccounts(conn) {
    const { data } = await this.call(conn, { url: '/adAccounts?q=search&search=(status:(values:List(ACTIVE)))&count=100' });
    return (data.elements || []).map((a) => ({ id: String(a.id), name: a.name, currency: a.currency, active: a.status === 'ACTIVE', reference: a.reference }));
  },

  async listAssets(conn, accountId) {
    // An ad account's "reference" is the Company Page it advertises for.
    const accounts = await this.listAccounts(conn).catch(() => []);
    const orgs = new Map();
    for (const a of accounts) {
      if (!a.reference?.startsWith('urn:li:organization:')) continue;
      const id = a.reference.split(':').pop();
      if (!accountId || a.id === String(accountId) || !orgs.size) orgs.set(id, { id, name: `Company page ${id} (linked to ${a.name})` });
    }
    await Promise.all([...orgs.values()].map((o) => this.call(conn, { url: `/organizations/${o.id}` })
      .then((r) => { o.name = r.data.localizedName || o.name; }).catch(() => {})));
    return { organizations: [...orgs.values()] };
  },

  plan(spec, { accountId, currency, targets = {} }) {
    const c = spec.creative;
    const o = objectiveFor(spec, spec.tracking.linkedinConversionId);
    const acct = String(accountId);
    const cur = currency || spec.budget.currency;
    const orgUrn = `urn:li:organization:${targets.organizationId || '<organization id>'}`;
    const start = startMs(spec.schedule.start);
    const runSchedule = { start, ...(spec.schedule.end ? { end: new Date(`${spec.schedule.end}T23:59:59Z`).getTime() } : {}) };
    const steps = [
      {
        key: 'group',
        title: 'Create campaign group',
        explain: 'Campaign groups organise related campaigns (for example, one per product launch) and can hold a shared schedule or total budget.',
        method: 'POST',
        url: `/adAccounts/${acct}/adCampaignGroups`,
        body: { account: accountUrn(acct), name: spec.name, status: 'ACTIVE', runSchedule },
        extract: (d, h) => restliId(h) || d.id,
      },
    ];
    if (c.imageUrl) {
      steps.push({
        key: 'image',
        title: 'Upload image',
        explain: 'Images are uploaded in two steps: Vendo asks LinkedIn for an upload URL, then sends the bytes. The returned image URN is used as the post thumbnail.',
        method: 'POST',
        url: '/images?action=initializeUpload',
        preview: { initializeUploadRequest: { owner: orgUrn } },
        async run(ctx) {
          const { data } = await ctx.call({ method: 'POST', url: '/images?action=initializeUpload', json: { initializeUploadRequest: { owner: orgUrn } } });
          const media = await loadMedia(c.imageUrl, NAME);
          const put = await fetch(data.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${ctx.conn.accessToken}` }, body: media.bytes });
          if (!put.ok) throw new Error(`LinkedIn image upload failed (HTTP ${put.status})`);
          return data.value.image;
        },
      });
    }
    steps.push(
      {
        key: 'campaign',
        title: 'Create campaign (audience, budget, bid)',
        explain: `Objective ${o.objectiveType}, charged per ${o.costType === 'CPM' ? '1,000 impressions' : 'click'}. LinkedIn is the most expensive platform per click but lets you reach professionals by job, company and seniority. Starting bid ${o.unitCost} ${cur}; minimum daily budget is 10 USD. Created ${spec.activate ? 'ACTIVE' : 'PAUSED'}.`,
        method: 'POST',
        url: `/adAccounts/${acct}/adCampaigns`,
        body: (r) => ({
          account: accountUrn(acct),
          campaignGroup: `urn:li:sponsoredCampaignGroup:${r.group}`,
          name: spec.name,
          type: 'SPONSORED_UPDATES',
          objectiveType: o.objectiveType,
          costType: o.costType,
          unitCost: { amount: String(o.unitCost), currencyCode: cur },
          dailyBudget: { amount: String(platformDailyBudget(spec, 'linkedin')), currencyCode: cur },
          locale: { country: spec.audience.countries[0] || 'US', language: spec.audience.language },
          offsiteDeliveryEnabled: false,
          audienceExpansionEnabled: false,
          runSchedule,
          targetingCriteria: targetingCriteria(spec),
          status: spec.activate ? 'ACTIVE' : 'PAUSED',
        }),
        extract: (d, h) => restliId(h) || d.id,
      },
      {
        key: 'post',
        title: 'Create sponsored post (Direct Sponsored Content)',
        explain: 'LinkedIn ads are posts from your Company Page. A "dark" post (feedDistribution NONE) is only shown as an ad and never appears on your page feed.',
        method: 'POST',
        url: '/posts',
        body: (r) => ({
          author: orgUrn,
          commentary: c.primaryText,
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'NONE', targetEntities: [], thirdPartyDistributionChannels: [] },
          content: { article: { source: c.url, title: first(c.headlines), description: first(c.descriptions), ...(c.imageUrl ? { thumbnail: r.image } : {}) } },
          adContext: { dscAdAccount: accountUrn(acct), dscStatus: 'ACTIVE' },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
        extract: (d, h) => restliId(h) || d.id,
      },
      {
        key: 'creative',
        title: 'Create creative',
        explain: 'The creative attaches the sponsored post to the campaign. LinkedIn reviews creatives before they serve.',
        method: 'POST',
        url: `/adAccounts/${acct}/creatives`,
        body: (r) => ({ campaign: `urn:li:sponsoredCampaign:${r.campaign}`, content: { reference: r.post }, intendedStatus: 'ACTIVE' }),
        extract: (d, h) => restliId(h) || d.id,
      },
    );
    return { steps, notes: o.fallbackFrom ? [`No LinkedIn conversion configured, so this "${o.fallbackFrom}" campaign is launched with the Website visits objective.`] : [] };
  },

  async setStatus(conn, { accountId, externalIds }, active) {
    await this.call(conn, {
      method: 'POST',
      url: `/adAccounts/${accountId}/adCampaigns/${externalIds.campaign}`,
      headers: { 'X-RestLi-Method': 'PARTIAL_UPDATE' },
      json: { patch: { $set: { status: active ? 'ACTIVE' : 'PAUSED' } } },
    });
  },

  async fetchMetrics(conn, { externalIds, launchedAt }) {
    const d = new Date(launchedAt || Date.now() - 30 * 864e5);
    const campaign = encodeURIComponent(`urn:li:sponsoredCampaign:${externalIds.campaign}`);
    const url = `/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL&dateRange=(start:(year:${d.getUTCFullYear()},month:${d.getUTCMonth() + 1},day:${d.getUTCDate()}))&campaigns=List(${campaign})&fields=impressions,clicks,landingPageClicks,costInLocalCurrency,externalWebsiteConversions`;
    const { data } = await this.call(conn, { url });
    const m = first(data.elements, {});
    return { impressions: Number(m.impressions || 0), clicks: Number(m.landingPageClicks || m.clicks || 0), spend: Number(m.costInLocalCurrency || 0), conversions: Number(m.externalWebsiteConversions || 0), revenue: 0 };
  },
};

module.exports = adapter;
