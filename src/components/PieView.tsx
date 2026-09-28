// Full-size donuts for one shot: a large one for all its assets (or the focused asset type)
// next to a small one per asset type. Narrow widgets stack them and scroll as one page.

import { useEffect, useRef } from 'react';
import { Box, Button, ButtonBase, Paper, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { Aggregate } from '../data/aggregate';
import { formatCount, formatPercent } from '../data/aggregate';
import Donut from './Donut';
import { slices } from './chartUtils';

interface Props {
  agg: Aggregate;
  hidden: Set<string>;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}

export default function PieView({ agg, hidden, focusId, onFocus }: Props) {
  const theme = useTheme();
  const narrow = useMediaQuery('(max-width: 620px)');
  const short = useMediaQuery('(max-height: 360px)');
  const focused = focusId ? agg.rows.find((r) => r.ref.id === focusId) ?? null : null;

  // The focused asset type can disappear after a refresh or a new selection.
  useEffect(() => {
    if (focusId && !focused) onFocus(null);
  }, [focusId, focused, onFocus]);

  // Coming from a bar further down: bring its card into view.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusId) return;
    gridRef.current?.querySelector(`[data-group-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusId]);

  const main = focused ?? { values: agg.totals, total: agg.total, progress: agg.progress, done: agg.done };
  const mainSize = short ? 150 : narrow ? 200 : 240;
  const doneText = `${formatCount(main.done)} of ${formatCount(main.total)} done`;

  const summary = (
    <Stack spacing={1.5} alignItems="center" sx={{ p: 2, minWidth: 0 }}>
      <Box sx={{ textAlign: 'center', minWidth: 0, maxWidth: '100%' }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {focused ? 'Asset type' : 'All'}
        </Typography>
        <Typography variant="subtitle1" noWrap title={focused?.label} sx={{ fontWeight: 600 }}>
          {focused ? focused.label : 'All asset types'}
        </Typography>
      </Box>
      <Donut data={slices(main.values, agg.series, hidden)} size={mainSize} total={main.total} interactive>
        <Typography sx={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>{formatPercent(main.progress)}</Typography>
        <Typography variant="caption" color="text.secondary">done</Typography>
        {mainSize >= 180 && <Typography variant="caption" color="text.secondary">{formatCount(main.done)} of {formatCount(main.total)}</Typography>}
      </Donut>
      {mainSize < 180 && <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>{doneText}</Typography>}
      {focused && <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => onFocus(null)}>All asset types</Button>}
    </Stack>
  );

  const cards = (
    <Box ref={gridRef} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))', gap: 1, p: 1, alignContent: 'start' }}>
      {agg.rows.map((row) => {
        const selected = row.ref.id === focusId;
        return (
          <Tooltip key={row.ref.id} title={`${row.label}: ${formatCount(row.done)} of ${formatCount(row.total)} done`} placement="top">
            <Paper
              component={ButtonBase}
              variant="outlined"
              data-group-id={row.ref.id}
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
              <Donut data={slices(row.values, agg.series, hidden)} size={64} total={row.total} interactive={false}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{formatPercent(row.progress)}</Typography>
              </Donut>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{row.label}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCount(row.total)} asset{row.total === 1 ? '' : 's'}
                </Typography>
              </Box>
            </Paper>
          </Tooltip>
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
