# ftrack-shot-tracker

An ftrack dashboard widget that charts progress of the tasks under the selected project, folder,
sequence, shot or list, by task type and status, as stacked bars or donuts.

- **Several shots** under the selection (a folder, sequence or project): a scrolling list with one
  card per shot, each showing that shot's task types, its sequence and its % done, under an
  **All shots** summary. In pie mode each card also has a two-ring donut: task types inside
  (labelled), their statuses around them. The search box filters by shot or sequence name (every
  word must match; Esc clears). The list is virtualised with
  [react-virtuoso](https://virtuoso.dev/), so only the cards on screen are rendered.
- **One shot**: its task types full size. In bar mode, click a row to open its donut.
- **Timeline** (bar mode only, toggled in the toolbar): one lane per shot with each task drawn
  from its start to its due date in its status colour, like ftrack-timeline-viewer but by shot
  rather than by artist. Shot search, status exclusion and legend hiding apply to it. Zoom with
  the Days / Weeks / Months / Year levels (14, 28, 120 and 365 days, starting three days before
  today when today is on screen), the zoom buttons or ctrl-scroll; step a view's width with
  ‹ › and jump back with Today; Fit frames every scheduled task. Shift-scroll moves through
  time. Clicking a task opens it in ftrack's sidebar. Tasks without both dates are counted in
  the charts but listed as not shown. Built on
  [vis-timeline](https://visjs.github.io/vis-timeline/), loaded only when the timeline is first
  switched on.
- **Studio time**: the timeline reads every date in the studio's timezone, so a task lands on
  the same day for every viewer wherever they are, and the today line, hover-card times and
  working-day counts match ftrack's own popover. `src/data/dates.ts` is ported from
  ftrack-timeline-viewer. Set the zone with `VITE_STUDIO_TIME_ZONE` (an IANA name, e.g.
  `America/Los_Angeles`, the default) in `.env`; see `.env.example`. ftrack does not expose it
  through the API, and an unknown name fails loudly rather than falling back to the viewer's
  zone.
- **Task types** are in workflow order (their ftrack sort), not alphabetical.
- **Exclude** (toolbar drop-downs): leave tasks out of every count, unlike the legend, which
  only hides a status from the charts. *Exclude* takes statuses (e.g. Omitted); *Exclude
  folders* takes the non-shot entities tasks sit in directly (e.g. each shot's `plates`
  folder), matched by name so one tick covers every shot's folder of that name. Without it,
  such a folder shows up as a card of its own. Only a task's direct parent is matched; tasks in
  a subfolder of `plates` list that subfolder separately. Both are remembered per browser, and
  the header says how many tasks were left out.
- **Colour by**: each workflow status in its ftrack colour, or the four states (not started,
  in progress, blocked, done).
- **Progress** is the share of tasks whose status is in the *Done* state.

Click a legend entry to hide that status. **Open in ftrack** on a shot card opens its sidebar.
Display options (the sliders icon: colours, shot sort order, 100% bars) are remembered per browser
when storage is available. Bars in the shot cards share one scale, so shots compare at a glance.
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
| `?shot` | point the widget at a single shot |
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

Same setup as ftrack-360-player: `.github/workflows/deploy.yml` runs on every push to `main`. It
bumps the version from the merged PR's semver label (`jefflinse/pr-semver-bump`), creates a GitHub
release, builds with `--base=/<repo name>/` and deploys `dist/` to GitHub Pages:

    https://<org>.github.io/ftrack-shot-tracker/

Add that URL as a web widget on an ftrack dashboard. In the repository settings, set Pages'
source to **GitHub Actions** and allow `main` in the `github-pages` environment.

`npm run build` locally writes the same static site with relative asset paths, so `dist/` can
also be served from any HTTPS location. Opened outside ftrack, the build only shows a short note
on how to add it.

### Releasing

Every change reaches `main` through a pull request carrying exactly one of the labels `major`,
`minor` or `patch`; that label decides the next version tag. Merging the PR runs the workflow.

Do not push to `main` directly. The version step looks up the merged PR behind each commit on
`main`, and a direct push fails the run with "Failed to find PR by commit SHA" (nothing is
released or deployed). Put the change on a branch and open a PR instead.

## When the widget cannot connect

ftrack hands the widget its API credentials over `postMessage`, and the widget's API calls rely
on cookies in a third-party (cross-site) iframe. When the browser blocks third-party cookies, the
session fails to initialise, or ftrack never sends credentials at all (the widget gives up after
15 s). Either way, `src/LoadingError.tsx` explains the fix for the user's browser (Chrome/Edge,
Firefox, Safari), names the ftrack site to allow, and offers the Storage Access API prompt where
the browser supports it. Queries that later fail with 401/403 show the same advice inline.

## Data

`src/data/fetchProgress.ts` loads every task under the selection once (paged, 1000 rows per
query, capped at 50 000 with a warning), plus each shot's parent name (its sequence, from `link`)
to tell apart shots with the same name. `src/data/aggregate.ts` builds the chart rows client side,
so the toolbar and search never wait on the server. Answers for a previous selection are
discarded when the selection changes quickly.

A "shot" is whatever entity the task is on: usually a shot, but an asset build or a sequence
shows up the same way, labelled with its type.

| Selected entity | Tasks counted |
|---|---|
| Project | `project_id` |
| Folder, sequence, shot, task… | the entity itself (if a task) and every task under it |
| List | tasks on or under the listed entities |

Version lists, versions and review sessions hold no tasks; the widget says so instead of charting.