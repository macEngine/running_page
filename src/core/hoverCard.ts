/**
 * Rows for the per-activity hover card. Shared by the thumbnail card on the
 * tracks page and the popup on the route map so both show the same thing.
 */
import type { Activity } from './types';
import type { Annotation } from './annotations';
import { parseMovingTime } from './hooks/useActivities';
import type { Locale } from './i18n';

/** "0:22:11" -> "22m 11s"; "2:23:38" -> "2h 23m". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export type HoverRow = [label: string, value: string];

export function buildHoverRows(
  activity: Activity,
  annotation: Annotation | undefined,
  locale: Locale
): HoverRow[] {
  const lang = locale === 'zh' ? 'zh-CN' : 'en-US';
  const start = new Date(activity.start_date_local);
  // Only moving_time is available, so "end" excludes paused time.
  const seconds = parseMovingTime(activity.moving_time);
  const end = new Date(start.getTime() + seconds * 1000);
  const sameDay = start.toDateString() === end.toDateString();
  const time: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };
  const date: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  };
  const tags = annotation?.tags ?? [];
  const rows: HoverRow[] = [
    [
      locale === 'zh' ? '开始' : 'Start',
      `${start.toLocaleDateString(lang, date)} ${start.toLocaleTimeString(lang, time)}`,
    ],
    [
      locale === 'zh' ? '结束' : 'End',
      sameDay
        ? end.toLocaleTimeString(lang, time)
        : `${end.toLocaleDateString(lang, date)} ${end.toLocaleTimeString(lang, time)}`,
    ],
    [locale === 'zh' ? '时长' : 'Duration', formatDuration(seconds)],
    [locale === 'zh' ? '标签' : 'Tags', tags.length ? tags.join(' · ') : '—'],
  ];
  if (annotation?.note) {
    rows.push([locale === 'zh' ? '描述' : 'Description', annotation.note]);
  }
  return rows;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same rows as HTML, for mapbox-gl's Popup which takes a markup string.
 *  Flat label/value cells; the container is a 2-column grid (see RouteMap.css). */
export function hoverRowsToHtml(rows: HoverRow[]): string {
  return rows
    .map(
      ([label, value]) =>
        `<span class="hover-card-label">${escapeHtml(label)}</span><span class="hover-card-value">${escapeHtml(value)}</span>`
    )
    .join('');
}
