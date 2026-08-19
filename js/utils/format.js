/**
 * format.js
 * Shared date/time/number formatting helpers.
 * RULE: every user-facing date in this app must go through formatDate()
 * and render as DD/MM/YYYY. Never format dates ad-hoc in a module.
 */

/** Parse a value (Date, ISO string, or "DD/MM/YYYY") into a Date object. */
export function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    const parsed = new Date(value);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

/** DD/MM/YYYY — the only date format allowed in the UI. */
export function formatDate(value) {
  const d = toDate(value);
  if (!d || isNaN(d)) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** 12-hour clock, e.g. 06:35 AM */
export function formatTime(value) {
  const d = toDate(value);
  if (!d || isNaN(d)) return '—';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/** DD/MM/YYYY, 06:35 AM */
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d || isNaN(d)) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** Minutes between two dates/timestamps, rendered as "1h 23m". */
export function formatDuration(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end || isNaN(start) || isNaN(end)) return '—';
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Raw minutes between two timestamps (for aggregation/averages). */
export function minutesBetween(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end || isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

/** True if two Date values fall on the same calendar day. */
export function isSameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

/** Initials for avatar chips, e.g. "Sarah Malhotra" -> "SM". */
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Format a plain digit string as a readable phone number for display. */
export function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}
