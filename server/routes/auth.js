const express = require('express');
const path = require('path');
const { URLSearchParams } = require('node:url');
const dotenv = require('dotenv');
const { getRiderByStravaAthleteId, upsertRider } = require('../db');
const { getAuthUrl } = require('../stravaClient');

const fetch = globalThis.fetch;
if (!fetch) {
  throw new Error('Global fetch is not available; upgrade to Node 18+ or install a fetch polyfill.');
}

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const router = express.Router();
const TOKEN_URL = 'https://www.strava.com/oauth/token';

router.get('/strava/login', (req, res) => {
  res.redirect(getAuthUrl());
});

router.get('/strava/callback', async (req, res, next) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) {
      return res.status(400).json({ error, error_description });
    }
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      body: params,
    });
    if (!tokenResp.ok) {
      const body = await tokenResp.text();
      throw new Error(`Strava token exchange failed: ${tokenResp.status} ${body}`);
    }
    const tokenData = await tokenResp.json();

    const athlete = tokenData.athlete;
    if (!athlete) {
      throw new Error('Missing athlete data from Strava token response');
    }

    const riderId = upsertRider({
      stravaAthleteId: athlete.id,
      name: `${athlete.firstname || ''} ${athlete.lastname || ''}`.trim(),
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: Math.floor(tokenData.expires_at || Date.now() / 1000 + 21600),
      connectedAt: Math.floor(Date.now() / 1000),
    });

    const base = process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
    res.redirect(`${base}/?connected=1&riderId=${riderId}&name=${encodeURIComponent(athlete.firstname || '')}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
