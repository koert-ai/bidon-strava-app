const path = require('path');
const { URLSearchParams } = require('node:url');
const dotenv = require('dotenv');
const {
  getRiderById,
  upsertRider,
} = require('./db');

const fetch = globalThis.fetch;
if (!fetch) {
  throw new Error('Global fetch is not available; upgrade to Node 18+ or install a fetch polyfill.');
}

dotenv.config({ path: path.resolve(__dirname, '.env') });

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REDIRECT_URI = process.env.STRAVA_REDIRECT_URI;
const API_BASE = 'https://www.strava.com/api/v3';
const TOKEN_URL = 'https://www.strava.com/oauth/token';

let lastUsage = { short: 0, shortLimit: 100, long: 0, longLimit: 10000 };

// ── Simple in-memory API response cache ───────────────────────────────────────
const apiCache = new Map(); // key → { data, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Paths that should never be cached (always fetch fresh)
const NEVER_CACHE = new Set(['/athlete/activities']);

const getCached = (key) => {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { apiCache.delete(key); return null; }
  return entry.data;
};

const setCache = (key, data, ttlMs = CACHE_TTL_MS) => {
  apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
};

const clearApiCache = () => apiCache.clear();

const parseRateLimit = (value) => {
  if (!value) return null;
  const parts = value.split(',').map((v) => v.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return parts.map((item) => {
    const n = Number(item);
    return Number.isFinite(n) ? n : null;
  });
};

const updateRateLimitFromHeaders = (headers) => {
  const usage = parseRateLimit(headers.get('x-ratelimit-usage'));
  const limit = parseRateLimit(headers.get('x-ratelimit-limit'));
  if (usage && limit) {
    lastUsage = {
      short: usage[0],
      shortLimit: limit[0],
      long: usage[1],
      longLimit: limit[1],
    };
  }
};

const getAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'activity:read_all',
    approval_prompt: 'auto',
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForNextWindow = async () => {
  const now = new Date();
  const next = new Date(now);
  const minutes = now.getMinutes();
  const nextQuarter = Math.floor(minutes / 15) * 15 + 15;
  next.setSeconds(0, 0);
  if (nextQuarter >= 60) {
    next.setHours(now.getHours() + 1);
    next.setMinutes(0);
  } else {
    next.setMinutes(nextQuarter);
  }
  const waitMs = Math.max(0, next.getTime() - now.getTime());
  console.log(`Rate limit near threshold, waiting ${Math.ceil(waitMs / 1000)}s until next 15-minute window.`);
  await sleep(waitMs + 1000);
};

const refreshTokenIfNeeded = async (riderId) => {
  const rider = getRiderById(riderId);
  if (!rider) throw new Error(`Rider ${riderId} not found`);
  const now = Math.floor(Date.now() / 1000);
  if (!rider.refresh_token || !rider.token_expires_at || rider.token_expires_at > now + 60) {
    return rider.access_token;
  }

  const body = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: rider.refresh_token,
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    body,
  });
  if (!resp.ok) {
    throw new Error(`Failed to refresh Strava token: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  const expiresAt = Math.floor(data.expires_at || Date.now() / 1000 + 21600);
  upsertRider({
    stravaAthleteId: data.athlete?.id || rider.strava_athlete_id,
    name: data.athlete?.firstname ? `${data.athlete.firstname} ${data.athlete.lastname || ''}`.trim() : rider.name,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: expiresAt,
    connectedAt: rider.connected_at || now,
  });
  return data.access_token;
};

const fetchWithRateLimit = async (url, options = {}) => {
  if (lastUsage.short / Math.max(lastUsage.shortLimit, 1) >= 0.9) {
    await waitForNextWindow();
  }

  let attempt = 0;
  while (true) {
    const response = await fetch(url, options);
    updateRateLimitFromHeaders(response.headers);

    if (response.status === 429) {
      attempt += 1;
      const delay = Math.round(Math.random() * 1000 * Math.pow(2, Math.min(attempt, 5)));
      console.warn(`Strava 429 received, backing off for ${delay}ms (attempt ${attempt}).`);
      await sleep(delay);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Strava API ${response.status}: ${text}`);
    }
    return response;
  }
};

const apiCall = async ({ riderId, path, method = 'GET', queryParams = {}, body = null, useCache = true }) => {
  const accessToken = await refreshTokenIfNeeded(riderId);
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  // Cache GET requests that aren't in the never-cache list
  const cacheKey = `${riderId}:${url.pathname}?${url.searchParams}`;
  const shouldCache = method === 'GET' && useCache && !NEVER_CACHE.has(path);

  if (shouldCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const response = await fetchWithRateLimit(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();

  if (shouldCache) setCache(cacheKey, data);
  return data;
};

const getRateLimitState = () => ({ ...lastUsage });

module.exports = {
  getAuthUrl,
  apiCall,
  refreshTokenIfNeeded,
  updateRateLimitFromHeaders,
  getRateLimitState,
  clearApiCache,
};
