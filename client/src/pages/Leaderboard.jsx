import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getMonthlyPoints } from '../api.js';
import DatePresets from '../components/DatePresets.jsx';
import EventFilter from '../components/EventFilter.jsx';

const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_CLASS = ['leaderboard-rank-1', 'leaderboard-rank-2', 'leaderboard-rank-3'];

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

const genMonths = (from, to) => {
  const months = [];
  const d = new Date(from.slice(0, 7) + '-01');
  const end = new Date(to.slice(0, 7) + '-01');
  while (d <= end) {
    months.push(d.toISOString().slice(0, 7));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
};

function MiniChart({ riderId, monthlyMap, months }) {
  if (!months.length) return null;
  const values = months.map(m => monthlyMap[riderId]?.[m] || 0);
  const max = Math.max(...values, 1);
  const BAR_W = 6, GAP = 2, H = 24;
  const W = months.length * (BAR_W + GAP) - GAP;

  return (
    <svg width={W} height={H} style={{ display: 'block', minWidth: W }}>
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 2 : 0, Math.round((v / max) * H));
        return (
          <rect
            key={i}
            x={i * (BAR_W + GAP)}
            y={H - h}
            width={BAR_W}
            height={h}
            fill={v > 0 ? 'var(--orange)' : 'var(--border)'}
            rx={1}
          >
            <title>{months[i]}: {v} pts</title>
          </rect>
        );
      })}
    </svg>
  );
}

export default function Leaderboard() {
  const [from, setFrom] = useState(yearAgo());
  const [to, setTo] = useState(today());
  const [minRiders, setMinRiders] = useState(1);
  const [starredOnly, setStarredOnly] = useState(false);
  const [data, setData] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePreset, setActivePreset] = useState(null);

  const monthlyMap = {};
  for (const row of monthlyData) {
    if (!monthlyMap[row.rider_id]) monthlyMap[row.rider_id] = {};
    monthlyMap[row.rider_id][row.month] = row.monthly_points;
  }
  const months = genMonths(from, to);

  const load = async (f = from, t = to, mr = minRiders, starred = starredOnly) => {
    setLoading(true);
    setError(null);
    try {
      const [result, monthly] = await Promise.all([
        getLeaderboard(f, t, mr, starred),
        getMonthlyPoints(f, t, mr, starred),
      ]);
      setData(result);
      setMonthlyData(monthly);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreset = (f, t, label) => {
    setFrom(f);
    setTo(t);
    setActivePreset(label);
    load(f, t, minRiders, starredOnly);
  };

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
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset(null); }} />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset(null); }} />
        </div>
        <div className="filter-group">
          <label>Min riders per climb</label>
          <input
            type="number" min={1} max={20} value={minRiders}
            onChange={e => setMinRiders(Number(e.target.value))}
            style={{ width: 70 }}
          />
        </div>
        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={starredOnly} onChange={e => setStarredOnly(e.target.checked)} />
            ★ Starred climbs only
          </label>
        </div>
        <EventFilter onSelect={ev => {
          if (!ev) return;
          setFrom(ev.date_from); setTo(ev.date_to); setActivePreset(ev.name);
          load(ev.date_from, ev.date_to, minRiders, starredOnly);
        }} />

        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <DatePresets onSelect={handlePreset} active={activePreset} />
        </div>
        <button className="btn-primary" onClick={() => load()} disabled={loading} style={{ alignSelf: 'flex-end' }}>
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
                    <th>Efforts</th>
                    <th title="Monthly points trend">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.rider_id} className={RANK_CLASS[i] || ''}>
                      <td style={{ textAlign: 'center' }}>
                        {MEDAL[i] || i + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        <Link
                          to={`/riders/${row.rider_id}`}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                          className="rider-link"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td style={{ fontWeight: 700, fontSize: 18, color: 'var(--orange)' }}>
                        {row.total_points}
                      </td>
                      <td>
                        {row.hc_wins > 0
                          ? <span className="badge badge-HC">{row.hc_wins}×</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {row.cat1_wins > 0
                          ? <span className="badge badge-1">{row.cat1_wins}×</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td>
                        {row.cat234_wins > 0
                          ? <span className="badge badge-4">{row.cat234_wins}×</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td className="muted">{row.scored_efforts}</td>
                      <td>
                        <MiniChart riderId={row.rider_id} monthlyMap={monthlyMap} months={months} />
                      </td>
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
