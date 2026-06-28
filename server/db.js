const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbPath = path.resolve(__dirname, process.env.DB_PATH || './data/bidon.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
console.log(`[db] SQLite database at: ${dbPath}`);

const createTables = () => {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS riders (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      strava_athlete_id INTEGER UNIQUE,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      connected_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY,
      rider_id INTEGER NOT NULL REFERENCES riders(id),
      name TEXT,
      start_date TEXT NOT NULL,
      start_date_local TEXT NOT NULL,
      country TEXT,
      distance_m REAL,
      total_elevation_gain_m REAL,
      type TEXT
    );

    CREATE TABLE IF NOT EXISTS segments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      distance_m REAL,
      elevation_gain_m REAL,
      average_grade REAL,
      country TEXT
    );

    CREATE TABLE IF NOT EXISTS segment_efforts (
      id INTEGER PRIMARY KEY,
      activity_id INTEGER NOT NULL REFERENCES activities(id),
      rider_id INTEGER NOT NULL REFERENCES riders(id),
      segment_id INTEGER NOT NULL REFERENCES segments(id),
      elapsed_time_s INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      rank_in_effort INTEGER
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      rider_id INTEGER PRIMARY KEY REFERENCES riders(id),
      backfill_complete INTEGER DEFAULT 0,
      last_page_fetched INTEGER DEFAULT 0,
      oldest_activity_date TEXT,
      last_synced_at INTEGER
    );
  `);
};

const migrateSchema = () => {
  // Add difficulty_score, category and starred columns to segments if missing
  const segmentCols = db.prepare('PRAGMA table_info(segments)').all().map(c => c.name);
  let needsRecompute = false;
  if (!segmentCols.includes('difficulty_score')) {
    db.exec('ALTER TABLE segments ADD COLUMN difficulty_score REAL');
    needsRecompute = true;
  }
  if (!segmentCols.includes('category')) {
    db.exec('ALTER TABLE segments ADD COLUMN category TEXT');
    needsRecompute = true;
  }
  if (!segmentCols.includes('starred')) {
    db.exec('ALTER TABLE segments ADD COLUMN starred INTEGER DEFAULT 0');
  }
  // Elevation & grade detail columns
  if (!segmentCols.includes('max_grade')) {
    db.exec('ALTER TABLE segments ADD COLUMN max_grade REAL');
  }
  if (!segmentCols.includes('elevation_high')) {
    db.exec('ALTER TABLE segments ADD COLUMN elevation_high REAL');
  }
  if (!segmentCols.includes('elevation_low')) {
    db.exec('ALTER TABLE segments ADD COLUMN elevation_low REAL');
  }

  // Sync error tracking
  const syncCols = db.prepare('PRAGMA table_info(sync_state)').all().map(c => c.name);
  if (!syncCols.includes('last_error')) {
    db.exec('ALTER TABLE sync_state ADD COLUMN last_error TEXT');
  }

  // Bidon Week event media fields
  const eventCols = db.prepare('PRAGMA table_info(events)').all().map(c => c.name);
  if (!eventCols.includes('video_url')) {
    db.exec('ALTER TABLE events ADD COLUMN video_url TEXT');
  }
  if (!eventCols.includes('notes')) {
    db.exec('ALTER TABLE events ADD COLUMN notes TEXT');
  }

  // Rider profile fields
  const riderCols = db.prepare('PRAGMA table_info(riders)').all().map(c => c.name);
  if (!riderCols.includes('nickname')) {
    db.exec('ALTER TABLE riders ADD COLUMN nickname TEXT');
  }
  if (!riderCols.includes('picture_url')) {
    db.exec('ALTER TABLE riders ADD COLUMN picture_url TEXT');
  }
  if (!riderCols.includes('palmares')) {
    db.exec('ALTER TABLE riders ADD COLUMN palmares TEXT'); // JSON array of strings
  }
  if (!riderCols.includes('favorite_cyclists')) {
    db.exec('ALTER TABLE riders ADD COLUMN favorite_cyclists TEXT'); // JSON array of strings
  }
  if (!riderCols.includes('bio')) {
    db.exec('ALTER TABLE riders ADD COLUMN bio TEXT');
  }

  // Seed the 9 Bidon club riders (without Strava connection — they connect later)
  const riderSeedCount = db.prepare("SELECT COUNT(*) as count FROM riders").get().count;
  if (riderSeedCount === 0) {
    const insRider = db.prepare('INSERT OR IGNORE INTO riders (name) VALUES (?)');
    db.transaction(() => {
      ['Ares', 'Koert', 'Gregor', 'Jaap', 'Rutger', 'Berg', 'Thomas', 'Chris', 'Maurice'].forEach(n => insRider.run(n));
    })();
  }

  // Seed historical Bidon Week events
  const eventCount = db.prepare("SELECT COUNT(*) as count FROM events").get().count;
  if (eventCount === 0) {
    const insEvent = db.prepare(
      'INSERT INTO events (name, location, date_from, date_to) VALUES (?, ?, ?, ?)'
    );
    const bidonEvents = [
      { name: 'Bidon Week 2001', location: 'Mai Tai', year: 2001 },
      { name: 'Bidon Week 2002', location: 'Mont Ventoux', year: 2002 },
      { name: 'Bidon Week 2003', location: 'Pyreneeën', year: 2003 },
      { name: 'Bidon Week 2004', location: 'Alpen', year: 2004 },
      { name: 'Bidon Week 2006', location: 'Barcelonette', year: 2006 },
      { name: 'Bidon Week 2008', location: 'Marmotte', year: 2008 },
      { name: 'Bidon Week 2009', location: 'Lombardije', year: 2009 },
      { name: 'Bidon Week 2010', location: 'Vogezen', year: 2010 },
      { name: 'Bidon Week 2011', location: 'Mallorca', year: 2011 },
      { name: 'Bidon Week 2013', location: 'Tegernsee', year: 2013 },
      { name: 'Bidon Week 2014', location: 'Sierra Nevada', year: 2014 },
      { name: 'Bidon Week 2015', location: 'Cevennen', year: 2015 },
    ];
    db.transaction(() => {
      bidonEvents.forEach(({ name, location, year }) => {
        insEvent.run(name, location, `${year}-09-01`, `${year}-09-30`);
      });
    })();
  }

  // Create category_config (replaces climb_config)
  db.exec(`
    CREATE TABLE IF NOT EXISTS category_config (
      category TEXT PRIMARY KEY,
      min_score REAL NOT NULL,
      display_order INTEGER NOT NULL
    )
  `);
  const catCount = db.prepare('SELECT COUNT(*) as count FROM category_config').get().count;
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO category_config (category, min_score, display_order) VALUES (?, ?, ?)');
    db.transaction(() => {
      ins.run('HC', 600, 0);
      ins.run('1', 300, 1);
      ins.run('2', 150, 2);
      ins.run('3', 75, 3);
      ins.run('4', 25, 4);
    })();
  }

  if (needsRecompute) _needsRecomputeOnInit = true;

  // Goals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rider_id INTEGER NOT NULL REFERENCES riders(id),
      segment_id INTEGER NOT NULL REFERENCES segments(id),
      target_time_s INTEGER NOT NULL,
      deadline TEXT,
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      achieved_at INTEGER
    )
  `);

  // Push notification subscriptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rider_id INTEGER REFERENCES riders(id),
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  // Migrate points_config to (category, rank, points) schema if needed
  const pointsCols = db.prepare('PRAGMA table_info(points_config)').all().map(c => c.name);
  if (!pointsCols.includes('category')) {
    db.exec('DROP TABLE IF EXISTS points_config');
    db.exec(`
      CREATE TABLE points_config (
        category TEXT NOT NULL,
        rank INTEGER NOT NULL,
        points INTEGER NOT NULL,
        PRIMARY KEY (category, rank)
      )
    `);
    const ins = db.prepare('INSERT INTO points_config (category, rank, points) VALUES (?, ?, ?)');
    const defaults = {
      HC: [25, 20, 16, 14, 12, 10, 8, 6, 4, 2],
      '1': [10, 8, 6, 4, 2, 1],
      '2': [5, 3, 2, 1],
      '3': [2, 1],
      '4': [1],
    };
    db.transaction(() => {
      for (const [cat, pts] of Object.entries(defaults)) {
        pts.forEach((p, i) => ins.run(cat, i + 1, p));
      }
    })();
  }
};

