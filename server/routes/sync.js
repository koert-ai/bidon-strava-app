const express = require('express');
const { apiCall, getRateLimitState } = require('../stravaClient');
const {
  getRiderById,
  getSyncState,
  upsertSyncState,
  insertOrUpdateActivity,
  insertOrUpdateSegment,
  insertOrUpdateSegmentEffort,
  countActivities,
  countSegmentEfforts,
  getOldestActivityDate,
  getEventById,
} = require('../db');

const router = express.Router();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// In-memory set of rider IDs currently being synced — prevents duplicate parallel syncs
const activeSyncs = new Set();

const CYCLING_TYPES = new Set(['ride', 'virtualride', 'ebikeride', 'handcycle', 'velomobile']);

const normalizeType = (activity) => {
  const type = activity.type || activity.sport_type || '';
  return String(type).toLowerCase();
};

const isCyclingActivity = (activity) => CYCLING_TYPES.has(normalizeType(activity));

const mapActivity = (activity, riderId) => ({
  id: activity.id,
  rider_id: riderId,
  name: activity.name,
  start_date: activity.start_date,
  start_date_local: activity.start_date_local,
  country: activity.country,
  distance_m: activity.distance,
  total_elevation_gain_m: activity.total_elevation_gain,
  type: activity.type || activity.sport_type,
});

const mapSegment = (segment) => ({
  id: segment.id,
  name: segment.name,
  distance_m: segment.distance,
  elevation_gain_m: segment.elevation_gain,
  average_grade: segment.average_grade,
  max_grade: segment.maximum_grade ?? null,
  elevation_high: segment.elevation_high ?? null,
  elevation_low: segment.elevation_low ?? null,
  country: segment.country,
});

const mapSegmentEffort = (effort, riderId) => ({
  id: effort.id,
  activity_id: effort.activity.id,
  rider_id: riderId,
  segment_id: effort.segment.id,
  elapsed_time_s: effort.elapsed_time,
  start_date: effort.start_date_local || effort.start_date,
  rank_in_effort: effort.kom_rank || effort.rank || null,
});

const safeFetchActivityEfforts = async (riderId, activityId) => {
  const response = await apiCall({
    riderId,
    path: `/activities/${activityId}`,
    queryParams: { include_all_efforts: true },
  });
  return response;
};

// Core function that processes a paginated batch of activities for a rider.
// afterTs / beforeTs are optional Unix timestamps (Strava API params).
// When eventScoped=true, we don't touch backfill_complete.
const runSync = async ({ riderId, afterTs, beforeTs, eventScoped = false }) => {
  let page = 1;
  let hasMore = true;
  let totalActivities = 0;
  let totalEfforts = 0;

  if (!eventScoped) {
    const syncState = getSyncState(riderId) || { last_page_fetched: 0 };
    page = syncState.last_page_fetched ? syncState.last_page_fetched + 1 : 1;
  }

  while (hasMore) {
    const queryParams = { per_page: 100, page };
    if (afterTs) queryParams.after = afterTs;
    if (beforeTs) queryParams.before = beforeTs;

    const activityList = await apiCall({
      riderId,
      path: '/athlete/activities',
      queryParams,
    });

    const rideActivities = Array.isArray(activityList)
      ? activityList.filter(isCyclingActivity)
      : [];

    if (activityList.length === 0) {
      // No more pages — mark complete only for full backfill
      if (!eventScoped) {
        upsertSyncState({
          riderId,
          backfillComplete: 1,
          lastPageFetched: page,
          oldestActivityDate: getOldestActivityDate(riderId),
          lastSyncedAt: Math.floor(Date.now() / 1000),
        });
      }
      break;
    }

    let pageEfforts = 0;
    for (const activity of rideActivities) {
      insertOrUpdateActivity(mapActivity(activity, riderId));
      totalActivities += 1;

      const activityDetails = await safeFetchActivityEfforts(riderId, activity.id);
      if (!activityDetails.segment_efforts || !Array.isArray(activityDetails.segment_efforts)) continue;

      for (const effort of activityDetails.segment_efforts) {
        if (!effort.segment || !effort.id) continue;
        insertOrUpdateSegment(mapSegment(effort.segment));
        insertOrUpdateSegmentEffort(mapSegmentEffort(effort, riderId));
        pageEfforts += 1;
        totalEfforts += 1;
      }
    }

    upsertSyncState({
      riderId,
      backfillComplete: eventScoped ? (getSyncState(riderId)?.backfill_complete || 0) : 0,
      lastPageFetched: page,
      oldestActivityDate: getOldestActivityDate(riderId),
      lastSyncedAt: Math.floor(Date.now() / 1000),
    });

    const rl = getRateLimitState();
    console.log(`[sync] page ${page}: ${rideActivities.length} activities, ${pageEfforts} efforts stored, rate ${rl.short}/${rl.shortLimit}`);

    if (rl.short / Math.max(rl.shortLimit, 1) >= 0.9) await sleep(5000);

    page += 1;
    hasMore = activityList.length === 100;
  }

  return { totalActivities, totalEfforts };
};

