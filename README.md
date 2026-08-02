# Charlotte Weather Dashboards

Three builds of the same dashboard, from the same data, by three different routes.

The starting point was a one-shot challenge: give Claude Code and Codex an identical
prompt and see which produced the better weather dashboard from raw NOAA data. The
Claude build won on editorial judgment, so it became the design brief for a third
version - the same dashboard rebuilt as a **Power BI semantic model and report**,
authored entirely as text files rather than by dragging fields onto a canvas.

**Live:** [neonowl.ai/dashboards](https://neonowl.ai/dashboards/)

| Build | What it is | Link |
|---|---|---|
| **Claude Code** | Single-file React + Recharts + Plotly + D3 dashboard, 5 tabs, 10 cascading filters | [dashboard.html](dashboard.html) |
| **Codex** | A second interpretation of the same prompt | [codex-dashboard.html](codex-dashboard.html) |
| **Power BI** | Star-schema model, 37 DAX measures, 6 pages, 25 visualizations | [pbi-dashboard.html](pbi-dashboard.html) |

---

## The data

**NOAA Climate Data Online**, station `GHCND:USW00013881` at Charlotte Douglas
International Airport - **31,545 daily observations** from 1 January 1940 to
14 May 2026, committed as `charlotte-weather.json` (3.9 MB).

Fields are daily high, low and reported mean temperature, precipitation, snowfall
and snow depth. Two caveats that shaped every build:

- **1942-43 have no readings** for temperature or precipitation. They are preserved
  as blanks, not zero-filled - showing them as zero would misrepresent them as a
  historic drought.
- **2026 is a partial year**, ending 14 May, so it is excluded from per-year trends
  rather than plotted as a false cliff.

To refresh the data (5-10 minutes, NOAA rate limits):

```bash
node fetch-noaa.js          # needs NOAA_API_TOKEN in .env
```

---

## Running it locally

The dashboards fetch `charlotte-weather.json` over HTTP, so they must be served -
opening the file directly with `file://` will not work.

```bash
npx serve .
# then open http://localhost:3000/pbi-dashboard.html
```

The Power BI project itself needs [Power BI Desktop](https://powerbi.microsoft.com/desktop/).
Open `powerbi/CharlotteWeather.pbip` and click **Refresh**.

---

## What is in here

```
dashboard.html              Claude Code build (JavaScript)
codex-dashboard.html        Codex build (JavaScript)
pbi-dashboard.html          Power BI project overview - the walkthrough page
report.html                 Generated technical reference for the Power BI report
charlotte-weather.json      Source data, 31,545 daily records
fetch-noaa.js               NOAA API fetch script
img/                        Page screenshots and logo assets
powerbi/                    The PBIP project - model, report, and page generator
```

### Documentation

| File | Covers |
|---|---|
| [Agents.md](Agents.md) | Full project context: data dictionary, tech stack, tab and filter structure |
| [powerbi/README.md](powerbi/README.md) | Opening, editing, regenerating and publishing the Power BI project |
| [PLAN-POWERBI.md](PLAN-POWERBI.md) | The plan the Power BI build followed, and why it was sequenced |
| [notes.md](notes.md) | Research notes on the libraries and data sources used |

---

## The Power BI build

The part worth reading about. The JavaScript versions compute everything in the
browser at render time; Power BI needs a model first, so the work was sequenced -
plan, then model, then design, then report - using the Power BI authoring skills.

- **Semantic model** - a real marked Date table, a daily fact table, and a
  precomputed rolling-window table. The values the JavaScript calculates inline
  (1991-2020 normals, precipitation deficit, dry-streak length, rolling 12-month
  totals, the 1940-1980 anomaly baseline) all became DAX measures.
- **Report** - six pages of PBIR JSON emitted by a deterministic Node generator.
  Page and visual IDs are SHA-derived from stable seeds, so re-running produces an
  empty diff unless the design actually changed.

Two rules that matter if you edit it:

> **Report pages are generated.** Run `node powerbi/build/check-drift.js` before
> rebuilding - Desktop edits to a page will be destroyed by the next
> `node powerbi/build/build.js`. Fold them into the generator first.

> **TMDL files must be UTF-8 without a BOM.** PowerShell's `Set-Content -Encoding utf8`
> writes one, and Desktop will then refuse to open the project.

Full detail in [powerbi/README.md](powerbi/README.md).

---

## Deployment

Vercel serves this repo as static files. `.vercelignore` excludes the source-only
material - the `powerbi/` project, planning docs and the fetch script - since Vercel
cannot render a PBIP and there is nothing to gain by uploading it.

The live site proxies `/dashboards/*` to this deployment, so anything added at the
repo root is reachable from `neonowl.ai/dashboards/`.
