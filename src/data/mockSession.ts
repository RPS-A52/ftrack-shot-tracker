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
const PLATE_TYPES = [{ id: 'tt-plate', name: 'Plate prep', sort: -2 }, { id: 'tt-roto', name: 'Roto', sort: -1 }];
// Shot statuses: most shots in progress, a few on hold or omitted, the first few approved.
const SHOT_STATUSES = {
  progress: { id: 'ss-ip', name: 'In progress', color: '#4f97d8', sort: 1, state: { short: 'IN_PROGRESS' } },
  hold: { id: 'ss-hold', name: 'On hold', color: '#e8b04b', sort: 2, state: { short: 'BLOCKED' } },
  omitted: { id: 'ss-omit', name: 'Omitted', color: '#5c6370', sort: 3, state: { short: 'BLOCKED' } },
  approved: { id: 'ss-app', name: 'Approved', color: '#56b98e', sort: 4, state: { short: 'DONE' } },
};
function shotStatusFor(i: number) {
  if (i % 10 === 7) return SHOT_STATUSES.omitted;
  if (i % 10 === 3) return SHOT_STATUSES.hold;
  return i < 3 ? SHOT_STATUSES.approved : SHOT_STATUSES.progress;
}

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
  const shots: Record<string, unknown>[] = [];
  for (let i = 0; i < shotCount; i++) {
    const seq = { id: `seq-${Math.floor(i / 8)}`, name: `sq${String(Math.floor(i / 8) + 1).padStart(3, '0')}` };
    // Shot names repeat across sequences, as happens in real projects.
    const shot = { id: `shot-${i}`, name: `sh${String(((i % 8) + 1) * 10).padStart(4, '0')}`, __entity_type__: 'Shot' };
    contexts.push({ id: shot.id, link: [project, seq, shot] });
    shots.push({ id: shot.id, status: shotStatusFor(i) });
    // Earlier shots are further along, and tasks run down the pipeline: early departments
    // finish first.
    const maturity = 1 - i / Math.max(shotCount, 1);
    TASK_TYPES.forEach((type) => {
      if (rand() < 0.2) return;
      const roll = rand() * 0.6 + maturity * 0.5 - type.sort * 0.05;
      const status = rand() < 0.08 ? OMITTED
        : roll > 0.75 ? STATUSES[4] : roll > 0.6 ? STATUSES[2] : roll > 0.4 ? STATUSES[1]
          : roll > 0.35 ? STATUSES[3] : STATUSES[0];
      // Departments follow one another through each shot, starting a few weeks back; a few
      // tasks have no dates, as unscheduled work does.
      const day = 24 * 60 * 60 * 1000;
      const start = Date.now() - 45 * day + i * 2 * day + type.sort * 6 * day + Math.round(rand() * 3) * day;
      const scheduled = rand() > 0.08;
      tasks.push({
        id: `task-${i}-${type.id}`,
        name: `${shot.name}_${type.name.toLowerCase()}`,
        type,
        parent: shot,
        status,
        start_date: scheduled ? new Date(start).toISOString() : null,
        end_date: scheduled ? new Date(start + (3 + Math.round(rand() * 8)) * day).toISOString() : null,
      });
    });
    // Many shots have a plates folder with its own prep tasks, which the studio leaves out.
    if (rand() < 0.6) {
      const plates = { id: `plates-${i}`, name: 'plates', __entity_type__: 'Folder' };
      contexts.push({ id: plates.id, link: [project, seq, shot, plates] });
      PLATE_TYPES.forEach((type) => {
        const start = Date.now() - 50 * 86_400_000 + i * 2 * 86_400_000;
        tasks.push({
          id: `task-${i}-${type.id}`,
          name: `${shot.name}_${type.name.toLowerCase().replace(' ', '_')}`,
          type,
          parent: plates,
          status: rand() < 0.5 ? STATUSES[4] : STATUSES[0],
          start_date: new Date(start).toISOString(),
          end_date: new Date(start + 4 * 86_400_000).toISOString(),
        });
      });
    }
  }
  return { project, tasks, contexts, shots };
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
      if (/from Shot /.test(expression)) return page(db.shots);
      if (/from Task /.test(expression)) {
        const rows = shotId && !/ in \(/.test(expression)
          // Everything under the shot, its plates folder included, as `ancestors.id` matches.
          ? db.tasks.filter((t) => [shotId, shotId.replace('shot-', 'plates-')].includes((t.parent as { id: string }).id))
          : db.tasks;
        return page(rows);
      }
      return { data: [] };
    },
  };
}
