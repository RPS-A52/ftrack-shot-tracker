# ftrack-shot-tracker

An ftrack dashboard widget that charts progress under the selected project, sequence, shot or list:
stacked bars or donuts, broken down by status.

- **Group by**: task type, shot (the task's parent), or asset type (the latest version of each asset).
- **Measure**: bid hours (ftrack stores bids in seconds; shown in hours) or item count. Asset types
  are always counted, as versions have no bid.
- **Colour by**: each workflow status in its ftrack colour, or the four states (not started,
  in progress, blocked, done).
- **Progress** is the share of bid hours (or items) whose status is in the *Done* state.

Click a legend entry to hide that status. In bar mode, click a row to open its donut. In pie mode,
click a card to focus it; for shots, **Open in ftrack** opens the sidebar. Display options (gear
icon) are remembered per browser when storage is available.

Charts are [MUI X Charts](https://mui.com/x/react-charts/) (free tier) on MUI 6, the same UI stack
as our other widgets.

## Development

```
npm ci
npm run dev
```

The dev server uses HTTPS on port 3032 with the mkcert pair in `.cert/` (`localhost.pem`,
`localhost-key.pem`), copied from ftrack-360-player. `.cert/` is git-ignored.

Opened directly (not in an iframe), the dev server mounts a harness with a mock project:

| URL parameter | Effect |
|---|---|
| `?shots=120` | size of the fake project (`0` for an empty one) |
| `?theme=light` | ftrack's light theme |
| `?embed&w=440&h=330` | run inside an iframe of that size, like a small dashboard tile |
| `?fail=<message>` | make every query fail |
| `?error=timeout` / `session` / `not-embedded` | show the loading error page |

To use a real server instead, put these in an untracked `.env.local`:
`VITE_FTRACK_SERVER_URL`, `VITE_FTRACK_API_USER`, `VITE_FTRACK_API_KEY`, `VITE_FTRACK_ENTITY_ID`
and optionally `VITE_FTRACK_ENTITY_TYPE` (default `Project`).

`vite.config.ts` sets `resolve.preserveSymlinks`, because the `O:` share resolves to a `Y:` path
that Node cannot open. The inline `<style>` from `index.html` lives in `src/index.css` for the same
reason (Vite's HTML proxy fails on the resolved path).

## Deploying

`npm run build` writes a static site to `dist/` with relative asset paths. Host it on HTTPS and
add the URL as a web widget on an ftrack dashboard. Opened outside ftrack, the build only shows a
short note on how to add it.

## When the widget cannot connect

ftrack hands the widget its API credentials over `postMessage`, and the widget's API calls rely
on cookies in a third-party (cross-site) iframe. When the browser blocks third-party cookies, the
session fails to initialise, or ftrack never sends credentials at all (the widget gives up after
15 s). Either way, `src/LoadingError.tsx` explains the fix for the user's browser (Chrome/Edge,
Firefox, Safari), names the ftrack site to allow, and offers the Storage Access API prompt where
the browser supports it. Queries that later fail with 401/403 show the same advice inline.

## Data

`src/data/fetchProgress.ts` loads everything once per selection (paged, 1000 rows per query,
capped at 50 000 rows per source with a warning), and `src/data/aggregate.ts` builds the chart
rows client side, so the toolbar never waits on the server. Answers for a previous selection
are discarded when the selection changes quickly.

| Selected entity | Tasks | Latest versions |
|---|---|---|
| Project | `project_id` | `project_id` (or `asset.parent` when the schema lacks it) |
| Sequence, shot, task, folder… | the entity and its descendants | assets on it or under it, or published from the task |
| List | the listed entities and their descendants | same; an AssetVersionList counts its versions |
