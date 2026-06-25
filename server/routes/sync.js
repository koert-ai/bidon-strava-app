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
} = require('../db');

const router = express.Router();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeType = (activity) => {
  const type = activity.type || activity.sport_type || '';
  return String(type).toLowerCase();
};

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

router.post('/backfill/:riderId', async (req, res, next) => {
  try {
    const riderId = Number(req.params.riderId);
    const rider = getRiderById(riderId);
    if (!rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }

    const syncState = getSyncState(riderId) || { backfill_complete: 0, last_page_fetched: 0 };
    if (syncState.backfill_complete) {
      return res.json({ message: 'Backfill already complete', syncState });
    }

    let page = syncState.last_page_fetched ? syncState.last_page_fetched + 1 : 1;
    let hasMore = true;
    let totalActivities = 0;
    let totalEfforts = 0;

    while (hasMore) {
      const activityList = await apiCall({
        riderId,
        path: '/athlete/activities',
        queryParams: { per_page: 100, page },
      });

      const rideActivities = Array.isArray(activityList)
        ? activityList.filter((activity) => normalizeType(activity) === 'ride')
        : [];

      if (activityList.length === 0 || rideActivities.length === 0) {
        if (activityList.length === 0) {
          upsertSyncState({
            riderId,
            backfillComplete: 1,
            lastPageFetched: page,
            oldestActivityDate: getOldestActivityDate(riderId),
            lastSyncedAt: Math.floor(Date.now() / 1000),
          });
          return res.json({
            message: 'Backfill complete',
            page,
            totalActivities,
            totalEfforts,
            syncState: getSyncState(riderId),
          });
        }
      }

      let pageEfforts = 0;
      for (const activity of rideActivities) {
        insertOrUpdateActivity(mapActivity(activity, riderId));
        totalActivities += 1;

        const activityDetails = await safeFetchActivityEfforts(riderId, activity.id);
        if (!activityDetails.segment_efforts || !Array.isArray(activityDetails.segment_efforts)) {
          continue;
        }

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
        backfillComplete: 0,
        lastPageFetched: page,
        oldestActivityDate: getOldestActivityDate(riderId),
        lastSyncedAt: Math.floor(Date.now() / 1000),
      });

      const rl = getRateLimitState();
      console.log(`Page ${page}: ${rideActivities.length} activities, ${pageEfforts} segment efforts stored, rate limit ${rl.short}/${rl.shortLimit}`);

      if (rl.short / Math.max(rl.shortLimit, 1) >= 0.9) {
        await sleep(5000);
      }

      page += 1;
      hasMore = activityList.length === 100;
    }

    upsertSyncState({
      riderId,
      backfillComplete: 1,
      lastPageFetched: page - 1,
      oldestActivityDate: getOldestActivityDate(riderId),
      lastSyncedAt: Math.floor(Date.now() / 1000),
    });

    res.json({ message: 'Backfill complete', totalActivities, totalEfforts, syncState: getSyncState(riderId) });
  } catch (err) {
    next(err);
  }
});

router.get('/status/all', (req, res, next) => {
  try {
    const { db } = require('../db');
    const riders = db.prepare('SELECT id, name, strava_athlete_id, connected_at FROM riders ORDER BY id').all();
    const result = riders.map(r => {
      const syncState = getSyncState(r.id) || { backfill_complete: 0, last_page_fetched: 0 };
      return {
        rider: r,
        sync_state: syncState,
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

module.exports = router;
