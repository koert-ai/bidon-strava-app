const express = require('express');
const { getEvents, getEventById, createEvent, updateEvent, deleteEvent } = require('../db');

const router = express.Router();

// GET /api/events
router.get('/', (req, res, next) => {
  try { res.json(getEvents()); } catch (err) { next(err); }
});

// POST /api/events
router.post('/', (req, res, next) => {
  try {
    const { name, location, date_from, date_to, video_url, notes } = req.body;
    if (!name || !date_from || !date_to) {
      return res.status(400).json({ error: 'name, date_from and date_to are required' });
    }
    if (date_from > date_to) {
      return res.status(400).json({ error: 'date_from must be before date_to' });
    }
    const id = createEvent({ name, location, dateFrom: date_from, dateTo: date_to, videoUrl: video_url, notes });
    res.status(201).json(getEventById(id));
  } catch (err) { next(err); }
});

// PUT /api/events/:id
router.put('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, location, date_from, date_to, video_url, notes } = req.body;
    if (!name || !date_from || !date_to) {
      return res.status(400).json({ error: 'name, date_from and date_to are required' });
    }
    const changed = updateEvent(id, { name, location, dateFrom: date_from, dateTo: date_to, videoUrl: video_url, notes });
    if (!changed) return res.status(404).json({ error: 'Event not found' });
    res.json(getEventById(id));
  } catch (err) { next(err); }
});

// DELETE /api/events/:id
router.delete('/:id', (req, res, next) => {
  try {
    const changed = deleteEvent(parseInt(req.params.id));
    if (!changed) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