let _needsRecomputeOnInit = false;

createTables();
migrateSchema();

// ── Category helpers ───────────────────────────────────────────────────────────

const getCategoryConfig = () =>
  db.prepare('SELECT * FROM category_config ORDER BY display_order').all();

const computeDifficultyScore = (distanceM, avgGrade) => {
  if (distanceM == null || avgGrade == null || avgGrade <= 0) return null;
  return (distanceM / 1000) * avgGrade * avgGrade;
};

const computeCategoryFromScore = (score) => {
  if (score == null) return null;
  const cats = db.prepare('SELECT * FROM category_config ORDER BY min_score DESC').all();
  for (const cat of cats) {
    if (score >= cat.min_score) return cat.category;
  }
  return null;
};

const recomputeAllSegmentCategories = () => {
  const segs = db.prepare('SELECT id, distance_m, average_grade FROM segments').all();
  const update = db.prepare('UPDATE segments SET difficulty_score = ?, category = ? WHERE id = ?');
  db.transaction(() => {
    for (const seg of segs) {
      const score = computeDifficultyScore(seg.distance_m, seg.average_grade);
      update.run(score, computeCategoryFromScore(score), seg.id);
    }
  })();
};

const updateCategoryThresholds = (thresholds) => {
  const update = db.prepare('UPDATE category_config SET min_score = ? WHERE category = ?');
  db.transaction(() => {
    for (const [cat, minScore] of Object.entries(thresholds)) {
      update.run(minScore, cat);
    }
  })();
  recomputeAllSegmentCategories();
};