// POST /api/sync/backfill/:riderId — full historical backfill (runs in background)
router.post('/backfill/:riderId', (req, res, next) => {
  try {
    const riderId = Number(req.params.riderId);
    const rider = getRiderById(riderId);
    if (!rider) return res.status(404).json({ error: 'Rider not found' });

    if (activeSyncs.has(riderId)) {
      return res.status(409).json({ error: 'Sync already in progress for this rider' });
    }

    const syncState = getSyncState(riderId) || { backfill_complete: 0, last_page_fetched: 0 };
    if (syncState.backfill_complete) {
      return res.json({ message: 'Backfill already complete', syncState });
    }

    // Respond immediately — sync runs in background so Railway doesn't time out
    res.json({ message: 'Backfill started', riderId });

    activeSyncs.add(riderId);
    // Clear any previous error when starting fresh
    upsertSyncState({
      riderId,
      backfillComplete: 0,
      lastPageFetched: syncState.last_page_fetched || 0,
      oldestActivityDate: syncState.oldest_activity_date || null,
      lastSyncedAt: syncState.last_synced_at || null,
      lastError: null,
    });

    runSync({ riderId })
      .then(() => {
        upsertSyncState({
          riderId,
          backfillComplete: 1,
          lastPageFetched: getSyncState(riderId)?.last_page_fetched || 0,
          oldestActivityDate: getOldestActivityDate(riderId),
          lastSyncedAt: Math.floor(Date.now() / 1000),
          lastError: null,
        });
        console.log(`[sync] Backfill complete for rider ${riderId}`);
      })
      .catch(err => {
        console.error(`[sync] Backfill error for rider ${riderId}:`, err.message);
        const current = getSyncState(riderId);
        upsertSyncState({
          riderId,
          backfillComplete: 0,
          lastPageFetched: current?.last_page_fetched || 0,
          oldestActivityDate: current?.oldest_activity_date || null,
          lastSyncedAt: current?.last_synced_at || null,
          lastError: err.message,
        });
      })
      .finally(() => activeSyncs.delete(riderId));
  } catch (err) { next(err); }
});

