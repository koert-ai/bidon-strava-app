import { useState, useEffect } from 'react';
import { getEvents, createEvent, updateEvent, deleteEvent } from '../api.js';

const EMPTY_FORM = { name: '', location: '', date_from: '', date_to: '', video_url: '', notes: '' };

function EventForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="filter-group" style={{ flex: '1 1 160px' }}>
          <label>Event name</label>
          <input type="text" required placeholder="e.g. Cevennen" value={form.name} onChange={set('name')} />
        </div>
        <div className="filter-group" style={{ flex: '1 1 140px' }}>
          <label>Location</label>
          <input type="text" placeholder="optional" value={form.location} onChange={set('location')} />
        </div>
        <div className="filter-group">
          <label>Start date</label>
          <input type="date" required value={form.date_from} onChange={set('date_from')} />
        </div>
        <div className="filter-group">
          <label>End date</label>
          <input type="date" required value={form.date_to} min={form.date_from} onChange={set('date_to')} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="filter-group" style={{ flex: '1 1 280px' }}>
          <label>Video link</label>
          <input
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={form.video_url || ''}
            onChange={set('video_url')}
          />
        </div>
        <div className="filter-group" style={{ flex: '2 1 320px' }}>
          <label>Notes</label>
          <input
            type="text"
            placeholder="Route info, highlights, trip notes…"
            value={form.notes || ''}
            onChange={set('notes')}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save event'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </form>
  );
}

export default function BidonWeek() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);

  const load = () => getEvents().then(setEvents).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createEvent(form);
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id, form) => {
    setSaving(true);
    setError(null);
    try {
      await updateEvent(id, form);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete event "${name}"? This only removes the event definition — synced data stays.`)) return;
    await deleteEvent(id);
    load();
  };

  const fmtDate = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}-${m}-${y}`;
  };

  const nights = (from, to) => {
    if (!from || !to) return 0;
    return Math.round((new Date(to) - new Date(from)) / 86400000);
  };

  return (
    <div className="page">
      <h1>Bidon Week — Events</h1>
      <p className="muted mb">
        Define club events (training camps, trips, etc.) with a date range.
        Use the <strong>Riders</strong> page to sync Strava data for a specific event — much faster than a full backfill.
        Events also appear as filter shortcuts in the Dashboard and Leaderboard.
      </p>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {events.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {events.map(ev => (
            editingId === ev.id ? (
              <div className="card" key={ev.id} style={{ marginBottom: 12 }}>
                <EventForm
                  initial={{
                    name: ev.name,
                    location: ev.location || '',
                    date_from: ev.date_from,
                    date_to: ev.date_to,
                    video_url: ev.video_url || '',
                    notes: ev.notes || '',
                  }}
                  onSave={(form) => handleUpdate(ev.id, form)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              </div>
            ) : (
              <div className="card" key={ev.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h2 style={{ margin: 0, marginBottom: 2 }}>{ev.name}</h2>
                    {ev.location && <span className="muted" style={{ fontSize: 13 }}>📍 {ev.location}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-small btn-secondary" onClick={() => setEditingId(ev.id)}>Edit</button>
                    <button
                      className="btn-small"
                      style={{ color: 'var(--it-red)', borderColor: 'var(--it-red)', border: '1px solid' }}
                      onClick={() => handleDelete(ev.id, ev.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 13 }}>
                  <span>📅 {fmtDate(ev.date_from)} → {fmtDate(ev.date_to)}</span>
                  <span className="muted">{nights(ev.date_from, ev.date_to)} nights</span>
                  {ev.video_url && (
                    <a href={ev.video_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)' }}>
                      🎥 Watch video
                    </a>
                  )}
                </div>
                {ev.notes && (
                  <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: 'var(--muted-text)' }}>
                    {ev.notes}
                  </p>
                )}
              </div>
            )
          ))}
        </div>
      )}

      {!loading && events.length === 0 && !showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="muted">No events yet. Add your first event below.</p>
        </div>
      )}

      {showAdd ? (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>New event</h2>
          <EventForm onSave={handleCreate} onCancel={() => setShowAdd(false)} saving={saving} />
        </div>
      ) : (
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add event</button>
      )}
    </div>
  );
}
