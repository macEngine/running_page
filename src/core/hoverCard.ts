/**
 * Content of the per-activity hover card. Shared by the thumbnail card on the
 * tracks page and the popup on the route map so both show the same thing.
 *
 * Layout follows the place popup on places_page: a bold title, then stacked
 * sections, each a small uppercase label over its value (where / time /
 * distance / note / tags / link). Sections without data are omitted.
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

export interface HoverSection {
  label: string;
  /** Plain-text value; for tags it is the joined list, for link the URL. */
  value: string;
  /** Present on the tags section so a renderer can make each tag clickable. */
  tags?: string[];
  /** Present on the link section (already validated http(s) URL). */
  href?: string;
  /** Render the value in a monospace face (dates, numbers). */
  mono?: boolean;
}

export interface HoverCard {
  title: string;
  sections: HoverSection[];
}

/** country · province · district from Keep's Python-dict location string. */
function formatWhere(loc: string | null): string {
  if (!loc || !loc.startsWith('{')) return '';
  try {
    const d = JSON.parse(
      loc.replace(/'/g, '"').replace(/None/g, 'null')
    ) as Record<string, unknown>;
    const parts = [d.country, d.province, d.city, d.district].filter(
      (v): v is string => typeof v === 'string' && v.trim() !== ''
    );
    return parts.filter((v, i) => parts.indexOf(v) === i).join(' · ');
  } catch {
    return '';
  }
}

function typeLabel(type: string, zh: boolean): string {
  const table: Record<string, [string, string]> = {
    Run: ['跑步', 'Run'],
    Walk: ['徒步', 'Walk'],
    Hike: ['徒步', 'Hike'],
    Ride: ['骑行', 'Ride'],
    Swim: ['游泳', 'Swim'],
  };
  const entry = table[type];
  return entry ? entry[zh ? 0 : 1] : type;
}

export function buildHoverCard(
  activity: Activity,
  annotation: Annotation | undefined,
  locale: Locale
): HoverCard {
  const zh = locale === 'zh';
  const lang = zh ? 'zh-CN' : 'en-US';
  const start = new Date(activity.start_date_local);
  // Only moving_time is available, so "end" excludes paused time.
  const seconds = parseMovingTime(activity.moving_time);
  const end = new Date(start.getTime() + seconds * 1000);
  const sameDay = start.toDateString() === end.toDateString();
  const time: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };
  const weekday = start.toLocaleDateString(lang, { weekday: 'short' });
  const endText = sameDay
    ? end.toLocaleTimeString(lang, time)
    : `${end.toLocaleDateString(lang, { month: 'short', day: 'numeric' })} ${end.toLocaleTimeString(lang, time)}`;
  const km = (activity.distance / 1000).toFixed(2);

  const title =
    annotation?.title?.trim() || `${typeLabel(activity.type, zh)} ${km} km`;

  const sections: HoverSection[] = [];
  const where = formatWhere(activity.location_country);
  if (where) sections.push({ label: zh ? '位置' : 'Where', value: where });
  sections.push({
    label: zh ? '时间' : 'Time',
    value: `${activity.start_date_local.slice(0, 10)} ${weekday} ${start.toLocaleTimeString(lang, time)} – ${endText} · ${formatDuration(seconds)}`,
    mono: true,
  });
  sections.push({
    label: zh ? '距离' : 'Distance',
    value: `${km} km`,
    mono: true,
  });
  if (annotation?.note?.trim()) {
    sections.push({
      label: zh ? '备注' : 'Note',
      value: annotation.note.trim(),
    });
  }
  const tags = annotation?.tags ?? [];
  if (tags.length > 0) {
    sections.push({
      label: zh ? '标签' : 'Tags',
      value: tags.join(' · '),
      tags,
    });
  }
  if (annotation?.link) {
    sections.push({
      label: zh ? '链接' : 'Link',
      value: annotation.link,
      href: annotation.link,
    });
  }
  return { title, sections };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same card as HTML, for mapbox-gl's Popup which takes a markup string.
 *  Class names are styled in RouteMap.css. */
export function hoverCardToHtml(card: HoverCard): string {
  const parts = [
    `<div class="hover-card-title">${escapeHtml(card.title)}</div>`,
  ];
  for (const s of card.sections) {
    parts.push(`<div class="hover-card-label">${escapeHtml(s.label)}</div>`);
    if (s.tags) {
      parts.push(
        `<div class="hover-card-tags">${s.tags
          .map((t) => `<span>${escapeHtml(t)}</span>`)
          .join('')}</div>`
      );
    } else if (s.href) {
      const href = escapeHtml(s.href);
      parts.push(
        `<a class="hover-card-link" href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`
      );
    } else {
      parts.push(
        `<div class="hover-card-value${s.mono ? ' font-mono' : ''}">${escapeHtml(s.value)}</div>`
      );
    }
  }
  return `<div class="hover-card">${parts.join('')}</div>`;
}
