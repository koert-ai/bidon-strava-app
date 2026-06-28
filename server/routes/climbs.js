const express = require('express');
const {
  getQualifyingSegments,
  getClimbRanking,
  getGroupRides,
  getLeaderboard,
  toggleSegmentStar,
  getGlobalStats,
  getRecentFeed,
  getMonthlyPoints,
  getRiderProfile,
  getSegmentBadges,
  getSegmentAllTimeBests,
  getRiderSegmentHistory,
  db,
} = require('../db');
const { apiCall } = require('../stravaClient');

const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

// GET /api/segments/qualifying?from=&to=&minRiders=
router.get('/segments/qualifying', (req, res, next) => {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;
    const minRiders = parseInt(req.query.minRiders) || 1;
    res.json(getQualifyingSegments(from, to, minRiders));
  } catch (err) { next(err); }
});

// POST /api/segments/:id/star — toggle starred
router.post('/segments/:id/star', (req, res, next) => {
  try {
    const seg = toggleSegmentStar(parseInt(req.params.id));
    if (!seg) return res.status(404).json({ error: 'Segment not found' });
    res.json({ id: seg.id, starred: seg.starred });
  } catch (err) { next(err); }
});

// GET /api/climbs/group-rides?from=&to=&minRiders=
router.get('/climbs/group-rides', (req, res, next) => {
  try {
    const from = req.query.from || yearAgo();
    const to = req.query.to || today();
    const minRiders = parseInt(req.query.minRiders) || 1;
    res.json(getGroupRides(from, to, minRiders));
  } catch (err) { next(err); }
});

// GET /api/climbs/:segmentId/ranking?from=&to=&minRiders=
router.get('/climbs/:segmentId/ranking', (req, res, next) => {
  try {
    const segmentId = parseInt(req.params.segmentId);
    const from = req.query.from || yearAgo();
    const to = req.query.to || today();
    const minRiders = parseInt(req.query.minRiders) || 1;
    const result = getClimbRanking(segmentId, from, to, minRiders);
    if (!result) return res.status(404).json({ error: 'Segment not found' });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/points/leaderboard?from=&to=&minRiders=&starredOnly=true
router.get('/points/leaderboard', (req, res, next) => {
  try {
    const from = req.query.from || yearAgo();
    const to = req.query.to || today();
    const minRiders = parseInt(req.query.minRiders) || 1;
    const starredOnly = req.query.starredOnly === 'true';
    res.json(getLeaderboard(from, to, minRiders, starredOnly));
  } catch (err) { next(err); }
});

// GET /api/stats/global
router.get('/stats/global', (req, res, next) => {
  try { res.json(getGlobalStats()); } catch (err) { next(err); }
});

// GET /api/feed/recent?limit=
router.get('/feed/recent', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    res.json(getRecentFeed(limit));
  } catch (err) { next(err); }
});

// GET /api/points/monthly?from=&to=&minRiders=&starredOnly=
router.get('/points/monthly', (req, res, next) => {
  try {
    const from = req.query.from || yearAgo();
    const to = req.query.to || today();
    const minRiders = parseInt(req.query.minRiders) || 1;
    const starredOnly = req.query.starredOnly === 'true';
    res.json(getMonthlyPoints(from, to, minRiders, starredOnly));
  } catch (err) { next(err); }
});

// GET /api/riders/:riderId/profile
router.get('/riders/:riderId/profile', (req, res, next) => {
  try {
    const profile = getRiderProfile(parseInt(req.params.riderId));
    if (!profile) return res.status(404).json({ error: 'Rider not found' });
    res.json(profile);
  } catch (err) { next(err); }
});

// GET /api/segments/:id/badges
router.get('/segments/:id/badges', (req, res, next) => {
  try {
    res.json(getSegmentBadges(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

// GET /api/segments/:id/alltimebests
router.get('/segments/:id/alltimebests', (req, res, next) => {
  try {
    res.json(getSegmentAllTimeBests(parseInt(req.params.id)));
  } catch (err) { next(err); }
});

// GET /api/riders/:riderId/segments/:segmentId/history
router.get('/riders/:riderId/segments/:segmentId/history', (req, res, next) => {
  try {
    const history = getRiderSegmentHistory(
      parseInt(req.params.riderId),
      parseInt(req.params.segmentId)
    );
    res.json(history);
  } catch (err) { next(err); }
});

// GET /api/segments/:id/strava-leaderboard — proxies Strava segment leaderboard
router.get('/segments/:id/strava-leaderboard', async (req, res, next) => {
  try {
    // Use first connected rider's token
    const firstRider = db.prepare(
      'SELECT id FROM riders WHERE access_token IS NOT NULL ORDER BY id LIMIT 1'
    ).get();
    if (!firstRider) return res.json({ entries: [] });

    const data = await apiCall({
      riderId: firstRider.id,
      path: `/segments/${req.params.id}/leaderboard`,
      queryParams: { per_page: 10, page: 1 },
    });
    res.json(data);
  } catch (err) {
    // Gracefully handle Strava restrictions on this endpoint
    res.json({ entries: [], error: err.message });
  }
});

module.exports = router;
