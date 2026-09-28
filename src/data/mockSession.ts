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
const ASSET_TYPES = ['Plate', 'Camera', 'Geometry', 'Rig', 'Animation cache', 'FX cache', 'Render', 'Comp'];

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
  const versions: Record<string, unknown>[] = [];
  const contexts: Record<string, unknown>[] = [];
  for (let i = 0; i < shotCount; i++) {
    const seq = { id: `seq-${Math.floor(i / 8)}`, name: `sq${String(Math.floor(i / 8) + 1).padStart(3, '0')}` };
    // Shot names repeat across sequences, as happens in real projects.
    const shot = { id: `shot-${i}`, name: `sh${String(((i % 8) + 1) * 10).padStart(4, '0')}`, __entity_type__: 'Shot' };
    contexts.push({ id: shot.id, link: [project, seq, shot] });
    // Earlier shots are further along.
    const maturity = 1 - i / Math.max(shotCount, 1);
    ASSET_TYPES.forEach((typeName, t) => {
      if (rand() < 0.3) return;
      const copies = typeName === 'Render' || typeName === 'Geometry' ? 1 + Math.floor(rand() * 3) : 1;
      for (let c = 0; c < copies; c++) {
        const roll = rand() * 0.7 + maturity * 0.45;
        const status = roll > 0.85 ? STATUSES[4] : roll > 0.7 ? STATUSES[2] : roll > 0.5 ? STATUSES[1]
          : roll > 0.44 ? STATUSES[3] : STATUSES[0];
        versions.push({
          id: `ver-${i}-${t}-${c}`,
          asset: {
            id: `asset-${i}-${t}-${c}`,
            name: `${shot.name}_${typeName.toLowerCase().replace(' ', '_')}${c ? `_${c + 1}` : ''}`,
            type: { id: `at-${t}`, name: typeName },
            parent: shot,
          },
          status,
        });
      }
    });
  }
  return { project, versions, contexts };
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
      if (/from AssetVersion /.test(expression)) {
        const rows = shotId && !/ in \(/.test(expression)
          ? db.versions.filter((v) => (v.asset as { parent: { id: string } }).parent.id === shotId)
          : db.versions;
        return page(rows);
      }
      return { data: [] };
    },
  };
}
