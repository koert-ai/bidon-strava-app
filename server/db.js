const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbPath = path.resolve(__dirname, process.env.DB_PATH || './data/bidon.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

const createTables = () => {
  db.exec(`
    PRAGMA foreign_keys = ON;

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

const getRiderById = (id) => db.prepare('SELECT * FROM riders WHERE id = ?').get(id);
const getRiderByStravaAthleteId = (stravaAthleteId) =>
  db.prepare('SELECT * FROM riders WHERE strava_athlete_id = ?').get(stravaAthleteId);

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

const upsertSyncState = ({ riderId, backfillComplete = 0, lastPageFetched = 0, oldestActivityDate = null, lastSyncedAt = null }) => {
  const existing = getSyncState(riderId);
  if (existing) {
    db.prepare(
      `UPDATE sync_state SET backfill_complete=?, last_page_fetched=?, oldest_activity_date=?, last_synced_at=? WHERE rider_id=?`
    ).run(backfillComplete, lastPageFetched, oldestActivityDate, lastSyncedAt, riderId);
  } else {
    db.prepare(
      `INSERT INTO sync_state (rider_id, backfill_complete, last_page_fetched, oldest_activity_date, last_synced_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(riderId, backfillComplete, lastPageFetched, oldestActivityDate, lastSyncedAt);
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
       difficulty_score=?, category=? WHERE id=?`
    ).run(segment.name, segment.distance_m, segment.elevation_gain_m, segment.average_grade,
      segment.country, score, category, segment.id);
  } else {
    db.prepare(
      `INSERT INTO segments (id, name, distance_m, elevation_gain_m, average_grade, country, difficulty_score, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(segment.id, segment.name, segment.distance_m, segment.elevation_gain_m,
      segment.average_grade, segment.country, score, category);
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

module.exports = {
  db,
  getRiderById,
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
};
