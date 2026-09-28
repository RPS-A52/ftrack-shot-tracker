import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/600.css';
import { useCallback, useMemo, useState } from 'react';
import * as ftrackWidget from '@ftrack/web-widget';
import { Alert, Box, Button, LinearProgress, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import type { QuerySession } from './data/fetchProgress';
import { UnsupportedScopeError } from './data/fetchProgress';
import { aggregate, buildSeries, formatCount, formatPercent, summariseShots, type Aggregate } from './data/aggregate';
import type { GroupRef, ProgressData } from './data/types';
import { isBool, oneOf, useFtrackEntity, useProgressData, usePersistentState, type EntityRef, type LoadState } from './hooks';
import Toolbar, { type ViewSettings } from './components/Toolbar';
import Legend from './components/Legend';
import BarView from './components/BarView';
import PieView from './components/PieView';
import ShotList from './components/ShotList';

const DEFAULTS: ViewSettings = {
  chart: 'bar',
  breakdown: 'status',
  sortBy: 'default',
  normalize: false,
};
const isSettings = (v: unknown): v is ViewSettings => {
  const s = v as ViewSettings;
  return Boolean(s) && oneOf('bar', 'pie')(s.chart) && oneOf('status', 'state')(s.breakdown)
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
  const [stored, setSettings] = usePersistentState('settings', DEFAULTS, isSettings);
  // Older saved settings may carry fields this version no longer has.
  const settings: ViewSettings = { chart: stored.chart, breakdown: stored.breakdown, sortBy: stored.sortBy, normalize: stored.normalize };
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const data = 'data' in state ? state.data : undefined;
  const { breakdown, sortBy } = settings;
  const view = useMemo(() => {
    if (!data) return undefined;
    const series = buildSeries(data.versions, breakdown);
    return {
      overall: aggregate(data.versions, series, breakdown),
      shots: summariseShots(data.versions, series, breakdown, sortBy),
    };
  }, [data, breakdown, sortBy]);
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

  return (
    <Box component="main" sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', color: 'text.primary', overflow: 'hidden' }}>
      <Box sx={{ position: 'relative', px: 1.5, pt: 1.25, pb: 1, display: 'flex', flexDirection: 'column', gap: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        {(data || state.status === 'loading') && <Header data={data} agg={view?.overall} shotCount={view?.shots.length ?? 0} />}
        <Toolbar settings={settings} onChange={change} hasShotList={showShotList} loading={state.status === 'loading'} onRefresh={reload} />
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
        />
      </Box>
    </Box>
  );
}

function Header({ data, agg, shotCount }: { data?: ProgressData; agg?: Aggregate; shotCount: number }) {
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
            {' '}done · {formatCount(agg.done)} of {formatCount(agg.total)} assets
          </Box>
        </Typography>
      </Stack>
      <Tooltip title={`${formatPercent(agg.progress)} of assets have their latest version in a done status`}>
        <LinearProgress
          variant="determinate"
          value={agg.progress * 100}
          aria-label="Overall progress"
          sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: '#56b98e' } }}
        />
      </Tooltip>
      {data.truncated && (
        <Typography variant="caption" color="warning.main">Very large scope: only the first 50,000 versions are counted.</Typography>
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
}) {
  const { state, entity, view, showShotList, settings, hidden, focusId, onFocus, onOpen, onReload, onChange } = props;

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
    return (
      <>
        {staleError}
        <EmptyState title="No published versions here">
          Nothing has been published under this {state.status === 'ready' ? state.data.scope.type.toLowerCase() : 'entity'} yet.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {staleError}
      {showShotList ? (
        <ShotList
          shots={view.shots}
          overall={view.overall}
          chart={settings.chart}
          normalize={settings.normalize}
          hidden={hidden}
          onOpen={onOpen}
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
