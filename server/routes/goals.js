const express = require('express');
const { getGoals, createGoal, updateGoal, deleteGoal } = require('../db');

const router = express.Router();

// GET /api/goals?riderId=
router.get('/', (req, res, next) => {
  try {
    const riderId = req.query.riderId ? parseInt(req.query.riderId) : null;
    res.json(getGoals(riderId));
  } catch (err) { next(err); }
});

// POST /api/goals
router.post('/', (req, res, next) => {
  try {
    const { rider_id, segment_id, target_time_s, deadline, notes } = req.body;
    if (!rider_id || !segment_id || !target_time_s) {
      return res.status(400).json({ error: 'rider_id, segment_id and target_time_s are required' });
    }
    const id = createGoal({ riderId: rider_id, segmentId: segment_id, targetTimeS: target_time_s, deadline, notes });
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// PUT /api/goals/:id
router.put('/:id', (req, res, next) => {
  try {
    const { target_time_s, deadline, notes, achieved_at } = req.body;
    const changed = updateGoal(parseInt(req.params.id), {
      targetTimeS: target_time_s,
      deadline,
      notes,
      achievedAt: achieved_at,
    });
    if (!changed) return res.status(404).json({ error: 'Goal not found' });
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
});

// DELETE /api/goals/:id
router.delete('/:id', (req, res, next) => {
  try {
    const changed = deleteGoal(parseInt(req.params.id));
    if (!changed) return res.status(404).json({ error: 'Goal not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
