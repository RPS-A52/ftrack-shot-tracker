// Drop-down for leaving things out of the counts altogether: statuses (e.g. "Omitted") or
// folders under the shots (e.g. "plates"). Unlike the legend, which only hides a status from
// the charts, excluded tasks leave every total. Exclusions are saved by name.

import { Box, Checkbox, Chip, Divider, ListItemText, MenuItem, Select, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { formatCount } from '../data/aggregate';

export interface ExcludeOption {
  /** What is saved, and matched against. */
  name: string;
  /** Status colour swatch. */
  color?: string;
  /** Entity type chip, e.g. "Folder". */
  kind?: string;
  count: number;
}

interface Props {
  /** "Exclude", "Exclude folders"... */
  label: string;
  /** Plural for the button when several are excluded: "statuses", "folders". */
  noun: string;
  /** The first line of the menu. */
  hint: string;
  options: ExcludeOption[];
  excluded: string[];
  onChange: (excluded: string[]) => void;
}

const CLEAR = '__clear__';

export default function ExcludeFilter({ label, noun, hint, options, excluded, onChange }: Props) {
  // Keep entries that are excluded but absent here listed, so they can be switched back on.
  const missing = excluded.filter((name) => !options.some((o) => o.name === name));
  const all: ExcludeOption[] = [...options, ...missing.map((name) => ({ name, count: 0 }))];

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
      inputProps={{ 'aria-label': label.includes(noun) ? label : `${label} ${noun}` }}
      renderValue={(value) => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <FilterListIcon sx={{ fontSize: 16, color: value.length ? 'primary.main' : 'text.secondary' }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>{label}: </Box>
            <Box component="span" sx={{ color: value.length ? 'text.primary' : 'text.secondary' }}>
              {value.length === 0 ? 'None' : value.length === 1 ? value[0] : `${value.length} ${noun}`}
            </Box>
          </Box>
        </Box>
      )}
      MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
      sx={{ maxWidth: 240, '& .MuiSelect-select': { py: 0.6 } }}
    >
      <Typography component="li" variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 0.75, maxWidth: 280 }}>
        {hint}
      </Typography>
      {all.length === 0 && (
        <Typography component="li" variant="body2" color="text.secondary" sx={{ display: 'block', px: 2, py: 0.5 }}>
          Nothing to exclude here.
        </Typography>
      )}
      {all.map((o) => (
        <MenuItem key={o.name} value={o.name} dense>
          <Checkbox size="small" checked={excluded.includes(o.name)} sx={{ p: 0.5, mr: 1 }} />
          {o.color && <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: o.color, mr: 1, flexShrink: 0 }} />}
          <ListItemText primary={o.name} />
          {o.kind && <Chip label={o.kind} size="small" variant="outlined" sx={{ height: 18, fontSize: 10, ml: 1 }} />}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2, fontVariantNumeric: 'tabular-nums' }}>
            {formatCount(o.count)}
          </Typography>
        </MenuItem>
      ))}
      {excluded.length > 0 && <Divider />}
      {excluded.length > 0 && (
        <MenuItem value={CLEAR} dense>
          <ListItemText primary={`Count all ${noun}`} primaryTypographyProps={{ color: 'primary' }} />
        </MenuItem>
      )}
    </Select>
  );
}
