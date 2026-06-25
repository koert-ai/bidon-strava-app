# Bidon Strava App

Local-first prototype for a cycling club dashboard backed by Strava.

## Phase 1: OAuth + Backfill

### Setup

1. Copy `server/.env.example` to `server/.env`.
2. Fill in `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and keep `STRAVA_REDIRECT_URI` as:
   `http://localhost:3001/api/auth/strava/callback`
3. Optionally set `DB_PATH` to `./data/bidon.sqlite`.

### Install and run

```bash
cd ~/Downloads/bidon-strava-app
npm install
npm run start
```

### API Endpoints

- `GET /api/auth/strava/login` - redirect to Strava OAuth
- `GET /api/auth/strava/callback` - handle Strava OAuth callback
- `POST /api/sync/backfill/:riderId` - trigger activity backfill for a rider
- `GET /api/sync/status/:riderId` - get backfill progress/status

### Notes

- This phase is backend-only. After you verify OAuth and backfill, I will continue with Phase 2.
- Do not commit `server/.env` or any secrets.
