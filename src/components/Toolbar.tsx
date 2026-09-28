import { useState } from 'react';
import {
  Box, CircularProgress, Divider, FormControlLabel, IconButton, MenuItem, Popover, Select, Stack, Switch,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import RefreshIcon from '@mui/icons-material/Refresh';
import TuneIcon from '@mui/icons-material/Tune';
import type { Breakdown, ChartKind, SortBy } from '../data/types';

export interface ViewSettings {
  chart: ChartKind;
  breakdown: Breakdown;
  sortBy: SortBy;
  normalize: boolean;
}

interface Props {
  settings: ViewSettings;
  onChange: (patch: Partial<ViewSettings>) => void;
  /** Sorting only applies to the shot list. */
  hasShotList: boolean;
  loading: boolean;
  onRefresh: () => void;
}

const SORT_LABELS: Record<SortBy, string> = {
  default: 'Sequence order',
  name: 'Shot name',
  progress: 'Most complete first',
  total: 'Most assets first',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>{title}</Typography>
      {children}
    </Box>
  );
}

export default function Toolbar({ settings, onChange, hasShotList, loading, onRefresh }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
      <ToggleButtonGroup
        size="small"
        exclusive
        value={settings.chart}
        onChange={(_e, v: ChartKind | null) => v && onChange({ chart: v })}
        aria-label="Chart type"
      >
        {/* MUI v6 ToggleButtonGroup passes state by context, so a Tooltip wrapper is fine. */}
        <Tooltip title="Bar charts">
          <ToggleButton value="bar" aria-label="Bar charts">
            <BarChartIcon fontSize="small" sx={{ transform: 'rotate(90deg) scaleX(-1)' }} />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Pie charts">
          <ToggleButton value="pie" aria-label="Pie charts">
            <DonutLargeIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary" noWrap>by asset type</Typography>

      <Box sx={{ flex: 1 }} />

      <Tooltip title="Display options">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Display options" aria-haspopup="dialog">
          <TuneIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Refresh">
        <span>
          <IconButton size="small" onClick={onRefresh} disabled={loading} aria-label="Refresh">
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 2, width: 260, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', border: 1, borderColor: 'divider' } } }}
      >
        <Stack spacing={2}>
          <Section title="Colour by">
            <ToggleButtonGroup size="small" exclusive fullWidth value={settings.breakdown}
              onChange={(_e, v: Breakdown | null) => v && onChange({ breakdown: v })}>
              <ToggleButton value="status">Status</ToggleButton>
              <ToggleButton value="state">State</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
              State groups statuses into not started, in progress, blocked and done.
            </Typography>
          </Section>
          <Section title="Sort shots">
            <Select size="small" fullWidth value={settings.sortBy} disabled={!hasShotList}
              onChange={(e) => onChange({ sortBy: e.target.value as SortBy })} MenuProps={{ disablePortal: true }}>
              {(Object.keys(SORT_LABELS) as SortBy[]).map((s) => <MenuItem key={s} value={s}>{SORT_LABELS[s]}</MenuItem>)}
            </Select>
          </Section>
          <Divider />
          <FormControlLabel
            disabled={settings.chart !== 'bar'}
            control={<Switch size="small" checked={settings.normalize} onChange={(e) => onChange({ normalize: e.target.checked })} />}
            label={<Typography variant="body2">Bars as 100%</Typography>}
          />
        </Stack>
      </Popover>
    </Stack>
  );
}
