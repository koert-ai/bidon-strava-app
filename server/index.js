const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const authRouter = require('./routes/auth');
const syncRouter = require('./routes/sync');
const configRouter = require('./routes/config');
const climbsRouter = require('./routes/climbs');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);
app.use('/api/config', configRouter);
app.use('/api', climbsRouter);

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
