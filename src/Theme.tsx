import { deepmerge } from '@mui/utils';
import { createTheme, ThemeOptions } from '@mui/material/styles';

// Same look as our other ftrack widgets (ftrack-360-player), so they sit together on a dashboard.
const themeOptions: ThemeOptions = {
  palette: {
    primary: {
      main: 'rgb(191, 154, 201)',
    },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: '"Open Sans", "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
    button: {
      textTransform: 'none',
      fontSize: 12,
    },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: { textTransform: 'none', paddingTop: 3, paddingBottom: 3 },
      },
    },
    MuiTooltip: {
      defaultProps: { disableInteractive: true },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#6b6b6b transparent",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            width: 10,
            height: 10,
            backgroundColor: "transparent",
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            borderRadius: 8,
            backgroundColor: "#6b6b6b",
            minHeight: 24,
            border: "3px solid transparent",
            backgroundClip: "content-box",
          },
          "&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "#959595",
          },
          "&::-webkit-scrollbar-corner, & *::-webkit-scrollbar-corner": {
            backgroundColor: "transparent",
          },
        },
      },
    },
  },
};

const lightTheme = createTheme(deepmerge(themeOptions, {
  palette: {
    mode: 'light',
    background: {
      paper: 'rgb(255, 255, 255)',
      default: 'rgb(248, 248, 249)',
    },
    primary: {
      main: 'rgb(147, 91, 162)',
    },
  },
}));

const darkTheme = createTheme(deepmerge(themeOptions, {
  palette: {
    mode: 'dark',
    background: {
      paper: 'rgb(27, 34, 43)',
      default: 'rgb(19, 25, 32)',
    },
  },
}));

export function themeFor(mode: string | null | undefined) {
  return mode === 'light' ? lightTheme : darkTheme;
}

export { lightTheme, darkTheme };
