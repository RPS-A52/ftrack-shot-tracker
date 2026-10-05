/** ftrack's four status states. Every workflow status belongs to one of them. */
export type StateKey = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

export interface StatusInfo {
  id: string;
  name: string;
  color: string;
  sort: number;
  state: StateKey;
}

/** One task: what the widget counts. */
export interface WorkItem {
  id: string;
  status: StatusInfo;
  /** Its task type: the chart rows. */
  taskType: GroupRef;
  /** The entity the task is on, normally a shot. */
  parent: GroupRef | null;
  name: string;
  /** Scheduled start and due dates as ISO strings, for the timeline; null if not scheduled. */
  startsAt: string | null;
  endsAt: string | null;
}

export interface GroupRef {
  id: string;
  name: string;
  /** Secondary text, e.g. the sequence a shot is in. */
  detail?: string;
  /** ftrack entity type, for opening the sidebar and labelling non-shot parents. */
  entityType?: string;
  /** Workflow order (task types have one); rows sort by it, then by name. */
  sort?: number;
}

export type Breakdown = 'status' | 'state';
export type SortBy = 'default' | 'name' | 'progress' | 'total';
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
  /** True if the query was cut short by the safety limit (see fetchProgress.ts). */
  truncated: boolean;
}
