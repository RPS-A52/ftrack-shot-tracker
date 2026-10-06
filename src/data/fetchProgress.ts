// Loads every task under the entity the widget is pointed at, with its type and status.
// Everything is fetched once per scope; switching chart, colours, sorting or searching is
// done client side (aggregate.ts), so the toolbar never waits on the server.

import type { ProgressData, Scope, StateKey, StatusInfo, WorkItem } from './types';

/** The part of @ftrack/api's Session we use; mockSession.ts implements the same. */
export interface QuerySession {
  query(expression: string): Promise<{ data: Row[] }>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PAGE_SIZE = 1000;
/** Stop paging past this many rows; the UI says the numbers are partial. */
const MAX_ROWS = 50000;
/** Ids per `in (...)` clause, to keep query strings a sane length. */
const ID_CHUNK = 100;

const LIST_TYPES = ['List', 'TypedContextList'];
const UNSUPPORTED_TYPES = ['AssetVersion', 'AssetVersionList', 'Component', 'ReviewSession', 'ReviewSessionObject', 'User'];

export class UnsupportedScopeError extends Error {}

const TASK_FIELDS = [
  'id', 'name', 'start_date', 'end_date',
  'type.id', 'type.name', 'type.sort',
  'parent.id', 'parent.name',
  'status.id', 'status.name', 'status.color', 'status.sort', 'status.state.short',
];
const NO_STATUS: StatusInfo = { id: '__none__', name: 'No status', color: '#8a8f98', sort: -1, state: 'NOT_STARTED' };

function quote(id: string) {
  // ftrack ids are uuids; anything else is refused rather than pasted into a query.
  if (!/^[0-9a-zA-Z-]+$/.test(id)) throw new Error(`Unexpected entity id: ${id}`);
  return `"${id}"`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `select <fields> from <type> where <filter>` page by page. */
async function queryAll(session: QuerySession, type: string, fields: string[], filter: string) {
  const rows: Row[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const expr = `select ${fields.join(', ')} from ${type} where ${filter} order by id offset ${offset} limit ${PAGE_SIZE}`;
    const { data } = await session.query(expr);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
  }
  return { rows, truncated };
}

/** Same as queryAll, for a filter that has to be split over many ids. */
async function queryAllIn(session: QuerySession, type: string, fields: string[], ids: string[], filterFor: (idList: string) => string) {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let truncated = false;
  for (const part of chunks(ids, ID_CHUNK)) {
    const result = await queryAll(session, type, fields, filterFor(part.map(quote).join(', ')));
    truncated ||= result.truncated;
    for (const row of result.rows) {
      if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
    }
    if (rows.length >= MAX_ROWS) { truncated = true; break; }
  }
  return { rows, truncated };
}

function toStatus(status: Row | null | undefined): StatusInfo {
  if (!status?.id) return NO_STATUS;
  const state = (status.state?.short ?? 'NOT_STARTED') as StateKey;
  return {
    id: status.id,
    name: status.name ?? 'Unnamed status',
    color: status.color || NO_STATUS.color,
    sort: Number(status.sort ?? 0),
    state: ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE'].includes(state) ? state : 'NOT_STARTED',
  };
}

function toTask(row: Row, parents: Map<string, ParentInfo>, shotStatuses: Map<string, StatusInfo>): WorkItem {
  const type = row.type;
  const parent = row.parent;
  const info = parent?.id ? parents.get(parent.id) : undefined;
  // The task's shot: its parent if that is a shot, else the nearest shot above it (a task in
  // sh010/plates belongs to sh010).
  const shotId = parent?.id && shotStatuses.has(parent.id) ? parent.id : info?.chain.find((id) => shotStatuses.has(id));
  return {
    id: row.id,
    status: toStatus(row.status),
    taskType: type?.id
      ? { id: type.id, name: type.name, sort: Number(type.sort ?? 0) }
      : { id: '__none__', name: 'No task type', sort: Number.MAX_SAFE_INTEGER },
    parent: parent?.id
      ? { id: parent.id, name: parent.name, detail: info?.above, entityType: parent.__entity_type__ }
      : null,
    shotId: shotId ?? null,
    shotStatus: shotId ? shotStatuses.get(shotId) ?? null : null,
    name: row.name ?? type?.name ?? 'Task',
    startsAt: toIso(row.start_date),
    endsAt: toIso(row.end_date),
  };
}
/**
 * ftrack dates as ISO strings. @ftrack/api decodes them to moment objects unless the session
 * is created with `decodeDatesAsIso`, and the mock session sends strings; accept both.
 */
function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return Number.isNaN(Date.parse(value)) ? null : value;
  const date = value as { toISOString?: () => string };
  return typeof date.toISOString === 'function' ? date.toISOString() : null;
}

interface ParentInfo {
  /** Name of the entity above (usually the sequence), to tell apart shots with one name. */
  above?: string;
  /** Ids of the entities above, nearest first, for finding a task's shot. */
  chain: string[];
}

/**
 * Where each task parent sits, from its `link` (the path from the project down to it).
 * Best effort: without it the list shows bare shot names and shot statuses are unknown.
 */
async function loadParents(session: QuerySession, ids: string[]) {
  const parents = new Map<string, ParentInfo>();
  try {
    const { rows } = await queryAllIn(session, 'TypedContext', ['id', 'link'], ids, (list) => `id in (${list})`);
    for (const row of rows) {
      // [project, ..., sequence, shot, (folder)]: everything but the entity itself and the project.
      const link: Row[] = Array.isArray(row.link) ? row.link : [];
      const above = link.length >= 2 ? link[link.length - 2] : undefined;
      parents.set(row.id, {
        above: above?.name,
        chain: link.slice(1, -1).map((entry) => String(entry.id)).reverse(),
      });
    }
  } catch (error) {
    console.warn('Could not load parent paths', error);
  }
  return parents;
}

/**
 * The status of every shot among `ids`, for excluding shots by status. Ids that are not shots
 * (folders, sequences) simply do not come back. Best effort, as studios without a Shot type
 * would otherwise lose the whole widget.
 */
async function loadShotStatuses(session: QuerySession, ids: string[]) {
  const statuses = new Map<string, StatusInfo>();
  try {
    const fields = ['id', 'status.id', 'status.name', 'status.color', 'status.sort', 'status.state.short'];
    const { rows } = await queryAllIn(session, 'Shot', fields, ids, (list) => `id in (${list})`);
    for (const row of rows) statuses.set(String(row.id), toStatus(row.status));
  } catch (error) {
    console.warn('Could not load shot statuses', error);
  }
  return statuses;
}
async function loadScope(session: QuerySession, id: string, type: string): Promise<Scope> {
  const from = LIST_TYPES.includes(type) ? type : 'Context';
  try {
    const { data } = await session.query(`select name from ${from} where id is ${quote(id)}`);
    return { id, type, name: data[0]?.name ?? type };
  } catch {
    return { id, type, name: type };
  }
}

/** Every task under the entity (or the entity itself, if it is a task). */
async function queryTasks(session: QuerySession, entity: { id: string; type: string }) {
  const id = quote(entity.id);
  if (entity.type === 'Project') return queryAll(session, 'Task', TASK_FIELDS, `project_id is ${id}`);
  if (LIST_TYPES.includes(entity.type)) {
    // A list holds entities; count the tasks on and under each of them.
    const { rows } = await queryAll(session, 'ListObject', ['entity_id'], `list_id is ${id}`);
    const ids = [...new Set(rows.map((r) => String(r.entity_id)))];
    return queryAllIn(session, 'Task', TASK_FIELDS, ids, (list) => `(id in (${list}) or ancestors.id in (${list}))`);
  }
  return queryAll(session, 'Task', TASK_FIELDS, `(id is ${id} or ancestors.id is ${id})`);
}

/** Every task under the entity, with the status each one (and its shot) is in. */
export async function fetchProgress(session: QuerySession, entity: { id: string; type: string }): Promise<ProgressData> {
  if (UNSUPPORTED_TYPES.includes(entity.type)) {
    throw new UnsupportedScopeError(`This widget summarises the tasks under a project, folder, sequence, shot or list. It can't be used on a ${entity.type}.`);
  }
  const [scope, result] = await Promise.all([
    loadScope(session, entity.id, entity.type),
    queryTasks(session, entity),
  ]);
  const parentIds = [...new Set(result.rows.map((r) => r.parent?.id).filter(Boolean) as string[])];
  const parents = await loadParents(session, parentIds);
  // Any parent, or anything above one, may be a shot.
  const candidates = new Set(parentIds);
  for (const info of parents.values()) info.chain.forEach((id) => candidates.add(id));
  const shotStatuses = await loadShotStatuses(session, [...candidates]);
  return {
    scope,
    tasks: result.rows.map((row) => toTask(row, parents, shotStatuses)),
    truncated: result.truncated,
  };
}