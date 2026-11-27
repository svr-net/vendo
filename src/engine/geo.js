'use strict';
/**
 * Country lookups for each platform. Meta and Pinterest accept ISO-3166 alpha-2
 * codes directly; the others use their own location identifiers:
 *  - Google Ads: geoTargetConstants/{criterionId}  (developers.google.com/google-ads/api/data/geotargets)
 *  - TikTok:     location_ids are GeoNames ids      (tools/region/ endpoint)
 *  - LinkedIn:   urn:li:geo:{id}                   (geo typeahead / adTargetingEntities)
 * Extend this table to support more countries.
 */
const COUNTRIES = {
  US: { name: 'United States', google: 2840, tiktok: 6252001, linkedin: 103644278 },
  CA: { name: 'Canada', google: 2124, tiktok: 6251999, linkedin: 101174742 },
  GB: { name: 'United Kingdom', google: 2826, tiktok: 2635167, linkedin: 101165590 },
  IE: { name: 'Ireland', google: 2372, tiktok: 2963597, linkedin: 104738515 },
  AU: { name: 'Australia', google: 2036, tiktok: 2077456, linkedin: 101452733 },
  NZ: { name: 'New Zealand', google: 2554, tiktok: 2186224, linkedin: 105490917 },
  DE: { name: 'Germany', google: 2276, tiktok: 2921044, linkedin: 101282230 },
  AT: { name: 'Austria', google: 2040, tiktok: 2782113, linkedin: 103883259 },
  CH: { name: 'Switzerland', google: 2756, tiktok: 2658434, linkedin: 106693272 },
  FR: { name: 'France', google: 2250, tiktok: 3017382, linkedin: 105015875 },
  ES: { name: 'Spain', google: 2724, tiktok: 2510769, linkedin: 105646813 },
  IT: { name: 'Italy', google: 2380, tiktok: 3175395, linkedin: 103350119 },
  NL: { name: 'Netherlands', google: 2528, tiktok: 2750405, linkedin: 102890719 },
  BE: { name: 'Belgium', google: 2056, tiktok: 2802361, linkedin: 100565514 },
  SE: { name: 'Sweden', google: 2752, tiktok: 2661886, linkedin: 105117694 },
  NO: { name: 'Norway', google: 2578, tiktok: 3144096, linkedin: 103819153 },
  DK: { name: 'Denmark', google: 2208, tiktok: 2623032, linkedin: 104514075 },
  PL: { name: 'Poland', google: 2616, tiktok: 798544, linkedin: 105072130 },
  RS: { name: 'Serbia', google: 2688, tiktok: 6290252, linkedin: 101855366 },
  HR: { name: 'Croatia', google: 2191, tiktok: 3202326, linkedin: 104688944 },
  PT: { name: 'Portugal', google: 2620, tiktok: 2264397, linkedin: 100364837 },
  IN: { name: 'India', google: 2356, tiktok: 1269750, linkedin: 102713980 },
  BR: { name: 'Brazil', google: 2076, tiktok: 3469034, linkedin: 106057199 },
  MX: { name: 'Mexico', google: 2484, tiktok: 3996063, linkedin: 103323778 },
  JP: { name: 'Japan', google: 2392, tiktok: 1861060, linkedin: 101355337 },
  SG: { name: 'Singapore', google: 2702, tiktok: 1880251, linkedin: 102454443 },
  AE: { name: 'United Arab Emirates', google: 2784, tiktok: 290557, linkedin: 104305776 },
  ZA: { name: 'South Africa', google: 2710, tiktok: 953987, linkedin: 104035573 },
};

function countryList() {
  return Object.entries(COUNTRIES).map(([code, c]) => ({ code, name: c.name }));
}

function lookup(code, platform) {
  const c = COUNTRIES[String(code).toUpperCase()];
  if (!c) return null;
  return platform ? c[platform] : c;
}

module.exports = { COUNTRIES, countryList, lookup };
