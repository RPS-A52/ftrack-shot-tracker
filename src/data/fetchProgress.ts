// Loads the latest versions under the entity the widget is pointed at.
// Everything is fetched once per scope; switching chart, colours, sorting or searching is
// done client side (aggregate.ts), so the toolbar never waits on the server.

import type { ProgressData, Scope, StateKey, StatusInfo, WorkItem } from './types';

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
const VERSION_FIELDS = [
  'id', 'asset.id', 'asset.name',
  'asset.type.id', 'asset.type.name',
  'asset.parent.id', 'asset.parent.name',
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

function toVersion(row: Row, sequences: Map<string, string>): WorkItem {
  const type = row.asset?.type;
  const parent = row.asset?.parent;
  return {
    id: row.id,
    status: toStatus(row.status),
    assetType: type?.id ? { id: type.id, name: type.name } : { id: '__none__', name: 'No asset type' },
    parent: parent?.id
      ? { id: parent.id, name: parent.name, detail: sequences.get(parent.id), entityType: parent.__entity_type__ }
      : null,
  };
}

/**
 * Name of the entity above each shot (usually its sequence), to tell apart shots that share
 * a name. Best effort: without it the list just shows bare shot names.
 */
async function loadParentNames(session: QuerySession, ids: string[]) {
  const names = new Map<string, string>();
  try {
    const { rows } = await queryAllIn(session, 'TypedContext', ['id', 'link'], ids, (list) => `id in (${list})`);
    for (const row of rows) {
      // `link` runs from the project down to the entity itself: [..., sequence, shot].
      const link: Row[] = Array.isArray(row.link) ? row.link : [];
      const above = link.length >= 2 ? link[link.length - 2] : undefined;
      if (above?.name) names.set(row.id, above.name);
    }
  } catch (error) {
    console.warn('Could not load sequence names', error);
  }
  return names;
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

/** Latest version of every asset under the entity, with the status each one is in. */
export async function fetchProgress(session: QuerySession, entity: { id: string; type: string }): Promise<ProgressData> {
  if (UNSUPPORTED_TYPES.includes(entity.type)) {
    throw new UnsupportedScopeError(`This widget summarises projects, folders, sequences, shots, tasks and lists. It can't be used on a ${entity.type}.`);
  }
  const scopePromise = loadScope(session, entity.id, entity.type);
  const id = quote(entity.id);
  const latest = 'is_latest_version is true';

  let versions: Promise<{ rows: Row[]; truncated: boolean }>;
  if (entity.type === 'Project') {
    const filter = hasProperty(session, 'AssetVersion', 'project_id')
      ? `project_id is ${id}`
      : `(asset.context_id is ${id} or asset.parent.project_id is ${id})`;
    versions = queryAll(session, 'AssetVersion', VERSION_FIELDS, `${filter} and ${latest}`);
  } else if (LIST_TYPES.includes(entity.type)) {
    // A list holds entities (or versions); count everything under what it holds.
    const { rows: items } = await queryAll(session, 'ListObject', ['entity_id'], `list_id is ${id}`);
    const ids = [...new Set(items.map((r) => String(r.entity_id)))];
    versions = entity.type === 'AssetVersionList'
      ? queryAllIn(session, 'AssetVersion', VERSION_FIELDS, ids, (list) => `id in (${list})`)
      : queryAllIn(session, 'AssetVersion', VERSION_FIELDS, ids,
        (list) => `(asset.context_id in (${list}) or asset.parent.ancestors.id in (${list})) and ${latest}`);
  } else {
    versions = queryAll(session, 'AssetVersion', VERSION_FIELDS,
      `(task_id is ${id} or asset.context_id is ${id} or asset.parent.ancestors.id is ${id}) and ${latest}`);
  }

  const [scope, v] = await Promise.all([scopePromise, versions]);
  const parentIds = [...new Set(v.rows.map((r) => r.asset?.parent?.id).filter(Boolean) as string[])];
  const sequences = await loadParentNames(session, parentIds);
  return {
    scope,
    versions: v.rows.map((row) => toVersion(row, sequences)),
    truncated: v.truncated,
  };
}