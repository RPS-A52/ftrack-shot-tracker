// Drop-down for leaving statuses out of the counts altogether (e.g. "Omitted"), as opposed to
// the legend, which only hides a status from the charts. Excluded statuses are saved by name.

import { Box, Checkbox, Divider, ListItemText, MenuItem, Select, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { formatCount } from '../data/aggregate';

export interface StatusOption {
  name: string;
  color: string;
  count: number;
}

interface Props {
  options: StatusOption[];
  excluded: string[];
  onChange: (excluded: string[]) => void;
}

const CLEAR = '__clear__';

export default function StatusFilter({ options, excluded, onChange }: Props) {
  // Keep statuses that are excluded but absent here listed, so they can be switched back on.
  const missing = excluded.filter((name) => !options.some((o) => o.name === name));
  const all: StatusOption[] = [...options, ...missing.map((name) => ({ name, color: '#8a8f98', count: 0 }))];

  return (
    <Select
      multiple
      size="small"
      displayEmpty
      value={excluded}
      onChange={(e) => {
        const value = e.target.value as string[];
        onChange(value.includes(CLEAR) ? [] : value);
      }}
      inputProps={{ 'aria-label': 'Exclude statuses' }}
      renderValue={(value) => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <FilterListIcon sx={{ fontSize: 16, color: value.length ? 'primary.main' : 'text.secondary' }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>Exclude: </Box>
            <Box component="span" sx={{ color: value.length ? 'text.primary' : 'text.secondary' }}>
              {value.length === 0 ? 'None' : value.length === 1 ? value[0] : `${value.length} statuses`}
            </Box>
          </Box>
        </Box>
      )}
      MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
      sx={{ maxWidth: 220, '& .MuiSelect-select': { py: 0.6 } }}
    >
      <Typography component="li" variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 0.75 }}>
        Tick statuses to leave out of the counts
      </Typography>
      {all.map((o) => (
        <MenuItem key={o.name} value={o.name} dense>
          <Checkbox size="small" checked={excluded.includes(o.name)} sx={{ p: 0.5, mr: 1 }} />
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: o.color, mr: 1, flexShrink: 0 }} />
          <ListItemText primary={o.name} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2, fontVariantNumeric: 'tabular-nums' }}>
            {formatCount(o.count)}
          </Typography>
        </MenuItem>
      ))}
      {excluded.length > 0 && <Divider />}
      {excluded.length > 0 && (
        <MenuItem value={CLEAR} dense>
          <ListItemText primary="Count all statuses" primaryTypographyProps={{ color: 'primary' }} />
        </MenuItem>
      )}
    </Select>
  );
}
