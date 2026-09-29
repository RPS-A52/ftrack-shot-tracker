// Horizontal stacked bars, one row per task type, one segment per status. Used full size
// (BarView) and small inside each shot card (ShotList).

import { BarChart, barLabelClasses } from '@mui/x-charts/BarChart';
import { axisClasses } from '@mui/x-charts/ChartsAxis';
import { useTheme } from '@mui/material/styles';
import type { GroupRow, Series } from '../data/aggregate';
import { formatCount, formatPercent, formatTasks } from '../data/aggregate';
import { AXIS_SPACE, textWidth, truncate } from './chartUtils';



interface Props {
  rows: GroupRow[];
  /** Visible series only. */
  series: Series[];
  normalize: boolean;
  width: number;
  height: number;
  labelWidth: number;
  /** Where the value scale goes; 'none' for the compact cards. */
  axis: 'top' | 'bottom' | 'none';
  /** Shared scale end, so bars in different cards compare. */
  xMax?: number;
  onRowClick?: (row: GroupRow) => void;
}

export default function StackedBars({ rows, series, normalize, width, height, labelWidth, axis, xMax, onRowClick }: Props) {
  const theme = useTheme();

  const labels = rows.map((r) => r.label);
  const value = (row: GroupRow, key: string) => {
    const v = row.values[key] ?? 0;
    return normalize ? (row.total > 0 ? (v / row.total) * 100 : 0) : v;
  };
  const fmt = (v: number) => (normalize ? `${Math.round(v)}%` : formatCount(v));
  const scale = { disableLine: true, disableTicks: true };

  return (
    <BarChart
      width={width}
      height={height}
      layout="horizontal"
      // Static bars: a dashboard that re-animates on every refresh is distracting.
      skipAnimation
      margin={{ left: labelWidth, right: 12, top: axis === 'top' ? AXIS_SPACE : 4, bottom: axis === 'bottom' ? AXIS_SPACE : 4 }}
      yAxis={[{
        scaleType: 'band',
        data: labels,
        // Typed on the band config only, which the union in BarChart's props hides.
        ...{ categoryGapRatio: 0.3 },
        disableTicks: true,
        valueFormatter: (v: string, ctx) => {
          if (ctx.location !== 'tooltip') return truncate(v, labelWidth - 12);
          const row = rows[labels.indexOf(v)];
          return row ? `${v} — ${formatPercent(row.progress)} done · ${formatTasks(row.total)}` : v;
        },
        tickLabelStyle: { fontSize: 12 },
      }]}
      xAxis={[{
        min: 0,
        ...((normalize || xMax) && { max: normalize ? 100 : xMax }),
        valueFormatter: (v: number) => (normalize ? `${v}%` : String(v)),
        tickLabelStyle: { fontSize: 11 },
        tickNumber: Math.max(2, Math.floor(width / 110)),
        // Counts are whole numbers; no 0.5-task ticks.
        tickMinStep: normalize ? undefined : 1,
      }]}
      topAxis={axis === 'top' ? scale : null}
      bottomAxis={axis === 'bottom' ? scale : null}
      grid={{ vertical: axis !== 'none' }}
      series={series.map((s) => ({
        id: s.key,
        label: s.label,
        color: s.color,
        stack: 'total',
        data: rows.map((r) => value(r, s.key)),
        // Zero segments are left out of the tooltip rather than listed as "0".
        valueFormatter: (v: number | null) => (v ? fmt(v) : null),
      }))}
      barLabel={(item, ctx) => {
        if (!item.value) return null;
        const text = fmt(item.value);
        return ctx.bar.width >= textWidth(text) + 10 && ctx.bar.height >= 14 ? text : null;
      }}
      borderRadius={3}
      tooltip={{ trigger: 'axis' }}
      slotProps={{ legend: { hidden: true } }}
      onAxisClick={onRowClick && ((_e, data) => {
        const row = data ? rows[data.dataIndex] : undefined;
        if (row) onRowClick(row);
      })}
      sx={{
        cursor: onRowClick ? 'pointer' : 'default',
        [`& .${barLabelClasses.root}`]: {
          fill: '#fff',
          fontSize: 11,
          fontWeight: 600,
          pointerEvents: 'none',
          textShadow: '0 1px 2px rgba(0,0,0,.35)',
        },
        [`& .${axisClasses.root} .${axisClasses.tickLabel}`]: {
          fill: theme.palette.text.secondary,
        },
        [`& .${axisClasses.left} .${axisClasses.tickLabel}`]: {
          fill: theme.palette.text.primary,
        },
        '& .MuiChartsGrid-line': {
          stroke: theme.palette.divider,
          strokeDasharray: '2 3',
        },
      }}
    />
  );
}
