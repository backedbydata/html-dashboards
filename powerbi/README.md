# Charlotte Weather — Power BI

A Power BI rebuild of the [Charlotte weather dashboard](../dashboard.html), covering
86 years of NOAA daily observations (1940–2026, 31,545 days) from station
GHCND:USW00013881 at Charlotte Douglas Airport.

Six pages: **Overview · Temperature · Precipitation · Patterns · Drought**, plus a hidden
**Daily Records** drill-through target.

---

## Open it locally

You need [Power BI Desktop](https://powerbi.microsoft.com/desktop/) (free).

```bash
git clone https://github.com/backedbydata/html-dashboards.git
cd html-dashboards/powerbi
```

Open `CharlotteWeather.pbip`, then click **Refresh** on the ribbon.

The data file is `charlotte-weather.json` at the repo root, and it is committed — no
separate download. If the refresh reports that the file cannot be found:

1. **Transform data → Manage parameters**
2. Set **Data Folder** to the folder holding `charlotte-weather.json` (your clone root)
3. **Close & Apply**, then **Refresh**

Power Query has no way to derive the PBIP's own folder, so the parameter carries an
absolute default. The query works around this by probing the parameter plus one and two
levels above it — so pointing it at the repo root, at `powerbi\`, or at `powerbi\data`
all resolve. Only a clone to a genuinely different location needs the manual step.

---

## Publish it for others

Four options, from least to most effort. The right one depends entirely on how your
viewers are licensed.

### 1. Publish to web — free, but fully public

**Home → Publish → Publish to web**, then share the generated link.

- **Cost:** none, for you or viewers
- **Viewers need:** nothing, not even an account
- ⚠️ **Anyone on the internet can see it.** The link is unlisted but unauthenticated,
  and the content can be indexed by search engines. Many tenants disable this by policy.

For public NOAA weather data this is a reasonable choice. Never use it for anything
confidential.

### 2. Share from a Fabric capacity workspace — viewers free

Publish to a workspace backed by Fabric capacity (F2 and up, ~$156/mo), then share.

- **Cost:** the capacity
- **Viewers need:** a Power BI **Free** licence only
- Best when sharing with many people inside one organisation.

### 3. Share from a Pro workspace

Publish to a normal workspace and share.

- **Cost:** Power BI **Pro** (~$14/user/month)
- **Viewers need:** Pro as well — every single one
- Fine for a handful of colleagues who already have Pro.

### 4. Send the source

Point people at this repo, or hand them a `.pbix`
(**File → Export → Power BI template** / Save As `.pbix`).

- **Cost:** none
- **Viewers need:** Power BI Desktop installed
- The `.pbix` embeds the data, so it works standalone — but it is a binary blob with no
  diffs and no history. Prefer the repo.

### What "free" actually means

Publishing is free. **Sharing is where the licence applies.** A Free licence lets you
publish to *My Workspace* and view it yourself; it does not let you share with anyone.
That's the wall most people hit.

---

## Project layout

```
charlotte-weather.json                     source data (3.9 MB, repo root)
powerbi/
├── CharlotteWeather.pbip                  entry point — open this
├── CharlotteWeather.SemanticModel/        TMDL model: 3 tables, 37 measures
├── CharlotteWeather.Report/               PBIR report: 6 pages, 157 visuals
└── build/                                 Node generator for the report pages
```

### Who owns which files

| Area | Owner | Safe to edit in Desktop? |
|---|---|---|
| `CharlotteWeather.SemanticModel/` | TMDL on disk | **Yes.** Measures, columns, relationships — export back to TMDL afterwards |
| `CharlotteWeather.Report/definition/pages/` | `build/build.js` | **No.** Regenerated on every build |
| `report.json`, theme, `.pbir`, `version.json` | hand-maintained | Yes |

The 6 pages and 127 visuals are generated output. Everything else is ordinary source.

### Regenerating the report

**Always check for drift first.** This is the step that prevents losing Desktop work:

```bash
node powerbi/build/check-drift.js          # exit 0 = safe, 1 = drift found
node powerbi/build/check-drift.js --list   # name the exact properties that differ
```

If it reports drift, someone changed a page outside the generator. Fold those changes
into `build/build.js` **before** rebuilding, or they are destroyed.

```bash
node powerbi/build/build.js
powerbi-report-author validate powerbi/CharlotteWeather.Report
```

The generator is deterministic — page and visual IDs are SHA-derived from stable seeds,
so re-running produces an empty diff unless the design actually changed. That property is
what makes the drift check meaningful: any difference is a real edit, never churn.

### Collaborating on the report

Because pages are generated, the workflow is:

- **Formatting, layout, visuals** → change `build/build.js`, not Desktop. Quick tweaks in
  Desktop are fine for *trying* something; once it looks right, port it to the generator
  and rebuild.
- **Model work** → do it in Desktop freely, then export TMDL back to
  `CharlotteWeather.SemanticModel/definition/`.

If hand-authored pages ever matter more than one-command rebuilds, delete
`build/build.js` and edit the PBIR directly. That is a one-way door — after it, running
the generator again would discard the hand edits.

---

## Editing the model

**TMDL files must be UTF-8 without a BOM.** PowerShell's `Set-Content -Encoding utf8`
writes one, and Desktop will then refuse to open the project entirely. Use an editor
that does not add a BOM, or:

```powershell
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
```

Also note: `powerbi-report-author validate` checks the **report** only. It reports zero
errors even when the semantic model is unloadable.

---

## Filter pane

Visual-level filters are all marked `isHiddenInViewMode: true`. They encode
authoring decisions — exclude the partial 2026 year, top-15 hottest days, rank ≤ 10
driest windows, drop unmeasured days from Key Influencers — not choices a viewer
should make. Left visible they appear in the published report as controls like
"Year is less than or equal to 2025", which contradicts the visual titles.

Two things to know if you add a filter:

- **Set `isHiddenInViewMode` unless the filter is genuinely a user control.**
- **Desktop's editing view does not show the consumer filter pane**, so an unhidden
  filter is invisible locally and only appears after publishing.

The pane itself is styled through `page.json → objects.outspacePane` and
`objects.filterCard` (states `Available` / `Applied`). It does **not** inherit the
theme's structural colours, and the theme's `visualStyles` rejects those objects —
page-level is the only place they work.

## Notes on the data

- **1942–43 have no `tmax`/`tmin`/`prcp` readings.** These are left blank rather than
  zero-filled, so the heat grid shows gaps and precipitation lines break instead of
  diving to zero. Blanks are real missing observations, not dry years.
- **`tavg` covers only 10.5% of rows** (1942–43 and 1998–2005). Daily mean temperature
  uses the reported value where present and `(tmax+tmin)/2` otherwise — both sources are
  needed, since the years with `tavg` are exactly the years missing `tmax`/`tmin`.
- **2026 is a partial year**, ending 14 May. It is excluded from per-year trend charts
  so it does not plot as a false cliff.
- Drought measures ignore all filters by design — they are defined against fixed
  baselines (1991–2020 normals), so the Drought page carries no slicers.
