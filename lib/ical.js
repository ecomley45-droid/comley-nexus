// Builds an iCalendar (.ics) feed from events. Recurring events are emitted
// as a single VEVENT with an RRULE (so subscribers get infinite recurrence
// natively) rather than expanded. Served by the public feed route so a
// business can publish a "Subscribe in Google/Apple Calendar" link.

const pad = (s) => String(s);
const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); };
const icsDate = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.toISOString().slice(0, 10).replace(/-/g, ''); };
const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };

export function buildIcs(events, { calName = 'Events', prodHost = 'nexus' } = {}) {
  const stamp = icsUtc(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nexus//Events//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calName)}`, `NAME:${icsEscape(calName)}`,
  ];
  for (const ev of (events || [])) {
    if (!ev.startsAt) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${pad(ev.id)}@${prodHost}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.startsAt)}`);
      if (ev.endsAt) lines.push(`DTEND;VALUE=DATE:${icsDate(ev.endsAt)}`);
    } else {
      lines.push(`DTSTART:${icsUtc(ev.startsAt)}`);
      if (ev.endsAt) lines.push(`DTEND:${icsUtc(ev.endsAt)}`);
    }
    lines.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    if (ev.linkUrl) lines.push(`URL:${icsEscape(ev.linkUrl)}`);
    if (ev.recurrence && FREQ[ev.recurrence]) {
      let rule = `RRULE:FREQ=${FREQ[ev.recurrence]}`;
      if (ev.recurrenceUntil) rule += `;UNTIL=${icsDate(ev.recurrenceUntil)}T235959Z`;
      lines.push(rule);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
