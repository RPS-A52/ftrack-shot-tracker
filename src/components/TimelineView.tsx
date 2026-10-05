// Shot timeline: one lane per shot, each task drawn from its start date to its due date in its
// status colour. Built on vis-timeline, as in ftrack-timeline-viewer: the library owns its
// DOM, so this component creates it once and keeps its groups and items in sync with props.
// Dates are drawn in studio time (see data/dates.ts), on an axis the library reads as UTC.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import moment from 'moment';
import { Timeline, type TimelineOptions } from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import { Box, Button, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { ShotSummary } from '../data/aggregate';
import { formatPercent, formatTasks } from '../data/aggregate';
import type { WorkItem } from '../data/types';
import {
  formatLongDayTime, studioZoneLabel, toStudioDayFloor, toStudioWallClock, workingDaysExclusive,
} from '../data/dates';
import ShotSearchBar from './ShotSearchBar';
import { NoMatches } from './ShotList';
import { useShotSearch } from './shotSearch';

interface Props {
  shots: ShotSummary[];
  /** The counted tasks (status exclusions already applied). */
  tasks: WorkItem[];
  colorFor: (task: WorkItem) => string;
  /** Statuses hidden from the legend are hidden here too. */
  isHidden: (task: WorkItem) => boolean;
  query: string;
  onQueryChange: (query: string) => void;
  /** Opens ftrack's sidebar for a task; absent outside ftrack. */
  onOpenTask?: (task: WorkItem) => void;
}

const DAY = 24 * 60 * 60 * 1000;
const TODAY_MARKER = 'today';

/** Zoom levels: how many days each shows at once (the first three as in ftrack-timeline-viewer). */
type ZoomLevel = 'days' | 'weeks' | 'months' | 'year';
const ZOOM_SPAN_DAYS: Record<ZoomLevel, number> = { days: 14, weeks: 28, months: 120, year: 365 };
const ZOOM_LABELS: Record<ZoomLevel, string> = { days: 'Days', weeks: 'Weeks', months: 'Months', year: 'Year' };

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Black or white, whichever reads better on `hex`. */
function textOn(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return '#fff';
  const [r, g, b] = [m[1], m[2], m[3]].map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#111' : '#fff';
}

/** The hover card, modelled on ftrack's task popover: path, name, status, type and dates. */
function tooltip(task: WorkItem, shot: ShotSummary, color: string) {
  const where = shot.ref.detail ? `${shot.ref.detail} / ${shot.ref.name}` : shot.ref.name;
  const from = toStudioDayFloor(task.startsAt);
  const to = toStudioDayFloor(task.endsAt);
  const working = from && to ? workingDaysExclusive(from, to) : 0;
  return (
    `<div class="tl-tip">` +
    `<div class="tl-tip__path">${escapeHtml(where)}</div>` +
    `<div class="tl-tip__name">${escapeHtml(task.name)}</div>` +
    `<div class="tl-tip__row"><span class="tl-tip__dot" style="background:${escapeHtml(color)}"></span>` +
    `${escapeHtml(task.status.name)} · ${escapeHtml(task.taskType.name)}</div>` +
    `<div class="tl-tip__facts">` +
    `<span class="tl-tip__label">Start</span><span>${escapeHtml(formatLongDayTime(task.startsAt!))}</span>` +
    `<span class="tl-tip__label">Due</span><span>${escapeHtml(formatLongDayTime(task.endsAt!))}</span>` +
    `<span class="tl-tip__label">Span</span><span><b>${working}</b> working day${working === 1 ? '' : 's'}</span>` +
    `</div></div>`
  );
}

/** The studio's "now", on the same shifted axis as the bars. */
function studioNow() {
  return toStudioWallClock(new Date()) ?? new Date();
}

export default function TimelineView({ shots, tasks, colorFor, isHidden, query, onQueryChange, onOpenTask }: Props) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const fittedFor = useRef('');
  // The zoom level last picked; cleared when the view is zoomed some other way.
  const [zoom, setZoom] = useState<ZoomLevel | null>(null);
  const { filtered, searching, deferredQuery } = useShotSearch(shots, query);

  // Lanes are the shots shown, in the list's order; bars are their scheduled tasks.
  const { groups, items, unscheduled, byId } = useMemo(() => {
    const shown = new Map(filtered.map((shot, order) => [shot.ref.id, { shot, order }]));
    const groups = filtered.map((shot, order) => ({
      id: shot.ref.id,
      order,
      content:
        `<div class="tl-group"><span class="tl-group__name">${escapeHtml(shot.ref.name)}</span>` +
        (shot.ref.detail ? `<span class="tl-group__detail">${escapeHtml(shot.ref.detail)}</span>` : '') +
        `<span class="tl-group__pct">${formatPercent(shot.agg.progress)}</span></div>`,
    }));
    const items = [];
    const byId = new Map<string, WorkItem>();
    let unscheduled = 0;
    for (const task of tasks) {
      const lane = task.parent && shown.get(task.parent.id);
      if (!lane || isHidden(task)) continue;
      // Drawn from the instants ftrack stores, re-expressed in studio time, not snapped to
      // days: that is how ftrack's own timeline places them.
      const start = toStudioWallClock(task.startsAt);
      const end = toStudioWallClock(task.endsAt);
      if (!start || !end || end < start) {
        unscheduled += 1;
        continue;
      }
      const color = colorFor(task);
      byId.set(task.id, task);
      items.push({
        id: task.id,
        group: lane.shot.ref.id,
        start,
        // A task due the moment it starts still gets a visible sliver.
        end: new Date(Math.max(end.getTime(), start.getTime() + DAY / 2)),
        content: `<span class="tl-bar__label">${escapeHtml(task.taskType.name)}</span>`,
        title: tooltip(task, lane.shot, color),
        style: `background-color:${color};border-color:${color};color:${textOn(color)};`,
        className: 'tl-bar',
      });
    }
    return { groups, items, unscheduled, byId };
  }, [filtered, tasks, colorFor, isHidden]);

  // Create once; re-creating on every change would lose the scroll and zoom position.
  useEffect(() => {
    if (!containerRef.current) return;
    const options: TimelineOptions = {
      orientation: { axis: 'top', item: 'top' },
      stack: true,
      groupOrder: 'order',
      groupHeightMode: 'fitItems',
      margin: { item: { horizontal: 1, vertical: 4 }, axis: 4 },
      height: '100%',
      // Plain wheel scrolls the shots; shift-wheel (or a sideways swipe) moves through time;
      // ctrl-wheel zooms, as in ftrack-timeline-viewer.
      verticalScroll: true,
      horizontalScroll: true,
      horizontalScrollKey: 'shiftKey',
      zoomKey: 'ctrlKey',
      zoomMin: 7 * DAY,
      zoomMax: 3 * 365 * DAY,
      // The library's own "now" line uses the real clock, which sits hours off on a studio-time
      // axis; a custom marker is placed instead (below).
      showCurrentTime: false,
      selectable: false,
      editable: false,
      // Bars are already in studio time carried on UTC fields, so the axis must read UTC.
      moment: (date: moment.MomentInput) => moment(date).utc(),
      format: {
        minorLabels: { day: 'D', weekday: 'D', week: '[W]W', month: 'MMM' },
        // One label per week (or month, or year), as ftrack and the timeline viewer show it.
        // A function, because a pattern with the day number in it would repeat every column.
        majorLabels: (date: moment.MomentInput, scale: string) => {
          const at = moment(date).utc();
          if (scale === 'day' || scale === 'weekday') return at.startOf('isoWeek').format('[W]W MMM D, YYYY');
          if (scale === 'week') return at.format('MMMM YYYY');
          return at.format('YYYY');
        },
      },
      tooltip: { followMouse: false, overflowMethod: 'flip', delay: 100 },
      // vis-timeline sanitises item HTML; allow the classes and styles our bars rely on.
      xss: {
        disabled: false,
        filterOptions: { whiteList: { div: ['class', 'style'], span: ['class', 'style'], b: [] } },
      },
    };
    const timeline = new Timeline(containerRef.current, [], [], options);
    timelineRef.current = timeline;

    // vis-timeline measures its container once; inside an ftrack iframe that can be before
    // layout, so redraw whenever the container changes size.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => timelineRef.current?.redraw());
    });
    observer.observe(containerRef.current);

    // The today line, in studio time, kept current on a widget left open all day.
    let placed = false;
    const placeToday = () => {
      try {
        if (placed) timeline.setCustomTime(studioNow(), TODAY_MARKER);
        else {
          timeline.addCustomTime(studioNow(), TODAY_MARKER);
          placed = true;
        }
      } catch { /* the marker is decoration; it must never break the timeline */ }
    };
    placeToday();
    const ticker = window.setInterval(placeToday, 60_000);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearInterval(ticker);
      timeline.destroy();
      timelineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const handler = (props: { item?: string | number | null }) => {
      const task = props.item != null ? byId.get(String(props.item)) : undefined;
      if (task) onOpenTask?.(task);
    };
    timeline.on('click', handler);
    return () => timeline.off('click', handler);
  }, [byId, onOpenTask]);

  // Zooming by mouse or trackpad leaves the picked level behind, unless it lands on it.
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const handler = (props: { start: Date; end: Date; byUser: boolean }) => {
      if (!props.byUser) return;
      const days = (props.end.getTime() - props.start.getTime()) / DAY;
      setZoom((current) => (current && Math.abs(days - ZOOM_SPAN_DAYS[current]) < 0.5 ? current : null));
    };
    timeline.on('rangechanged', handler);
    return () => timeline.off('rangechanged', handler);
  }, []);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    timeline.setGroups(groups);
    timeline.setItems(items);
    // Frame the work the first time each set of shots is shown; after that, leave the view
    // where the user put it.
    const key = groups.map((g) => g.id).join(',');
    if (items.length && fittedFor.current !== key) {
      fittedFor.current = key;
      timeline.fit({ animation: false });
      setZoom(null);
    }
  }, [groups, items]);

  const animation = { duration: 250, easingFunction: 'easeInOutQuad' as const };
  const windowNow = () => {
    const range = timelineRef.current?.getWindow();
    return range ? { start: range.start.getTime(), end: range.end.getTime() } : null;
  };

  /**
   * Show a zoom level's span. With today on screen the view starts three days before today,
   * as ftrack-timeline-viewer's levels do; otherwise it stays centred on what is being looked at.
   */
  const zoomTo = useCallback((level: ZoomLevel) => {
    const range = windowNow();
    if (!range) return;
    const span = ZOOM_SPAN_DAYS[level] * DAY;
    const now = studioNow().getTime();
    const start = now >= range.start && now <= range.end
      ? now - 3 * DAY
      : (range.start + range.end) / 2 - span / 2;
    timelineRef.current?.setWindow(new Date(start), new Date(start + span), { animation });
    setZoom(level);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = (factor: number) => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (factor < 1) timeline.zoomIn(1 - factor, { animation });
    else timeline.zoomOut(1 - 1 / factor, { animation });
    setZoom(null);
  };

  /** Step a whole view's width back or forward, like the viewer's ‹ › buttons. */
  const step = (direction: -1 | 1) => {
    const range = windowNow();
    if (!range) return;
    const span = range.end - range.start;
    timelineRef.current?.setWindow(new Date(range.start + direction * span), new Date(range.end + direction * span), { animation });
  };

  const today = () => timelineRef.current?.moveTo(studioNow(), { animation });
  const fit = () => {
    timelineRef.current?.fit({ animation });
    setZoom(null);
  };

  const grid = alpha(theme.palette.text.primary, 0.08);
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <ShotSearchBar query={query} onChange={onQueryChange} shown={filtered.length} total={shots.length} searching={searching} />

      {filtered.length > 0 && (
        <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap" sx={{ px: 1.5, pb: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={zoom} aria-label="Zoom level"
            onChange={(_e, level: ZoomLevel | null) => level && zoomTo(level)}>
            {(Object.keys(ZOOM_LABELS) as ZoomLevel[]).map((level) => (
              <Tooltip key={level} title={`Show ${ZOOM_SPAN_DAYS[level]} days`}>
                <ToggleButton value={level} sx={{ px: 1.25, py: 0.25 }}>{ZOOM_LABELS[level]}</ToggleButton>
              </Tooltip>
            ))}
          </ToggleButtonGroup>
          <Stack direction="row">
            <Tooltip title="Zoom out (or Ctrl-scroll)">
              <IconButton size="small" onClick={() => zoomBy(2)} aria-label="Zoom out"><ZoomOutIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Zoom in (or Ctrl-scroll)">
              <IconButton size="small" onClick={() => zoomBy(0.5)} aria-label="Zoom in"><ZoomInIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
          <Stack direction="row" alignItems="center">
            <Tooltip title="Earlier">
              <IconButton size="small" onClick={() => step(-1)} aria-label="Earlier"><ChevronLeftIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Button size="small" onClick={today} sx={{ minWidth: 0 }}>Today</Button>
            <Tooltip title="Later">
              <IconButton size="small" onClick={() => step(1)} aria-label="Later"><ChevronRightIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
          <Tooltip title="Fit all scheduled tasks">
            <Button size="small" startIcon={<FitScreenIcon fontSize="small" />} onClick={fit}>Fit</Button>
          </Tooltip>
        </Stack>
      )}

      {filtered.length === 0 && <NoMatches query={deferredQuery} onClear={() => onQueryChange('')} />}
      {filtered.length > 0 && items.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1 }}>
          None of these tasks has a start and due date yet.
        </Typography>
      )}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          mx: 1.5,
          mb: 0.5,
          display: filtered.length ? 'block' : 'none',
          overscrollBehavior: 'contain',
          // The library's stylesheet is light-only; restyle it from the MUI theme.
          '& .vis-timeline': { border: 1, borderColor: 'divider', borderRadius: 1, fontFamily: theme.typography.fontFamily, fontSize: 12 },
          '& .vis-panel': { borderColor: 'divider' },
          '& .vis-time-axis .vis-text': { color: 'text.secondary', fontSize: 11 },
          '& .vis-time-axis .vis-text.vis-saturday, & .vis-time-axis .vis-text.vis-sunday': { color: 'text.disabled' },
          '& .vis-time-axis .vis-grid.vis-minor': { borderColor: grid },
          '& .vis-time-axis .vis-grid.vis-saturday, & .vis-time-axis .vis-grid.vis-sunday': { bgcolor: alpha(theme.palette.text.primary, 0.03) },
          '& .vis-time-axis .vis-grid.vis-major': { borderColor: alpha(theme.palette.text.primary, 0.18) },
          '& .vis-labelset .vis-label, & .vis-foreground .vis-group': { borderBottom: `1px solid ${grid}` },
          '& .vis-labelset .vis-label': { color: 'text.primary' },
          // The today marker is a custom time bar, which the library would let you drag.
          '& .vis-custom-time': { backgroundColor: theme.palette.primary.main, width: '2px !important', pointerEvents: 'none' },
          '& .tl-group': { display: 'flex', alignItems: 'baseline', gap: 0.75, px: 1, minWidth: 130 },
          '& .tl-group__name': { fontWeight: 600 },
          '& .tl-group__detail': { color: 'text.secondary', fontSize: 11 },
          '& .tl-group__pct': { ml: 'auto', pl: 1, color: 'text.secondary', fontSize: 11, fontVariantNumeric: 'tabular-nums' },
          '& .vis-item.tl-bar': { borderRadius: '4px', fontSize: 11, fontWeight: 600, cursor: onOpenTask ? 'pointer' : 'default' },
          '& .vis-item.tl-bar .vis-item-content': { padding: '2px 6px' },
          '& .vis-item.tl-bar:hover': { filter: 'brightness(1.12)' },
          '& .vis-item.tl-bar .vis-item-overflow': { overflow: 'hidden' },
          '& .vis-item.tl-bar .tl-bar__label': { whiteSpace: 'nowrap' },
          '& .vis-tooltip': {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            boxShadow: theme.shadows[4],
            fontFamily: theme.typography.fontFamily,
            fontSize: 12,
            p: 1,
            whiteSpace: 'normal',
            maxWidth: 300,
          },
          '& .tl-tip__path': { color: 'text.secondary', fontSize: 11 },
          '& .tl-tip__name': { fontWeight: 600, mb: 0.5 },
          '& .tl-tip__row': { display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' },
          '& .tl-tip__dot': { width: 8, height: 8, borderRadius: '2px', flexShrink: 0 },
          '& .tl-tip__facts': { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.25, mt: 0.75 },
          '& .tl-tip__label': { color: 'text.secondary' },
        }}
      />
      {filtered.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 0.75 }}>
          {unscheduled > 0 && `${formatTasks(unscheduled)} without start and due dates ${unscheduled === 1 ? 'is' : 'are'} not shown. `}
          Dates in studio time ({studioZoneLabel()}). Scroll for more shots, Shift-scroll to move through time, Ctrl-scroll to zoom.
        </Typography>
      )}
    </Box>
  );
}
