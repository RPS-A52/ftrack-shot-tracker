// A large donut for the whole scope (or the focused group) next to a grid of small
// donuts, one per group. Narrow widgets stack them and scroll as one page.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, Paper, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { PieChart } from '@mui/x-charts/PieChart';
import type { Aggregate, GroupRow, Series } from '../data/aggregate';
import { formatPercent, formatValue } from '../data/aggregate';
import type { Measure } from '../data/types';

interface Props {
  agg: Aggregate;
  measure: Measure;
  hidden: Set<string>;
  groupLabel: string;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onOpen?: (row: GroupRow) => void;
}

function slices(values: Record<string, number>, series: Series[], hidden: Set<string>) {
  return series
    .filter((s) => !hidden.has(s.key) && (values[s.key] ?? 0) > 0)
    .map((s) => ({ id: s.key, value: values[s.key], label: s.label, color: s.color }));
}

function Donut({ data, size, measure, total, interactive, children }: {
  data: ReturnType<typeof slices>;
  size: number;
  measure: Measure;
  total: number;
  interactive: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const empty = data.length === 0;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <PieChart
        width={size}
        height={size}
        margin={{ top: 0, bottom: 0, left: 0, right: 0 }}
        skipAnimation
        series={[{
          data: empty ? [{ id: 'empty', value: 1, color: alpha(theme.palette.text.primary, 0.1) }] : data,
          innerRadius: '68%',
          outerRadius: '100%',
          paddingAngle: data.length > 1 ? 1.2 : 0,
          cornerRadius: 3,
          highlightScope: interactive && !empty ? { fade: 'global', highlight: 'item' } : undefined,
          valueFormatter: (item) => `${formatValue(item.value, measure)} · ${formatPercent(total > 0 ? item.value / total : 0)}`,
        }]}
        tooltip={{ trigger: interactive && !empty ? 'item' : 'none' }}
        slotProps={{ legend: { hidden: true } }}
      />
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center' }}>
        {children}
      </Box>
    </Box>
  );
}

/** Mounts children only once scrolled near the viewport: hundreds of shots stay cheap. */
function LazyMount({ id, height, children }: { id: string; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);
  return <Box ref={ref} data-group-id={id} sx={{ minHeight: height }}>{visible ? children : null}</Box>;
}

export default function PieView({ agg, measure, hidden, groupLabel, focusId, onFocus, onOpen }: Props) {
  const theme = useTheme();
  const narrow = useMediaQuery('(max-width: 620px)');
  const short = useMediaQuery('(max-height: 360px)');
  const focused = focusId ? agg.rows.find((r) => r.ref.id === focusId) ?? null : null;

  // The focused group can disappear after a refresh or a grouping change.
  useEffect(() => {
    if (focusId && !focused) onFocus(null);
  }, [focusId, focused, onFocus]);

  // Coming from a bar deep in the list: bring its card into view.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusId) return;
    const card = gridRef.current?.querySelector(`[data-group-id="${CSS.escape(focusId)}"]`);
    card?.scrollIntoView({ block: 'nearest' });
  }, [focusId]);

  const main = focused ??{ values: agg.totals, total: agg.total, progress: agg.progress, done: agg.done };
  const mainSize = short ? 150 : narrow ? 200 : 240;

  const summary = (
    <Stack spacing={1.5} alignItems="center" sx={{ p: 2, minWidth: 0 }}>
      <Box sx={{ textAlign: 'center', minWidth: 0, maxWidth: '100%' }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {focused ? groupLabel : 'All'}
        </Typography>
        <Typography variant="subtitle1" noWrap title={focused?.label} sx={{ fontWeight: 600 }}>
          {focused ? focused.label : 'Overall'}
        </Typography>
      </Box>
      <Donut data={slices(main.values, agg.series, hidden)} size={mainSize} measure={measure} total={main.total} interactive>
        <Typography sx={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>{formatPercent(main.progress)}</Typography>
        <Typography variant="caption" color="text.secondary">done</Typography>
        {mainSize >= 180 && (
          <Typography variant="caption" color="text.secondary">{formatValue(main.done, measure)} of {formatValue(main.total, measure)}</Typography>
        )}
      </Donut>
      {mainSize < 180 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>{formatValue(main.done, measure)} of {formatValue(main.total, measure)}</Typography>
      )}
      {focused && (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => onFocus(null)}>All</Button>
          {onOpen && (
            <Button size="small" endIcon={<OpenInNewIcon />} onClick={() => onOpen(focused)}>Open in ftrack</Button>
          )}
        </Stack>
      )}
    </Stack>
  );

  const cards = (
    <Box
      ref={gridRef}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))',
        gap: 1,
        p: 1,
        alignContent: 'start',
      }}
    >
      {agg.rows.map((row) => {
        const selected = row.ref.id === focusId;
        return (
          <LazyMount key={row.ref.id} id={row.ref.id} height={84}>
            <Tooltip title={`${row.label}: ${formatValue(row.done, measure)} of ${formatValue(row.total, measure)} done`} placement="top">
              <Paper
                component={ButtonBase}
                variant="outlined"
                onClick={() => onFocus(selected ? null : row.ref.id)}
                aria-pressed={selected}
                sx={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'flex-start',
                  gap: 1.25,
                  p: 1,
                  textAlign: 'left',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'background.paper',
                  transition: theme.transitions.create(['border-color', 'background-color']),
                  '&:hover': { borderColor: selected ? 'primary.main' : 'text.secondary' },
                  '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Donut data={slices(row.values, agg.series, hidden)} size={64} measure={measure} total={row.total} interactive={false}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{formatPercent(row.progress)}</Typography>
                </Donut>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{row.ref.name}</Typography>
                  {row.ref.detail && <Typography variant="caption" color="text.secondary" noWrap component="div">{row.ref.detail}</Typography>}
                  <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatValue(row.total, measure)}{measure === 'bid' && ` · ${row.count} task${row.count === 1 ? '' : 's'}`}
                  </Typography>
                </Box>
              </Paper>
            </Tooltip>
          </LazyMount>
        );
      })}
    </Box>
  );

  if (narrow) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}>
        {summary}
        {cards}
      </Box>
    );
  }
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <Box sx={{ width: mainSize + 48, flexShrink: 0, overflowY: 'auto', overscrollBehavior: 'contain', borderRight: 1, borderColor: 'divider', display: 'flex', alignItems: 'safe center', justifyContent: 'center' }}>
        {summary}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}>
        {cards}
      </Box>
    </Box>
  );
}
