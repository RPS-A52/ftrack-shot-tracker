import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { PieChart } from '@mui/x-charts/PieChart';
import { formatCount, formatPercent } from '../data/aggregate';
import type { Slice } from './chartUtils';

/** A status donut with free space in the middle for `children` (usually the % done). */
export default function Donut({ data, size, total, interactive, children }: {
  data: Slice[];
  size: number;
  total: number;
  /** Hover highlight and tooltips; off for the small ones, which are many. */
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
          valueFormatter: (item) => `${formatCount(item.value)} · ${formatPercent(total > 0 ? item.value / total : 0)}`,
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
