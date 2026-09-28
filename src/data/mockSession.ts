// Development only: canned data so the widget can be worked on outside ftrack.
// Answers the queries fetchProgress.ts makes, ignoring the filters and paging past
// the first page. ?shots=<n> changes the size of the fake project.

import type { QuerySession } from './fetchProgress';

const STATUSES = [
  { id: 's-ns', name: 'Not started', color: '#9aa1ab', sort: 0, state: { short: 'NOT_STARTED' } },
  { id: 's-rdy', name: 'Ready to start', color: '#b0b6bf', sort: 1, state: { short: 'NOT_STARTED' } },
  { id: 's-ip', name: 'In progress', color: '#4f97d8', sort: 2, state: { short: 'IN_PROGRESS' } },
  { id: 's-rev', name: 'Pending review', color: '#e8b04b', sort: 3, state: { short: 'IN_PROGRESS' } },
  { id: 's-hold', name: 'On hold', color: '#e0605e', sort: 4, state: { short: 'BLOCKED' } },
  { id: 's-app', name: 'Approved', color: '#56b98e', sort: 5, state: { short: 'DONE' } },
];
const TASK_TYPES = [
  { id: 't-mod', name: 'Modeling', color: '#a17fd6', sort: 0 },
  { id: 't-trk', name: 'Tracking', color: '#6aa6e8', sort: 1 },
  { id: 't-anim', name: 'Animation', color: '#e87e6a', sort: 2 },
  { id: 't-fx', name: 'FX', color: '#e8c66a', sort: 3 },
  { id: 't-lgt', name: 'Lighting', color: '#f0a04b', sort: 4 },
  { id: 't-comp', name: 'Compositing', color: '#57c7c0', sort: 5 },
];
const ASSET_TYPES = ['Geometry', 'Rig', 'Animation cache', 'Render', 'Comp', 'Plate', 'Texture'];

/** Deterministic pseudo-random numbers, so reloads show the same project. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function build(shotCount: number) {
  const rand = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const project = { id: 'mock-project', name: 'Demo project', __entity_type__: 'Project' };
  const tasks: Record<string, unknown>[] = [];
  const versions: Record<string, unknown>[] = [];
  for (let i = 0; i < shotCount; i++) {
    const seq = `sq${String(Math.floor(i / 8) + 1).padStart(3, '0')}`;
    // A couple of shots share a name across sequences, as happens in real projects.
    const shotName = `sh${String(((i % 8) + 1) * 10).padStart(4, '0')}`;
    const shot = { id: `shot-${i}`, name: shotName, __entity_type__: 'Shot' };
    // Earlier shots are further along.
    const maturity = 1 - i / Math.max(shotCount, 1);
    for (const type of TASK_TYPES) {
      if (rand() < 0.2) continue;
      const roll = rand() * 0.7 + maturity * 0.5;
      const status = roll > 0.95 ? STATUSES[5] : roll > 0.8 ? STATUSES[3] : roll > 0.6 ? STATUSES[2]
        : roll > 0.55 ? STATUSES[4] : roll > 0.4 ? STATUSES[1] : STATUSES[0];
      tasks.push({
        id: `task-${i}-${type.id}`,
        bid: rand() < 0.1 ? 0 : Math.round(4 + rand() * 36) * 3600,
        type,
        status,
        parent: shot,
        link: [project, { id: `seq-${seq}`, name: seq }, shot, { id: `task-${i}-${type.id}`, name: type.name }],
      });
      if (status.state.short !== 'NOT_STARTED' && rand() < 0.7) {
        versions.push({
          id: `ver-${i}-${type.id}`,
          asset: { id: `asset-${i}-${type.id}`, name: `${shotName}_${type.name}`, type: { id: `at-${type.id}`, name: pick(ASSET_TYPES) } },
          status: pick(STATUSES.slice(2)),
        });
      }
    }
  }
  return { project, tasks, versions };
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
      if (/from Context /.test(expression)) return { data: [db.project] };
      if (/from Task /.test(expression)) return page(db.tasks);
      if (/from AssetVersion /.test(expression)) return page(db.versions);
      return { data: [] };
    },
  };
}
