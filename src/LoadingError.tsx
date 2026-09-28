// Shown instead of the widget when it cannot talk to ftrack. The usual cause is the
// browser blocking third-party cookies/storage for the widget iframe: ftrack's API
// session then fails to initialise, or ftrack never hands over the credentials.

import { useState } from 'react';
import { browserName } from 'react-device-detect';
import { ThemeProvider } from '@mui/material/styles';
import { Alert, AlertTitle, Box, Button, CssBaseline, Link, Stack, Typography } from '@mui/material';
import CookieOutlinedIcon from '@mui/icons-material/CookieOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { themeFor } from './Theme';

export type LoadingErrorReason = 'session' | 'timeout' | 'not-embedded';

interface Props {
  reason: LoadingErrorReason;
  error?: { message?: string } | null;
  theme?: string | null;
  /** From the ftrack credentials, when we got that far. */
  serverUrl?: string;
}

/** The ftrack site embedding us, for the "allow cookies for" instructions. */
function ftrackOrigin(serverUrl?: string) {
  if (serverUrl) {
    try { return new URL(serverUrl).origin; } catch { /* fall through */ }
  }
  const ancestors = window.location.ancestorOrigins;
  if (ancestors && ancestors.length > 0) return ancestors[0];
  if (document.referrer) {
    try { return new URL(document.referrer).origin; } catch { /* fall through */ }
  }
  return null;
}

function looksLikeAuthError(message = '') {
  return /401|403|auth|credential|api key|cookie|csrf|session/i.test(message);
}

export default function LoadingError({ reason, error, theme, serverUrl }: Props) {
  const site = ftrackOrigin(serverUrl);
  const siteText = site ?? 'your ftrack site (e.g. https://<studio>.ftrackapp.com)';
  const canRequestAccess = typeof document.requestStorageAccess === 'function' && reason !== 'not-embedded';
  const [accessState, setAccessState] = useState<'idle' | 'pending' | 'denied'>('idle');

  const requestAccess = async () => {
    setAccessState('pending');
    try {
      await document.requestStorageAccess();
      window.location.reload();
    } catch {
      setAccessState('denied');
    }
  };

  const headline = {
    'session': 'The widget could not connect to ftrack.',
    'timeout': 'ftrack did not respond to the widget.',
    'not-embedded': 'This page is an ftrack dashboard widget.',
  }[reason];

  return (
    <ThemeProvider theme={themeFor(theme)}>
      <CssBaseline />
      <Box sx={{ height: '100%', overflow: 'auto', overscrollBehavior: 'contain', p: { xs: 1.5, sm: 3 } }}>
        <Stack spacing={2} sx={{ maxWidth: 720, mx: 'auto' }}>
          {reason === 'not-embedded' ? (
            <Alert severity="info" variant="outlined">
              <AlertTitle>{headline}</AlertTitle>
              Add this page's URL as a widget on an ftrack dashboard (Dashboards &rsaquo; Add widget &rsaquo; Web
              widget) to see task progress for the selected project, sequence or shot.
            </Alert>
          ) : (
            <>
              <Alert severity="error" variant="outlined" icon={<CookieOutlinedIcon />}>
                <AlertTitle>{headline}</AlertTitle>
                {reason === 'timeout'
                  ? 'No login details were received from ftrack. This almost always means the browser is blocking third-party cookies for this widget.'
                  : looksLikeAuthError(error?.message)
                    ? 'ftrack refused the widget\'s login. Your session may have expired, or the browser is blocking third-party cookies for this widget.'
                    : 'Your session may have expired, or the browser is blocking third-party cookies for this widget.'}
                {error?.message && (
                  <Typography component="div" variant="caption" sx={{ mt: 1, opacity: 0.8, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                    {error.message}
                  </Typography>
                )}
              </Alert>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="contained" size="small" startIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
                  Reload widget
                </Button>
                {canRequestAccess && (
                  <Button variant="outlined" size="small" onClick={requestAccess} disabled={accessState === 'pending'}>
                    {accessState === 'pending' ? 'Asking the browser…' : 'Allow cookies for this widget'}
                  </Button>
                )}
              </Stack>
              {accessState === 'denied' && (
                <Typography variant="body2" color="text.secondary">
                  The browser did not grant access from here. Please use the steps below.
                </Typography>
              )}

              <Box>
                <Typography variant="subtitle2" gutterBottom>How to fix it</Typography>
                <Box component="ol" sx={{ m: 0, pl: 2.5, typography: 'body2', '& li': { mb: 0.75 } }}>
                  <li>Refresh the ftrack page. If you were logged out, log in again.</li>
                  <li>
                    Allow third-party cookies for <b>{siteText}</b>.
                    <BrowserSteps site={siteText} />
                  </li>
                  <li>Reload the page once the setting is changed.</li>
                </Box>
              </Box>
            </>
          )}
          <Typography variant="caption" color="text.disabled">
            Shot Progress widget v{import.meta.env.PACKAGE_VERSION}
          </Typography>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}

function BrowserSteps({ site }: { site: string }) {
  const steps = (items: string[]) => (
    <Box component="ol" type="a" sx={{ mt: 0.5, pl: 2.5, color: 'text.secondary' }}>
      {items.map((s) => <li key={s}>{s}</li>)}
    </Box>
  );
  switch (browserName) {
    case 'Chrome':
    case 'Edge':
    case 'Brave':
    case 'Opera':
      return (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">Quick fix, for this site only:</Typography>
          {steps([
            'Click the site-information icon at the left of the address bar (or the eye icon at its right, if shown).',
            'Open “Cookies and site data” and turn “Third-party cookies” on (Allowed).',
            'Reload the page.',
          ])}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            To keep it allowed: {browserName === 'Edge' ? 'Settings › Cookies and site permissions › Manage and delete cookies › Allow' : 'Settings › Privacy and security › Third-party cookies › Sites allowed to use third-party cookies › Add'},
            then enter <b>{site}</b>.
          </Typography>
        </Box>
      );
    case 'Firefox':
      return steps([
        'Click the shield icon to the left of the address bar.',
        'Turn off “Enhanced Tracking Protection” for this site,',
        `or go to Settings › Privacy & Security › Cookies and Site Data › Manage Exceptions and allow ${site}.`,
        'Reload the page.',
      ]);
    case 'Safari':
      return steps([
        'Open Safari › Settings › Privacy.',
        'Untick “Prevent cross-site tracking”.',
        'Reload the page.',
      ]);
    default:
      return (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Look in your browser's privacy settings for third-party or cross-site cookies and add an exception for{' '}
          <b>{site}</b>. <Link href="https://help.ftrack.com" target="_blank" rel="noreferrer">ftrack help</Link>
        </Typography>
      );
  }
}
