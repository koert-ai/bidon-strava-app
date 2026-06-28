import { useState, useEffect } from 'react';
import { getEvents } from '../api.js';

export default function EventFilter({ onSelect }) {
  const [events, setEvents] = useState([]);

  useEffect(() => { getEvents().then(setEvents); }, []);

  if (events.length === 0) return null;

  return (
    <div className="filter-group">
      <label>Event</label>
      <select
        defaultValue=""
        onChange={e => {
          if (!e.target.value) { onSelect(null); return; }
          const ev = events.find(ev => String(ev.id) === e.target.value);
          if (ev) onSelect(ev);
        }}
      >
        <option value="">All time</option>
        {events.map(ev => (
          <option key={ev.id} value={ev.id}>
            {ev.name}{ev.location ? ` (${ev.location})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
