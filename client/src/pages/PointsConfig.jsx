import { useState, useEffect } from 'react';
import { getPointsConfig, updatePointsForCategory } from '../api.js';

const CATEGORIES = ['HC', '1', '2', '3', '4'];
const DEFAULTS = {
  HC: [25, 20, 16, 14, 12, 10, 8, 6, 4, 2],
  '1': [10, 8, 6, 4, 2, 1],
  '2': [5, 3, 2, 1],
  '3': [2, 1],
  '4': [1],
};

export default function PointsConfig() {
  const [config, setConfig] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    const data = await getPointsConfig();
    setConfig(data);
    const d = {};
    for (const cat of CATEGORIES) {
      d[cat] = (data[cat] || []).join(', ');
    }
    setDrafts(d);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (cat) => {
    setSaving(cat);
    setError(null);
    setSaved(null);
    try {
      const points = drafts[cat]
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .map(Number);
      if (points.some(isNaN) || points.some(p => p < 0)) {
        throw new Error('Enter comma-separated non-negative numbers');
      }
      const updated = await updatePointsForCategory(cat, points);
      setConfig(updated);
      setSaved(cat);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleReset = (cat) => {
    setDrafts(d => ({ ...d, [cat]: DEFAULTS[cat].join(', ') }));
  };

  if (!config) return <div className="page"><p className="muted">Loading…</p></div>;

  return (
    <div className="page">
      <h1>Points Configuration</h1>
      <p className="muted mb">
        Enter comma-separated points for each finishing position (1st, 2nd, 3rd…).
        Points are only awarded on group-ride days when ≥N riders hit the same segment.
      </p>

      {CATEGORIES.map(cat => (
        <div className="card" key={cat}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span className={`badge badge-${cat}`}>{cat === 'HC' ? 'HC' : `Cat ${cat}`}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {(config[cat] || []).length} positions currently configured
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(config[cat] || []).map((pts, i) => (
              <span key={i} style={{
                background: '#f0f0f0', borderRadius: 4, padding: '2px 8px',
                fontSize: 13, fontWeight: 600
              }}>
                P{i + 1}: {pts}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              style={{ flex: 1, minWidth: 200 }}
              value={drafts[cat] || ''}
              onChange={e => setDrafts(d => ({ ...d, [cat]: e.target.value }))}
              placeholder="e.g. 25, 20, 16, 14, 12, 10"
            />
            <button className="btn-primary btn-small" onClick={() => handleSave(cat)} disabled={saving === cat}>
              {saving === cat ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary btn-small" onClick={() => handleReset(cat)}>
              Reset to default
            </button>
            {saved === cat && <span style={{ color: 'green', fontSize: 12 }}>✓ Saved</span>}
          </div>
        </div>
      ))}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
