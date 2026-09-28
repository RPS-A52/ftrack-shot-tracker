import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/600.css';
import { useCallback, useMemo, useState } from 'react';
import * as ftrackWidget from '@ftrack/web-widget';
import { Alert, Box, Button, LinearProgress, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import type { QuerySession } from './data/fetchProgress';
import { UnsupportedScopeError } from './data/fetchProgress';
import { aggregate, formatPercent, formatValue, type GroupRow } from './data/aggregate';
import { GROUP_LABELS, sourceFor, type ProgressData } from './data/types';
import { isBool, oneOf, useFtrackEntity, useProgressData, usePersistentState, type EntityRef } from './hooks';
import Toolbar, { type ViewSettings } from './components/Toolbar';
import Legend from './components/Legend';
import BarView from './components/BarView';
import PieView from './components/PieView';

const DEFAULTS: ViewSettings = {
  chart: 'bar',
  groupBy: 'taskType',
  measure: 'bid',
  breakdown: 'status',
  sortBy: 'default',
  normalize: false,
};
const isSettings = (v: unknown): v is ViewSettings => {
  const s = v as ViewSettings;
  return Boolean(s) && oneOf('bar', 'pie')(s.chart) && oneOf('taskType', 'shot', 'assetType')(s.groupBy)
    && oneOf('bid', 'count')(s.measure) && oneOf('status', 'state')(s.breakdown)
    && oneOf('default', 'name', 'progress', 'total')(s.sortBy) && isBool(s.normalize);
};

interface Props {
  session: QuerySession;
  /** Set by the dev harness; in ftrack the entity comes from the widget events. */
  entity?: EntityRef | null;
}

export default function App({ session, entity: fixedEntity }: Props) {
  const entity = useFtrackEntity(fixedEntity);
  const { state, reload } = useProgressData(session, entity);
  const [settings, setSettings] = usePersistentState('settings', DEFAULTS, isSettings);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const data = 'data' in state ? state.data : undefined;
  const source = sourceFor(settings.groupBy);
  const bidAvailable = source === 'tasks';
  const measure = bidAvailable ? settings.measure : 'count';

  const agg = useMemo(() => data && aggregate(data[source], {
    groupBy: settings.groupBy,
    measure,
    breakdown: settings.breakdown,
    sortBy: settings.sortBy,
  }), [data, source, settings.groupBy, settings.breakdown, settings.sortBy, measure]);

  const change = useCallback((patch: Partial<ViewSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    // Series and groups change meaning with these, so start from a clean slate.
    if (patch.breakdown || patch.groupBy) setHidden(new Set());
    if (patch.groupBy) setFocusId(null);
  }, [setSettings]);

  const toggleSeries = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Only shots (and other parents) are entities worth opening; task and asset types are not.
  const openInFtrack = settings.groupBy === 'shot' && !fixedEntity
    ? (row: GroupRow) => { try { ftrackWidget.openSidebar(row.ref.entityType ?? 'TypedContext', row.ref.id); } catch (e) { console.error(e); } }
    : undefined;

  return (
    <Box component="main" sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      <Box sx={{ position: 'relative', px: 1.5, pt: 1.25, pb: 1, display: 'flex', flexDirection: 'column', gap: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        {(data || state.status === 'loading') && <Header data={data} agg={agg} measure={measure} />}
        <Toolbar settings={settings} onChange={change} bidAvailable={bidAvailable} loading={state.status === 'loading'} onRefresh={reload} />
        {agg && <Legend agg={agg} measure={measure} hidden={hidden} onToggle={toggleSeries} />}
        {state.status === 'loading' && data && (
          <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2 }} />
        )}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Body
          state={state}
          entity={entity}
          agg={agg}
          settings={settings}
          measure={measure}
          hidden={hidden}
          focusId={focusId}
          onFocus={setFocusId}
          onOpen={openInFtrack}
          onReload={reload}
          onChange={change}
        />
      </Box>
    </Box>
  );
}

function Header({ data, agg, measure }: { data?: ProgressData; agg?: ReturnType<typeof aggregate>; measure: ViewSettings['measure'] }) {
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
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>{data.scope.type}</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" noWrap sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          <b>{formatPercent(agg.progress)}</b>
          <Box component="span" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline' } }}>
            {' '}done · {formatValue(agg.done, measure)} of {formatValue(agg.total, measure)}
          </Box>
        </Typography>
      </Stack>
      <Tooltip title={`${formatPercent(agg.progress)} of ${measure === 'bid' ? 'bid hours' : 'items'} are in a done status`}>
        <LinearProgress
          variant="determinate"
          value={agg.progress * 100}
          aria-label="Overall progress"
          sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: '#56b98e' } }}
        />
      </Tooltip>
      {data.truncated && (
        <Typography variant="caption" color="warning.main">Very large scope: only the first 50,000 items are counted.</Typography>
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
  state: ReturnType<typeof useProgressData>['state'];
  entity: EntityRef | null;
  agg?: ReturnType<typeof aggregate>;
  settings: ViewSettings;
  measure: ViewSettings['measure'];
  hidden: Set<string>;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onOpen?: (row: GroupRow) => void;
  onReload: () => void;
  onChange: (patch: Partial<ViewSettings>) => void;
}) {
  const { state, entity, agg, settings, measure, hidden, focusId, onFocus, onOpen, onReload, onChange } = props;

  if (!entity) {
    return <EmptyState title="Nothing selected">Open this widget on a project, sequence, shot or list to see its progress.</EmptyState>;
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
  if (!agg) {
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

  if (agg.rows.length === 0) {
    const what = settings.groupBy === 'assetType' ? 'published versions' : 'tasks';
    return (
      <>
        {staleError}
        <EmptyState
          title={`No ${what} here`}
          action={settings.groupBy === 'assetType'
            ? <Button size="small" onClick={() => onChange({ groupBy: 'taskType' })}>Show tasks instead</Button>
            : undefined}
        >
          There are no {what} under this {state.status === 'ready' ? state.data.scope.type.toLowerCase() : 'entity'} yet.
        </EmptyState>
      </>
    );
  }
  if (measure === 'bid' && agg.total === 0) {
    return (
      <>
        {staleError}
        <EmptyState title="No bids entered" action={<Button size="small" variant="outlined" onClick={() => onChange({ measure: 'count' })}>Count tasks instead</Button>}>
          None of these {agg.count} tasks has a bid, so there are no hours to chart.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {staleError}
      {settings.chart === 'bar' ? (
        <BarView
          agg={agg}
          measure={measure}
          normalize={settings.normalize}
          hidden={hidden}
          onRowClick={(row) => { onFocus(row.ref.id); onChange({ chart: 'pie' }); }}
        />
      ) : (
        <PieView
          agg={agg}
          measure={measure}
          hidden={hidden}
          groupLabel={GROUP_LABELS[settings.groupBy]}
          focusId={focusId}
          onFocus={onFocus}
          onOpen={onOpen}
        />
      )}
    </>
  );
}
