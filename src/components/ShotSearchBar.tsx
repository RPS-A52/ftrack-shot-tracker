import type { ReactNode } from 'react';
import { IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { formatCount } from '../data/aggregate';

interface Props {
  query: string;
  onChange: (query: string) => void;
  /** Shots shown, and shots in total, for the "8 of 120 shots" count. */
  shown: number;
  total: number;
  searching: boolean;
  /** Controls placed at the right end of the row (the timeline's zoom buttons). */
  actions?: ReactNode;
}

/** The search row above the shot list and the timeline. */
export default function ShotSearchBar({ query, onChange, shown, total, searching, actions }: Props) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 1, flexShrink: 0 }}>
      <TextField
        size="small"
        placeholder="Search shots or sequences"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); onChange(''); } }}
        inputProps={{ 'aria-label': 'Search shots', spellCheck: false }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton size="small" edge="end" aria-label="Clear search" onClick={() => onChange('')}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        }}
        sx={{ flex: 1, minWidth: 0, maxWidth: 360, '& .MuiInputBase-input': { py: 0.75 } }}
      />
      <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {searching ? `${formatCount(shown)} of ${formatCount(total)} shots` : `${formatCount(total)} shots`}
      </Typography>
      {actions && <Stack direction="row" spacing={0.5} sx={{ ml: 'auto !important', flexShrink: 0 }}>{actions}</Stack>}
    </Stack>
  );
}
