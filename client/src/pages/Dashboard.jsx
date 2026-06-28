import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getQualifyingSegments, getClimbRanking, toggleStar,
  getSegmentBadges, getSegmentAllTimeBests, getStravaLeaderboard,
} from '../api.js';
import DatePresets from '../components/DatePresets.jsx';
import EventFilter from '../components/EventFilter.jsx';

const MEDAL = ['🥇', '🥈', '🥉'];

const fmtTime = (s) => {
  if (!s && s !== 0) return '—';
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

// ── Elevation Profile SVG ──────────────────────────────────────────────────────
function ElevationProfile({ segment }) {
  const { distance_m, elevation_gain_m, elevation_low, elevation_high, average_grade } = segment;
  if (!distance_m || !elevation_gain_m) return null;

  const W = 280, H = 80, PAD = { l: 30, r: 8, t: 8, b: 20 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const low = elevation_low ?? 0;
  const high = elevation_high ?? (low + elevation_gain_m);
  const elRange = Math.max(high - low, 1);

  // Build simple profile: flat run-in 10%, then climb at avg grade, optional descent
  const pts = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Slightly bumpy profile using avg grade as primary slope
    const noise = Math.sin(t * Math.PI * 6) * (elRange * 0.03);
    const elev = low + t * elevation_gain_m + noise;
    pts.push({ x: PAD.l + t * plotW, y: PAD.t + plotH - ((elev - low) / elRange) * plotH });
  }

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillD = `${pathD} L${PAD.l + plotW},${PAD.t + plotH} L${PAD.l},${PAD.t + plotH} Z`;

  const yLabels = [low, low + elRange * 0.5, high].map(v => Math.round(v));

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--muted-text)', marginBottom: 4 }}>Elevation profile (estimated)</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        {/* Y-axis labels */}
        {yLabels.map((v, i) => (
          <text key={i}
            x={PAD.l - 4}
            y={PAD.t + plotH - i * plotH / 2 + 3}
            textAnchor="end"
            fontSize="8"
            fill="var(--muted-text)"
          >{v}m</text>
        ))}
        {/* X-axis */}
        <line x1={PAD.l} y1={PAD.t + plotH} x2={PAD.l + plotW} y2={PAD.t + plotH} stroke="var(--border)" strokeWidth="1" />
        {/* X labels */}
        <text x={PAD.l} y={H - 4} fontSize="8" fill="var(--muted-text)">0</text>
        <text x={PAD.l + plotW} y={H - 4} fontSize="8" textAnchor="end" fill="var(--muted-text)">
          {(distance_m / 1000).toFixed(1)}km
        </text>
        {/* Fill area */}
        <path d={fillD} fill="var(--orange)" fillOpacity="0.15" />
        {/* Profile line */}
        <path d={pathD} fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Summit dot */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill="var(--orange)" />
      </svg>
    </div>
  );
}

