import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/600.css';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import * as ftrackWidget from '@ftrack/web-widget';
import { Alert, Box, Button, LinearProgress, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import type { QuerySession } from './data/fetchProgress';
import { UnsupportedScopeError } from './data/fetchProgress';
import {
  aggregate, buildSeries, compareNames, formatCount, formatPercent, formatTasks, STATES, summariseShots, type Aggregate,
} from './data/aggregate';
import type { GroupRef, ProgressData, WorkItem } from './data/types';
import { isBool, oneOf, useFtrackEntity, useProgressData, usePersistentState, type EntityRef, type LoadState } from './hooks';
import Toolbar, { type ViewSettings } from './components/Toolbar';
import Legend from './components/Legend';
import BarView from './components/BarView';
import PieView from './components/PieView';
import ShotList from './components/ShotList';
import ExcludeFilter, { type ExcludeOption } from './components/ExcludeFilter';
// vis-timeline is about as large as the rest of the widget, so it loads only when the
// timeline is first switched on.
const TimelineView = lazy(() => import('./components/TimelineView'));

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Whether a task sits directly in a non-shot folder whose name was excluded. */
function isInFolder(task: WorkItem, folders: string[]) {
  return Boolean(task.parent && task.parent.entityType !== 'Shot' && folders.includes(task.parent.name));
}

const DEFAULTS: ViewSettings = {
  chart: 'bar',
  timeline: false,
  breakdown: 'status',
  sortBy: 'default',
  normalize: false,
};
const isSettings = (v: unknown): v is ViewSettings => {
  const s = v as ViewSettings;
  return Boolean(s) && oneOf('bar', 'pie')(s.chart) && oneOf('status', 'state')(s.breakdown)
    && oneOf('default', 'name', 'progress', 'total')(s.sortBy) && isBool(s.normalize)
    // Saved before the timeline existed.
    && (s.timeline === undefined || isBool(s.timeline));
};

interface Props {
  session: QuerySession;
  /** Set by the dev harness; in ftrack the entity comes from the widget events. */
  entity?: EntityRef | null;
}

export default function App({ session, entity: fixedEntity }: Props) {
  const entity = useFtrackEntity(fixedEntity);
  const [stored, setSettings] = usePersistentState('settings', DEFAULTS, isSettings);
  // Older saved settings may lack newer fields, or carry ones this version no longer has.
  const settings: ViewSettings = {
    chart: stored.chart,
    timeline: stored.timeline ?? false,
    breakdown: stored.breakdown,
    sortBy: stored.sortBy,
    normalize: stored.normalize,
  };
  const { state, reload } = useProgressData(session, entity);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const [excluded, setExcluded] = usePersistentState('excludedStatuses', [] as string[], isStringArray);
  // Folders under the shots (e.g. "plates") whose tasks should not count, saved by name.
  const [excludedFolders, setExcludedFolders] = usePersistentState('excludedFolders', [] as string[], isStringArray);
  // Shot statuses (e.g. "Omitted") whose shots should not count at all, saved by name.
  const [excludedShotStatuses, setExcludedShotStatuses] = usePersistentState('excludedShotStatuses', [] as string[], isStringArray);
  // Shot search, shared by the list and the timeline so it survives switching between them.
  const [query, setQuery] = useState('');

  const data = 'data' in state ? state.data : undefined;
  const { breakdown, sortBy } = settings;

  // Exclusions apply from the parent down: shots by status first (with everything under them),
  // then folders, then task statuses on what is left. Each menu section counts what is still
  // in after the sections above it.
  const inShots = useMemo(() => {
    if (!data) return [];
    if (!excludedShotStatuses.length) return data.tasks;
    return data.tasks.filter((t) => !(t.shotStatus && excludedShotStatuses.includes(t.shotStatus.name)));
  }, [data, excludedShotStatuses]);
  const inFolders = useMemo(
    () => (excludedFolders.length ? inShots.filter((t) => !isInFolder(t, excludedFolders)) : inShots),
    [inShots, excludedFolders],
  );

  // Every shot status in the scope, in workflow order, with how many shots are in it.
  const shotStatusOptions = useMemo<ExcludeOption[]>(() => {
    const byName = new Map<string, ExcludeOption & { sort: number; shots: Set<string> }>();
    for (const { shotId, shotStatus } of data?.tasks ?? []) {
      if (!shotId || !shotStatus) continue;
      const entry = byName.get(shotStatus.name)
        ?? { name: shotStatus.name, color: shotStatus.color, count: 0, sort: shotStatus.sort, shots: new Set<string>() };
      entry.shots.add(shotId);
      entry.count = entry.shots.size;
      byName.set(shotStatus.name, entry);
    }
    return [...byName.values()]
      .sort((a, b) => a.sort - b.sort || compareNames(a.name, b.name))
      .map(({ name, color, count }) => ({ name, color, count }));
  }, [data]);

  // Every non-shot parent the remaining tasks sit under (a plates folder...), by name.
  const folderOptions = useMemo<ExcludeOption[]>(() => {
    const byName = new Map<string, ExcludeOption>();
    for (const { parent } of inShots) {
      if (!parent || parent.entityType === 'Shot') continue;
      const entry = byName.get(parent.name) ?? { name: parent.name, kind: parent.entityType, count: 0 };
      entry.count += 1;
      byName.set(parent.name, entry);
    }
    return [...byName.values()].sort((a, b) => compareNames(a.name, b.name));
  }, [inShots]);

  // Every task status left, in workflow order, with how many tasks are in it.
  const statusOptions = useMemo<ExcludeOption[]>(() => {
    const byName = new Map<string, ExcludeOption & { sort: number }>();
    for (const { status } of inFolders) {
      const entry = byName.get(status.name) ?? { name: status.name, color: status.color, count: 0, sort: status.sort };
      entry.count += 1;
      byName.set(status.name, entry);
    }
    return [...byName.values()].sort((a, b) => a.sort - b.sort || compareNames(a.name, b.name));
  }, [inFolders]);

  const view = useMemo(() => {
    if (!data) return undefined;
    // Excluded statuses leave the counts entirely, unlike a status hidden from the legend.
    const counted = excluded.length ? inFolders.filter((t) => !excluded.includes(t.status.name)) : inFolders;
    const series = buildSeries(counted, breakdown);
    return {
      overall: aggregate(counted, series, breakdown),
      shots: summariseShots(counted, series, breakdown, sortBy),
      excludedCount: data.tasks.length - counted.length,
      counted,
    };
  }, [data, inFolders, excluded, breakdown, sortBy]);
  // A folder, sequence or project with several shots gets the per-shot list.
  const showShotList = Boolean(view && view.shots.length > 1);

  const change = useCallback((patch: Partial<ViewSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    // Series change meaning with the breakdown, so start from a clean slate.
    if (patch.breakdown) setHidden(new Set());
  }, [setSettings]);

  const toggleSeries = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const openInFtrack = fixedEntity
    ? undefined
    : (ref: GroupRef) => { try { ftrackWidget.openSidebar(ref.entityType ?? 'TypedContext', ref.id); } catch (e) { console.error(e); } };
  const openTask = useMemo(() => (fixedEntity
    ? undefined
    : (task: WorkItem) => { try { ftrackWidget.openSidebar('Task', task.id); } catch (e) { console.error(e); } }), [fixedEntity]);

  // The timeline colours and hides bars the way the legend does for the charts.
  const seriesKeyOf = useCallback((task: WorkItem) => (breakdown === 'state' ? task.status.state : task.status.id), [breakdown]);
  const colorFor = useCallback((task: WorkItem) => (breakdown === 'state'
    ? STATES.find((s) => s.key === task.status.state)?.color ?? task.status.color
    : task.status.color), [breakdown]);
  const isHidden = useCallback((task: WorkItem) => hidden.has(seriesKeyOf(task)), [hidden, seriesKeyOf]);

  return (
    <Box component="main" sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      <Box sx={{ position: 'relative', px: 1.5, pt: 1.25, pb: 1, display: 'flex', flexDirection: 'column', gap: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        {(data || state.status === 'loading') && (
          <Header
            data={data}
            agg={view?.overall}
            shotCount={view?.shots.length ?? 0}
            excluded={[
              excludedShotStatuses.length && `shots: ${excludedShotStatuses.join(', ')}`,
              excludedFolders.length && `folders: ${excludedFolders.join(', ')}`,
              excluded.length && `tasks: ${excluded.join(', ')}`,
            ].filter(Boolean).join(' · ')}
            excludedCount={view?.excludedCount ?? 0}
          />
        )}
        <Toolbar
          settings={settings}
          onChange={change}
          hasShotList={showShotList}
          loading={state.status === 'loading'}
          onRefresh={reload}
          filter={data && (
            <ExcludeFilter
              sections={[
                {
                  key: 'shot', title: 'Shots by status', counts: 'shots',
                  options: shotStatusOptions, excluded: excludedShotStatuses, onChange: setExcludedShotStatuses,
                },
                {
                  key: 'folder', title: 'Folders', counts: 'tasks',
                  options: folderOptions, excluded: excludedFolders, onChange: setExcludedFolders,
                },
                {
                  key: 'task', title: 'Tasks by status', counts: 'tasks',
                  options: statusOptions, excluded, onChange: setExcluded,
                },
              ]}
            />
          )}
        />
        {view && <Legend agg={view.overall} hidden={hidden} onToggle={toggleSeries} />}
        {state.status === 'loading' && data && (
          <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2 }} />
        )}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Body
          state={state}
          entity={entity}
          view={view}
          showShotList={showShotList}
          settings={settings}
          hidden={hidden}
          focusId={focusId}
          onFocus={setFocusId}
          onOpen={openInFtrack}
          onReload={reload}
          onChange={change}
          excludedCount={view?.excludedCount ?? 0}
          onClearExcluded={() => { setExcluded([]); setExcludedFolders([]); setExcludedShotStatuses([]); }}
          query={query}
          onQueryChange={setQuery}
          renderTimeline={() => view && (
            <Suspense fallback={<LinearProgress sx={{ m: 2 }} />}>
              <TimelineView
                shots={view.shots}
                tasks={view.counted}
                colorFor={colorFor}
                isHidden={isHidden}
                query={query}
                onQueryChange={setQuery}
                onOpenTask={openTask}
              />
            </Suspense>
          )}
        />
      </Box>
    </Box>
  );
}

function Header({ data, agg, shotCount, excluded, excludedCount }: {
  data?: ProgressData;
  agg?: Aggregate;
  shotCount: number;
  /** What was excluded, already worded: "shots: Omitted · folders: plates". */
  excluded: string;
  excludedCount: number;
}) {
  const theme = useTheme();
  if (!data || !agg) {
    return <Stack spacing={0.5}><Skeleton width="40%" height={22} /><Skeleton height={6} variant="rounded" /></Stack>;
  }
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, minWidth: 0 }} title={data.scope.name}>
          {data.scope.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
          {data.scope.type}{shotCount > 1 && ` · ${formatCount(shotCount)} shots`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" noWrap sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          <b>{formatPercent(agg.progress)}</b>
          <Box component="span" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline' } }}>
            {' '}done · {formatCount(agg.done)} of {formatCount(agg.total)} tasks
          </Box>
        </Typography>
      </Stack>
      <Tooltip title={`${formatPercent(agg.progress)} of tasks are in a done status`}>
        <LinearProgress
          variant="determinate"
          value={agg.progress * 100}
          aria-label="Overall progress"
          sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: '#56b98e' } }}
        />
      </Tooltip>
      {data.truncated && (
        <Typography variant="caption" color="warning.main">Very large scope: only the first 50,000 tasks are counted.</Typography>
      )}
      {excludedCount > 0 && (
        <Typography variant="caption" color="text.secondary">
          {formatTasks(excludedCount)} not counted ({excluded})
        </Typography>
      )}
    </Stack>
  );
}

