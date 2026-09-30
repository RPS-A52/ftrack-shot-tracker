// Development only: canned data so the widget can be worked on outside ftrack.
// Answers the queries fetchProgress.ts makes, loosely: paging stops after the first page,
// and a filter on a shot id narrows to that shot. ?shots=<n> sets the project size.

import type { QuerySession } from './fetchProgress';

const STATUSES = [
  { id: 's-ns', name: 'Not started', color: '#9aa1ab', sort: 0, state: { short: 'NOT_STARTED' } },
  { id: 's-ip', name: 'In progress', color: '#4f97d8', sort: 1, state: { short: 'IN_PROGRESS' } },
  { id: 's-rev', name: 'Pending review', color: '#e8b04b', sort: 2, state: { short: 'IN_PROGRESS' } },
  { id: 's-fix', name: 'Needs fixes', color: '#e0605e', sort: 3, state: { short: 'BLOCKED' } },
  { id: 's-app', name: 'Approved', color: '#56b98e', sort: 4, state: { short: 'DONE' } },
];
// Work that will not be done, which studios often want left out of the counts.
const OMITTED = { id: 's-omit', name: 'Omitted', color: '#5c6370', sort: 5, state: { short: 'BLOCKED' } };
// In workflow order, the way ftrack's task type `sort` puts them.
const TASK_TYPES = ['Tracking', 'Modeling', 'Rigging', 'Animation', 'FX', 'Lighting', 'Compositing']
  .map((name, sort) => ({ id: `tt-${sort}`, name, sort }));

/** Deterministic pseudo-random numbers, so reloads show the same project. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function build(shotCount: number) {
  const rand = rng(42);
  const project = { id: 'mock-project', name: 'Demo project', __entity_type__: 'Project' };
  const tasks: Record<string, unknown>[] = [];
  const contexts: Record<string, unknown>[] = [];
  for (let i = 0; i < shotCount; i++) {
    const seq = { id: `seq-${Math.floor(i / 8)}`, name: `sq${String(Math.floor(i / 8) + 1).padStart(3, '0')}` };
    // Shot names repeat across sequences, as happens in real projects.
    const shot = { id: `shot-${i}`, name: `sh${String(((i % 8) + 1) * 10).padStart(4, '0')}`, __entity_type__: 'Shot' };
    contexts.push({ id: shot.id, link: [project, seq, shot] });
    // Earlier shots are further along, and tasks run down the pipeline: early departments
    // finish first.
    const maturity = 1 - i / Math.max(shotCount, 1);
    TASK_TYPES.forEach((type) => {
      if (rand() < 0.2) return;
      const roll = rand() * 0.6 + maturity * 0.5 - type.sort * 0.05;
      const status = rand() < 0.08 ? OMITTED
        : roll > 0.75 ? STATUSES[4] : roll > 0.6 ? STATUSES[2] : roll > 0.4 ? STATUSES[1]
          : roll > 0.35 ? STATUSES[3] : STATUSES[0];
      tasks.push({ id: `task-${i}-${type.id}`, type, parent: shot, status });
    });
  }
  return { project, tasks, contexts };
}

export function createMockSession(): QuerySession {
  const params = new URLSearchParams(window.location.search);
  const shotCount = Math.max(0, Number(params.get('shots') ?? 36) || 0);
  const failWith = params.get('fail');
  const db = build(shotCount);
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    async query(expression: string) {
      await delay(250 + Math.random() * 350);
      if (failWith) throw new Error(failWith);
      const offset = Number(/offset (\d+)/.exec(expression)?.[1] ?? 0);
      const page = <T,>(rows: T[]) => ({ data: offset === 0 ? rows : [] });
      const shotId = /"(shot-\d+)"/.exec(expression)?.[1];
      if (/from Context /.test(expression)) {
        const shot = shotId && db.contexts.find((c) => c.id === shotId) as { link: { name: string }[] } | undefined;
        return { data: [shot ? { name: shot.link[shot.link.length - 1].name } : db.project] };
      }
      if (/from TypedContext /.test(expression)) return page(db.contexts);
      if (/from Task /.test(expression)) {
        const rows = shotId && !/ in \(/.test(expression)
          ? db.tasks.filter((t) => (t.parent as { id: string }).id === shotId)
          : db.tasks;
        return page(rows);
      }
      return { data: [] };
    },
  };
}
