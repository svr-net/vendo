'use strict';
const db = require('./db');
const { hashPassword, verifyPassword, randomToken, id } = require('./crypto');
const { HttpError } = require('./http');
const config = require('../config');

const COOKIE = 'vendo_session';
const SESSION_DAYS = 30;
const secure = config.publicBaseUrl.startsWith('https://');

function createUser({ email, password, name }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address');
  if (String(password || '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists');
  const user = { id: id('usr'), email, name: String(name || '').trim() || email.split('@')[0] };
  db.run('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)', user.id, user.email, user.name, hashPassword(password));
  return user;
}

function authenticate({ email, password }) {
  const row = db.one('SELECT * FROM users WHERE email = ?', String(email || '').trim().toLowerCase());
  if (!row || !verifyPassword(String(password || ''), row.password_hash)) throw new HttpError(401, 'Email or password is incorrect');
  return { id: row.id, email: row.email, name: row.name };
}

function startSession(res, user) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, user.id, expires);
  res.setCookie(COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure });
}

function endSession(req, res) {
  const token = req.cookies[COOKIE];
  if (token) db.run('DELETE FROM sessions WHERE token = ?', token);
  res.setCookie(COOKIE, '', { maxAge: 0, secure });
}

function currentUser(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  const row = db.one(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`, token, new Date().toISOString());
  return row || null;
}

/** Middleware: requires a signed-in user. */
function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, 'Please sign in');
  req.user = user;
  next();
}

/** Middleware: CSRF protection for state-changing JSON API calls (same-origin custom header). */
function requireSameOrigin(req, res, next) {
  if (req.headers['x-requested-with'] !== 'vendo') throw new HttpError(403, 'Missing X-Requested-With header');
  next();
}

module.exports = { createUser, authenticate, startSession, endSession, currentUser, requireUser, requireSameOrigin };
