import { useState, useEffect } from 'react';
import { getGoals, createGoal, updateGoal, deleteGoal, getQualifyingSegments } from '../api.js';

const fmtTime = (s) => {
  if (!s && s !== 0) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Parse "m:ss" input → total seconds
const parseTime = (str) => {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  const n = Number(str);
  return isNaN(n) ? null : n;
};

const progressPct = (current, target) => {
  if (!current) return 0;
  // Lower is better: progress = how close current is to target
  // 100% = at target, 0% = very far away
  if (current <= target) return 100;
  // Show percentage of the way there (target / current * 100)
  return Math.round((target / current) * 100);
};

function GoalCard({ goal, onDelete, onAchieve }) {
  const pct = progressPct(goal.current_best, goal.target_time_s);
  const achieved = !!goal.achieved_at;
  const overdue = goal.deadline && !achieved && new Date(goal.deadline) < new Date();

  return (
    <div className={`card goal-card${achieved ? ' goal-achieved' : ''}${overdue ? ' goal-overdue' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{goal.segment_name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted-text)' }}>{goal.rider_name}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!achieved && goal.current_best && goal.current_best <= goal.target_time_s && (
            <button className="btn-small btn-primary" onClick={() => onAchieve(goal.id)}>
              ✓ Mark achieved
            </button>
          )}
          <button className="btn-small"
            style={{ color: 'var(--it-red)', borderColor: 'var(--it-red)', border: '1px solid' }}
            onClick={() => onDelete(goal.id, goal.segment_name)}>
            Delete
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
        <div>
          <div style={{ color: 'var(--muted-text)', fontSize: 11 }}>Target</div>
          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16, color: 'var(--orange)' }}>
            {fmtTime(goal.target_time_s)}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--muted-text)', fontSize: 11 }}>Current best</div>
          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16 }}>
            {goal.current_best ? fmtTime(goal.current_best) : '—'}
          </div>
        </div>
        {goal.deadline && (
          <div>
            <div style={{ color: 'var(--muted-text)', fontSize: 11 }}>Deadline</div>
            <div style={{ fontWeight: 600, color: overdue ? 'var(--danger, #c0392b)' : 'inherit' }}>
              {goal.deadline}
              {overdue && ' ⚠️'}
            </div>
          </div>
        )}
        {achieved && (
          <div>
            <div style={{ color: 'var(--muted-text)', fontSize: 11 }}>Achieved</div>
            <div style={{ fontWeight: 600, color: 'var(--it-green)' }}>
              {new Date(goal.achieved_at * 1000).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!achieved && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted-text)', marginBottom: 4 }}>
            <span>Progress</span>
            <span>{pct}%</span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar"
              style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--it-green)' : 'var(--orange)' }} />
          </div>
        </div>
      )}

      {goal.notes && (
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--muted-text)' }}>{goal.notes}</p>
      )}
    </div>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [segments, setSegments] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ rider_id: '', segment_id: '', target_time: '', deadline: '', notes: '' });

  const load = async () => {
    try {
      const [g, segs] = await Promise.all([getGoals(), getQualifyingSegments()]);
      setGoals(g);
      setSegments(segs);
      // Dedupe riders from goals for filter (or from sync status)
      const riderMap = {};
      g.forEach(gol => { riderMap[gol.rider_id] = gol.rider_name; });
      setRiders(Object.entries(riderMap).map(([id, name]) => ({ id: Number(id), name })));
    } finally {
      setLoading(false);
    }
  };

  // Also load all riders from API to populate the form
  useEffect(() => {
    load();
    fetch('/api/sync/status/all').then(r => r.json()).then(data => {
      setRiders(data.map(d => ({ id: d.rider.id, name: d.rider.name })));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    const target_time_s = parseTime(form.target_time);
    if (!target_time_s) { setError('Enter a valid target time (m:ss)'); return; }
    if (!form.rider_id || !form.segment_id) { setError('Select a rider and segment'); return; }
    setSaving(true); setError(null);
    try {
      await createGoal({
        rider_id: Number(form.rider_id),
        segment_id: Number(form.segment_id),
        target_time_s,
        deadline: form.deadline || null,
        notes: form.notes || null,
      });
      setForm({ rider_id: '', segment_id: '', target_time: '', deadline: '', notes: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete goal for "${name}"?`)) return;
    await deleteGoal(id);
    load();
  };

  const handleAchieve = async (id) => {
    await updateGoal(id, {
      achieved_at: Math.floor(Date.now() / 1000),
    });
    load();
  };

  const active = goals.filter(g => !g.achieved_at);
  const done = goals.filter(g => g.achieved_at);

  return (
    <div className="page">
      <h1>🎯 Goals</h1>
      <p className="muted mb">
        Set a target time on any segment for any rider. Track progress as they ride.
      </p>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <>
          {active.length === 0 && !showForm && (
            <div className="card" style={{ marginBottom: 20 }}>
              <p className="muted">No active goals. Add your first goal below.</p>
            </div>
          )}

          {active.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ marginBottom: 12 }}>Active goals</h2>
              {active.map(g => (
                <GoalCard key={g.id} goal={g} onDelete={handleDelete} onAchieve={handleAchieve} />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ marginBottom: 12 }}>✅ Achieved</h2>
              {done.map(g => (
                <GoalCard key={g.id} goal={g} onDelete={handleDelete} onAchieve={handleAchieve} />
              ))}
            </div>
          )}

          {showForm ? (
            <div className="card">
              <h2 style={{ marginBottom: 16 }}>New goal</h2>
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <div className="filter-group" style={{ flex: '1 1 140px' }}>
                    <label>Rider</label>
                    <select required value={form.rider_id} onChange={set('rider_id')}>
                      <option value="">Select rider…</option>
                      {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="filter-group" style={{ flex: '2 1 220px' }}>
                    <label>Segment</label>
                    <select required value={form.segment_id} onChange={set('segment_id')}>
                      <option value="">Select segment…</option>
                      {segments.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.category ? ` (${s.category === 'HC' ? 'HC' : `Cat ${s.category}`})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>Target time (m:ss)</label>
                    <input type="text" required placeholder="e.g. 12:30" value={form.target_time}
                      onChange={set('target_time')} style={{ width: 90 }} />
                  </div>
                  <div className="filter-group">
                    <label>Deadline (optional)</label>
                    <input type="date" value={form.deadline} onChange={set('deadline')} />
                  </div>
                </div>
                <div className="filter-group">
                  <label>Notes</label>
                  <input type="text" placeholder="optional notes…" value={form.notes}
                    onChange={set('notes')} style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Add goal'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setError(null); }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add goal</button>
          )}
        </>
      )}
    </div>
  );
}