// ── Badges ─────────────────────────────────────────────────────────────────────
function BadgeRow({ badges }) {
  if (!badges) return null;
  const { kom, iron, first, speed_demon } = badges;
  const items = [
    kom && { icon: '🏆', label: 'KOM', name: kom.name, detail: fmtTime(kom.best_time) },
    iron && { icon: '🔩', label: 'Iron Rider', name: iron.name, detail: `${iron.effort_count} efforts` },
    first && { icon: '⛰️', label: 'First Ascent', name: first.name, detail: first.first_date },
    speed_demon && { icon: '⚡', label: 'Speed Demon', name: speed_demon.name, detail: `-${fmtTime(speed_demon.improvement_s)}` },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {items.map(b => (
        <div key={b.label} className="badge-card" title={`${b.label}: ${b.name} (${b.detail})`}>
          <span style={{ fontSize: 16 }}>{b.icon}</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted-text)', lineHeight: 1 }}>{b.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{b.name}</div>
            <div style={{ fontSize: 10, color: 'var(--orange)' }}>{b.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(() => searchParams.get('seg') ? Number(searchParams.get('seg')) : null);
  const [ranking, setRanking] = useState(null);
  const [from, setFrom] = useState(() => searchParams.get('from') || yearAgo());
  const [to, setTo] = useState(() => searchParams.get('to') || today());
  const [minRiders, setMinRiders] = useState(() => searchParams.get('mr') ? Number(searchParams.get('mr')) : 1);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [filterCat, setFilterCat] = useState('all');
  const [sortBy, setSortBy] = useState('category');
  const [starredOnly, setStarredOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [activePreset, setActivePreset] = useState(null);
  // Grade / VAM filters (client-side)
  const [minGrade, setMinGrade] = useState('');
  const [maxGrade, setMaxGrade] = useState('');

  // Segment detail extras
  const [badges, setBadges] = useState(null);
  const [allTimeBests, setAllTimeBests] = useState(null);
  const [stravaBoard, setStravaBoard] = useState(null);
  const [detailTab, setDetailTab] = useState('ranking'); // 'ranking' | 'bests' | 'strava'
  const [loadingExtras, setLoadingExtras] = useState(false);

  useEffect(() => {
    getQualifyingSegments().then(segs => {
      setSegments(segs);
      const urlSeg = searchParams.get('seg');
      if (urlSeg) {
        const f = searchParams.get('from') || yearAgo();
        const t = searchParams.get('to') || today();
        const mr = searchParams.get('mr') ? Number(searchParams.get('mr')) : 1;
        loadRanking(Number(urlSeg), f, t, mr);
        loadExtras(Number(urlSeg));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRanking = async (segId, f = from, t = to, mr = minRiders) => {
    setLoadingRanking(true);
    setRanking(null);
    try {
      const data = await getClimbRanking(segId, f, t, mr);
      setRanking(data);
    } finally {
      setLoadingRanking(false);
    }
  };

  const loadExtras = async (segId) => {
    setLoadingExtras(true);
    setBadges(null);
    setAllTimeBests(null);
    setStravaBoard(null);
    try {
      const [b, atb] = await Promise.all([
        getSegmentBadges(segId),
        getSegmentAllTimeBests(segId),
      ]);
      setBadges(b);
      setAllTimeBests(atb);
      // Strava leaderboard loaded lazily when tab selected
    } finally {
      setLoadingExtras(false);
    }
  };

  const handleSelectStravaTab = async (segId) => {
    setDetailTab('strava');
    if (!stravaBoard) {
      const data = await getStravaLeaderboard(segId);
      setStravaBoard(data);
    }
  };

  const updateUrl = useCallback((segId, f, t, mr) => {
    const p = {};
    if (segId) p.seg = segId;
    if (f !== yearAgo()) p.from = f;
    if (t !== today()) p.to = t;
    if (mr !== 1) p.mr = mr;
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);

  const handleSelectSegment = (seg) => {
    setSelected(seg.id);
    setDetailTab('ranking');
    loadRanking(seg.id);
    loadExtras(seg.id);
    updateUrl(seg.id, from, to, minRiders);
  };

  const handleStar = async (e, segId) => {
    e.stopPropagation();
    const result = await toggleStar(segId);
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, starred: result.starred } : s));
  };

  const handleApplyFilter = () => {
    getQualifyingSegments(from, to, minRiders).then(setSegments);
    if (selected) {
      loadRanking(selected, from, to, minRiders);
      updateUrl(selected, from, to, minRiders);
    }
  };

  const handlePreset = (f, t, label) => {
    setFrom(f); setTo(t); setActivePreset(label);
    getQualifyingSegments(f, t, minRiders).then(setSegments);
    if (selected) { loadRanking(selected, f, t, minRiders); updateUrl(selected, f, t, minRiders); }
  };

  const filtered = segments.filter(s => {
    if (starredOnly && !s.starred) return false;
    if (filterCat !== 'all') {
      if (filterCat === 'categorized' && s.category == null) return false;
      if (filterCat === 'uncategorized' && s.category != null) return false;
      if (!['categorized', 'uncategorized'].includes(filterCat) && s.category !== filterCat) return false;
    }
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (minGrade !== '' && (s.average_grade == null || s.average_grade < Number(minGrade))) return false;
    if (maxGrade !== '' && (s.average_grade == null || s.average_grade > Number(maxGrade))) return false;
    return true;
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

  const shareUrl = selected
    ? `${window.location.origin}${window.location.pathname}?seg=${selected}&from=${from}&to=${to}${minRiders !== 1 ? `&mr=${minRiders}` : ''}`
    : null;

  return (
    <div className="page">
      <h1>Dashboard — Qualifying Climbs</h1>

      <div className="filters">
        <div className="filter-group" style={{ flex: '1 1 180px' }}>
          <label>Search</label>
          <input type="text" placeholder="Filter by name…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
        </div>
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
        <div className="filter-group">
          <label>Grade %</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="number" min={0} max={30} step={0.5} value={minGrade}
              onChange={e => setMinGrade(e.target.value)}
              placeholder="min" style={{ width: 52 }} />
            <span className="muted" style={{ fontSize: 11 }}>–</span>
            <input type="number" min={0} max={30} step={0.5} value={maxGrade}
              onChange={e => setMaxGrade(e.target.value)}
              placeholder="max" style={{ width: 52 }} />
          </div>
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
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset(null); }} />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset(null); }} />
        </div>
        <div className="filter-group">
          <label>Min riders</label>
          <input type="number" min={1} max={20} value={minRiders}
            onChange={e => setMinRiders(Number(e.target.value))} style={{ width: 70 }} />
        </div>

        <EventFilter onSelect={ev => {
          if (!ev) return;
          setFrom(ev.date_from); setTo(ev.date_to); setActivePreset(ev.name);
          getQualifyingSegments(ev.date_from, ev.date_to, minRiders).then(setSegments);
          if (selected) loadRanking(selected, ev.date_from, ev.date_to, minRiders);
        }} />

        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <DatePresets onSelect={handlePreset} active={activePreset} />
        </div>

        <button className="btn-primary" onClick={handleApplyFilter} disabled={loadingRanking} style={{ alignSelf: 'flex-end' }}>
          {loadingRanking ? 'Loading…' : 'Apply filter'}
        </button>
      </div>

      <div className="dashboard-grid" data-split={selected ? 'true' : 'false'}>
        {/* Left: segment list */}
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
                    <button className="star-btn" title={seg.starred ? 'Unstar' : 'Star'}
                      onClick={e => handleStar(e, seg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 16, color: seg.starred ? '#f0a500' : '#ccc', padding: 0 }}>
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
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                    No segments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right: segment detail */}
        {selected && (
          <div>
            {shareUrl && (
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-small btn-secondary"
                  onClick={() => navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied!'))}
                  title="Copy shareable link">
                  🔗 Copy link
                </button>
              </div>
            )}

            {loadingRanking && <RankingSkeleton />}
            {ranking && !loadingRanking && (
              <>
                {/* Segment info card */}
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ marginBottom: 4 }}>{ranking.segment.name}</h2>
                    <a href={`https://www.strava.com/segments/${ranking.segment.id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="strava-segment-link" onClick={e => e.stopPropagation()}>
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
                    {ranking.segment.average_grade != null ? ` avg ${ranking.segment.average_grade.toFixed(1)}%` : ''}
                    {ranking.segment.max_grade != null ? ` · max ${ranking.segment.max_grade.toFixed(1)}%` : ''} ·
                    {ranking.segment.elevation_gain_m != null ? ` ${Math.round(ranking.segment.elevation_gain_m)} m elev` : ''}
                    {ranking.segment.elevation_high != null ? ` (${Math.round(ranking.segment.elevation_high)}m top)` : ''}
                  </p>

                  <ElevationProfile segment={ranking.segment} />
                  <BadgeRow badges={badges} />
                </div>

                {/* Tabs */}
                <div className="detail-tabs">
                  <button
                    className={`detail-tab${detailTab === 'ranking' ? ' active' : ''}`}
                    onClick={() => setDetailTab('ranking')}>
                    Group rides
                  </button>
                  <button
                    className={`detail-tab${detailTab === 'bests' ? ' active' : ''}`}
                    onClick={() => setDetailTab('bests')}>
                    All-time bests
                  </button>
                  <button
                    className={`detail-tab${detailTab === 'strava' ? ' active' : ''}`}
                    onClick={() => handleSelectStravaTab(selected)}>
                    Strava KOM list
                  </button>
                </div>

                {/* Tab: group ride ranking */}
                {detailTab === 'ranking' && (
                  ranking.events.length === 0 ? (
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
                                <th>Rank</th><th>Rider</th><th>Time</th>
                                <th title="Vertical Ascent Metres per hour">VAM</th><th>Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {event.riders.map(r => (
                                <tr key={r.rider_id}>
                                  <td><span className="rank-medal">{MEDAL[r.rank - 1] || `#${r.rank}`}</span></td>
                                  <td>{r.name}</td>
                                  <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                    {fmtTime(r.elapsed_time_s)}
                                    {r.is_pr && <span className="pr-badge" title="Personal Record!">PR</span>}
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
                  )
                )}

                {/* Tab: all-time bests */}
                {detailTab === 'bests' && (
                  <div className="card" style={{ padding: 0 }}>
                    {!allTimeBests ? (
                      <p className="muted" style={{ padding: 16 }}>Loading…</p>
                    ) : allTimeBests.length === 0 ? (
                      <p className="muted" style={{ padding: 16 }}>No efforts recorded yet.</p>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>#</th><th>Rider</th><th>Best time</th>
                            <th title="VAM on best effort">VAM</th>
                            <th>Efforts</th><th>First ride</th><th>Last ride</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allTimeBests.map((row, i) => (
                            <tr key={row.rider_id}>
                              <td>{MEDAL[i] || i + 1}</td>
                              <td style={{ fontWeight: 600 }}>{row.name}</td>
                              <td style={{ fontFamily: 'monospace' }}>
                                {fmtTime(row.best_time)}
                                {i === 0 && <span className="pr-badge" style={{ marginLeft: 4 }}>KOM</span>}
                              </td>
                              <td className="muted" style={{ fontSize: 12 }}>
                                {fmtVam(ranking.segment.elevation_gain_m, row.best_time)}
                              </td>
                              <td className="muted">{row.effort_count}</td>
                              <td className="muted">{row.first_date}</td>
                              <td className="muted">{row.last_date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Tab: Strava global leaderboard */}
                {detailTab === 'strava' && (
                  <div className="card" style={{ padding: 0 }}>
                    {!stravaBoard ? (
                      <p className="muted" style={{ padding: 16 }}>Loading Strava leaderboard…</p>
                    ) : stravaBoard.error ? (
                      <p className="muted" style={{ padding: 16 }}>
                        Strava leaderboard unavailable: {stravaBoard.error}
                      </p>
                    ) : !stravaBoard.entries?.length ? (
                      <p className="muted" style={{ padding: 16 }}>No Strava leaderboard entries found.</p>
                    ) : (
                      <>
                        <p className="muted" style={{ padding: '8px 16px 0', fontSize: 12 }}>
                          Global Strava leaderboard (top times from all Strava athletes)
                        </p>
                        <table>
                          <thead>
                            <tr><th>Rank</th><th>Athlete</th><th>Time</th><th>VAM</th></tr>
                          </thead>
                          <tbody>
                            {stravaBoard.entries.map((e, i) => (
                              <tr key={e.athlete_id || i}>
                                <td>{MEDAL[i] || i + 1}</td>
                                <td style={{ fontWeight: 600 }}>
                                  {e.athlete_name || `${e.athlete_firstname || ''} ${e.athlete_lastname || ''}`.trim()}
                                </td>
                                <td style={{ fontFamily: 'monospace' }}>{fmtTime(e.elapsed_time)}</td>
                                <td className="muted" style={{ fontSize: 12 }}>
                                  {fmtVam(ranking.segment.elevation_gain_m, e.elapsed_time)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
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
