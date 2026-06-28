const express = require('express');
const { getAllRiders, getRiderById, updateRiderProfile } = require('../db');

const router = express.Router();

// GET /api/riders — list all riders with profile info
router.get('/', (req, res, next) => {
  try {
    const riders = getAllRiders();
    res.json({ data: riders });
  } catch (err) {
    next(err);
  }
});

// PUT /api/riders/:id — update rider profile fields
router.put('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rider = getRiderById(id);
    if (!rider) return res.status(404).json({ error: 'Rider not found' });

    const { name, nickname, picture_url, palmares, favorite_cyclists, bio } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    // palmares and favorite_cyclists are stored as JSON strings
    const palmaresJson = Array.isArray(palmares)
      ? JSON.stringify(palmares)
      : (typeof palmares === 'string' ? palmares : null);
    const favCyclistsJson = Array.isArray(favorite_cyclists)
      ? JSON.stringify(favorite_cyclists)
      : (typeof favorite_cyclists === 'string' ? favorite_cyclists : null);

    updateRiderProfile(id, {
      name: name.trim(),
      nickname: nickname?.trim() || null,
      picture_url: picture_url?.trim() || null,
      palmares: palmaresJson,
      favorite_cyclists: favCyclistsJson,
      bio: bio?.trim() || null,
    });

    res.json({ data: getRiderById(id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
