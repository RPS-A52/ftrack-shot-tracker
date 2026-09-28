// HTML legend shared by both views. MUI X's own legend is SVG and does not wrap, which
// breaks with a long list of workflow statuses in a narrow widget; this one wraps, and
// clicking an entry hides that series.

import { Box, ButtonBase, Tooltip, useMediaQuery } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { Aggregate } from '../data/aggregate';
import { formatCount, formatPercent } from '../data/aggregate';

interface Props {
  agg: Aggregate;
  hidden: Set<string>;
  onToggle: (key: string) => void;
}

export default function Legend({ agg, hidden, onToggle }: Props) {
  // Short dashboard tiles get one row that scrolls sideways instead of a wrapped block.
  const compact = useMediaQuery('(max-height: 440px)');
  if (agg.series.length === 0) return null;
  return (
    <Box
      component="ul"
      aria-label="Statuses"
      sx={{
        display: 'flex',
        gap: 0.5,
        m: 0,
        p: 0,
        listStyle: 'none',
        overscrollBehavior: 'contain',
        ...(compact
          ? { flexWrap: 'nowrap', overflowX: 'auto', pb: 0.5, scrollbarWidth: 'thin' }
          : { flexWrap: 'wrap', maxHeight: 60, overflowY: 'auto' }),
      }}
    >
      {agg.series.map((s) => {
        const value = agg.totals[s.key] ?? 0;
        const off = hidden.has(s.key);
        return (
          <Box component="li" key={s.key} sx={{ flexShrink: 0 }}>
            <Tooltip title={`${off ? 'Show' : 'Hide'} ${s.label}`}>
              <ButtonBase
                onClick={() => onToggle(s.key)}
                aria-pressed={!off}
                sx={(theme) => ({
                  gap: 0.75,
                  px: 1,
                  py: 0.25,
                  borderRadius: 999,
                  fontSize: 12,
                  color: 'text.secondary',
                  opacity: off ? 0.45 : 1,
                  border: `1px solid ${theme.palette.divider}`,
                  transition: theme.transitions.create(['opacity', 'background-color']),
                  '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.06) },
                  '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}` },
                })}
              >
                <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: s.color, flexShrink: 0, ...(off && { bgcolor: 'transparent', border: `2px solid ${s.color}` }) }} />
                <Box component="span" sx={{ color: 'text.primary', textDecoration: off ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>{s.label}</Box>
                <Box component="span" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCount(value)}
                  {agg.total > 0 && ` · ${formatPercent(value / agg.total)}`}
                </Box>
              </ButtonBase>
            </Tooltip>
          </Box>
        );
      })}
    </Box>
  );
}
