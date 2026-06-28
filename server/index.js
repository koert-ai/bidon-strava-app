const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const authRouter = require('./routes/auth');
const syncRouter = require('./routes/sync');
const configRouter = require('./routes/config');
const climbsRouter = require('./routes/climbs');
const webhookRouter = require('./routes/webhook');
const eventsRouter = require('./routes/events');
const goalsRouter = require('./routes/goals');
const notificationsRouter = require('./routes/notifications');
const { startDigestJob } = require('./jobs/emailDigest');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);
app.use('/api/config', configRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/events', eventsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', climbsRouter);

startDigestJob();

// Serve built React frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Bidon Strava backend listening on http://localhost:${port}`);
});
