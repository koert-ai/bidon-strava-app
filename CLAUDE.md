# Bidon Strava App — Agent Instructions

## Project Overview

A cycling club leaderboard and dashboard backed by the Strava API. The stack is:

- **Backend**: Node.js + Express, SQLite via `better-sqlite3`, deployed on Railway
- **Frontend**: React 18 + Vite, served as static build from the Express server
- **Deployment**: Railway (Nixpacks build), SQLite persisted to `/data` volume
- **Strava**: OAuth 2.0, webhook push, backfill jobs, activity sync

Key directories:
- `server/` — Express API, routes, DB logic, Strava client, cron jobs
- `client/src/` — React pages and components
- `client/src/pages/` — full-page views (Dashboard, Leaderboard, Goals, etc.)
- `client/src/components/` — shared UI components

---

## Code Quality Standards

### General
- Write clean, readable, well-commented code. Prefer clarity over cleverness.
- Keep components small and focused. Split logic into hooks or helpers when a file exceeds ~150 lines.
- No dead code, no commented-out blocks, no `console.log` left in production paths.
- Use `async/await` throughout. Never mix callbacks and promises.
- Handle all errors explicitly — no silent catches, no swallowed rejections.

### Backend
- All routes go in `server/routes/`. One file per domain (auth, sync, leaderboard, etc.).
- DB queries go in dedicated query functions, not inline in route handlers.
- Always validate and sanitize inputs before touching the DB or calling Strava.
- Return consistent JSON: `{ data: ... }` on success, `{ error: "message" }` on failure.
- Never expose stack traces or internal error details to the client.

### Frontend
- Components live in `client/src/components/` (reusable) or `client/src/pages/` (route-level).
- All API calls go through `client/src/api.js` — never fetch directly from a component.
- Use React Router for navigation. No `window.location` hacks.
- Loading states and error states are required for every data-fetching component.
- No inline styles. Use CSS classes (index.css or component-scoped CSS).

---

## UI & Design Standards

The app should look and feel like a **premium sports dashboard** — clean, modern, data-forward. Think Strava meets a pro cycling team's internal tool.

- **Typography**: Clear hierarchy — large bold headings for stats, readable body text, subtle labels.
- **Color**: Use a coherent palette. Orange/coral accent (Strava-adjacent) works well. Dark mode by default or as an option.
- **Spacing**: Generous whitespace. Cards with subtle shadows, not heavy borders.
- **Data visualization**: Use charts for trends (activities over time, points history). Keep them readable on mobile.
- **Responsiveness**: Mobile-first. Every page must work well on a phone.
- **Micro-interactions**: Smooth transitions on state changes, hover effects on clickable elements, skeleton loaders instead of spinners where possible.
- **Empty states**: Always render a helpful message when there's no data yet — never a blank screen.

When implementing new UI, always check: does this look like something you'd be proud to show someone? If not, refine it.

---

## Testing & Verification Protocol

**Never ask to deploy until all of the following are complete:**

### Backend
1. Run the server locally: `npm run dev:server`
2. Test every new/changed API endpoint manually with curl or a REST client
3. Verify error paths (bad input, missing records, Strava API failures)
4. Check that DB queries are correct by inspecting the SQLite file directly if needed
5. Confirm no secrets are logged or exposed in responses

### Frontend
1. Run the dev client: `npm run dev:client`
2. Visually inspect every affected page/component at desktop and mobile widths
3. Test all user interactions: clicks, form submissions, navigation
4. Verify loading states, error states, and empty states all render correctly
5. Check browser console — zero errors, zero warnings

### Build verification
1. Run `npm run build` from the root and confirm it succeeds with no errors
2. Start the production build with `npm start` and do a final smoke test against the built output

**Only after all checks pass:** present the changes and ask Koert to confirm before committing and pushing to Railway.

---

## Deployment Workflow

1. Verify all tests above pass.
2. Summarize what changed and why, and any risks or things to watch after deploy.
3. Wait for explicit go-ahead before running any git commands.
4. Commit with a clear, descriptive message: `feat: ...`, `fix: ...`, `refactor: ...`, `style: ...`.
5. Push to `main` — Railway auto-deploys on push.
6. After deploy, note the Railway URL and confirm the live app behaves correctly.

**Never auto-commit or auto-push without explicit approval.**

---

## Debugging Approach

When something is broken:
1. Reproduce the issue precisely — what input, what expected behavior, what actual behavior.
2. Check server logs first. Most bugs leave a trace there.
3. Check the SQLite DB state — wrong data causes most runtime bugs.
4. Isolate the layer: is it the DB query, the route handler, the API call, or the component render?
5. Fix the root cause, not the symptom. Don't paper over bugs with try/catch.
6. After fixing, verify the fix didn't break adjacent functionality.

---

## Improvement & Optimization Mindset

After completing any task, proactively surface:

- **Performance**: slow queries, unnecessary re-renders, large bundle chunks, unindexed DB columns
- **UX improvements**: friction points, missing feedback, confusing flows
- **Visual polish**: spacing inconsistencies, font sizing, color contrast, animation opportunities
- **Feature ideas**: things that would naturally extend what was just built
- **Technical debt**: things that should be refactored before the codebase grows further

Frame suggestions concisely — one sentence each, grouped by category. Don't overwhelm, but don't hold back good ideas.

---

## Environment

- Node >= 20
- SQLite DB path: `./data/bidon.sqlite` locally, `/data/bidon.sqlite` on Railway (env var `DB_PATH`)
- Strava credentials in `server/.env` — never commit this file
- Railway deployment auto-triggers on push to `main`
- Client builds to `client/dist/` and is served as static files by Express in production
