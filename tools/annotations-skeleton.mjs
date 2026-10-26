#!/usr/bin/env node
/**
 * Refresh src/static/annotations.json so every activity has a row to edit.
 *
 *   node tools/annotations-skeleton.mjs
 *
 * - Adds a row for every activity in src/static/activities.json, keyed by
 *   start_date_local (see src/core/annotations.ts for why not run_id).
 * - Preserves any tags/note already written; never deletes your edits.
 * - Rewrites `_label`, which exists purely so the file is readable by hand.
 * - Rows whose activity no longer exists are kept and marked, so a failed sync
 *   can never silently drop your annotations.
 *
 * Output is run through prettier before writing, because CI runs
 * `pnpm run check` over src/**\/*.json and prettier collapses short arrays onto
 * one line -- plain JSON.stringify(_, null, 2) does not and fails the check.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { format } from 'prettier';

const ACTIVITIES = 'src/static/activities.json';
const ANNOTATIONS = 'src/static/annotations.json';

const activities = JSON.parse(readFileSync(ACTIVITIES, 'utf8'));

let existing = {};
if (existsSync(ANNOTATIONS)) {
  try {
    existing = JSON.parse(readFileSync(ANNOTATIONS, 'utf8')).byStartDateLocal ?? {};
  } catch (error) {
    console.error(`${ANNOTATIONS} is not valid JSON, refusing to overwrite it.`);
    console.error(error.message);
    process.exit(1);
  }
}

const label = (activity) => {
  const km = (activity.distance / 1000).toFixed(2);
  // A 12-char polyline is a placeholder point, not a real route; those
  // activities never reach the track wall (it requires length > 20).
  const hasRoute = (activity.summary_polyline?.length ?? 0) > 20;
  return `${activity.type} ${km}km${hasRoute ? '' : ' (无轨迹，不出现在轨迹墙)'}`;
};

const byStartDateLocal = {};
const seen = new Set();

// Newest first, so the rows you are most likely to edit are at the top.
for (const activity of [...activities].sort((a, b) =>
  b.start_date_local.localeCompare(a.start_date_local)
)) {
  const key = activity.start_date_local;
  seen.add(key);
  const previous = existing[key] ?? {};
  byStartDateLocal[key] = {
    _label: label(activity),
    tags: previous.tags ?? [],
    note: previous.note ?? '',
  };
}

let orphans = 0;
for (const [key, previous] of Object.entries(existing)) {
  if (seen.has(key)) continue;
  const hasContent =
    (previous.tags?.length ?? 0) > 0 || (previous.note ?? '').trim() !== '';
  if (!hasContent) continue;
  orphans++;
  byStartDateLocal[key] = {
    ...previous,
    _label: `${(previous._label ?? '').replace(/ \(该活动已不在数据中\)$/, '')} (该活动已不在数据中)`,
  };
}

const output = { version: 1, byStartDateLocal };
writeFileSync(
  ANNOTATIONS,
  await format(JSON.stringify(output), { parser: 'json' })
);

const annotated = Object.values(byStartDateLocal).filter(
  (entry) => entry.tags.length > 0 || entry.note.trim() !== ''
).length;
console.log(
  `${ANNOTATIONS}: ${Object.keys(byStartDateLocal).length} rows, ` +
    `${annotated} annotated${orphans ? `, ${orphans} orphaned (kept)` : ''}`
);
