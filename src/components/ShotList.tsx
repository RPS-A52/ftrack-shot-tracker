// One card per shot under the selected folder/sequence/project, each with that shot's asset
// types as bars or donuts. Virtualised with react-virtuoso: only the cards on screen exist,
// so projects with hundreds of shots scroll smoothly.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  Box, Button, Chip, IconButton, InputAdornment, LinearProgress, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { Aggregate, ShotSummary } from '../data/aggregate';
import { formatCount, formatPercent } from '../data/aggregate';
import type { ChartKind, GroupRef } from '../data/types';
import StackedBars from './StackedBars';
import { labelWidthFor } from './chartUtils';
import Donut from './Donut';
import { slices } from './chartUtils';
import { useElementSize } from './useElementSize';

interface Props {
  shots: ShotSummary[];
  overall: Aggregate;
  chart: ChartKind;
  normalize: boolean;
  hidden: Set<string>;
  onOpen?: (ref: GroupRef) => void;
}

const ROW_H = 26;

type Item = { kind: 'all'; agg: Aggregate } | { kind: 'shot'; shot: ShotSummary };

/** Every word typed must appear in the shot or sequence name. */
function matches(shot: ShotSummary, terms: string[]) {
  const text = `${shot.ref.name} ${shot.ref.detail ?? ''}`.toLowerCase();
  return terms.every((t) => text.includes(t));
}

