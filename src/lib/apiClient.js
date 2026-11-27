'use strict';
/**
 * Thin wrapper around fetch used by all platform adapters. Normalises errors
 * into PlatformError (with the platform's own message, so users can act on it),
 * retries transient failures and records every call for the launch log.
 */

class PlatformError extends Error {
  constructor(platform, message, { status, body, request } = {}) {
    super(`${platform}: ${message}`);
    this.platform = platform;
    this.status = status;
    this.body = body;
    this.request = request;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Default extractor for an error message from a platform response body. */
function extractMessage(body) {
  if (!body || typeof body !== 'object') return typeof body === 'string' ? body.slice(0, 500) : null;
  // Meta: { error: { message, error_user_msg } }
  if (body.error?.error_user_msg) return `${body.error.error_user_title || ''} ${body.error.error_user_msg}`.trim();
  if (body.error?.message) {
    // Google Ads: error.details[0].errors[].message
    const gErrors = body.error.details?.flatMap((d) => d.errors || []) || [];
    if (gErrors.length) return gErrors.map((e) => `${e.message}${e.location ? ` (${e.location.fieldPathElements?.map((f) => f.fieldName).join('.')})` : ''}`).join('; ');
    return body.error.message;
  }
  // TikTok: { code, message }
  if (typeof body.code === 'number' && body.code !== 0 && body.message) return `${body.message} (code ${body.code})`;
  // LinkedIn / Pinterest
  if (body.message) return body.message;
  if (body.error_description) return body.error_description;
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.platform
 * @param {string} opts.method
 * @param {string} opts.url
 * @param {object} [opts.headers]
 * @param {any} [opts.json]   JSON body
 * @param {URLSearchParams|FormData|string} [opts.body]
 * @param {(body:any, res:Response)=>boolean} [opts.isError] extra error check (e.g. TikTok code != 0)
 */
async function request({ platform, method = 'GET', url, headers = {}, json, body, isError, retries = 2, fetchImpl = globalThis.fetch }) {
  const init = { method, headers: { Accept: 'application/json', ...headers } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    init.body = body;
    if (body instanceof URLSearchParams) init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      if (attempt++ < retries) { await sleep(500 * 2 ** attempt); continue; }
      throw new PlatformError(platform, `Network error: ${err.message}`, { request: { method, url } });
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
    if ((res.status === 429 || res.status >= 500) && attempt++ < retries) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(Math.min(retryAfter, 10) * 1000);
      continue;
    }
    if (!res.ok || (isError && isError(data, res))) {
      throw new PlatformError(platform, extractMessage(data) || `HTTP ${res.status}`, { status: res.status, body: data, request: { method, url } });
    }
    return { data, headers: res.headers, status: res.status };
  }
}

module.exports = { request, PlatformError, extractMessage };
