import { useState, useEffect } from 'react';
import { getStravaLoginUrl, getSyncStatus, triggerBackfill } from '../api.js';

const getAllStatus = () => fetch('/api/sync/status/all').then(r => r.json());

export default function Connect() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(null); // riderId being backfilled
  const [errors, setErrors] = useState({});
  const [justConnected, setJustConnected] = useState(null); // name from URL

  // Read riderId / name from OAuth redirect query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      setJustConnected(params.get('name') || 'Rider');
      // Clean URL without reloading
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const fetchAll = async () => {
    try {
      const data = await getAllStatus();
      setRiders(data);
    } catch {
      setRiders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Poll while any backfill is running
  useEffect(() => {
    if (!backfilling) return;
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [backfilling]);

  const handleBackfill = async (riderId) => {
    setBackfilling(riderId);
    setErrors(e => ({ ...e, [riderId]: null }));
    try {
      await triggerBackfill(riderId);
      await fetchAll();
    } catch (err) {
      setErrors(e => ({ ...e, [riderId]: err.message }));
    } finally {
      setBackfilling(null);
    }
  };

  return (
    <div className="page">
      <h1>Rider Connections</h1>

      {justConnected && (
        <div className="card" style={{ borderLeft: '4px solid var(--it-green)', marginBottom: 20 }}>
          <strong>✓ {justConnected} connected to Strava!</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            Click "Start backfill" below to sync their ride history.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Invite a rider</h2>
        <p className="muted mb">
          Share this link with each club member. They click it, authorise with their own Strava account,
          and their history will be added to the database.
        </p>
        <a className="strava-btn" href={getStravaLoginUrl()}>
          Connect with Strava
        </a>
      </div>

      {loading && <p className="muted">Loading…</p>}

      {!loading && riders.length === 0 && (
        <p className="muted">No riders connected yet.</p>
      )}

      {riders.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Activities</th>
                <th>Segment efforts</th>
                <th>Backfill</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {riders.map(({ rider, sync_state, activity_count, segment_effort_count }) => (
                <tr key={rider.id}>
                  <td style={{ fontWeight: 600 }}>{rider.name}</td>
                  <td>{activity_count.toLocaleString()}</td>
                  <td>{segment_effort_count.toLocaleString()}</td>
                  <td>
                    {sync_state.backfill_complete
                      ? <span style={{ color: 'var(--it-green)', fontWeight: 700 }}>✓ Complete</span>
                      : backfilling === rider.id
                        ? <span className="muted">Running (page {sync_state.last_page_fetched})…</span>
                        : <span className="muted">Not started</span>}
                  </td>
                  <td>
                    {!sync_state.backfill_complete && (
                      <button
                        className="btn-primary btn-small"
                        onClick={() => handleBackfill(rider.id)}
                        disabled={backfilling !== null}
                      >
                        {backfilling === rider.id ? 'Running…' : 'Start backfill'}
                      </button>
                    )}
                    {errors[rider.id] && (
                      <span className="error" style={{ marginLeft: 8 }}>{errors[rider.id]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {backfilling && (
        <div className="card">
          <p>Backfill running — this may take several minutes depending on ride history.</p>
          <div className="progress-bar-wrap mt">
            <div className="progress-bar" style={{ width: '60%' }} />
          </div>
          <p className="muted mt" style={{ fontSize: 12 }}>
            Keep this tab open. Check the server terminal for detailed progress.
          </p>
        </div>
      )}
    </div>
  );
}
