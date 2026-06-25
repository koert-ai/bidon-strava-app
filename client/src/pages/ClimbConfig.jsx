import { useState, useEffect } from 'react';
import { getCategoryConfig, updateCategoryConfig, getQualifyingSegments } from '../api.js';

const CATEGORIES = ['HC', '1', '2', '3', '4'];
const DESCRIPTIONS = {
  HC: 'Hors Catégorie — beyond category (score ≥ threshold)',
  '1': 'Category 1 — major mountain passes',
  '2': 'Category 2 — moderate climbs',
  '3': 'Category 3 — rolling hills',
  '4': 'Category 4 — small short hills',
};

export default function ClimbConfig() {
  const [config, setConfig] = useState(null);
  const [thresholds, setThresholds] = useState({});
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getCategoryConfig(), getQualifyingSegments()]).then(([cats, segs]) => {
      setConfig(cats);
      const t = {};
      for (const c of cats) t[c.category] = c.min_score;
      setThresholds(t);

      const c = {};
      for (const s of segs) {
        const key = s.category || 'uncategorized';
        c[key] = (c[key] || 0) + 1;
      }
      setCounts(c);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateCategoryConfig(
        Object.fromEntries(CATEGORIES.map(c => [c, Number(thresholds[c])]))
      );
      setConfig(result.categories);
      setCounts(result.segment_counts);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="page"><p className="muted">Loading…</p></div>;

  const totalCategorized = CATEGORIES.reduce((s, c) => s + (counts[c] || 0), 0);
  const uncategorized = counts['uncategorized'] || 0;

  return (
    <div className="page">
      <h1>Climb Category Configuration</h1>
      <p className="muted mb">
        Climbs are scored using: <strong>distance (km) × average grade (%)²</strong>.
        Set the minimum score for each category. Segments below the Cat 4 threshold are shown as uncategorised.
      </p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Min score</th>
              <th>Segments</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat}>
                <td><span className={`badge badge-${cat}`}>{cat === 'HC' ? 'HC' : `Cat ${cat}`}</span></td>
                <td className="muted">{DESCRIPTIONS[cat]}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={25}
                    value={thresholds[cat] ?? ''}
                    onChange={e => setThresholds(t => ({ ...t, [cat]: e.target.value }))}
                    style={{ width: 90 }}
                  />
                </td>
                <td>{counts[cat] || 0}</td>
              </tr>
            ))}
            <tr>
              <td><span className="badge badge-none">Uncat.</span></td>
              <td className="muted">Below Cat 4 threshold or missing data</td>
              <td>—</td>
              <td>{uncategorized}</td>
            </tr>
          </tbody>
        </table>

        <div className="gap mt">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save & recompute categories'}
          </button>
          {saved && <span style={{ color: 'green', fontSize: 13 }}>✓ Saved</span>}
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">{totalCategorized}</div>
          <div className="stat-label">Qualifying climbs</div>
        </div>
        <div className="stat">
          <div className="stat-value">{uncategorized}</div>
          <div className="stat-label">Uncategorised</div>
        </div>
      </div>
    </div>
  );
}
