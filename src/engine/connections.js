'use strict';
/** Stores platform connections (encrypted tokens) and keeps tokens fresh. */
const db = require('../lib/db');
const { encrypt, decrypt, id } = require('../lib/crypto');
const { getAdapter } = require('../platforms');

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    mode: row.mode,
    accessToken: decrypt(row.access_token),
    refreshToken: decrypt(row.refresh_token),
    expiresAt: row.expires_at,
    accountId: row.account_id,
    accountName: row.account_name,
    currency: row.currency,
    settings: db.parseJson(row.settings, {}),
    updatedAt: row.updated_at,
  };
}

/** Public, token-free view of a connection for the browser. */
function toPublic(conn) {
  if (!conn) return null;
  return {
    platform: conn.platform,
    mode: conn.mode,
    accountId: conn.accountId,
    accountName: conn.accountName,
    currency: conn.currency,
    targets: conn.settings.targets || {},
    expiresAt: conn.expiresAt,
    expired: Boolean(conn.expiresAt && conn.expiresAt < Date.now() && !conn.refreshToken),
    updatedAt: conn.updatedAt,
  };
}

const getConnection = (userId, platform) => hydrate(db.one('SELECT * FROM connections WHERE user_id = ? AND platform = ?', userId, platform));
const listConnections = (userId) => db.all('SELECT * FROM connections WHERE user_id = ?', userId).map(hydrate);

function saveConnection(userId, platform, fields) {
  const existing = getConnection(userId, platform);
  const merged = { mode: 'live', settings: {}, ...existing, ...fields };
  merged.settings = { ...(existing?.settings || {}), ...(fields.settings || {}) };
  if (existing) {
    db.run(
      `UPDATE connections SET mode=?, access_token=?, refresh_token=?, expires_at=?, account_id=?, account_name=?, currency=?, settings=?, updated_at=datetime('now') WHERE id=?`,
      merged.mode, encrypt(merged.accessToken), encrypt(merged.refreshToken), merged.expiresAt ?? null,
      merged.accountId ?? null, merged.accountName ?? null, merged.currency ?? null, JSON.stringify(merged.settings), existing.id,
    );
  } else {
    db.run(
      `INSERT INTO connections (id, user_id, platform, mode, access_token, refresh_token, expires_at, account_id, account_name, currency, settings)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id('con'), userId, platform, merged.mode, encrypt(merged.accessToken), encrypt(merged.refreshToken), merged.expiresAt ?? null,
      merged.accountId ?? null, merged.accountName ?? null, merged.currency ?? null, JSON.stringify(merged.settings),
    );
  }
  return getConnection(userId, platform);
}

const deleteConnection = (userId, platform) => db.run('DELETE FROM connections WHERE user_id = ? AND platform = ?', userId, platform);

/** Refresh the access token if it expires within 5 minutes and the platform supports refresh. */
async function ensureFresh(conn) {
  if (conn.mode !== 'live') return conn;
  const adapter = getAdapter(conn.platform);
  if (conn.expiresAt && conn.expiresAt - Date.now() < 5 * 60 * 1000) {
    if (!adapter.refresh || !conn.refreshToken) throw new Error(`${adapter.name} access has expired. Please reconnect on the Connect page.`);
    const fresh = await adapter.refresh(conn);
    return saveConnection(conn.userId, conn.platform, { ...fresh });
  }
  return conn;
}

module.exports = { getConnection, listConnections, saveConnection, deleteConnection, ensureFresh, toPublic };
