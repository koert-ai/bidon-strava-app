import { useState, useEffect } from 'react';
import { getQualifyingSegments, getClimbRanking, toggleStar } from '../api.js';

const MEDAL = ['🥇', '🥈', '🥉'];

const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const fmtScore = (score) => score != null ? score.toFixed(1) : '—';

const fmtVam = (elevM, elapsedS) => {
  if (!elevM || !elapsedS) return '—';
  return Math.round((elevM / elapsedS) * 3600);
};

const today = () => new Date().toISOString().slice(0, 10);
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

function RankingSkeleton() {
  return (
    <div>
      <div className="card skeleton-card" style={{ marginBottom: 12 }}>
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-text" style={{ width: '60%' }} />
      </div>
      {[1, 2].map(i => (
        <div className="card" key={i} style={{ marginBottom: 12 }}>
          <div className="skeleton skeleton-text" style={{ width: '40%', marginBottom: 12 }} />
          {[1, 2, 3].map(j => (
            <div key={j} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div className="skeleton" style={{ width: 28, height: 14, borderRadius: 4 }} />
              <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: 40, height: 14, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [from, setFrom] = useState(yearAgo());
  const [to, setTo] = useState(today());
  const [minRiders, setMinRiders] = useState(1);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [filterCat, setFilterCat] = useState('all');
  const [sortBy, setSortBy] = useState('category');
  const [starredOnly, setStarredOnly] = useState(false);

  const loadSegments = (f = from, t = to, mr = minRiders) => {
    getQualifyingSegments(f, t, mr).then(setSegments);
  };

  useEffect(() => {
    loadSegments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRanking = async (segId) => {
    setLoadingRanking(true);
    setRanking(null);
    try {
      const data = await getClimbRanking(segId, from, to, minRiders);
      setRanking(data);
    } finally {
      setLoadingRanking(false);
    }
  };

  const handleSelectSegment = (seg) => {
    setSelected(seg.id);
    loadRanking(seg.id);
  };

  const handleStar = async (e, segId) => {
    e.stopPropagation();
    const result = await toggleStar(segId);
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, starred: result.starred } : s));
  };

  const handleFilterChange = () => {
    loadSegments(from, to, minRiders);
    if (selected) loadRanking(selected);
  };

  const filtered = segments.filter(s => {
    if (starredOnly && !s.starred) return false;
    if (filterCat === 'all') return true;
    if (filterCat === 'categorized') return s.category != null;
    if (filterCat === 'uncategorized') return s.category == null;
    return s.category === filterCat;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'score') return (b.difficulty_score || 0) - (a.difficulty_score || 0);
    if (sortBy === 'distance') return (b.distance_m || 0) - (a.distance_m || 0);
    if (sortBy === 'elevation') return (b.elevation_gain_m || 0) - (a.elevation_gain_m || 0);
    const catOrder = { HC: 0, '1': 1, '2': 2, '3': 3, '4': 4 };
    const ao = catOrder[a.category] ?? 5;
    const bo = catOrder[b.category] ?? 5;
    if (ao !== bo) return ao - bo;
    return (b.difficulty_score || 0) - (a.difficulty_score || 0);
  });

  return (
    <div className="page">
      <h1>Dashboard — Qualifying Climbs</h1>

      <div className="filters">
        <div className="filter-group">
          <label>Category</label>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">All</option>
            <option value="categorized">Categorized only</option>
            <option value="HC">HC</option>
            <option value="1">Cat 1</option>
            <option value="2">Cat 2</option>
            <option value="3">Cat 3</option>
            <option value="4">Cat 4</option>
            <option value="uncategorized">Uncategorised</option>
          </select>
        </div>
        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={starredOnly} onChange={e => setStarredOnly(e.target.checked)} />
            Starred only
          </label>
        </div>
        <div className="filter-group">
          <label>Sort by</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="category">Category</option>
            <option value="score">Difficulty score</option>
            <option value="name">Name</option>
            <option value="distance">Distance</option>
            <option value="elevation">Elevation gain</option>
          </select>
        </div>
        <div className="filter-group">
          <label>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Min riders</label>
          <input type="number" min={1} max={20} value={minRiders}
            onChange={e => setMinRiders(Number(e.target.value))}
            style={{ width: 70 }} />
        </div>
        <button className="btn-primary" onClick={handleFilterChange} disabled={loadingRanking}>
          {loadingRanking ? 'Loading…' : 'Apply filter'}
        </button>
      </div>

      <div className="dashboard-grid" data-split={selected ? 'true' : 'false'}>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>★</th>
                <th>Climb</th>
                <th>Cat</th>
                <th>Score</th>
                <th>Dist (km)</th>
                <th>Elev (m)</th>
                <th>Grade %</th>
                <th>Efforts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(seg => (
                <tr
                  key={seg.id}
                  className={`segment-row${selected === seg.id ? ' selected' : ''}`}
                  onClick={() => handleSelectSegment(seg)}
                >
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="star-btn"
                      title={seg.starred ? 'Unstar' : 'Star this climb'}
                      onClick={e => handleStar(e, seg.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 16, color: seg.starred ? '#f0a500' : '#ccc', padding: 0,
                      }}
                    >
                      {seg.starred ? '★' : '☆'}
                    </button>
                  </td>
                  <td style={{ fontWeight: 600 }}>{seg.name}</td>
                  <td>
                    <span className={`badge badge-${seg.category || 'none'}`}>
                      {seg.category ? (seg.category === 'HC' ? 'HC' : `Cat ${seg.category}`) : 'Uncat'}
                    </span>
                  </td>
                  <td>{fmtScore(seg.difficulty_score)}</td>
                  <td>{seg.distance_m ? (seg.distance_m / 1000).toFixed(1) : '—'}</td>
                  <td>{seg.elevation_gain_m != null ? Math.round(seg.elevation_gain_m) : '—'}</td>
                  <td>{seg.average_grade != null ? seg.average_grade.toFixed(1) : '—'}</td>
                  <td>{seg.effort_count}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>No segments found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div>
            {loadingRanking && <RankingSkeleton />}
            {ranking && !loadingRanking && (
              <>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ marginBottom: 4 }}>{ranking.segment.name}</h2>
                    <a
                      href={`https://www.strava.com/segments/${ranking.segment.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="strava-segment-link"
                      onClick={e => e.stopPropagation()}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z"/>
                        <path d="M9.664 14.093L6.6 8.592H3.533L9.664 20.87l3.064-6.085h-3.065l-.001-.692z"/>
                      </svg>
                      View on Strava
                    </a>
                  </div>
                  <p className="muted" style={{ fontSize: 12 }}>
                    <span className={`badge badge-${ranking.segment.category || 'none'}`} style={{ marginRight: 6 }}>
                      {ranking.segment.category ? (ranking.segment.category === 'HC' ? 'HC' : `Cat ${ranking.segment.category}`) : 'Uncat'}
                    </span>
                    Score: {fmtScore(ranking.segment.difficulty_score)} ·
                    {ranking.segment.distance_m ? ` ${(ranking.segment.distance_m / 1000).toFixed(1)} km` : ''} ·
                    {ranking.segment.average_grade != null ? ` avg ${ranking.segment.average_grade.toFixed(1)}%` : ''} ·
                    {ranking.segment.elevation_gain_m != null ? ` ${Math.round(ranking.segment.elevation_gain_m)} m elev` : ''}
                  </p>
                </div>

                {ranking.events.length === 0 ? (
                  <div className="card">
                    <p className="muted">No group rides found for this segment in the selected date range
                      {minRiders > 1 ? ` with ≥${minRiders} riders` : ''}.
                    </p>
                  </div>
                ) : (
                  <div className="events-list">
                    {ranking.events.map(event => (
                      <div className="card event-block" key={event.date}>
                        <div className="event-date">
                          {event.date} — {event.rider_count} rider{event.rider_count !== 1 ? 's' : ''}
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Rider</th>
                              <th>Time</th>
                              <th title="Vertical Ascent Metres per hour">VAM</th>
                              <th>Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {event.riders.map(r => (
                              <tr key={r.rider_id}>
                                <td>
                                  <span className="rank-medal">{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
                                </td>
                                <td>{r.name}</td>
                                <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  {fmtTime(r.elapsed_time_s)}
                                  {r.is_pr && (
                                    <span className="pr-badge" title="Personal Record!">PR</span>
                                  )}
                                </td>
                                <td className="muted" style={{ fontSize: 12 }}>
                                  {fmtVam(ranking.segment.elevation_gain_m, r.elapsed_time_s)}
                                  {ranking.segment.elevation_gain_m ? <span style={{ fontSize: 10 }}> m/h</span> : ''}
                                </td>
                                <td style={{ fontWeight: 700, color: r.points > 0 ? 'var(--orange)' : 'var(--muted)' }}>
                                  {r.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
