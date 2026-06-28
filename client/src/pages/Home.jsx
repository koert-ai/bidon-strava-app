import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getRecentFeed, getGlobalStats } from '../api.js';

const MEDAL = ['🥇', '🥈', '🥉'];

const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

function FeedCard({ event }) {
  const { segment, ride_date, riders } = event;
  if (!segment) return null;
  return (
    <div className="card event-block">
      <div className="feed-card-header">
        <div>
          <div className="event-date">
            {ride_date} — {riders.length} rider{riders.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{segment.name}</span>
            <span className={`badge badge-${segment.category || 'none'}`}>
              {segment.category ? (segment.category === 'HC' ? 'HC' : `Cat ${segment.category}`) : 'Uncat'}
            </span>
            {segment.distance_m && (
              <span className="muted" style={{ fontSize: 12 }}>
                {(segment.distance_m / 1000).toFixed(1)} km
                {segment.average_grade != null ? ` · ${segment.average_grade.toFixed(1)}%` : ''}
              </span>
            )}
          </div>
        </div>
        <a
          href={`https://www.strava.com/segments/${segment.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="strava-segment-link"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z"/>
            <path d="M9.664 14.093L6.6 8.592H3.533L9.664 20.87l3.064-6.085h-3.065l-.001-.692z"/>
          </svg>
          Strava
        </a>
      </div>

      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th style={{ width: 36 }}>Rank</th>
            <th>Rider</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {riders.map((r, i) => (
            <tr key={r.rider_id}>
              <td style={{ fontSize: 16 }}>{MEDAL[i] || `#${i + 1}`}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td style={{ fontFamily: 'monospace' }}>{fmtTime(r.best_time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [feed, setFeed] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRecentFeed(20), getGlobalStats()])
      .then(([f, s]) => { setFeed(f); setStats(s); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Recent Group Rides</h1>
        <Link to="/leaderboard" className="btn-primary" style={{ textDecoration: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
          View leaderboard →
        </Link>
      </div>

      {stats && (
        <div className="stat-row">
          <div className="stat" style={{ borderTopColor: 'var(--it-green)' }}>
            <div className="stat-value">{stats.riders}</div>
            <div className="stat-label">Riders</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats.activities.toLocaleString()}</div>
            <div className="stat-label">Activities</div>
          </div>
          <div className="stat" style={{ borderTopColor: 'var(--orange)' }}>
            <div className="stat-value">{stats.efforts.toLocaleString()}</div>
            <div className="stat-label">Segment efforts</div>
          </div>
          <div className="stat" style={{ borderTopColor: 'var(--it-red)' }}>
            <div className="stat-value">{stats.segments.toLocaleString()}</div>
            <div className="stat-label">Segments</div>
          </div>
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}

      {!loading && feed.length === 0 && (
        <div className="card">
          <p className="muted" style={{ marginBottom: 8 }}>No group rides yet.</p>
          <p className="muted">
            Go to <Link to="/connect">Riders</Link> to connect a Strava account and start a backfill.
          </p>
        </div>
      )}

      <div className="events-list">
        {feed.map(event => (
          <FeedCard key={`${event.segment?.id}-${event.ride_date}`} event={event} />
        ))}
      </div>
    </div>
  );
}
