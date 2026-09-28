// Horizontal stacked bars, one row per group. Rows keep a readable height, so a
// project with hundreds of shots scrolls instead of squashing the bars.

import { useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { barLabelClasses } from '@mui/x-charts/BarChart';
import { axisClasses } from '@mui/x-charts/ChartsAxis';
import type { Aggregate, GroupRow } from '../data/aggregate';
import { formatPercent, formatValue } from '../data/aggregate';
import type { Measure } from '../data/types';
import { useElementSize } from './useElementSize';

interface Props {
  agg: Aggregate;
  measure: Measure;
  normalize: boolean;
  hidden: Set<string>;
  onRowClick?: (row: GroupRow) => void;
}

const MIN_ROW = 30;
const MAX_ROW = 56;
const AXIS_SPACE = 28;
const LABEL_FONT = '12px "Open Sans", "Segoe UI", sans-serif';

let measureCanvas: HTMLCanvasElement | null = null;
function textWidth(text: string) {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = LABEL_FONT;
  return ctx.measureText(text).width;
}

function truncate(text: string, maxWidth: number) {
  if (textWidth(text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(text.slice(0, mid) + '…') <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, Math.max(1, lo)) + '…';
}

export default function BarView({ agg, measure, normalize, hidden, onRowClick }: Props) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { width, height: viewHeight } = useElementSize(scrollRef);
  const rows = agg.rows;
  const series = agg.series.filter((s) => !hidden.has(s.key));

  // Label column: as wide as the longest name, but never more than a third of the widget.
  const labelWidth = useMemo(() => {
    const longest = rows.reduce((max, r) => Math.max(max, textWidth(r.label)), 0);
    return Math.round(Math.min(Math.max(longest + 16, 60), Math.max(width * 0.33, 80), 240));
  }, [rows, width]);

  const plotHeight = (rowH: number) => rows.length * rowH + AXIS_SPACE + 12;
  const fitHeight = Math.min(Math.max(viewHeight - 2, plotHeight(MIN_ROW)), plotHeight(MAX_ROW));
  const chartHeight = Math.max(fitHeight, plotHeight(MIN_ROW));
  const overflowing = chartHeight > viewHeight + 1;

  const labels = rows.map((r) => r.label);
  const value = (row: GroupRow, key: string) => {
    const v = row.values[key] ?? 0;
    return normalize ? (row.total > 0 ? (v / row.total) * 100 : 0) : v;
  };
  const fmt = (v: number) => (normalize ? `${Math.round(v)}%` : formatValue(v, measure));

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        // Reaching the end of the list must not start scrolling the ftrack dashboard.
        overscrollBehavior: 'contain',
        scrollbarGutter: 'stable',
      }}
    >
      {width > 0 && rows.length > 0 && (
        <BarChart
          width={width}
          height={chartHeight}
          layout="horizontal"
          // Static bars: a dashboard that re-animates on every refresh is distracting.
          skipAnimation
          margin={{ left: labelWidth, right: 16, top: overflowing ? AXIS_SPACE : 8, bottom: overflowing ? 4 : AXIS_SPACE }}
          yAxis={[{
            scaleType: 'band',
            data: labels,
            // Typed on the band config only, which the union in BarChart's props hides.
            ...{ categoryGapRatio: 0.35 },
            disableTicks: true,
            valueFormatter: (v: string, ctx) => {
              if (ctx.location !== 'tooltip') return truncate(v, labelWidth - 12);
              const row = rows[labels.indexOf(v)];
              if (!row) return v;
              return `${v} — ${formatPercent(row.progress)} done · ${formatValue(row.total, measure)}`;
            },
            tickLabelStyle: { fontSize: 12 },
          }]}
          xAxis={[{
            min: 0,
            ...(normalize && { max: 100 }),
            valueFormatter: (v: number) => (normalize ? `${v}%` : measure === 'bid' ? `${v}h` : String(v)),
            tickLabelStyle: { fontSize: 11 },
            tickNumber: Math.max(2, Math.floor(width / 110)),
          }]}
          // With a scrolling list the scale goes on top, where it is visible when the widget opens.
          topAxis={overflowing ? { disableLine: true, disableTicks: true } : null}
          bottomAxis={overflowing ? null : { disableLine: true, disableTicks: true }}
          grid={{ vertical: true }}
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
            const text = fmt(item.value);            return ctx.bar.width >= textWidth(text) + 10 && ctx.bar.height >= 14 ? text : null;
          }}
          borderRadius={3}
          tooltip={{ trigger: 'axis' }}
          slotProps={{ legend: { hidden: true } }}
          onAxisClick={(_e, data) => {
            const row = data ? rows[data.dataIndex] : undefined;
            if (row) onRowClick?.(row);
          }}
          sx={{
            cursor: onRowClick ? 'pointer' : 'default',
            [`& .${barLabelClasses.root}`]: {
              fill: '#fff',
              fontSize: 11,
              fontWeight: 600,
              pointerEvents: 'none',
              textShadow: '0 1px 2px rgba(0,0,0,.35)',
            },
            [`& .${axisClasses.left} .${axisClasses.tickLabel}`]: {
              fill: theme.palette.text.primary,
            },
            [`& .${axisClasses.root} .${axisClasses.tickLabel}`]: {
              fill: theme.palette.text.secondary,
            },
            '& .MuiChartsGrid-line': {
              stroke: theme.palette.divider,
              strokeDasharray: '2 3',
            },
          }}
        />
      )}
    </Box>
  );
}
