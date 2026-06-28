import { useState, useEffect } from 'react';
import { getAllRiders, updateRider } from '../api.js';

const EMPTY_PROFILE = {
  name: '',
  nickname: '',
  picture_url: '',
  bio: '',
  palmares: [],
  favorite_cyclists: [],
};

function parseJson(val, fallback = []) {
  if (!val) return fallback;
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Tag input: comma-separated list as chips ──────────────────────────────────
function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const items = Array.isArray(value) ? value : [];

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInput('');
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {items.map((item, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '2px 10px', fontSize: 13,
          }}>
            {item}
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-text)', padding: 0, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-secondary btn-small" onClick={add}>Add</button>
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ rider, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: rider.name || '',
    nickname: rider.nickname || '',
    picture_url: rider.picture_url || '',
    bio: rider.bio || '',
    palmares: parseJson(rider.palmares),
    favorite_cyclists: parseJson(rider.favorite_cyclists),
  });

  const set = (k) => (val) => setForm(f => ({ ...f, [k]: val }));
  const setInput = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg)', borderRadius: 12, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto', padding: 28,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Edit rider profile</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted-text)' }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="filter-group" style={{ flex: '1 1 180px' }}>
              <label>Full name *</label>
              <input type="text" required value={form.name} onChange={setInput('name')} />
            </div>
            <div className="filter-group" style={{ flex: '1 1 140px' }}>
              <label>Nickname</label>
              <input type="text" value={form.nickname} onChange={setInput('nickname')} placeholder="e.g. De Klommel" />
            </div>
          </div>

          <div className="filter-group">
            <label>Profile picture URL</label>
            <input
              type="url"
              value={form.picture_url}
              onChange={setInput('picture_url')}
              placeholder="https://example.com/photo.jpg"
            />
          </div>

          {form.picture_url && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={form.picture_url}
                alt="Preview"
                style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          <div className="filter-group">
            <label>Bio</label>
            <textarea
              value={form.bio}
              onChange={setInput('bio')}
              placeholder="A few words about this rider…"
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
            />
          </div>

          <div className="filter-group">
            <label>Palmares highlights</label>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>
              Race results, KOMs, notable climbs — one per entry
            </p>
            <TagInput
              value={form.palmares}
              onChange={set('palmares')}
              placeholder="e.g. HC Col du Galibier, 2015"
            />
          </div>

          <div className="filter-group">
            <label>Favourite cyclists</label>
            <TagInput
              value={form.favorite_cyclists}
              onChange={set('favorite_cyclists')}
              placeholder="e.g. Eddy Merckx"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rider card ────────────────────────────────────────────────────────────────
function RiderCard({ rider, onEdit }) {
  const palmares = parseJson(rider.palmares);
  const favCyclists = parseJson(rider.favorite_cyclists);
  const initials = (rider.nickname || rider.name || '?').slice(0, 2).toUpperCase();

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flexShrink: 0 }}>
          {rider.picture_url ? (
            <img
              src={rider.picture_url}
              alt={rider.name}
              style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--orange)' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: 'var(--orange)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 20, color: '#fff',
            }}>
              {initials}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{rider.name}</h2>
            {rider.nickname && (
              <span style={{ fontSize: 13, color: 'var(--orange)', fontStyle: 'italic' }}>"{rider.nickname}"</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-text)', marginTop: 2 }}>
            {rider.strava_athlete_id
              ? <span style={{ color: 'var(--it-green)' }}>✓ Strava connected</span>
              : <span>No Strava connection yet</span>}
          </div>
        </div>
        <button className="btn-small btn-secondary" onClick={() => onEdit(rider)} style={{ flexShrink: 0 }}>
          Edit
        </button>
      </div>

      {/* Bio */}
      {rider.bio && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-text)', lineHeight: 1.5 }}>{rider.bio}</p>
      )}

      {/* Palmares */}
      {palmares.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Palmares
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {palmares.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      )}

      {/* Favourite cyclists */}
      {favCyclists.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Favourite cyclists
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {favCyclists.map((c, i) => (
              <span key={i} style={{
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '2px 10px', fontSize: 12,
              }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {!rider.bio && palmares.length === 0 && favCyclists.length === 0 && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Profile not filled in yet — click Edit to add details.</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Riders() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    getAllRiders()
      .then(data => setRiders(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    setSaving(true);
    setError(null);
    try {
      await updateRider(editing.id, form);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading riders…</p></div>;

  return (
    <div className="page">
      <h1>Riders</h1>
      <p className="muted mb" style={{ maxWidth: 560 }}>
        The Bidon cycling club. Click <strong>Edit</strong> on any card to fill in nickname, photo, palmares, and favourite cyclists.
      </p>

      {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {riders.map(rider => (
          <RiderCard key={rider.id} rider={rider} onEdit={setEditing} />
        ))}
      </div>

      {!loading && riders.length === 0 && (
        <div className="card">
          <p className="muted">No riders found.</p>
        </div>
      )}

      {editing && (
        <EditModal
          rider={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
