import { useState, useEffect } from 'react';
import { getStravaLoginUrl, getSyncStatus, triggerBackfill, clearRiderData } from '../api.js';

const getAllStatus = () => fetch('/api/sync/status/all').then(r => r.json());

export default function Connect() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(null); // riderId being backfilled
  const [clearing, setClearing] = useState(null); // riderId being cleared
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

  const handleClear = async (riderId, riderName) => {
    if (!window.confirm(`Remove all Strava data for ${riderName}? This cannot be undone.`)) return;
    setClearing(riderId);
    setErrors(e => ({ ...e, [riderId]: null }));
    try {
      await clearRiderData(riderId);
      await fetchAll();
    } catch (err) {
      setErrors(e => ({ ...e, [riderId]: err.message }));
    } finally {
      setClearing(null);
    }
  };

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
                <th>Sync status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {riders.map(({ rider, sync_state, activity_count, segment_effort_count }) => {
                const lastSynced = sync_state.last_synced_at
                  ? new Date(sync_state.last_synced_at * 1000).toLocaleString()
                  : null;
                const isBusy = backfilling !== null || clearing !== null;
                return (
                <tr key={rider.id}>
                  <td style={{ fontWeight: 600 }}>{rider.name}</td>
                  <td>{activity_count.toLocaleString()}</td>
                  <td>{segment_effort_count.toLocaleString()}</td>
                  <td>
                    {sync_state.backfill_complete ? (
                      <span style={{ color: 'var(--it-green)', fontWeight: 700 }}>
                        ✓ Synced{lastSynced ? ` · ${lastSynced}` : ''}
                      </span>
                    ) : backfilling === rider.id ? (
                      <span className="muted">Syncing (page {sync_state.last_page_fetched})…</span>
                    ) : activity_count > 0 ? (
                      <span className="muted">
                        Partial · last page {sync_state.last_page_fetched}
                        {lastSynced ? ` · ${lastSynced}` : ''}
                      </span>
                    ) : (
                      <span className="muted">Not started</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {!sync_state.backfill_complete && (
                      <button
                        className="btn-primary btn-small"
                        onClick={() => handleBackfill(rider.id)}
                        disabled={isBusy}
                      >
                        {backfilling === rider.id ? 'Syncing…' : 'Start sync'}
                      </button>
                    )}
                    {activity_count > 0 && (
                      <button
                        className="btn-small"
                        style={{ color: 'var(--danger, #c0392b)', borderColor: 'var(--danger, #c0392b)' }}
                        onClick={() => handleClear(rider.id, rider.name)}
                        disabled={isBusy}
                      >
                        {clearing === rider.id ? 'Clearing…' : 'Clear data'}
                      </button>
                    )}
                    {errors[rider.id] && (
                      <span className="error">{errors[rider.id]}</span>
                    )}
                  </td>
                </tr>
                );
              })}
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
