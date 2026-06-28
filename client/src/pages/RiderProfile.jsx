import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRiderProfile } from '../api.js';

const fmtTime = (s) => {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

export default function RiderProfile() {
  const { riderId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRiderProfile(riderId)
      .then(setProfile)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [riderId]);

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!profile) return null;

  const { rider, sync_state, stats, top_segments, recent_rides } = profile;

  return (
    <div className="page">
      <div style={{ marginBottom: 16 }}>
        <Link to="/leaderboard" className="muted" style={{ fontSize: 13, textDecoration: 'none' }}>
          ← Back to leaderboard
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{rider.name}</h1>
        <span className="muted" style={{ fontSize: 13 }}>
          Connected {fmtDate(rider.connected_at)}
          {sync_state?.last_synced_at ? ` · Last synced ${new Date(sync_state.last_synced_at * 1000).toLocaleString()}` : ''}
        </span>
      </div>

      <div className="stat-row">
        <div className="stat" style={{ borderTopColor: 'var(--it-green)' }}>
          <div className="stat-value">{stats.activity_count.toLocaleString()}</div>
          <div className="stat-label">Rides synced</div>
        </div>
        <div className="stat" style={{ borderTopColor: 'var(--orange)' }}>
          <div className="stat-value">{stats.effort_count.toLocaleString()}</div>
          <div className="stat-label">Segment efforts</div>
        </div>
        <div className="stat" style={{ borderTopColor: 'var(--it-red)' }}>
          <div className="stat-value">{stats.unique_segments.toLocaleString()}</div>
          <div className="stat-label">Unique segments</div>
        </div>
      </div>

      {top_segments.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: '14px 20px 0', fontWeight: 700, fontSize: 14 }}>Most-ridden segments</div>
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Cat</th>
                <th>Times ridden</th>
                <th>Best time</th>
              </tr>
            </thead>
            <tbody>
              {top_segments.map(seg => (
                <tr key={seg.id}>
                  <td style={{ fontWeight: 600 }}>
                    <a
                      href={`https://www.strava.com/segments/${seg.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {seg.name}
                    </a>
                  </td>
                  <td>
                    <span className={`badge badge-${seg.category || 'none'}`}>
                      {seg.category ? (seg.category === 'HC' ? 'HC' : `Cat ${seg.category}`) : 'Uncat'}
                    </span>
                  </td>
                  <td>{seg.effort_count}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtTime(seg.best_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recent_rides.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 20px 0', fontWeight: 700, fontSize: 14 }}>Recent rides</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Segment</th>
                <th>Cat</th>
                <th>Best time</th>
                <th>Riders that day</th>
              </tr>
            </thead>
            <tbody>
              {recent_rides.map((ride, i) => (
                <tr key={`${ride.segment_id}-${ride.ride_date}-${i}`}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{ride.ride_date}</td>
                  <td style={{ fontWeight: 600 }}>{ride.segment_name}</td>
                  <td>
                    <span className={`badge badge-${ride.category || 'none'}`}>
                      {ride.category ? (ride.category === 'HC' ? 'HC' : `Cat ${ride.category}`) : 'Uncat'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{fmtTime(ride.best_time)}</td>
                  <td className="muted">{ride.total_riders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {top_segments.length === 0 && recent_rides.length === 0 && (
        <div className="card">
          <p className="muted">No segment efforts yet. Run a backfill to populate this rider's data.</p>
        </div>
      )}
    </div>
  );
}