// POST /api/sync/event/:riderId — event-scoped sync (runs in background)
router.post('/event/:riderId', (req, res, next) => {
  try {
    const riderId = Number(req.params.riderId);
    const rider = getRiderById(riderId);
    if (!rider) return res.status(404).json({ error: 'Rider not found' });

    if (activeSyncs.has(riderId)) {
      return res.status(409).json({ error: 'Sync already in progress for this rider' });
    }

    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ error: 'eventId required' });

    const event = getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Respond immediately — sync runs in background
    res.json({ message: 'Event sync started', event: event.name, riderId });

    activeSyncs.add(riderId);
    const current = getSyncState(riderId);
    // Clear previous error
    upsertSyncState({
      riderId,
      backfillComplete: current?.backfill_complete || 0,
      lastPageFetched: current?.last_page_fetched || 0,
      oldestActivityDate: current?.oldest_activity_date || null,
      lastSyncedAt: current?.last_synced_at || null,
      lastError: null,
    });

    const afterTs = Math.floor(new Date(event.date_from + 'T00:00:00Z').getTime() / 1000);
    const beforeTs = Math.floor(new Date(event.date_to + 'T23:59:59Z').getTime() / 1000);

    runSync({ riderId, afterTs, beforeTs, eventScoped: true })
      .then(({ totalActivities, totalEfforts }) => {
        const after = getSyncState(riderId);
        upsertSyncState({
          riderId,
          backfillComplete: after?.backfill_complete || 0,
          lastPageFetched: after?.last_page_fetched || 0,
          oldestActivityDate: after?.oldest_activity_date || null,
          lastSyncedAt: Math.floor(Date.now() / 1000),
          lastError: null,
        });
        console.log(`[sync] Event sync complete for rider ${riderId}: ${totalActivities} activities, ${totalEfforts} efforts`);
      })
      .catch(err => {
        console.error(`[sync] Event sync error for rider ${riderId}:`, err.message);
        const after = getSyncState(riderId);
        upsertSyncState({
          riderId,
          backfillComplete: after?.backfill_complete || 0,
          lastPageFetched: after?.last_page_fetched || 0,
          oldestActivityDate: after?.oldest_activity_date || null,
          lastSyncedAt: after?.last_synced_at || null,
          lastError: err.message,
        });
      })
      .finally(() => activeSyncs.delete(riderId));
  } catch (err) { next(err); }
});

router.delete('/data/:riderId', (req, res, next) => {
  try {
    const riderId = Number(req.params.riderId);
    const rider = getRiderById(riderId);
    if (!rider) return res.status(404).json({ error: 'Rider not found' });

    const { db } = require('../db');
    db.transaction(() => {
      db.prepare('DELETE FROM segment_efforts WHERE rider_id = ?').run(riderId);
      db.prepare('DELETE FROM activities WHERE rider_id = ?').run(riderId);
      db.prepare('DELETE FROM sync_state WHERE rider_id = ?').run(riderId);
    })();

    res.json({ message: 'Data cleared' });
  } catch (err) { next(err); }
});

router.get('/status/all', (req, res, next) => {
  try {
    const { db } = require('../db');
    const riders = db.prepare('SELECT id, name, strava_athlete_id, connected_at FROM riders ORDER BY id').all();
    const result = riders.map(r => {
      const syncState = getSyncState(r.id) || { backfill_complete: 0, last_page_fetched: 0 };
      return {
        rider: r,
        sync_state: { ...syncState, is_syncing: activeSyncs.has(r.id) },
        activity_count: countActivities(r.id),
        segment_effort_count: countSegmentEfforts(r.id),
      };
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/status/:riderId', (req, res, next) => {
  try {
    const riderId = Number(req.params.riderId);
    const rider = getRiderById(riderId);
    if (!rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }
    const syncState = getSyncState(riderId) || {
      rider_id: riderId,
      backfill_complete: 0,
      last_page_fetched: 0,
      oldest_activity_date: null,
      last_synced_at: null,
    };

    res.json({
      sync_state: syncState,
      activity_count: countActivities(riderId),
      segment_effort_count: countSegmentEfforts(riderId),
      oldest_activity_date: syncState.oldest_activity_date || getOldestActivityDate(riderId),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sync/rate-limit — current Strava API rate limit state
router.get('/rate-limit', (req, res, next) => {
  try {
    res.json(getRateLimitState());
  } catch (err) { next(err); }
});

module.exports = router;