if (_needsRecomputeOnInit) recomputeAllSegmentCategories();

// ── Points helpers ─────────────────────────────────────────────────────────────

const getPointsConfig = () => {
  const rows = db.prepare('SELECT * FROM points_config ORDER BY category, rank').all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row.points);
  }
  return grouped;
};

const replacePointsForCategory = (category, pointsArray) => {
  db.transaction(() => {
    db.prepare('DELETE FROM points_config WHERE category = ?').run(category);
    const ins = db.prepare('INSERT INTO points_config (category, rank, points) VALUES (?, ?, ?)');
    pointsArray.forEach((p, i) => ins.run(category, i + 1, p));
  })();
};

// ── Riders ─────────────────────────────────────────────────────────────────────

const getAllRiders = () =>
  db.prepare('SELECT id, name, nickname, picture_url, palmares, favorite_cyclists, bio, strava_athlete_id, connected_at FROM riders ORDER BY id').all();

const getRiderById = (id) => db.prepare('SELECT * FROM riders WHERE id = ?').get(id);
const getRiderByStravaAthleteId = (stravaAthleteId) =>
  db.prepare('SELECT * FROM riders WHERE strava_athlete_id = ?').get(stravaAthleteId);

const updateRiderProfile = (id, { name, nickname, picture_url, palmares, favorite_cyclists, bio }) => {
  db.prepare(
    `UPDATE riders SET name=?, nickname=?, picture_url=?, palmares=?, favorite_cyclists=?, bio=? WHERE id=?`
  ).run(name, nickname ?? null, picture_url ?? null, palmares ?? null, favorite_cyclists ?? null, bio ?? null, id);
};

