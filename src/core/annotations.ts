/**
 * Per-activity tags and notes.
 *
 * Why a separate file instead of extra fields on Activity:
 * `src/static/activities.json` is regenerated from scratch by every data sync
 * (`generator.load()` -> `json.dump`), so anything stored there is lost on the
 * next run. The sync only ever writes activities.json, run_page/data.db and the
 * GPX/TCX/FIT folders, so a sibling file under src/static is safe.
 *
 * Why keyed on `start_date_local` instead of `run_id`:
 * Keep's run_id is a 19-digit integer that exceeds Number.MAX_SAFE_INTEGER, so
 * JSON.parse silently rounds it (9223370481043038407 -> 9223370481043038000).
 * A hand-written exact id would never match the parsed value. start_date_local
 * is unique per activity and readable, which also makes the file editable by
 * hand.
 *
 * Loading is deliberately non-blocking and failure-tolerant: a missing or
 * malformed file degrades to "no annotations" so neither the page nor the daily
 * auto-deploy can be broken by a typo in it.
 */
import annotationsUrl from '@/static/annotations.json?url';

export interface Annotation {
  /** Free-form labels, e.g. ["三里屯", "夜跑"]. Searchable. */
  tags?: string[];
  /** Free-form note for this activity. Searchable. */
  note?: string;
  /** Human orientation only when hand-editing the file; ignored by the app. */
  _label?: string;
}

/** key: Activity.start_date_local, e.g. "2026-10-24 11:54:16" */
export type AnnotationMap = Record<string, Annotation>;

export const EMPTY_ANNOTATIONS: AnnotationMap = Object.freeze(
  {}
) as AnnotationMap;

interface AnnotationsFile {
  version?: number;
  byStartDateLocal?: unknown;
}

/** Keep only well-formed entries so one bad row cannot take out the rest. */
function sanitize(raw: unknown): AnnotationMap {
  if (!raw || typeof raw !== 'object') return EMPTY_ANNOTATIONS;
  const source = (raw as AnnotationsFile).byStartDateLocal;
  if (!source || typeof source !== 'object') return EMPTY_ANNOTATIONS;

  const out: AnnotationMap = {};
  for (const [key, value] of Object.entries(
    source as Record<string, unknown>
  )) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Annotation;
    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter(
          (tag): tag is string => typeof tag === 'string' && tag.trim() !== ''
        )
      : [];
    const note = typeof entry.note === 'string' ? entry.note : '';
    if (tags.length === 0 && note.trim() === '') continue;
    out[key] = { tags, note };
  }
  return out;
}

let cache: AnnotationMap | null = null;
let promise: Promise<AnnotationMap> | null = null;

export function loadAnnotations(): Promise<AnnotationMap> {
  promise ??= fetch(annotationsUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then(sanitize)
    .catch((error: unknown) => {
      // Non-fatal by design — the tracks page works without annotations.
      console.warn('Annotations unavailable, continuing without them:', error);
      return EMPTY_ANNOTATIONS;
    })
    .then((value) => {
      cache = value;
      return value;
    });
  return promise;
}

export function getCachedAnnotations(): AnnotationMap | null {
  return cache;
}

/** Collect the distinct tags used by the given activities, most used first. */
export function collectTags(
  annotations: AnnotationMap,
  keys: readonly string[]
): string[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    for (const tag of annotations[key]?.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/**
 * True when the annotation for `key` satisfies every search term and carries
 * every required tag. Terms are matched as case-insensitive substrings against
 * the tags and the note, so "三里" finds "三里屯".
 */
export function matchesAnnotation(
  annotations: AnnotationMap,
  key: string,
  terms: readonly string[],
  requiredTags: readonly string[]
): boolean {
  const entry = annotations[key];
  if (requiredTags.length > 0) {
    const tags = entry?.tags ?? [];
    if (!requiredTags.every((tag) => tags.includes(tag))) return false;
  }
  if (terms.length === 0) return true;
  const haystack = [...(entry?.tags ?? []), entry?.note ?? '']
    .join('\n')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Split a raw query into lowercase terms; whitespace separated, AND-combined. */
export function parseQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== '');
}
