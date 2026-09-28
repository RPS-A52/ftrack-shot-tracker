/** ftrack's four status states. Every workflow status belongs to one of them. */
export type StateKey = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export interface StatusInfo {
  id: string;
  name: string;
  color: string;
  sort: number;
  state: StateKey;
}

/** One thing whose progress we count: a task, or the latest version of an asset. */
export interface WorkItem {
  id: string;
  status: StatusInfo;
  /** Bid in hours; 0 when not set, or for versions (which have no bid). */
  bidHours: number;
  /** What the item is grouped under, one entry per GroupBy mode that applies to its source. */
  groups: Partial<Record<GroupBy, GroupRef>>;
}

export interface GroupRef {
  id: string;
  name: string;
  /** Secondary text, e.g. the sequence a shot is in. */
  detail?: string;
  color?: string;
  sort?: number;
  /** ftrack entity type, for opening the sidebar. */
  entityType?: string;
}

export type GroupBy = 'taskType' | 'shot' | 'assetType';
export type Measure = 'bid' | 'count';
export type Breakdown = 'status' | 'state';
export type SortBy = 'default' | 'progress' | 'total' | 'name';
export type ChartKind = 'bar' | 'pie';

/** What the widget was pointed at in ftrack. */
export interface Scope {
  id: string;
  type: string;
  name: string;
}

export interface ProgressData {
  scope: Scope;
  tasks: WorkItem[];
  versions: WorkItem[];
  /** True if a source was cut short by the safety limit (see fetchProgress.ts). */
  truncated: boolean;
}

export const GROUP_LABELS: Record<GroupBy, string> = {
  taskType: 'Task type',
  shot: 'Shot',
  assetType: 'Asset type',
};

/** Tasks are counted for task type and shot; asset types come from versions. */
export function sourceFor(groupBy: GroupBy): 'tasks' | 'versions' {
  return groupBy === 'assetType' ? 'versions' : 'tasks';
}