const upsertRider = ({ stravaAthleteId, name, accessToken, refreshToken, tokenExpiresAt, connectedAt }) => {
  const existing = getRiderByStravaAthleteId(stravaAthleteId);
  if (existing) {
    db.prepare(
      `UPDATE riders SET name=?, access_token=?, refresh_token=?, token_expires_at=?, connected_at=? WHERE id=?`
    ).run(name, accessToken, refreshToken, tokenExpiresAt, connectedAt, existing.id);
    return existing.id;
  }
  const result = db.prepare(
    `INSERT INTO riders (name, strava_athlete_id, access_token, refresh_token, token_expires_at, connected_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, stravaAthleteId, accessToken, refreshToken, tokenExpiresAt, connectedAt);
  return result.lastInsertRowid;
};

// ── Sync state ─────────────────────────────────────────────────────────────────

const getSyncState = (riderId) =>
  db.prepare('SELECT * FROM sync_state WHERE rider_id = ?').get(riderId);

const upsertSyncState = ({ riderId, backfillComplete = 0, lastPageFetched = 0, oldestActivityDate = null, lastSyncedAt = null, lastError = null }) => {
  const existing = getSyncState(riderId);
  if (existing) {
    db.prepare(
      `UPDATE sync_state SET backfill_complete=?, last_page_fetched=?, oldest_activity_date=?, last_synced_at=?, last_error=? WHERE rider_id=?`
    ).run(backfillComplete, lastPageFetched, oldestActivityDate, lastSyncedAt, lastError, riderId);
  } else {
    db.prepare(
      `INSERT INTO sync_state (rider_id, backfill_complete, last_page_fetched, oldest_activity_date, last_synced_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(riderId, backfillComplete, lastPageFetched, oldestActivityDate, lastSyncedAt, lastError);
  }
};

// ── Activities ─────────────────────────────────────────────────────────────────

const insertOrUpdateActivity = (activity) => {
  const existing = db.prepare('SELECT id FROM activities WHERE id = ?').get(activity.id);
  if (existing) {
    db.prepare(
      `UPDATE activities SET rider_id=?, name=?, start_date=?, start_date_local=?, country=?,
       distance_m=?, total_elevation_gain_m=?, type=? WHERE id=?`
    ).run(activity.rider_id, activity.name, activity.start_date, activity.start_date_local,
      activity.country, activity.distance_m, activity.total_elevation_gain_m, activity.type, activity.id);
  } else {
    db.prepare(
      `INSERT INTO activities (id, rider_id, name, start_date, start_date_local, country, distance_m, total_elevation_gain_m, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(activity.id, activity.rider_id, activity.name, activity.start_date, activity.start_date_local,
      activity.country, activity.distance_m, activity.total_elevation_gain_m, activity.type);
  }
};

// ── Segments ───────────────────────────────────────────────────────────────────

const insertOrUpdateSegment = (segment) => {
  const score = computeDifficultyScore(segment.distance_m, segment.average_grade);
  const category = computeCategoryFromScore(score);
  const existing = db.prepare('SELECT id FROM segments WHERE id = ?').get(segment.id);
  if (existing) {
    db.prepare(
      `UPDATE segments SET name=?, distance_m=?, elevation_gain_m=?, average_grade=?, country=?,
       difficulty_score=?, category=?,
       max_grade=COALESCE(?, max_grade),
       elevation_high=COALESCE(?, elevation_high),
       elevation_low=COALESCE(?, elevation_low)
       WHERE id=?`
    ).run(segment.name, segment.distance_m, segment.elevation_gain_m, segment.average_grade,
      segment.country, score, category,
      segment.max_grade ?? null, segment.elevation_high ?? null, segment.elevation_low ?? null,
      segment.id);
  } else {
    db.prepare(
      `INSERT INTO segments (id, name, distance_m, elevation_gain_m, average_grade, country,
       difficulty_score, category, max_grade, elevation_high, elevation_low)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(segment.id, segment.name, segment.distance_m, segment.elevation_gain_m,
      segment.average_grade, segment.country, score, category,
      segment.max_grade ?? null, segment.elevation_high ?? null, segment.elevation_low ?? null);
  }
};

const getSegmentById = (id) => db.prepare('SELECT * FROM segments WHERE id = ?').get(id);

const toggleSegmentStar = (id) => {
  db.prepare('UPDATE segments SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  return getSegmentById(id);
};

const getQualifyingSegments = (from = null, to = null, minRiders = 1) => {
  if (from && to) {
    // Only return segments that had a group ride (≥ minRiders on the same day) in the date range
    return db.prepare(`
      SELECT s.*,
             COUNT(se.id) AS effort_count
      FROM segments s
      JOIN segment_efforts se ON se.segment_id = s.id
      WHERE date(se.start_date) BETWEEN ? AND ?
      GROUP BY s.id
      HAVING COUNT(DISTINCT CASE WHEN date(se.start_date) IN (
        SELECT date(se2.start_date)
        FROM segment_efforts se2
        WHERE se2.segment_id = s.id
          AND date(se2.start_date) BETWEEN ? AND ?
        GROUP BY date(se2.start_date)
        HAVING COUNT(DISTINCT se2.rider_id) >= ?
      ) THEN 1 END) > 0
      ORDER BY
        CASE s.category
          WHEN 'HC' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2
          WHEN '3' THEN 3 WHEN '4' THEN 4 ELSE 5
        END,
        s.difficulty_score DESC
    `).all(from, to, from, to, minRiders);
  }
  return db.prepare(`
    SELECT s.*,
           COUNT(se.id) AS effort_count
    FROM segments s
    LEFT JOIN segment_efforts se ON se.segment_id = s.id
    GROUP BY s.id
    ORDER BY
      CASE s.category
        WHEN 'HC' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2
        WHEN '3' THEN 3 WHEN '4' THEN 4 ELSE 5
      END,
      s.difficulty_score DESC
  `).all();
};

// ── Segment efforts ────────────────────────────────────────────────────────────

const insertOrUpdateSegmentEffort = (effort) => {
  const existing = db.prepare('SELECT id FROM segment_efforts WHERE id = ?').get(effort.id);
  if (existing) {
    db.prepare(
      `UPDATE segment_efforts SET activity_id=?, rider_id=?, segment_id=?, elapsed_time_s=?,
       start_date=?, rank_in_effort=? WHERE id=?`
    ).run(effort.activity_id, effort.rider_id, effort.segment_id, effort.elapsed_time_s,
      effort.start_date, effort.rank_in_effort, effort.id);
  } else {
    db.prepare(
      `INSERT INTO segment_efforts (id, activity_id, rider_id, segment_id, elapsed_time_s, start_date, rank_in_effort)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(effort.id, effort.activity_id, effort.rider_id, effort.segment_id,
      effort.elapsed_time_s, effort.start_date, effort.rank_in_effort);
  }
};

// ── Ranking queries ────────────────────────────────────────────────────────────

const getClimbRanking = (segmentId, from, to, minRiders) => {
  const segment = getSegmentById(segmentId);
  if (!segment) return null;

  const scoringDates = db.prepare(`
    SELECT date(start_date) AS ride_date, COUNT(DISTINCT rider_id) AS rider_count
    FROM segment_efforts
    WHERE segment_id = ? AND date(start_date) BETWEEN ? AND ?
    GROUP BY date(start_date)
    HAVING rider_count >= ?
    ORDER BY ride_date DESC
  `).all(segmentId, from, to, minRiders);

  if (scoringDates.length === 0) return { segment, events: [] };

  const dates = scoringDates.map(d => d.ride_date);
  const ph = dates.map(() => '?').join(',');

  const efforts = db.prepare(`
    WITH best AS (
      SELECT rider_id, date(start_date) AS ride_date, MIN(elapsed_time_s) AS best_time
      FROM segment_efforts
      WHERE segment_id = ? AND date(start_date) IN (${ph})
      GROUP BY rider_id, date(start_date)
    )
    SELECT b.rider_id, r.name, b.ride_date, b.best_time,
           ROW_NUMBER() OVER (PARTITION BY b.ride_date ORDER BY b.best_time) AS rank_pos
    FROM best b
    JOIN riders r ON r.id = b.rider_id
    ORDER BY b.ride_date DESC, rank_pos
  `).all(segmentId, ...dates);

  // All-time best per rider on this segment (for PR detection)
  const allTimeBests = db.prepare(`
    SELECT rider_id, MIN(elapsed_time_s) AS all_time_best
    FROM segment_efforts
    WHERE segment_id = ?
    GROUP BY rider_id
  `).all(segmentId);
  const allTimeBestMap = Object.fromEntries(allTimeBests.map(r => [r.rider_id, r.all_time_best]));

  const ptsRows = segment.category
    ? db.prepare('SELECT rank, points FROM points_config WHERE category = ?').all(segment.category)
    : [];
  const ptsMap = Object.fromEntries(ptsRows.map(p => [p.rank, p.points]));

  const eventMap = Object.fromEntries(
    scoringDates.map(d => [d.ride_date, { date: d.ride_date, rider_count: d.rider_count, riders: [] }])
  );
  for (const e of efforts) {
    eventMap[e.ride_date].riders.push({
      rider_id: e.rider_id,
      name: e.name,
      elapsed_time_s: e.best_time,
      rank: e.rank_pos,
      points: ptsMap[e.rank_pos] || 0,
      is_pr: e.best_time === allTimeBestMap[e.rider_id],
    });
  }

  return { segment, events: Object.values(eventMap) };
};

const getGroupRides = (from, to, minRiders) =>
  db.prepare(`
    SELECT se.segment_id, s.name, s.category, s.difficulty_score,
           date(se.start_date) AS ride_date,
           COUNT(DISTINCT se.rider_id) AS rider_count
    FROM segment_efforts se
    JOIN segments s ON s.id = se.segment_id
    WHERE date(se.start_date) BETWEEN ? AND ?
    GROUP BY se.segment_id, date(se.start_date)
    HAVING rider_count >= ?
    ORDER BY ride_date DESC, rider_count DESC
  `).all(from, to, minRiders);

const getLeaderboard = (from, to, minRiders, starredOnly = false) =>
  db.prepare(`
    WITH scoring_events AS (
      SELECT se.segment_id, date(se.start_date) AS ride_date
      FROM segment_efforts se
      JOIN segments s ON s.id = se.segment_id
      WHERE s.category IS NOT NULL
        ${starredOnly ? 'AND s.starred = 1' : ''}
        AND date(se.start_date) BETWEEN ? AND ?
      GROUP BY se.segment_id, date(se.start_date)
      HAVING COUNT(DISTINCT se.rider_id) >= ?
    ),
    best_efforts AS (
      SELECT se.rider_id, se.segment_id, ev.ride_date,
             MIN(se.elapsed_time_s) AS best_time
      FROM segment_efforts se
      JOIN scoring_events ev
        ON ev.segment_id = se.segment_id AND date(se.start_date) = ev.ride_date
      GROUP BY se.rider_id, se.segment_id, ev.ride_date
    ),
    ranked AS (
      SELECT be.rider_id, be.segment_id, be.ride_date, be.best_time,
             s.category,
             ROW_NUMBER() OVER (
               PARTITION BY be.segment_id, be.ride_date ORDER BY be.best_time
             ) AS rank_pos
      FROM best_efforts be
      JOIN segments s ON s.id = be.segment_id
    ),
    scored AS (
      SELECT r.rider_id, r.category, r.rank_pos,
             COALESCE(pc.points, 0) AS points
      FROM ranked r
      LEFT JOIN points_config pc ON pc.category = r.category AND pc.rank = r.rank_pos
    )
    SELECT
      s.rider_id,
      ri.name,
      SUM(s.points) AS total_points,
      SUM(CASE WHEN s.rank_pos = 1 AND s.category = 'HC' THEN 1 ELSE 0 END) AS hc_wins,
      SUM(CASE WHEN s.rank_pos = 1 AND s.category = '1'  THEN 1 ELSE 0 END) AS cat1_wins,
      SUM(CASE WHEN s.rank_pos = 1 AND s.category IN ('2','3','4') THEN 1 ELSE 0 END) AS cat234_wins,
      COUNT(*) AS scored_efforts
    FROM scored s
    JOIN riders ri ON ri.id = s.rider_id
    GROUP BY s.rider_id
    ORDER BY total_points DESC, hc_wins DESC, cat1_wins DESC, cat234_wins DESC
  `).all(from, to, minRiders);

// ── Counts (used by sync status) ───────────────────────────────────────────────

const countActivities = (riderId) =>
  db.prepare('SELECT COUNT(*) AS count FROM activities WHERE rider_id = ?').get(riderId).count;

const countSegmentEfforts = (riderId) =>
  db.prepare('SELECT COUNT(*) AS count FROM segment_efforts WHERE rider_id = ?').get(riderId).count;

const getOldestActivityDate = (riderId) =>
  db.prepare('SELECT MIN(start_date) AS oldest FROM activities WHERE rider_id = ?').get(riderId).oldest;

// ── Events (Bidon Week) ────────────────────────────────────────────────────────

const getEvents = () =>
  db.prepare('SELECT * FROM events ORDER BY date_from DESC').all();

const getEventById = (id) =>
  db.prepare('SELECT * FROM events WHERE id = ?').get(id);

const createEvent = ({ name, location, dateFrom, dateTo, videoUrl, notes }) =>
  db.prepare(
    'INSERT INTO events (name, location, date_from, date_to, video_url, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, location || null, dateFrom, dateTo, videoUrl || null, notes || null).lastInsertRowid;

const updateEvent = (id, { name, location, dateFrom, dateTo, videoUrl, notes }) =>
  db.prepare(
    'UPDATE events SET name=?, location=?, date_from=?, date_to=?, video_url=?, notes=? WHERE id=?'
  ).run(name, location || null, dateFrom, dateTo, videoUrl || null, notes || null, id).changes;

const deleteEvent = (id) =>
  db.prepare('DELETE FROM events WHERE id = ?').run(id).changes;

// ── Global stats ───────────────────────────────────────────────────────────────

const getGlobalStats = () => ({
  riders:     db.prepare('SELECT COUNT(*) AS c FROM riders').get().c,
  activities: db.prepare('SELECT COUNT(*) AS c FROM activities').get().c,
  efforts:    db.prepare('SELECT COUNT(*) AS c FROM segment_efforts').get().c,
  segments:   db.prepare('SELECT COUNT(*) AS c FROM segments').get().c,
});

// ── Recent feed ────────────────────────────────────────────────────────────────

const getRecentFeed = (limit = 20) => {
  const events = db.prepare(`
    SELECT se.segment_id, date(se.start_date) AS ride_date, COUNT(DISTINCT se.rider_id) AS rider_count
    FROM segment_efforts se
    GROUP BY se.segment_id, date(se.start_date)
    ORDER BY ride_date DESC
    LIMIT ?
  `).all(limit);

  return events.map(ev => {
    const segment = getSegmentById(ev.segment_id);
    const riders = db.prepare(`
      SELECT se.rider_id, r.name, MIN(se.elapsed_time_s) AS best_time
      FROM segment_efforts se
      JOIN riders r ON r.id = se.rider_id
      WHERE se.segment_id = ? AND date(se.start_date) = ?
      GROUP BY se.rider_id
      ORDER BY best_time
    `).all(ev.segment_id, ev.ride_date);
    return { segment, ride_date: ev.ride_date, rider_count: ev.rider_count, riders };
  });
};

// ── Monthly points breakdown ───────────────────────────────────────────────────

const getMonthlyPoints = (from, to, minRiders = 1, starredOnly = false) =>
  db.prepare(`
    WITH scoring_events AS (
      SELECT se.segment_id, date(se.start_date) AS ride_date, strftime('%Y-%m', se.start_date) AS month
      FROM segment_efforts se
      JOIN segments s ON s.id = se.segment_id
      WHERE s.category IS NOT NULL
        ${starredOnly ? 'AND s.starred = 1' : ''}
        AND date(se.start_date) BETWEEN ? AND ?
      GROUP BY se.segment_id, date(se.start_date)
      HAVING COUNT(DISTINCT se.rider_id) >= ?
    ),
    best_efforts AS (
      SELECT se.rider_id, se.segment_id, ev.ride_date, ev.month,
             MIN(se.elapsed_time_s) AS best_time
      FROM segment_efforts se
      JOIN scoring_events ev ON ev.segment_id = se.segment_id AND date(se.start_date) = ev.ride_date
      GROUP BY se.rider_id, se.segment_id, ev.ride_date
    ),
    ranked AS (
      SELECT be.rider_id, be.month, s.category,
             ROW_NUMBER() OVER (PARTITION BY be.segment_id, be.ride_date ORDER BY be.best_time) AS rank_pos
      FROM best_efforts be
      JOIN segments s ON s.id = be.segment_id
    ),
    scored AS (
      SELECT r.rider_id, r.month, COALESCE(pc.points, 0) AS points
      FROM ranked r
      LEFT JOIN points_config pc ON pc.category = r.category AND pc.rank = r.rank_pos
    )
    SELECT s.rider_id, ri.name, s.month, SUM(s.points) AS monthly_points
    FROM scored s
    JOIN riders ri ON ri.id = s.rider_id
    GROUP BY s.rider_id, s.month
    ORDER BY s.month, ri.name
  `).all(from, to, minRiders);

// ── Rider profile ──────────────────────────────────────────────────────────────

const getRiderProfile = (riderId) => {
  const rider = getRiderById(riderId);
  if (!rider) return null;
  const { access_token, refresh_token, ...safeRider } = rider;

  const uniqueSegments = db.prepare(
    'SELECT COUNT(DISTINCT segment_id) AS c FROM segment_efforts WHERE rider_id = ?'
  ).get(riderId).c;

  const topSegments = db.prepare(`
    SELECT s.id, s.name, s.category, s.difficulty_score,
           COUNT(se.id) AS effort_count, MIN(se.elapsed_time_s) AS best_time
    FROM segment_efforts se JOIN segments s ON s.id = se.segment_id
    WHERE se.rider_id = ?
    GROUP BY se.segment_id
    ORDER BY effort_count DESC LIMIT 10
  `).all(riderId);

  const recentRides = db.prepare(`
    SELECT se.segment_id, s.name AS segment_name, s.category,
           date(se.start_date) AS ride_date,
           MIN(se.elapsed_time_s) AS best_time,
           (SELECT COUNT(DISTINCT rider_id) FROM segment_efforts
            WHERE segment_id = se.segment_id AND date(start_date) = date(se.start_date)) AS total_riders
    FROM segment_efforts se
    JOIN segments s ON s.id = se.segment_id
    WHERE se.rider_id = ?
    GROUP BY se.segment_id, date(se.start_date)
    ORDER BY ride_date DESC LIMIT 20
  `).all(riderId);

  return {
    rider: safeRider,
    sync_state: getSyncState(riderId),
    stats: {
      activity_count: countActivities(riderId),
      effort_count: countSegmentEfforts(riderId),
      unique_segments: uniqueSegments,
    },
    top_segments: topSegments,
    recent_rides: recentRides,
  };
};

// ── Segment badges ─────────────────────────────────────────────────────────────
// KOM, Iron Rider, First Ascent, Speed Demon — all derived from existing data

const getSegmentBadges = (segmentId) => {
  // KOM: fastest all-time effort
  const kom = db.prepare(`
    SELECT se.rider_id, r.name, MIN(se.elapsed_time_s) AS best_time
    FROM segment_efforts se JOIN riders r ON r.id = se.rider_id
    WHERE se.segment_id = ?
    GROUP BY se.rider_id
    ORDER BY best_time LIMIT 1
  `).get(segmentId);

  // Iron Rider: most efforts
  const iron = db.prepare(`
    SELECT se.rider_id, r.name, COUNT(se.id) AS effort_count
    FROM segment_efforts se JOIN riders r ON r.id = se.rider_id
    WHERE se.segment_id = ?
    GROUP BY se.rider_id
    ORDER BY effort_count DESC LIMIT 1
  `).get(segmentId);

  // First Ascent: earliest date
  const first = db.prepare(`
    SELECT se.rider_id, r.name, MIN(date(se.start_date)) AS first_date
    FROM segment_efforts se JOIN riders r ON r.id = se.rider_id
    WHERE se.segment_id = ?
    GROUP BY se.rider_id
    ORDER BY first_date LIMIT 1
  `).get(segmentId);

  // Speed Demon: biggest improvement (first effort vs. best effort, min 2 efforts)
  const improvements = db.prepare(`
    WITH first_efforts AS (
      SELECT rider_id, MIN(elapsed_time_s) AS first_time,
             (SELECT elapsed_time_s FROM segment_efforts se2
              WHERE se2.segment_id = ? AND se2.rider_id = se.rider_id
              ORDER BY start_date LIMIT 1) AS chronological_first
      FROM segment_efforts se
      WHERE se.segment_id = ?
      GROUP BY rider_id
      HAVING COUNT(*) >= 2
    )
    SELECT fe.rider_id, r.name,
           (fe.chronological_first - fe.first_time) AS improvement_s,
           fe.chronological_first AS from_time,
           fe.first_time AS to_time
    FROM first_efforts fe JOIN riders r ON r.id = fe.rider_id
    WHERE fe.chronological_first > fe.first_time
    ORDER BY improvement_s DESC LIMIT 1
  `).get(segmentId, segmentId);

  return { kom, iron, first, speed_demon: improvements };
};

// ── Segment all-time bests ─────────────────────────────────────────────────────

const getSegmentAllTimeBests = (segmentId) =>
  db.prepare(`
    SELECT se.rider_id, r.name,
           MIN(se.elapsed_time_s) AS best_time,
           COUNT(se.id) AS effort_count,
           MIN(date(se.start_date)) AS first_date,
           MAX(date(se.start_date)) AS last_date
    FROM segment_efforts se JOIN riders r ON r.id = se.rider_id
    WHERE se.segment_id = ?
    GROUP BY se.rider_id
    ORDER BY best_time
  `).all(segmentId);

// ── Rider segment history ──────────────────────────────────────────────────────

const getRiderSegmentHistory = (riderId, segmentId) =>
  db.prepare(`
    SELECT se.id, date(se.start_date) AS ride_date, se.elapsed_time_s,
           (SELECT MIN(elapsed_time_s) FROM segment_efforts se2
            WHERE se2.segment_id = ? AND se2.rider_id = ?
            AND date(se2.start_date) <= date(se.start_date)) AS rolling_best
    FROM segment_efforts se
    WHERE se.segment_id = ? AND se.rider_id = ?
    ORDER BY se.start_date
  `).all(segmentId, riderId, segmentId, riderId);

// ── Goals ──────────────────────────────────────────────────────────────────────

const getGoals = (riderId = null) => {
  const query = riderId
    ? `SELECT g.*, s.name AS segment_name, s.category, s.distance_m,
              r.name AS rider_name,
              (SELECT MIN(elapsed_time_s) FROM segment_efforts
               WHERE segment_id = g.segment_id AND rider_id = g.rider_id) AS current_best
       FROM goals g
       JOIN segments s ON s.id = g.segment_id
       JOIN riders r ON r.id = g.rider_id
       WHERE g.rider_id = ?
       ORDER BY g.created_at DESC`
    : `SELECT g.*, s.name AS segment_name, s.category, s.distance_m,
              r.name AS rider_name,
              (SELECT MIN(elapsed_time_s) FROM segment_efforts
               WHERE segment_id = g.segment_id AND rider_id = g.rider_id) AS current_best
       FROM goals g
       JOIN segments s ON s.id = g.segment_id
       JOIN riders r ON r.id = g.rider_id
       ORDER BY g.created_at DESC`;
  return riderId
    ? db.prepare(query).all(riderId)
    : db.prepare(query).all();
};

const createGoal = ({ riderId, segmentId, targetTimeS, deadline, notes }) =>
  db.prepare(
    'INSERT INTO goals (rider_id, segment_id, target_time_s, deadline, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(riderId, segmentId, targetTimeS, deadline || null, notes || null).lastInsertRowid;

const updateGoal = (id, { targetTimeS, deadline, notes, achievedAt }) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  if (!existing) return 0;
  return db.prepare(
    'UPDATE goals SET target_time_s=?, deadline=?, notes=?, achieved_at=? WHERE id=?'
  ).run(
    targetTimeS ?? existing.target_time_s,
    deadline !== undefined ? (deadline || null) : existing.deadline,
    notes !== undefined ? (notes || null) : existing.notes,
    achievedAt !== undefined ? (achievedAt || null) : existing.achieved_at,
    id
  ).changes;
};

const deleteGoal = (id) =>
  db.prepare('DELETE FROM goals WHERE id = ?').run(id).changes;

// ── Push subscriptions ─────────────────────────────────────────────────────────

const savePushSubscription = ({ riderId, endpoint, p256dh, auth }) => {
  const existing = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
  if (existing) {
    db.prepare('UPDATE push_subscriptions SET rider_id=?, p256dh=?, auth=? WHERE endpoint=?')
      .run(riderId || null, p256dh, auth, endpoint);
  } else {
    db.prepare('INSERT INTO push_subscriptions (rider_id, endpoint, p256dh, auth) VALUES (?,?,?,?)')
      .run(riderId || null, endpoint, p256dh, auth);
  }
};

const deletePushSubscription = (endpoint) =>
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint).changes;

const getAllPushSubscriptions = () =>
  db.prepare('SELECT * FROM push_subscriptions').all();

module.exports = {
  db,
  getAllRiders,
  getRiderById,
  updateRiderProfile,
  getRiderByStravaAthleteId,
  upsertRider,
  getSyncState,
  upsertSyncState,
  insertOrUpdateActivity,
  insertOrUpdateSegment,
  insertOrUpdateSegmentEffort,
  countActivities,
  countSegmentEfforts,
  getOldestActivityDate,
  getCategoryConfig,
  updateCategoryThresholds,
  recomputeAllSegmentCategories,
  getPointsConfig,
  replacePointsForCategory,
  getQualifyingSegments,
  getSegmentById,
  toggleSegmentStar,
  getClimbRanking,
  getGroupRides,
  getLeaderboard,
  getGlobalStats,
  getRecentFeed,
  getMonthlyPoints,
  getRiderProfile,
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getSegmentBadges,
  getSegmentAllTimeBests,
  getRiderSegmentHistory,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  savePushSubscription,
  deletePushSubscription,
  getAllPushSubscriptions,
};
