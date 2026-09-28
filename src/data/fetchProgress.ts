// Loads the tasks and latest versions under the entity the widget is pointed at.
// Everything is fetched once per scope; switching chart, grouping or measure is done
// client side (aggregate.ts), so the toolbar never waits on the server.

import type { GroupRef, ProgressData, Scope, StateKey, StatusInfo, WorkItem } from './types';

/** The part of @ftrack/api's Session we use; mockSession.ts implements the same. */
export interface QuerySession {
  query(expression: string): Promise<{ data: Row[] }>;
  schemas?: { id: string | number; properties?: object }[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PAGE_SIZE = 1000;
/** Stop paging past this many rows per source; the UI says the numbers are partial. */
const MAX_ROWS = 50000;
/** Ids per `in (...)` clause, to keep query strings a sane length. */
const ID_CHUNK = 100;

const LIST_TYPES = ['List', 'TypedContextList', 'AssetVersionList'];
const UNSUPPORTED_TYPES = ['AssetVersion', 'Component', 'ReviewSession', 'ReviewSessionObject', 'User'];

export class UnsupportedScopeError extends Error {}

const STATUS_FIELDS = ['status.id', 'status.name', 'status.color', 'status.sort', 'status.state.short'];
const TASK_FIELDS = [
  'id', 'bid', 'link',
  'type.id', 'type.name', 'type.color', 'type.sort',
  'parent.id', 'parent.name',
  ...STATUS_FIELDS,
];
const VERSION_FIELDS = [
  'id', 'asset.id', 'asset.name',
  'asset.type.id', 'asset.type.name',
  ...STATUS_FIELDS,
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

function hasProperty(session: QuerySession, entityType: string, property: string) {
  const schema = session.schemas?.find((s) => s.id === entityType);
  return Boolean(schema?.properties && property in schema.properties);
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

function toTask(row: Row): WorkItem {
  const groups: WorkItem['groups'] = {};
  groups.taskType = row.type?.id
    ? { id: row.type.id, name: row.type.name, color: row.type.color || undefined, sort: Number(row.type.sort ?? 0) }
    : { id: '__none__', name: 'No type' };
  if (row.parent?.id) {
    // `link` runs from the project down to the task: [..., sequence, shot, task].
    const link: Row[] = Array.isArray(row.link) ? row.link : [];
    const grandparent = link.length >= 3 ? link[link.length - 3] : undefined;
    const shot: GroupRef = {
      id: row.parent.id,
      name: row.parent.name,
      detail: grandparent?.name,
      entityType: row.parent.__entity_type__,
    };
    groups.shot = shot;
  }
  return {
    id: row.id,
    status: toStatus(row.status),
    // ftrack stores bids in seconds.
    bidHours: Math.max(0, Number(row.bid) || 0) / 3600,
    groups,
  };
}

function toVersion(row: Row): WorkItem {
  const type = row.asset?.type;
  return {
    id: row.id,
    status: toStatus(row.status),
    bidHours: 0,
    groups: {
      assetType: type?.id ? { id: type.id, name: type.name } : { id: '__none__', name: 'No asset type' },
    },
  };
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

export async function fetchProgress(session: QuerySession, entity: { id: string; type: string }): Promise<ProgressData> {
  if (UNSUPPORTED_TYPES.includes(entity.type)) {
    throw new UnsupportedScopeError(`This widget summarises projects, folders, sequences, shots, tasks and lists. It can't be used on a ${entity.type}.`);
  }
  const scopePromise = loadScope(session, entity.id, entity.type);
  const id = quote(entity.id);
  const latest = 'is_latest_version is true';

  let tasks: Promise<{ rows: Row[]; truncated: boolean }>;
  let versions: Promise<{ rows: Row[]; truncated: boolean }>;

  if (entity.type === 'Project') {
    tasks = queryAll(session, 'Task', TASK_FIELDS, `project_id is ${id}`);
    const versionFilter = hasProperty(session, 'AssetVersion', 'project_id')
      ? `project_id is ${id}`
      : `(asset.context_id is ${id} or asset.parent.project_id is ${id})`;
    versions = queryAll(session, 'AssetVersion', VERSION_FIELDS, `${versionFilter} and ${latest}`);
  } else if (LIST_TYPES.includes(entity.type)) {
    // A list holds entities (or versions); count everything under what it holds.
    const { rows: items } = await queryAll(session, 'ListObject', ['entity_id'], `list_id is ${id}`);
    const ids = [...new Set(items.map((r) => String(r.entity_id)))];
    if (entity.type === 'AssetVersionList') {
      tasks = Promise.resolve({ rows: [], truncated: false });
      versions = queryAllIn(session, 'AssetVersion', VERSION_FIELDS, ids, (list) => `id in (${list})`);
    } else {
      tasks = queryAllIn(session, 'Task', TASK_FIELDS, ids, (list) => `(id in (${list}) or ancestors.id in (${list}))`);
      versions = queryAllIn(session, 'AssetVersion', VERSION_FIELDS, ids,
        (list) => `(asset.context_id in (${list}) or asset.parent.ancestors.id in (${list})) and ${latest}`);
    }
  } else {
    tasks = queryAll(session, 'Task', TASK_FIELDS, `(id is ${id} or ancestors.id is ${id})`);
    versions = queryAll(session, 'AssetVersion', VERSION_FIELDS,
      `(task_id is ${id} or asset.context_id is ${id} or asset.parent.ancestors.id is ${id}) and ${latest}`);
  }

  const [scope, t, v] = await Promise.all([scopePromise, tasks, versions]);
  return {
    scope,
    tasks: t.rows.map(toTask),
    versions: v.rows.map(toVersion),
    truncated: t.truncated || v.truncated,
  };
}
