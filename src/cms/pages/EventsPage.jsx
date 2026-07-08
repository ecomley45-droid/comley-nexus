import { useEffect, useMemo, useState } from 'react';
import {
  getCalendars, createCalendar, updateCalendar, deleteCalendar,
  getEvents, createEvent, updateEvent, deleteEvent,
} from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect, GlassTextarea, Badge } from '../lib/ui/Glass.jsx';

// Central events manager: create multiple calendars and add events to them.
// Any Events List / Calendar / Flyer Slider block can then be bound to a
// calendar (in the page editor) to display these live.
const CAL_COLORS = ['#6366f1', '#d946ef', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// datetime-local wants "YYYY-MM-DDTHH:mm"; the API returns an ISO timestamp.
const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : '');
const fmtWhen = (ev) => {
  if (!ev.startsAt) return 'No date';
  const d = new Date(ev.startsAt);
  if (isNaN(d)) return 'No date';
  return ev.allDay
    ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const emptyEvent = (calendarId) => ({ title: '', calendarId: calendarId && calendarId !== 'all' ? calendarId : '', startsAt: '', allDay: false, location: '', description: '', flyerUrl: '', linkUrl: '' });

export default function EventsPage() {
  const [calendars, setCalendars] = useState(null);
  const [selected, setSelected] = useState('all');
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // event draft (with id when editing)
  const [newCalName, setNewCalName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCalendars = () => getCalendars().then((d) => setCalendars(d.calendars)).catch((e) => setError(e.message));
  const loadEvents = () => getEvents(selected === 'all' ? undefined : selected).then((d) => setEvents(d.events)).catch((e) => setError(e.message));

  useEffect(() => { loadCalendars(); }, []);
  useEffect(() => { setEvents(null); loadEvents(); /* eslint-disable-next-line */ }, [selected]);

  const calById = useMemo(() => Object.fromEntries((calendars || []).map((c) => [c.id, c])), [calendars]);

  const addCalendar = async () => {
    const name = newCalName.trim();
    if (!name) return;
    const color = CAL_COLORS[(calendars?.length || 0) % CAL_COLORS.length];
    try { await createCalendar({ name, color, sortOrder: calendars?.length || 0 }); setNewCalName(''); await loadCalendars(); }
    catch (e) { alert(e.message); }
  };
  const renameCalendar = async (c) => {
    const name = window.prompt('Calendar name', c.name); if (name == null) return;
    try { await updateCalendar(c.id, { name: name.trim() || c.name }); await loadCalendars(); } catch (e) { alert(e.message); }
  };
  const removeCalendar = async (c) => {
    if (!confirm(`Delete "${c.name}" and all its events? This can't be undone.`)) return;
    try { await deleteCalendar(c.id); if (selected === c.id) setSelected('all'); await loadCalendars(); await loadEvents(); } catch (e) { alert(e.message); }
  };

  const saveEvent = async () => {
    if (!editing.title.trim()) { alert('Title is required.'); return; }
    setSaving(true);
    const payload = { ...editing, title: editing.title.trim(), startsAt: editing.startsAt || null, calendarId: editing.calendarId || null };
    try {
      if (editing.id) await updateEvent(editing.id, payload); else await createEvent(payload);
      setEditing(null); await loadEvents();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };
  const removeEvent = async (ev) => {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    try { await deleteEvent(ev.id); await loadEvents(); } catch (e) { alert(e.message); }
  };

  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Events</h1>
        <GlassButton onClick={() => setEditing(emptyEvent(selected))}>Add event</GlassButton>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Manage your calendars and events here once. In the page editor, bind an Events List, Calendar, or Flyer Slider block to a calendar to display them.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
        {/* Calendars */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Calendars</h2>
          <div className="flex flex-col gap-1 mb-3">
            <button onClick={() => setSelected('all')} className={`text-left px-3 py-2 rounded-lg text-sm transition ${selected === 'all' ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'}`}>All calendars</button>
            {(calendars || []).map((c) => (
              <div key={c.id} className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${selected === c.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <button onClick={() => setSelected(c.id)} className="flex-1 text-left text-zinc-200 truncate">{c.name}</button>
                <button onClick={() => renameCalendar(c)} className="opacity-0 group-hover:opacity-100 text-xs text-glass-sky">edit</button>
                <button onClick={() => removeCalendar(c)} className="opacity-0 group-hover:opacity-100 text-xs text-red-400">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <GlassInput value={newCalName} onChange={(e) => setNewCalName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCalendar()} placeholder="New calendar…" className="flex-1 text-sm py-1.5" />
            <GlassButton variant="secondary" onClick={addCalendar}>Add</GlassButton>
          </div>
        </div>

        {/* Events */}
        <div>
          {!events ? (
            <p className="text-zinc-400">Loading…</p>
          ) : events.length === 0 ? (
            <GlassPanel className="p-6 text-sm text-zinc-400">No events yet. Click “Add event” to create one.</GlassPanel>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((ev) => (
                <GlassPanel key={ev.id} className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {calById[ev.calendarId] && <span className="w-2.5 h-2.5 rounded-full" style={{ background: calById[ev.calendarId].color }} />}
                      <span className="text-sm font-medium text-zinc-100">{ev.title}</span>
                      {ev.allDay && <Badge tone="draft">All day</Badge>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {fmtWhen(ev)}{ev.location ? ` · ${ev.location}` : ''}{calById[ev.calendarId] ? ` · ${calById[ev.calendarId].name}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <GlassButton variant="secondary" onClick={() => setEditing({ ...ev, startsAt: toLocalInput(ev.startsAt) })}>Edit</GlassButton>
                    <GlassButton variant="danger" onClick={() => removeEvent(ev)}>Delete</GlassButton>
                  </div>
                </GlassPanel>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-12 p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <GlassPanel className="p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold">{editing.id ? 'Edit event' : 'Add event'}</h2>
                <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Title"><GlassInput className="w-full" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Calendar">
                    <GlassSelect className="w-full" value={editing.calendarId || ''} onChange={(e) => setEditing({ ...editing, calendarId: e.target.value })}>
                      <option value="">— none —</option>
                      {(calendars || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </GlassSelect>
                  </Field>
                  <Field label="Date & time">
                    <GlassInput type="datetime-local" className="w-full" value={editing.startsAt} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value })} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={!!editing.allDay} onChange={(e) => setEditing({ ...editing, allDay: e.target.checked })} className="w-4 h-4" /> All day
                </label>
                <Field label="Location"><GlassInput className="w-full" value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} placeholder="Main room" /></Field>
                <Field label="Description"><GlassTextarea className="w-full h-20" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Flyer image URL"><GlassInput className="w-full" value={editing.flyerUrl} onChange={(e) => setEditing({ ...editing, flyerUrl: e.target.value })} placeholder="https://…" /></Field>
                  <Field label="Link (tickets/details)"><GlassInput className="w-full" value={editing.linkUrl} onChange={(e) => setEditing({ ...editing, linkUrl: e.target.value })} placeholder="https://…" /></Field>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <GlassButton variant="ghost" onClick={() => setEditing(null)}>Cancel</GlassButton>
                <GlassButton onClick={saveEvent} disabled={saving}>{saving ? 'Saving…' : 'Save event'}</GlassButton>
              </div>
            </GlassPanel>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