function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'safe center', justifyContent: 'center', p: 3 }}>
      <Stack spacing={1} alignItems="center" sx={{ textAlign: 'center', maxWidth: 360 }}>
        <InsightsOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
        <Typography variant="subtitle2">{title}</Typography>
        {children && <Typography variant="body2" color="text.secondary">{children}</Typography>}
        {action}
      </Stack>
    </Box>
  );
}

function Body(props: {
  state: LoadState;
  entity: EntityRef | null;
  view?: { overall: Aggregate; shots: ReturnType<typeof summariseShots> };
  showShotList: boolean;
  settings: ViewSettings;
  hidden: Set<string>;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onOpen?: (ref: GroupRef) => void;
  onReload: () => void;
  onChange: (patch: Partial<ViewSettings>) => void;
  excludedCount: number;
  onClearExcluded: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  renderTimeline: () => React.ReactNode;
}) {
  const {
    state, entity, view, showShotList, settings, hidden, focusId, onFocus, onOpen, onReload, onChange,
    excludedCount, onClearExcluded, query, onQueryChange, renderTimeline,
  } = props;

  if (!entity) {
    return <EmptyState title="Nothing selected">Open this widget on a project, folder, sequence, shot or list to see its progress.</EmptyState>;
  }
  if (state.status === 'error' && !state.data) {
    if (state.error instanceof UnsupportedScopeError) {
      return <EmptyState title="Not available here">{state.error.message}</EmptyState>;
    }
    // Mid-session 401/403s are the same cookie/session problem the loading page explains.
    const auth = /401|403|auth|credential|csrf|session/i.test(state.error.message);
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" variant="outlined" action={<Button color="inherit" size="small" onClick={onReload}>Retry</Button>}>
          Could not load progress from ftrack. {state.error.message}
          {auth && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Your ftrack session may have expired, or the browser is blocking third-party cookies for this widget.
              Refresh the ftrack page, and allow third-party cookies for your ftrack site if it keeps happening.
            </Typography>
          )}
        </Alert>
      </Box>
    );
  }
  if (!view) {
    return (
      <Stack spacing={1.25} sx={{ p: 2 }}>
        {[72, 55, 88, 40, 64].map((w, i) => (
          <Stack key={i} direction="row" spacing={1.5} alignItems="center">
            <Skeleton width={80} /><Skeleton variant="rounded" height={20} width={`${w}%`} />
          </Stack>
        ))}
      </Stack>
    );
  }

  const staleError = state.status === 'error' && (
    <Alert severity="warning" variant="outlined" sx={{ m: 1, mb: 0, py: 0 }}
      action={<Button color="inherit" size="small" onClick={onReload}>Retry</Button>}>
      Refresh failed, showing earlier data. {state.error.message}
    </Alert>
  );

  if (view.overall.total === 0) {
    const where = state.status === 'ready' ? state.data.scope.type.toLowerCase() : 'entity';
    return (
      <>
        {staleError}
        {excludedCount > 0 ? (
          <EmptyState title="Every task is excluded" action={<Button size="small" onClick={onClearExcluded}>Clear exclusions</Button>}>
            All {formatTasks(excludedCount)} here are in shots, folders or statuses you left out of the counts.
          </EmptyState>
        ) : (
          <EmptyState title="No tasks here">There are no tasks under this {where}.</EmptyState>
        )}
      </>
    );
  }

  return (
    <>
      {staleError}
      {settings.chart === 'bar' && settings.timeline ? (
        renderTimeline()
      ) : showShotList ? (
        <ShotList
          shots={view.shots}
          overall={view.overall}
          chart={settings.chart}
          normalize={settings.normalize}
          hidden={hidden}
          onOpen={onOpen}
          query={query}
          onQueryChange={onQueryChange}
        />
      ) : settings.chart === 'bar' ? (
        <BarView
          agg={view.overall}
          normalize={settings.normalize}
          hidden={hidden}
          onRowClick={(row) => { onFocus(row.ref.id); onChange({ chart: 'pie' }); }}
        />
      ) : (
        <PieView agg={view.overall} hidden={hidden} focusId={focusId} onFocus={onFocus} />
      )}
    </>
  );
}
