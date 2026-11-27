'use strict';
/**
 * OAuth 2.0 "connect your ad account" flow, identical for every platform:
 *   /oauth/:platform/start     → redirect to the platform's consent screen
 *   /oauth/:platform/callback  → exchange the code for tokens, store them encrypted
 */
const config = require('../config');
const db = require('../lib/db');
const { randomToken } = require('../lib/crypto');
const { currentUser } = require('../lib/auth');
const { HttpError } = require('../lib/http');
const { adapters, getAdapter } = require('../platforms');
const connections = require('../engine/connections');

const redirectUri = (platform) => `${config.publicBaseUrl}/oauth/${platform}/callback`;

function register(router) {
  router.get('/oauth/:platform/start', (req, res) => {
    const user = currentUser(req);
    if (!user) return res.redirect(`/login?next=${encodeURIComponent('/connect')}`);
    const { platform } = req.params;
    if (!adapters[platform]) throw new HttpError(404, 'Unknown platform');
    const adapter = getAdapter(platform);
    if (!adapter.isConfigured()) return res.redirect(`/connect?error=${encodeURIComponent(`${adapter.name} API credentials are not configured on this server. See the setup guide.`)}`);
    const state = randomToken(24);
    db.run("DELETE FROM oauth_states WHERE created_at < datetime('now', '-1 hour')");
    db.run('INSERT INTO oauth_states (state, user_id, platform) VALUES (?, ?, ?)', state, user.id, platform);
    res.redirect(adapter.authUrl({ state, redirectUri: redirectUri(platform) }));
  });

  router.get('/oauth/:platform/callback', async (req, res) => {
    const { platform } = req.params;
    const adapter = getAdapter(platform);
    // TikTok returns "auth_code" instead of "code".
    const code = req.query.code || req.query.auth_code;
    const back = (msg, ok = false) => res.redirect(`/connect?${ok ? 'connected' : 'error'}=${encodeURIComponent(msg)}`);
    if (req.query.error) return back(req.query.error_description || req.query.error);
    const state = db.one("SELECT * FROM oauth_states WHERE state = ? AND platform = ? AND created_at > datetime('now', '-1 hour')", req.query.state || '', platform);
    if (!state) return back('The connection request expired or was tampered with. Please try again.');
    db.run('DELETE FROM oauth_states WHERE state = ?', state.state);
    if (!code) return back('No authorization code was returned.');
    try {
      const tokens = await adapter.exchangeCode({ code, redirectUri: redirectUri(platform) });
      const conn = connections.saveConnection(state.user_id, platform, {
        mode: 'live', accessToken: tokens.accessToken, refreshToken: tokens.refreshToken || null, expiresAt: tokens.expiresAt || null,
        accountId: null, accountName: null, currency: null, settings: tokens.settings || {},
      });
      // Auto-select the ad account when there is exactly one.
      try {
        const accounts = await adapter.listAccounts(conn);
        if (accounts.length === 1) connections.saveConnection(state.user_id, platform, { accountId: accounts[0].id, accountName: accounts[0].name, currency: accounts[0].currency });
      } catch { /* the user can pick later */ }
      back(adapter.name, true);
    } catch (err) {
      back(err.message);
    }
  });
}

module.exports = { register, redirectUri };
