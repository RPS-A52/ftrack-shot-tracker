// One drop-down for leaving things out of the counts altogether, in sections applied from
// the top down: shot statuses (drop whole shots), then folders under the shots (e.g. plates),
// then task statuses on the tasks left over. Unlike the legend, which only hides a status
// from the charts, excluded tasks leave every total. Exclusions are saved by name.

import { Box, Checkbox, Chip, Divider, ListItemText, ListSubheader, MenuItem, Select, Typography } from '@mui/material';
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

export interface ExcludeSection {
  /** Unique per section; values in the drop-down are `${key}:${name}`. */
  key: string;
  title: string;
  /** What the counts in this section are: "shots", "tasks". */
  counts: string;
  options: ExcludeOption[];
  excluded: string[];
  onChange: (excluded: string[]) => void;
}

const CLEAR = '__clear__';

export default function ExcludeFilter({ sections }: { sections: ExcludeSection[] }) {
  // Keep entries that are excluded but absent here listed, so they can be switched back on.
  const shown = sections.map((section) => ({
    ...section,
    all: [
      ...section.options,
      ...section.excluded.filter((name) => !section.options.some((o) => o.name === name)).map((name) => ({ name, count: 0 })),
    ] as ExcludeOption[],
  }));
  const value = sections.flatMap((s) => s.excluded.map((name) => `${s.key}:${name}`));
  const names = sections.flatMap((s) => s.excluded);

  const onChange = (next: string[]) => {
    if (next.includes(CLEAR)) {
      sections.forEach((s) => s.onChange([]));
      return;
    }
    for (const s of sections) {
      const prefix = `${s.key}:`;
      const picked = next.filter((v) => v.startsWith(prefix)).map((v) => v.slice(prefix.length));
      const same = picked.length === s.excluded.length && picked.every((name) => s.excluded.includes(name));
      if (!same) s.onChange(picked);
    }
  };

  return (
    <Select
      multiple
      size="small"
      displayEmpty
      value={value}
      onChange={(e) => onChange(e.target.value as string[])}
      inputProps={{ 'aria-label': 'Exclude shots, folders or task statuses' }}
      renderValue={() => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <FilterListIcon sx={{ fontSize: 16, color: names.length ? 'primary.main' : 'text.secondary' }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Box component="span" sx={{ color: 'text.secondary' }}>Exclude: </Box>
            <Box component="span" sx={{ color: names.length ? 'text.primary' : 'text.secondary' }}>
              {names.length === 0 ? 'None' : names.length === 1 ? names[0] : `${names.length} types`}
            </Box>
          </Box>
        </Box>
      )}
      MenuProps={{ slotProps: { paper: { sx: { maxHeight: 420, minWidth: 260 } } } }}
      sx={{ maxWidth: 240, '& .MuiSelect-select': { py: 0.6 } }}
    >
      {shown.flatMap((section) => [
        <ListSubheader key={`${section.key}-header`} sx={{ lineHeight: '32px', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <span>{section.title}</span>
          <Typography component="span" variant="caption" color="text.disabled" sx={{ lineHeight: '32px' }}>{section.counts}</Typography>
        </ListSubheader>,
        ...(section.all.length === 0
          ? [<Typography key={`${section.key}-empty`} component="li" variant="body2" color="text.disabled" sx={{ display: 'block', px: 2, pb: 1 }}>None here</Typography>]
          : section.all.map((o) => (
            <MenuItem key={`${section.key}:${o.name}`} value={`${section.key}:${o.name}`} dense>
              <Checkbox size="small" checked={section.excluded.includes(o.name)} sx={{ p: 0.5, mr: 1 }} />
              {o.color && <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: o.color, mr: 1, flexShrink: 0 }} />}
              <ListItemText primary={o.name} />
              {o.kind && <Chip label={o.kind} size="small" variant="outlined" sx={{ height: 18, fontSize: 10, ml: 1 }} />}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2, fontVariantNumeric: 'tabular-nums' }}>
                {formatCount(o.count)}
              </Typography>
            </MenuItem>
          ))),
      ])}
      {names.length > 0 && <Divider />}
      {names.length > 0 && (
        <MenuItem value={CLEAR} dense>
          <ListItemText primary="Clear all exclusions" primaryTypographyProps={{ color: 'primary' }} />
        </MenuItem>
      )}
    </Select>
  );
}
