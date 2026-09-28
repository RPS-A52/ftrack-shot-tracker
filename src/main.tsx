import './index.css';
import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as ftrackWidget from '@ftrack/web-widget';
import { Session } from '@ftrack/api';
import { ThemeProvider } from '@mui/material/styles';
import { Alert, Button, CssBaseline } from '@mui/material';
import { themeFor } from './Theme';
import LoadingError from './LoadingError';
import App from './App';

/** How long to wait for ftrack to send credentials before assuming it never will. */
const LOAD_TIMEOUT_MS = 15000;

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Widget crashed', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert severity="error" variant="outlined" sx={{ m: 2 }}
        action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload</Button>}>
        Something went wrong in the widget: {this.state.error.message}
      </Alert>
    );
  }
}

function renderApp(root: Root, session: Session, theme: string | null) {
  root.render(
    <StrictMode>
      <ThemeProvider theme={themeFor(theme)}>
        <CssBaseline />
        <ErrorBoundary>
          <App session={session} />
        </ErrorBoundary>
      </ThemeProvider>
    </StrictMode>,
  );
}

function onDomContentLoaded() {
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  const embedded = window.self !== window.top;
  const params = new URLSearchParams(window.location.search);

  // Standalone development: canned data, or the error page with ?error=<reason>.
  if (import.meta.env.DEV && (!embedded || params.has('harness'))) {
    import('./DevHarness').then(({ default: DevHarness }) => root.render(<DevHarness />));
    return;
  }
  if (!embedded) {
    root.render(<LoadingError reason="not-embedded" theme={null} />);
    return;
  }

  let loaded = false;
  // With third-party storage blocked, ftrack sometimes never answers the widget at all.
  const timeout = window.setTimeout(() => {
    if (!loaded) root.render(<LoadingError reason="timeout" theme={safeTheme()} />);
  }, LOAD_TIMEOUT_MS);

  ftrackWidget.initialize({
    onWidgetLoad: () => {
      if (loaded) return;
      loaded = true;
      window.clearTimeout(timeout);
      const theme = safeTheme();
      let credentials: ftrackWidget.CredentialsType | undefined;
      try {
        credentials = ftrackWidget.getCredentials();
        if (!credentials?.serverUrl || !credentials.apiUser || !credentials.apiKey) {
          throw new Error('ftrack did not provide API credentials to the widget.');
        }
        const session = new Session(credentials.serverUrl, credentials.apiUser, credentials.apiKey);
        session.initializing
          .then(() => renderApp(root, session, theme))
          .catch((error: Error) => {
            console.error('ftrack session failed to initialise', error);
            root.render(<LoadingError reason="session" error={error} theme={theme} serverUrl={credentials?.serverUrl} />);
          });
      } catch (error) {
        root.render(<LoadingError reason="session" error={error as Error} theme={theme} serverUrl={credentials?.serverUrl} />);
      }
    },
  });
}

function safeTheme() {
  try { return ftrackWidget.getActiveTheme(); } catch { return null; }
}

window.addEventListener('DOMContentLoaded', onDomContentLoaded);
