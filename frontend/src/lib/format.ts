const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// e.g. "Tue 9:15:12 AM", or with the date if it is more than a few days away
export function formatBadgeTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const diffDays = Math.abs(d.getTime() - Date.now()) / 86_400_000;
  if (sameDay(d, new Date())) return `Today ${time}`;
  if (diffDays < 6) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

export function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// format for <input type="datetime-local"> in local time
export function toDateTimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const htmlToText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html.replace(/</g, ' <'); // keep words from adjacent blocks apart
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim();
};

export const initials = (name: string) =>
  name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
