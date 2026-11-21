// Optional "basic authentication" (see ideas.md). Everything here is a no-op unless
// REQUIRE_LOGIN=true.
//
// - UI users log in with a single password (no usernames). The client sends the plain password
//   over HTTPS and we verify it against LOGIN_PASSWORD_HASH (bcrypt) here on the server, so the
//   stored hash alone is never a usable credential.
// - A successful login sets an HttpOnly session cookie holding a signed, expiring token. A
//   cookie (rather than an Authorization header) means everything the browser loads by itself -
//   extension bundles via <script src>, extensions' own plain fetch('/api/...') calls, the
//   socket.io handshake - is authenticated automatically.
// - API_KEY grants access to the /api endpoints only (via X-API-Key or Authorization: Bearer).
//   It never creates a session, so it can't be used to get into the UI.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'budgett_session';
const DEFAULT_EXPIRATION = '7d';

// API paths reachable without a session/API key. Plaid can't authenticate to the webhook, and
// the auth routes themselves obviously have to be reachable to log in.
const PUBLIC_API_PATHS = ['/api/health', '/api/webhook', '/api/auth/'];

const UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000, w: 7 * 24 * 60 * 60 * 1000 };

// "5d" / "24h" / "30m" / "90s" / "2w" -> milliseconds. Returns null for anything else.
function parseDuration(value) {
  const match = /^\s*(\d+)\s*([smhdw])\s*$/i.exec(value || '');
  if (!match) {
    return null;
  }

  const ms = Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
  return ms > 0 ? ms : null;
}

const config = {
  enabled: false,
  passwordHash: null,
  expirationMs: null,
  apiKey: null,
  signingKey: null,
};

// Validates the env vars and fills in `config`. Throws (so startup fails loudly) on a
// misconfiguration that would otherwise leave the app locked or silently unprotected.
function initAuth() {
  config.enabled = String(process.env.REQUIRE_LOGIN || '').trim().toLowerCase() === 'true';
  if (!config.enabled) {
    return;
  }

  config.passwordHash = (process.env.LOGIN_PASSWORD_HASH || '').trim();
  if (!/^\$2[aby]\$\d{2}\$/.test(config.passwordHash)) {
    throw new Error('REQUIRE_LOGIN is true but LOGIN_PASSWORD_HASH is missing or is not a bcrypt hash. '
      + 'Generate one with: cd server && npm run hash-password');
  }

  const expiration = process.env.LOGIN_EXPIRATION || DEFAULT_EXPIRATION;
  config.expirationMs = parseDuration(expiration);
  if (!config.expirationMs) {
    throw new Error(`Invalid LOGIN_EXPIRATION "${expiration}" - expected a number followed by s, m, h, d or w (e.g. "5d", "24h")`);
  }

  config.apiKey = process.env.API_KEY || null;
  if (!config.apiKey) {
    console.warn('REQUIRE_LOGIN is true but API_KEY is not set - API access is limited to logged-in browser sessions.');
  }

  // Tokens are signed with SESSION_SECRET + the password hash, so changing the password logs out
  // every existing session. Without SESSION_SECRET a random key is used, which also logs everyone
  // out whenever the server restarts.
  let secret = process.env.SESSION_SECRET;
  if (!secret || secret === 'change-me-to-a-random-string') {
    console.warn('SESSION_SECRET is not set - using a random one, so logins will not survive a server restart.');
    secret = crypto.randomBytes(32).toString('hex');
  }

  config.signingKey = crypto.createHash('sha256').update(`${secret}:${config.passwordHash}`).digest();
}

function sign(data) {
  return crypto.createHmac('sha256', config.signingKey).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function createToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + config.expirationMs })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function isValidToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  }
  catch (e) {
    return false;
  }
}

function getCookie(cookieHeader, name) {
  for (const part of (cookieHeader || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx !== -1 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }

  return null;
}

function hasValidSession(cookieHeader) {
  return isValidToken(getCookie(cookieHeader, COOKIE_NAME));
}

function getApiKeyFromRequest(req) {
  const header = req.headers['x-api-key'];
  if (header) {
    return header;
  }

  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
}

function hasValidApiKey(req) {
  const key = getApiKeyFromRequest(req);
  return Boolean(config.apiKey && key && safeEqual(key, config.apiKey));
}

function isSecureRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function setSessionCookie(req, res, token, maxAgeMs) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function isPublicPath(path) {
  return !path.startsWith('/api/')
    || PUBLIC_API_PATHS.some(p => path === p || (p.endsWith('/') ? path.startsWith(p) : path.startsWith(`${p}/`)));
}

// Express middleware guarding /api/* (the static UI files stay public - the client itself shows
// the login page). Mount at the app level, before the API routes.
function requireApiAuth(req, res, next) {
  if (!config.enabled || isPublicPath(req.path)) {
    return next();
  }

  if (hasValidSession(req.headers.cookie) || hasValidApiKey(req)) {
    return next();
  }

  res.status(401).json({ error: 'Authentication required' });
}

// socket.io middleware - browser sessions only (the API key is for the HTTP API, not the UI).
function requireSocketAuth(socket, next) {
  if (!config.enabled || hasValidSession(socket.handshake.headers.cookie)) {
    return next();
  }

  next(new Error('Authentication required'));
}

// Routes mounted at /api/auth
const router = require('express').Router();

// GET /api/auth/status - lets the client decide whether to show the login page
router.get('/status', (req, res) => {
  res.json({
    require_login: config.enabled,
    authenticated: !config.enabled || hasValidSession(req.headers.cookie),
  });
});

// POST /api/auth/login { password }
router.post('/login', async (req, res) => {
  if (!config.enabled) {
    return res.json({ success: true });
  }

  const { password } = req.body || {};
  const valid = typeof password === 'string' && password.length > 0 && await bcrypt.compare(password, config.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = createToken();
  setSessionCookie(req, res, token, config.expirationMs);
  res.json({ success: true, expires_at: new Date(Date.now() + config.expirationMs).toISOString() });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  setSessionCookie(req, res, '', 0);
  res.json({ success: true });
});

module.exports = {
  initAuth,
  requireApiAuth,
  requireSocketAuth,
  authRouter: router,
  parseDuration,
};
