import { useState, useEffect } from 'react';
import { getLeaderboard } from '../api.js';

const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_CLASS = ['leaderboard-rank-1', 'leaderboard-rank-2', 'leaderboard-rank-3'];

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

export default function Leaderboard() {
  const [from, setFrom] = useState(yearAgo());
  const [to, setTo] = useState(today());
  const [minRiders, setMinRiders] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLeaderboard(from, to, minRiders);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <h1>
        <span className="polka-dot" />
        <span className="polka-dot" style={{ background: 'var(--it-white)', border: '1px solid #ccc' }} />
        <span className="polka-dot" style={{ background: 'var(--it-green)' }} />
        {' '}Bidon Points — Leaderboard
      </h1>
      <div className="tricolor-bar" />

      <div className="filters">
        <div className="filter-group">
          <label>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Min riders per climb</label>
          <input
            type="number" min={1} max={20} value={minRiders}
            onChange={e => setMinRiders(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          {data.length === 0 ? (
            <div className="card">
              <p className="muted">
                No scored climbs found in this date range
                {minRiders > 1 ? ` with ≥${minRiders} riders` : ''}.
                Try widening the date range or reducing min riders.
              </p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Rider</th>
                    <th>Points</th>
                    <th title="First-place finishes on HC climbs">HC wins</th>
                    <th title="First-place finishes on Cat 1 climbs">Cat 1 wins</th>
                    <th title="First-place finishes on Cat 2/3/4 climbs">Cat 2-4 wins</th>
                    <th>Efforts scored</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.rider_id} className={RANK_CLASS[i] || ''}>
                      <td style={{ textAlign: 'center' }}>
                        {MEDAL[i] || i + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td style={{ fontWeight: 700, fontSize: 18, color: 'var(--orange)' }}>
                        {row.total_points}
                      </td>
                      <td>
                        {row.hc_wins > 0
                          ? <span className={`badge badge-HC`}>{row.hc_wins}×</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {row.cat1_wins > 0
                          ? <span className={`badge badge-1`}>{row.cat1_wins}×</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {row.cat234_wins > 0
                          ? <span className={`badge badge-4`}>{row.cat234_wins}×</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td className="muted">{row.scored_efforts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted mt" style={{ fontSize: 12 }}>
            Tie-breaker order: HC wins → Cat 1 wins → Cat 2/3/4 wins.
            Points scored on group-ride days only (≥{minRiders} rider{minRiders !== 1 ? 's' : ''} on same climb same day).
          </p>
        </>
      )}
    </div>
  );
}