export default function ShotList({ shots, overall, chart, normalize, hidden, onOpen }: Props) {
  const [query, setQuery] = useState('');
  // Typing stays responsive with thousands of shots; filtering catches up a frame later.
  const deferredQuery = useDeferredValue(query);
  const terms = deferredQuery.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  const listRef = useRef<VirtuosoHandle>(null);

  const filtered = useMemo(() => (terms.length ? shots.filter((s) => matches(s, terms)) : shots),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shots, terms.join(' ')]);
  const items: Item[] = useMemo(() => [
    // The summary card only makes sense for the whole list.
    ...(terms.length ? [] : [{ kind: 'all', agg: overall } as Item]),
    ...filtered.map((shot) => ({ kind: 'shot', shot }) as Item),
  ], [filtered, overall, terms.length]);

  useEffect(() => { listRef.current?.scrollToIndex({ index: 0 }); }, [deferredQuery]);

  // Shared across cards so the columns line up and bar lengths compare between shots.
  const allTypeNames = useMemo(() => overall.rows.map((r) => r.label), [overall]);
  const xMax = useMemo(() => shots.reduce((max, s) => Math.max(max, ...s.agg.rows.map((r) => r.total)), 1), [shots]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 1, flexShrink: 0 }}>
        <TextField
          size="small"
          placeholder="Search shots or sequences"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); } }}
          inputProps={{ 'aria-label': 'Search shots', spellCheck: false }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton size="small" edge="end" aria-label="Clear search" onClick={() => setQuery('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
          sx={{ flex: 1, minWidth: 0, maxWidth: 360, '& .MuiInputBase-input': { py: 0.75 } }}
        />
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {terms.length ? `${formatCount(filtered.length)} of ${formatCount(shots.length)} shots` : `${formatCount(shots.length)} shots`}
        </Typography>
      </Stack>

      {items.length === 0 ? (
        <Stack spacing={1} alignItems="center" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="subtitle2">No shots match “{deferredQuery.trim()}”</Typography>
          <Typography variant="body2" color="text.secondary">Search looks at shot and sequence names.</Typography>
          <Button size="small" onClick={() => setQuery('')}>Clear search</Button>
        </Stack>
      ) : (
        <Virtuoso
          ref={listRef}
          data={items}
          // Reaching the end of the list must not start scrolling the ftrack dashboard.
          style={{ flex: 1, minHeight: 0, overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}
          increaseViewportBy={400}
          computeItemKey={(_i, item) => (item.kind === 'all' ? '__all__' : item.shot.ref.id)}
          itemContent={(_i, item) => (
            <Box sx={{ px: 1.5, pb: 1 }}>
              {item.kind === 'all' ? (
                <ShotCard
                  title="All shots"
                  subtitle={`${formatCount(shots.length)} shots`}
                  agg={item.agg}
                  chart={chart}
                  normalize={normalize}
                  hidden={hidden}
                  typeNames={allTypeNames}
                  highlight
                />
              ) : (
                <ShotCard
                  title={item.shot.ref.name}
                  subtitle={item.shot.ref.detail}
                  kind={item.shot.ref.entityType && item.shot.ref.entityType !== 'Shot' ? item.shot.ref.entityType : undefined}
                  agg={item.shot.agg}
                  chart={chart}
                  normalize={normalize}
                  hidden={hidden}
                  typeNames={allTypeNames}
                  xMax={xMax}
                  onOpen={onOpen && (() => onOpen(item.shot.ref))}
                />
              )}
            </Box>
          )}
        />
      )}
    </Box>
  );
}

function ShotCard({ title, subtitle, kind, agg, chart, normalize, hidden, typeNames, xMax, highlight, onOpen }: {
  title: string;
  subtitle?: string;
  /** Entity type, shown when the parent is not a shot (an asset build, a sequence...). */
  kind?: string;
  agg: Aggregate;
  chart: ChartKind;
  normalize: boolean;
  hidden: Set<string>;
  typeNames: string[];
  xMax?: number;
  highlight?: boolean;
  onOpen?: () => void;
}) {
  const theme = useTheme();
  const bodyRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(bodyRef);
  const series = agg.series.filter((s) => !hidden.has(s.key));
  const barsHeight = agg.rows.length * ROW_H + 8;

  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        ...(highlight && { borderColor: alpha(theme.palette.primary.main, 0.5), bgcolor: alpha(theme.palette.primary.main, 0.04) }),
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pt: 1, pb: 0.5, minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography variant="subtitle2" noWrap title={title} sx={{ fontWeight: 600, minWidth: 0 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 1, minWidth: 0 }}>{subtitle}</Typography>}
          {kind && <Chip label={kind} size="small" variant="outlined" sx={{ height: 18, fontSize: 10, alignSelf: 'center' }} />}
        </Box>
        <Tooltip title={`${formatCount(agg.done)} of ${formatCount(agg.total)} assets done`}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            <LinearProgress
              variant="determinate"
              value={agg.progress * 100}
              sx={{ width: { xs: 40, sm: 72 }, height: 5, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: '#56b98e' } }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatPercent(agg.progress)}
            </Typography>
          </Stack>
        </Tooltip>
        {onOpen && (
          <Tooltip title="Open in ftrack">
            <IconButton size="small" onClick={onOpen} aria-label={`Open ${title} in ftrack`} sx={{ mr: -0.5 }}>
              <OpenInNewIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Box ref={bodyRef} sx={{ px: chart === 'bar' ? 0.5 : 1.5, pb: 1 }}>
        {chart === 'bar' ? (
          <Box sx={{ height: barsHeight }}>
            {width > 0 && (
              <StackedBars
                rows={agg.rows}
                series={series}
                normalize={normalize}
                width={width}
                height={barsHeight}
                labelWidth={labelWidthFor(typeNames, width)}
                axis="none"
                xMax={xMax}
              />
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1, pt: 0.5 }}>
            {agg.rows.map((row) => (
              <Tooltip key={row.ref.id} title={`${row.label}: ${formatCount(row.done)} of ${formatCount(row.total)} done`}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Donut data={slices(row.values, agg.series, hidden)} size={44} total={row.total} interactive={false}>
                    <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{formatPercent(row.progress)}</Typography>
                  </Donut>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{row.label}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatCount(row.done)}/{formatCount(row.total)} done
                    </Typography>
                  </Box>
                </Stack>
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
