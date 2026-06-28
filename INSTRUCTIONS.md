# Bidon Strava App — Quick Start

A cycling club leaderboard and dashboard powered by the Strava API.

## Stack

- **Backend**: Node.js + Express, SQLite (`better-sqlite3`), deployed on Railway
- **Frontend**: React 18 + Vite, served as static files from Express in production
- **Auth**: Strava OAuth 2.0 with webhook push and activity backfill

## Setup

```bash
# 1. Clone and install
cd ~/Downloads/bidon-strava-app
npm install

# 2. Configure environment
cp server/.env.example server/.env
# Fill in STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
# STRAVA_REDIRECT_URI=http://localhost:3001/api/auth/strava/callback
# DB_PATH=./data/bidon.sqlite (optional, this is the default)

# 3. Run locally
npm run dev:server   # Express API on :3001
npm run dev:client   # Vite dev server on :5173
```

## Key Directories

```
server/
  index.js          # Express entry point
  db.js             # SQLite setup
  stravaClient.js   # Strava API wrapper
  routes/           # auth, sync, leaderboard, goals, climbs, events, webhook
  jobs/             # Cron and backfill jobs
  data/             # SQLite DB (gitignored)

client/src/
  api.js            # All API calls go here (no direct fetches in components)
  pages/            # Full-page views: Dashboard, Leaderboard, Goals, RiderProfile, etc.
  components/       # Shared UI components
```

## Core Features

- **Strava OAuth** — riders connect their Strava account via `/api/auth/strava/login`
- **Activity sync** — backfill past rides + webhook for new activities
- **Leaderboard** — points-based ranking configurable via PointsConfig
- **Climbs** — tracked segments with their own config (ClimbConfig)
- **Goals** — per-rider goal tracking
- **Events** — club event management
- **Bidon Week** — special weekly challenge view

## Deployment

Railway auto-deploys on push to `main`. SQLite is persisted to a `/data` volume.

```bash
npm run build   # builds client/dist, served by Express in production
npm start       # production server
```

Never commit `server/.env`. Never push without running the full verification checklist in `CLAUDE.md`.
