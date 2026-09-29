// Turns tasks into chart rows: one row per task type, one series per status (or state),
// for the whole scope and for each shot in it.

import type { Breakdown, GroupRef, SortBy, StateKey, WorkItem } from './types';

export interface Series {
  key: string;
  label: string;
  color: string;
  /** Whether this series counts as finished work. */
  done: boolean;
}

export interface GroupRow {
  ref: GroupRef;
  /** Label unique within the chart. */
  label: string;
  values: Record<string, number>;
  total: number;
  done: number;
  /** 0..1; 0 for an empty row. */
  progress: number;
}

export interface Aggregate {
  series: Series[];
  /** One per task type, in workflow order. */
  rows: GroupRow[];
  totals: Record<string, number>;
  total: number;
  done: number;
  progress: number;
}

export interface ShotSummary {
  ref: GroupRef;
  /** The shot name, with its sequence added when another shot has the same name. */
  label: string;
  agg: Aggregate;
}

/** Colours for the state breakdown, the same meaning ftrack gives them. */
export const STATES: { key: StateKey; label: string; color: string }[] = [
  { key: 'NOT_STARTED', label: 'Not started', color: '#9aa1ab' },
  { key: 'IN_PROGRESS', label: 'In progress', color: '#4f97d8' },
  { key: 'BLOCKED', label: 'Blocked', color: '#e0605e' },
  { key: 'DONE', label: 'Done', color: '#56b98e' },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const compareNames = (a: string, b: string) => collator.compare(a, b);

/** Every status seen, in workflow order, or the four states. Shared by all charts. */
export function buildSeries(items: WorkItem[], breakdown: Breakdown): Series[] {
  if (breakdown === 'state') return STATES.map((s) => ({ ...s, done: s.key === 'DONE' }));
  const seen = new Map<string, Series & { sort: number }>();
  for (const { status: s } of items) {
    if (!seen.has(s.id)) seen.set(s.id, { key: s.id, label: s.name, color: s.color, done: s.state === 'DONE', sort: s.sort });
  }
  return [...seen.values()]
    .sort((a, b) => a.sort - b.sort || compareNames(a.label, b.label))
    .map(({ key, label, color, done }) => ({ key, label, color, done }));
}

/** Counts `items` per task type and status. */
export function aggregate(items: WorkItem[], series: Series[], breakdown: Breakdown): Aggregate {
  const seriesKey = (item: WorkItem) => (breakdown === 'state' ? item.status.state : item.status.id);
  const rowMap = new Map<string, GroupRow>();
  const totals: Record<string, number> = {};
  for (const item of items) {
    const ref = item.taskType;
    let row = rowMap.get(ref.id);
    if (!row) {
      row = { ref, label: ref.name, values: {}, total: 0, done: 0, progress: 0 };
      rowMap.set(ref.id, row);
    }
    const key = seriesKey(item);
    row.values[key] = (row.values[key] ?? 0) + 1;
    row.total += 1;
    if (item.status.state === 'DONE') row.done += 1;
    totals[key] = (totals[key] ?? 0) + 1;
  }

  // Task types in workflow order (their ftrack sort), then by name.
  const rows = [...rowMap.values()].sort((a, b) => (a.ref.sort ?? 0) - (b.ref.sort ?? 0) || compareNames(a.label, b.label));
  for (const row of rows) row.progress = row.total > 0 ? row.done / row.total : 0;
  const total = items.length;
  const done = rows.reduce((sum, r) => sum + r.done, 0);
  return { series, rows, totals, total, done, progress: total > 0 ? done / total : 0 };
}

/** One summary per shot (the entity each task is on). */
export function summariseShots(items: WorkItem[], series: Series[], breakdown: Breakdown, sortBy: SortBy): ShotSummary[] {
  const byShot = new Map<string, { ref: GroupRef; items: WorkItem[] }>();
  for (const item of items) {
    if (!item.parent) continue;
    const entry = byShot.get(item.parent.id) ?? { ref: item.parent, items: [] };
    entry.items.push(item);
    byShot.set(item.parent.id, entry);
  }
  const shots = [...byShot.values()].map(({ ref, items: shotItems }) => ({
    ref,
    label: ref.name,
    agg: aggregate(shotItems, series, breakdown),
  }));

  // Two shots called sh010 in different sequences need telling apart.
  const nameCount = new Map<string, number>();
  shots.forEach((s) => nameCount.set(s.ref.name, (nameCount.get(s.ref.name) ?? 0) + 1));
  for (const s of shots) {
    if ((nameCount.get(s.ref.name) ?? 0) > 1 && s.ref.detail) s.label = `${s.ref.name} (${s.ref.detail})`;
  }

  const byName = (a: ShotSummary, b: ShotSummary) => compareNames(a.ref.name, b.ref.name);
  const sorters: Record<SortBy, (a: ShotSummary, b: ShotSummary) => number> = {
    // Sequence order, then shot order: how the edit reads.
    default: (a, b) => compareNames(a.ref.detail ?? '', b.ref.detail ?? '') || byName(a, b),
    name: (a, b) => byName(a, b) || compareNames(a.ref.detail ?? '', b.ref.detail ?? ''),
    progress: (a, b) => b.agg.progress - a.agg.progress || byName(a, b),
    total: (a, b) => b.agg.total - a.agg.total || byName(a, b),
  };
  return shots.sort(sorters[sortBy]);
}

export function formatCount(value: number) {
  return Math.round(value).toLocaleString();
}

/** "1 task", "12 tasks" */
export function formatTasks(value: number) {
  return `${formatCount(value)} task${Math.round(value) === 1 ? '' : 's'}`;
}

export function formatPercent(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}
