// Full-size bars for one shot (or any scope without several shots). Rows keep a readable
// height, so a long list of asset types scrolls instead of squashing the bars.

import { useRef } from 'react';
import { Box } from '@mui/material';
import type { Aggregate, GroupRow } from '../data/aggregate';
import StackedBars from './StackedBars';
import { AXIS_SPACE, labelWidthFor } from './chartUtils';
import { useElementSize } from './useElementSize';

interface Props {
  agg: Aggregate;
  normalize: boolean;
  hidden: Set<string>;
  onRowClick?: (row: GroupRow) => void;
}

const MIN_ROW = 30;
const MAX_ROW = 56;

export default function BarView({ agg, normalize, hidden, onRowClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { width, height: viewHeight } = useElementSize(scrollRef);
  const rows = agg.rows;

  const plotHeight = (rowH: number) => rows.length * rowH + AXIS_SPACE + 12;
  const fitHeight = Math.min(Math.max(viewHeight - 2, plotHeight(MIN_ROW)), plotHeight(MAX_ROW));
  const chartHeight = Math.max(fitHeight, plotHeight(MIN_ROW));
  // With a scrolling list the scale goes on top, where it is visible when the widget opens.
  const overflowing = chartHeight > viewHeight + 1;

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
        <StackedBars
          rows={rows}
          series={agg.series.filter((s) => !hidden.has(s.key))}
          normalize={normalize}
          width={width}
          height={chartHeight}
          labelWidth={labelWidthFor(rows.map((r) => r.label), width)}
          axis={overflowing ? 'top' : 'bottom'}
          onRowClick={onRowClick}
        />
      )}
    </Box>
  );
}
