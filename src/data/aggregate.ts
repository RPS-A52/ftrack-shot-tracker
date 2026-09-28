// Turns work items into chart rows: one row per group, one series per status (or state).

import type { Breakdown, GroupBy, GroupRef, Measure, SortBy, StateKey, WorkItem } from './types';

export interface Series {
  key: string;
  label: string;
  color: string;
  /** Whether this series counts as finished work. */
  done: boolean;
}

export interface GroupRow {
  ref: GroupRef;
  /** Label unique within the chart (duplicate names get the detail appended). */
  label: string;
  values: Record<string, number>;
  total: number;
  done: number;
  /** 0..1; 0 for an empty row. */
  progress: number;
  count: number;
}

export interface Aggregate {
  series: Series[];
  rows: GroupRow[];
  totals: Record<string, number>;
  total: number;
  done: number;
  progress: number;
  count: number;
}

/** Colours for the state breakdown, the same meaning ftrack gives them. */
export const STATES: { key: StateKey; label: string; color: string }[] = [
  { key: 'NOT_STARTED', label: 'Not started', color: '#9aa1ab' },
  { key: 'IN_PROGRESS', label: 'In progress', color: '#4f97d8' },
  { key: 'BLOCKED', label: 'Blocked', color: '#e0605e' },
  { key: 'DONE', label: 'Done', color: '#56b98e' },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function aggregate(items: WorkItem[], opts: { groupBy: GroupBy; measure: Measure; breakdown: Breakdown; sortBy: SortBy }): Aggregate {
  const { groupBy, measure, breakdown, sortBy } = opts;
  const weight = (item: WorkItem) => (measure === 'bid' ? item.bidHours : 1);

  // Series: every status seen, in workflow order, or the four states.
  const seriesMap = new Map<string, Series & { sort: number }>();
  if (breakdown === 'state') {
    STATES.forEach((s, i) => seriesMap.set(s.key, { ...s, done: s.key === 'DONE', sort: i }));
  } else {
    for (const item of items) {
      const s = item.status;
      if (!seriesMap.has(s.id)) {
        seriesMap.set(s.id, { key: s.id, label: s.name, color: s.color, done: s.state === 'DONE', sort: s.sort });
      }
    }
  }
  const seriesKey = (item: WorkItem) => (breakdown === 'state' ? item.status.state : item.status.id);

  const rowMap = new Map<string, GroupRow>();
  const totals: Record<string, number> = {};
  for (const item of items) {
    const ref = item.groups[groupBy];
    if (!ref) continue;
    let row = rowMap.get(ref.id);
    if (!row) {
      row = { ref, label: ref.name, values: {}, total: 0, done: 0, progress: 0, count: 0 };
      rowMap.set(ref.id, row);
    }
    const key = seriesKey(item);
    const w = weight(item);
    row.values[key] = (row.values[key] ?? 0) + w;
    row.total += w;
    row.count += 1;
    if (item.status.state === 'DONE') row.done += w;
    totals[key] = (totals[key] ?? 0) + w;
  }

  const rows = [...rowMap.values()];
  for (const row of rows) row.progress = row.total > 0 ? row.done / row.total : 0;

  // Two shots called sh010 in different sequences must not share a bar.
  const byName = new Map<string, GroupRow[]>();
  rows.forEach((r) => byName.set(r.ref.name, [...(byName.get(r.ref.name) ?? []), r]));
  for (const same of byName.values()) {
    if (same.length < 2) continue;
    same.forEach((r, i) => { r.label = r.ref.detail ? `${r.ref.name} (${r.ref.detail})` : `${r.ref.name} #${i + 1}`; });
  }
  // Band axes need unique categories, even for the odd duplicate that survives the above.
  const used = new Set<string>();
  for (const r of rows) {
    let label = r.label;
    for (let n = 2; used.has(label); n++) label = `${r.label} #${n}`;
    r.label = label;
    used.add(label);
  }

  const byName2 = (a: GroupRow, b: GroupRow) => collator.compare(a.label, b.label);
  const sorters: Record<SortBy, (a: GroupRow, b: GroupRow) => number> = {
    default: groupBy === 'taskType'
      ? (a, b) => (a.ref.sort ?? 0) - (b.ref.sort ?? 0) || byName2(a, b)
      : groupBy === 'shot'
        ? (a, b) => collator.compare(a.ref.detail ?? '', b.ref.detail ?? '') || byName2(a, b)
        : byName2,
    name: byName2,
    progress: (a, b) => b.progress - a.progress || byName2(a, b),
    total: (a, b) => b.total - a.total || byName2(a, b),
  };
  rows.sort(sorters[sortBy]);

  const series = [...seriesMap.values()]
    .sort((a, b) => a.sort - b.sort || collator.compare(a.label, b.label))
    .map(({ key, label, color, done }) => ({ key, label, color, done }));
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  const done = rows.reduce((sum, r) => sum + r.done, 0);
  return {
    series,
    rows,
    totals,
    total,
    done,
    progress: total > 0 ? done / total : 0,
    count: rows.reduce((sum, r) => sum + r.count, 0),
  };
}

export function formatValue(value: number, measure: Measure) {
  if (measure === 'count') return String(Math.round(value));
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString()} h`;
}

export function formatPercent(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}
