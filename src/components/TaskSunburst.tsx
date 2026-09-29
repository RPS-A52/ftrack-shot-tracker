// Two-ring donut for a shot: the inner ring is one slice per task type, labelled with its
// name; the outer ring splits each of those slices into its statuses, in status colours.
// Both rings are built from the same numbers in the same order, so their angles line up.

import { Box } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { PieChart, pieArcLabelClasses } from '@mui/x-charts/PieChart';
import type { Aggregate } from '../data/aggregate';
import { formatCount, formatPercent, formatTasks } from '../data/aggregate';
import { textWidth } from './chartUtils';



interface Props {
  agg: Aggregate;
  hidden: Set<string>;
  size: number;
}

/** Arc labels are 10px; textWidth measures at 12px. */
const LABEL_SCALE = 10 / 12;

/**
 * The label that fits in a ring slice, shortened with an ellipsis, or '' if not even a few
 * letters fit. Horizontal text in a slice at the top or bottom of the ring has the arc length
 * to work with; at the sides it runs across the ring and has its thickness.
 */
function fitLabel(text: string, startAngle: number, endAngle: number, midRadius: number, thickness: number) {
  const sweep = Math.abs(endAngle - startAngle);
  if (sweep < 0.25) return '';
  const mid = (startAngle + endAngle) / 2;
  // MUI angles run clockwise from 12 o'clock: sin is the horizontal offset of the slice.
  const across = Math.abs(Math.sin(mid));
  const room = Math.max(thickness * (0.35 + 0.65 * across), sweep * midRadius * (1 - across * 0.7)) - 6;
  const width = (t: string) => textWidth(t) * LABEL_SCALE;
  if (width(text) <= room) return text;
  for (let n = text.length - 1; n >= 3; n--) {
    const short = `${text.slice(0, n).trimEnd()}…`;
    if (width(short) <= room) return short;
  }
  return '';
}

export default function TaskSunburst({ agg, hidden, size }: Props) {
  const theme = useTheme();

  const radius = size / 2;
  // The named ring gets most of the room; statuses are a band around it.
  const inner = { innerRadius: radius * 0.2, outerRadius: radius * 0.76 };
  const outer = { innerRadius: radius * 0.79, outerRadius: radius };
  const series = agg.series.filter((s) => !hidden.has(s.key));

  // Only task types with something visible, so the two rings add up to the same total.
  const rows = agg.rows
    .map((row) => ({ row, parts: series.filter((s) => (row.values[s.key] ?? 0) > 0) }))
    .filter(({ parts }) => parts.length > 0);
  const total = rows.reduce((sum, { row, parts }) => sum + parts.reduce((n, s) => n + row.values[s.key], 0), 0);

  const typeSlices = rows.map(({ row, parts }, i) => ({
    id: row.ref.id,
    label: row.label,
    value: parts.reduce((n, s) => n + row.values[s.key], 0),
    // Alternating neutral tints keep neighbouring task types apart without competing with
    // the status colours around them.
    color: alpha(theme.palette.text.primary, i % 2 ? 0.16 : 0.26),
    progress: row.progress,
  }));
  const statusSlices = rows.flatMap(({ row, parts }) => parts.map((s) => ({
    id: `${row.ref.id}:${s.key}`,
    label: `${row.label}: ${s.label}`,
    value: row.values[s.key],
    color: s.color,
  })));

  if (total === 0) {
    return <Box sx={{ width: size, height: size, borderRadius: '50%', border: `${radius * 0.36}px solid ${alpha(theme.palette.text.primary, 0.1)}` }} />;
  }

  return (
    <PieChart
      width={size}
      height={size}
      margin={{ top: 0, bottom: 0, left: 0, right: 0 }}
      skipAnimation
      series={[
        {
          id: 'types',
          data: typeSlices,
          ...inner,
          cx: radius,
          cy: radius,
          highlightScope: { fade: 'global', highlight: 'item' },
          valueFormatter: (item) => {
            const slice = typeSlices.find((s) => s.id === item.id);
            return `${formatTasks(item.value)} · ${formatPercent(slice?.progress ?? 0)} done`;
          },
          arcLabel: (item) => fitLabel(item.label ?? '', item.startAngle, item.endAngle,
            (inner.innerRadius + inner.outerRadius) / 2, inner.outerRadius - inner.innerRadius),
        },
        {
          id: 'statuses',
          data: statusSlices,
          ...outer,
          cx: radius,
          cy: radius,
          highlightScope: { fade: 'global', highlight: 'item' },
          valueFormatter: (item) => `${formatCount(item.value)} · ${formatPercent(item.value / total)}`,
        },
      ]}
      tooltip={{ trigger: 'item' }}
      slotProps={{ legend: { hidden: true } }}
      sx={{
        [`& .${pieArcLabelClasses.root}`]: {
          fill: theme.palette.text.primary,
          fontSize: 10,
          fontWeight: 600,
          pointerEvents: 'none',
        },
        // Thin separators between slices, in the card colour.
        '& path': { stroke: theme.palette.background.paper, strokeWidth: 1 },
      }}
    />
  );
}
