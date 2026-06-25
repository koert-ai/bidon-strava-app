const express = require('express');
const {
  getCategoryConfig,
  updateCategoryThresholds,
  getPointsConfig,
  replacePointsForCategory,
  getQualifyingSegments,
} = require('../db');

const router = express.Router();

const VALID_CATEGORIES = ['HC', '1', '2', '3', '4'];

// GET /api/config/categories
router.get('/categories', (req, res, next) => {
  try {
    res.json(getCategoryConfig());
  } catch (err) { next(err); }
});

// PUT /api/config/categories — body: { HC: 600, "1": 300, "2": 150, "3": 75, "4": 25 }
router.put('/categories', (req, res, next) => {
  try {
    const thresholds = req.body;
    for (const cat of VALID_CATEGORIES) {
      if (thresholds[cat] == null || typeof thresholds[cat] !== 'number') {
        return res.status(400).json({ error: `Missing or invalid threshold for category "${cat}"` });
      }
    }
    updateCategoryThresholds(thresholds);
    // Return updated config + segment counts per category
    const config = getCategoryConfig();
    const segments = getQualifyingSegments();
    const counts = {};
    for (const seg of segments) {
      const cat = seg.category || 'uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    res.json({ categories: config, segment_counts: counts });
  } catch (err) { next(err); }
});

// GET /api/config/points
router.get('/points', (req, res, next) => {
  try {
    res.json(getPointsConfig());
  } catch (err) { next(err); }
});

// PUT /api/config/points/:category — body: { points: [25, 20, 16, ...] }
router.put('/points/:category', (req, res, next) => {
  try {
    const { category } = req.params;
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    const { points } = req.body;
    if (!Array.isArray(points) || points.some(p => typeof p !== 'number' || p < 0)) {
      return res.status(400).json({ error: 'points must be an array of non-negative numbers' });
    }
    replacePointsForCategory(category, points);
    res.json(getPointsConfig());
  } catch (err) { next(err); }
});

module.exports = router;
