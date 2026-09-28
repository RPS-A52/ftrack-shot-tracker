// Development-only: runs the widget outside ftrack. Only mounted by main.tsx under
// `vite` (import.meta.env.DEV). Query parameters:
//   ?shots=<n>           size of the fake project (default 36; 0 for an empty one)
//   ?shot                point the widget at a single shot instead of the project
//   ?theme=light         ftrack's light theme (dark by default)
//   ?fail=<message>      make every query fail
//   ?error=session|timeout|not-embedded   show the loading error page instead
//   ?embed               run inside an iframe, the way ftrack shows widgets
//   ?w=<px>&h=<px>       with ?embed, the iframe size (to try small dashboard tiles)
// Set VITE_FTRACK_SERVER_URL / _API_USER / _API_KEY / _ENTITY_ID (and optionally
// _ENTITY_TYPE, default Project) in an untracked .env.local to use a real server.

import { useEffect, useMemo, useState } from 'react';
import { Session } from '@ftrack/api';
import { ThemeProvider } from '@mui/material/styles';
import { Alert, Box, CssBaseline, Typography } from '@mui/material';
import { themeFor } from './Theme';
import App from './App';
import LoadingError, { type LoadingErrorReason } from './LoadingError';
import { createMockSession } from './data/mockSession';
import type { QuerySession } from './data/fetchProgress';

export default function DevHarness() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';

  if (params.has('embed')) {
    const inner = new URL(window.location.href);
    inner.searchParams.delete('embed');
    inner.searchParams.set('harness', '');
    const w = params.get('w');
    const h = params.get('h');
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#2a2f36', p: 2, gap: 1 }}>
        <Typography variant="caption" sx={{ color: '#aaa' }}>Dev harness, embedded in an iframe like ftrack does</Typography>
        <Box component="iframe" title="widget" src={inner.toString()}
          sx={{ border: '1px solid #444', borderRadius: 1, width: w ? `${w}px` : '100%', height: h ? `${h}px` : '100%', flex: h ? 'none' : 1 }} />
      </Box>
    );
  }

  const error = params.get('error') as LoadingErrorReason | null;
  if (error) {
    return <LoadingError reason={error} theme={theme} error={error === 'session' ? { message: 'Request failed with status 401' } : null} />;
  }

  return (
    <ThemeProvider theme={themeFor(theme)}>
      <CssBaseline />
      <HarnessApp />
    </ThemeProvider>
  );
}

function HarnessApp() {
  const env = import.meta.env;
  const real = Boolean(env.VITE_FTRACK_SERVER_URL && env.VITE_FTRACK_API_USER && env.VITE_FTRACK_API_KEY && env.VITE_FTRACK_ENTITY_ID);
  const [session, setSession] = useState<QuerySession | null>(real ? null : createMockSession());
  const [failure, setFailure] = useState<string | null>(null);
  const entity = useMemo(() => real
    ? { id: env.VITE_FTRACK_ENTITY_ID as string, type: (env.VITE_FTRACK_ENTITY_TYPE as string) || 'Project' }
    : new URLSearchParams(window.location.search).has('shot')
      ? { id: 'shot-0', type: 'Shot' }
      : { id: 'mock-project', type: 'Project' }, [real, env]);

  useEffect(() => {
    if (!real) return;
    const s = new Session(env.VITE_FTRACK_SERVER_URL, env.VITE_FTRACK_API_USER, env.VITE_FTRACK_API_KEY);
    s.initializing.then(() => setSession(s as unknown as QuerySession), (e: Error) => setFailure(e.message));
  }, [real, env]);

  if (failure) return <Alert severity="error" sx={{ m: 2 }}>Could not connect to {env.VITE_FTRACK_SERVER_URL}: {failure}</Alert>;
  if (!session) return null;
  return <App session={session} entity={entity} />;
}
