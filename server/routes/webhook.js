const express = require('express');
const {
  getRiderByStravaAthleteId,
  insertOrUpdateActivity,
  insertOrUpdateSegment,
  insertOrUpdateSegmentEffort,
  getSyncState,
  upsertSyncState,
  getOldestActivityDate,
} = require('../db');
const { apiCall } = require('../stravaClient');

const router = express.Router();

const CYCLING_TYPES = new Set(['ride', 'virtualride', 'ebikeride', 'handcycle', 'velomobile']);
const isCycling = (type) => CYCLING_TYPES.has(String(type || '').toLowerCase());

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'bidon_webhook_token';

// GET /api/webhook/strava — Strava subscription verification challenge
router.get('/strava', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[webhook] Strava subscription verified');
    return res.json({ 'hub.challenge': challenge });
  }
  console.warn('[webhook] Verification failed — token mismatch');
  res.status(403).json({ error: 'Verification failed' });
});

// POST /api/webhook/strava — receive Strava activity events
router.post('/strava', async (req, res) => {
  // Respond 200 immediately — Strava expects a fast acknowledgement
  res.sendStatus(200);

  const event = req.body;
  console.log(`[webhook] event: ${event.object_type} ${event.aspect_type} id=${event.object_id}`);

  if (event.object_type !== 'activity' || event.aspect_type !== 'create') return;

  const ownerAthleteId = event.owner_id;
  const activityId = event.object_id;

  try {
    const rider = getRiderByStravaAthleteId(ownerAthleteId);
    if (!rider) {
      console.log(`[webhook] no rider found for athlete ${ownerAthleteId} — ignoring`);
      return;
    }

    const activity = await apiCall({
      riderId: rider.id,
      path: `/activities/${activityId}`,
      queryParams: { include_all_efforts: true },
    });

    if (!isCycling(activity.type || activity.sport_type)) {
      console.log(`[webhook] skipping non-cycling activity ${activityId} (${activity.type})`);
      return;
    }

    insertOrUpdateActivity({
      id: activity.id,
      rider_id: rider.id,
      name: activity.name,
      start_date: activity.start_date,
      start_date_local: activity.start_date_local,
      country: activity.country,
      distance_m: activity.distance,
      total_elevation_gain_m: activity.total_elevation_gain,
      type: activity.type || activity.sport_type,
    });

    let effortCount = 0;
    if (Array.isArray(activity.segment_efforts)) {
      for (const effort of activity.segment_efforts) {
        if (!effort.segment || !effort.id) continue;
        const seg = effort.segment;
        insertOrUpdateSegment({
          id: seg.id,
          name: seg.name,
          distance_m: seg.distance,
          elevation_gain_m: seg.elevation_gain,
          average_grade: seg.average_grade,
          country: seg.country,
        });
        insertOrUpdateSegmentEffort({
          id: effort.id,
          activity_id: activity.id,
          rider_id: rider.id,
          segment_id: seg.id,
          elapsed_time_s: effort.elapsed_time,
          start_date: effort.start_date_local || effort.start_date,
          rank_in_effort: effort.kom_rank || effort.rank || null,
        });
        effortCount++;
      }
    }

    const syncState = getSyncState(rider.id) || { backfill_complete: 0, last_page_fetched: 0 };
    upsertSyncState({
      riderId: rider.id,
      backfillComplete: syncState.backfill_complete,
      lastPageFetched: syncState.last_page_fetched,
      oldestActivityDate: getOldestActivityDate(rider.id),
      lastSyncedAt: Math.floor(Date.now() / 1000),
    });

    console.log(`[webhook] processed activity ${activityId} for ${rider.name} — ${effortCount} efforts`);
  } catch (err) {
    console.error(`[webhook] error processing activity ${activityId}:`, err.message);
  }
});

module.exports = router;
