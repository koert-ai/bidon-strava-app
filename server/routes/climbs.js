const express = require('express');
const {
  getQualifyingSegments,
  getClimbRanking,
  getGroupRides,
  getLeaderboard,
  toggleSegmentStar,
} = require('../db');

const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

// GET /api/segments/qualifying
router.get('/segments/qualifying', (req, res, next) => {
  try {
    res.json(getQualifyingSegments());
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

module.exports = router;
