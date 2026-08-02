# Report Spec — Charlotte Weather (Power BI)

> Produced by `powerbi-report-planning` for the build described in
> [PLAN-POWERBI.md](../PLAN-POWERBI.md). Step 1 deliverable. Approval gate is
> after **step 2 (semantic model)**, not after this document.

## Report identity

- **Report name:** Charlotte Weather — 86 Years of Climate Record
- **Semantic model:** `CharlotteWeather` (new, local, Import mode) — built in step 2
- **Audience:** Enthusiast / analyst hybrid. The original is a portfolio piece meant to be
  read and explored, not a monitored operational asset.
- **Primary purpose:** Make 86 years of daily observations explorable, and land one
  argument — the current 12-month period is in severe precipitation deficit.
- **Delivery target:** **Local PBIP only.** No Fabric publish, no workspace items, no
  tenant connection. (Constraint from the plan, not a default.)

## User decisions and constraints

- **Scope:** 5 pages, mirroring the HTML tab structure.
- **Page count:** 5 (Overview, Temperature, Precipitation, Trends, Drought).
- **Interactivity:** Slicers + cross-filtering. Drought page is deliberately filter-isolated.
- **Design direction:** Dark theme, carried from `dashboard.html` so it reads as one system.
- **Publishing:** Forbidden.
- **Tooling:** `powerbi-report-author` CLI v0.1.4; Power BI Desktop (Store build v24.13.1).
- **Model edit permissions:** Full — model is greenfield.
- **Accessibility:** WCAG AA on all text/background pairs; alt text on every visual.
- **Data caveats:** See "Data findings" below — two are material and were not known when
  the plan was written.

---

## Data findings that change the plan

These came out of profiling `charlotte-weather.json` (31,545 rows) before any modeling.
Three of them alter decisions the plan pre-supposed.

**1. `tavg` is far sparser than "nullable" implies — and the documented fallback fails.**
`tavg` is present on only **3,314 of 31,545 rows (10.5%)**, in exactly two disjoint bands:
1942–1943 and 1998–2005. `Agents.md` documents the fallback as `(tmax+tmin)/2`, which is
what `dashboard.html:339` does. But **1942 and 1943 are precisely the years where `tmax`
and `tmin` are null** — 730 rows with a `tavg` value and nothing else. So the fallback
cannot fill them, and the raw `tavg` cannot be dropped in favour of the fallback either.
The two sources are complementary, not redundant. Model decision: a **computed column**
`COALESCE(tavg, (tmax+tmin)/2)`, which is the only form that recovers all three cases.
This is also why it must be a column and not a measure — see step 2.

**2. 1942–43 are a genuine data hole for everything except `tavg`.** 730 rows have null
`tmax`/`tmin`/`prcp`/`snow`/`snwd`. Any yearly precipitation total for 1942–43 is a
**false zero**, not a dry year. The HTML silently coalesces `prcp || 0` and therefore
plots those two years as near-zero precipitation. I will *not* reproduce that bug: blank
should stay blank so the line breaks rather than dives. Flagged because it is a visible
difference from the reference design.

**3. 2026 is a partial year (134 rows, ends 2026-05-14).** Any "by year" visual will show
a truncated 2026. The HTML has the same issue. I'll mark it rather than hide it.

**Validation targets.** I computed these from the source so step 2's DAX can be checked
against known-good numbers rather than eyeballed:

| Quantity | Value |
|---|---|
| 1991–2020 normal, annual total | **43.57 in** |
| Last 12 months actual (2025-06 → 2026-05) | **28.71 in** |
| Deficit | **14.86 in** |
| % of normal | **66%** → Severe Drought (D2) |

---

## Narrative

- **Core story:** Charlotte's climate record is long enough to show both a warming signal
  and a precipitation record that is currently well below its own modern baseline.
- **Audience promise:** Any question about Charlotte weather since 1940 is two clicks away.
- **Key questions answered:** How has temperature shifted vs. the 1940–1980 baseline?
  What does a normal year of precipitation look like, and how far off is now? Which days
  were the extremes?

---

## Revised brief (user direction, supersedes the literal-port framing below)

The user redirected after step 2: this is no longer a port that documents its losses. Where
something does not translate, **replace it with the best Power BI answer**, and where Power
BI can do better than the HTML, do that instead. Decisions taken:

| Item | Decision |
|---|---|
| Drought gauge | **Banded trend chart.** Verified `y1AxisReferenceLine` supports multiple independently-colored shaded zones, so the full D0-D4 classification renders as background bands behind a rolling % of normal series. Strictly more information than the SVG gauge: current severity *and* how it got there *and* how it ranks against past droughts. |
| PBI-only capabilities | **All four.** Decomposition tree, anomaly detection + forecast, key influencers, drill-through to daily detail. |
| Trends map | **Replaced by a calendar heatmap.** A one-point map is decorative; an 86-year Year x Month grid is the densest visual in the report. |
| Filters | **My call** (user delegated). See "Filter design" below. |

### Correction found while verifying the heatmap

`heatMap` in the catalog is a **geospatial** visual - its roles are Location / Latitude /
Longitude / Bubble size, and it is a Bing/Azure map variant. It is the wrong visual for a
Year x Month grid and would carry the same tenant map risk the heatmap was chosen to avoid.

The correct visual is **`matrix`** with `values.backColor` conditional formatting, which the
formatting catalog documents as "Format cells with color based on their value." Decade/Year
on Rows, Month on Columns, measure on Values. No map dependency. This is what I will build.

### Filter design

The HTML's 10 cascading filters exist because vanilla JS has no filter pane - every control
had to be hand-built and always visible. Power BI has a Filter pane, cross-filtering, and
slicer sync, so reproducing all 10 as slicers would spend canvas on controls the platform
already provides better. Design:

- **Synced slicer rail (all pages except Drought):** Year (`between`), Season (tile),
  Decade (tile), Climatological Period (dropdown). These four are the ones that change what
  question the page answers.
- **Filter pane:** Precipitation Type, Precipitation Band, Day Type, Month. Available on
  demand, zero canvas cost.
- **Cross-filtering replaces the cascade.** Clicking Summer on the season donut filters
  every other visual - the affordance the HTML's graying-out was approximating.
- **Dropped:** the Extreme Events toggle (its meaning changes in Power BI, as documented
  below) and the Temperature Range slider (little analytical value at daily grain, and the
  scatter plot already exposes the distribution directly).
- **Drought page carries no slicers at all**, per the isolation decision.

## Translation judgments (the part the plan asked for)

### The 10 sidebar filters

The HTML sidebar cascades: selecting Summer greys out non-summer months. **Power BI slicers
do not cascade this way.** Slicers filter each other only through the model, and the cascade
the HTML implements is a *validity* constraint, not a data relationship. What Power BI does
instead is more honest — an unrelated slicer selection yields an empty visual rather than a
greyed control — but it is not the same interaction.

| # | HTML filter | Power BI treatment | Judgment |
|---|---|---|---|
| 1 | Year Range (dual slider) | **Slicer**, `Date[Year]`, `between` | Direct equivalent. Numeric-range slicer, not date-range — the underlying grain is annual for most visuals. |
| 2 | Season (pills) | **Slicer**, `Date[Season]`, tile | Direct. Real dimension column. |
| 3 | Month (checkboxes, cascading) | **Slicer**, `Date[MonthName]`, dropdown | **Cascade is lost.** Month will list all 12 regardless of Season. Cross-filtering between slicers gets ~80% of the intent: selecting Summer *does* restrict which months return data. The greying-out does not survive. |
| 4 | Decade (pills) | **Slicer**, `Date[Decade]`, tile | Direct. |
| 5 | Temperature Range (dual slider on tmax) | **Slicer**, `Observation[TMax]`, `between` | Direct, but slicing a *fact* column. Works; high cardinality is fine at 140-odd distinct values. |
| 6 | Precipitation Type (All/Rain/Snow/Mixed) | **Slicer** on a computed column `Observation[PrecipType]` | Direct once modeled. Must be a column — a measure cannot slice. |
| 7 | Precipitation Amount (None/Light/Moderate/Heavy) | **Slicer** on computed column `Observation[PrecipBand]` | Direct once modeled. Banding thresholds carried from the HTML. |
| 8 | Extreme Events Only (toggle) | **Computed column** `Observation[IsExtreme]` + slicer | **Meaning changes.** The HTML recomputes the top/bottom 5% *within the current filter selection*. A computed column fixes the threshold against the whole record. A filter-responsive version needs a measure, and a measure cannot drive a slicer. I'm taking the fixed-threshold version and stating the difference — it is defensible (a 1948 heat extreme stays an extreme) but it is not identical. |
| 9 | Day of Week (All/Weekday/Weekend) | **Slicer**, `Date[DayType]` | Direct. Genuine date-dimension attribute. |
| 10 | Climatological Period | **Slicer**, `Date[ClimatePeriod]` | Direct, with one caveat: the HTML's four options overlap (Post-1980 ⊃ Last 30 Years). A single-select slicer column reproduces this only if modeled as a column with those exact four values, which forces mutual exclusivity. Modeling as **three independent boolean columns** would be more faithful but adds three slicers. **Recommendation: single column, single-select**, matching the HTML's radio-button behavior. |

**Net:** 9 of 10 translate. Filter 3 loses its cascade affordance; filter 8 changes meaning
in a way worth stating out loud. Nothing else is lost.

### The three problem visuals

| HTML visual | Power BI | Verdict |
|---|---|---|
| D3 donut (precip by season) | `donutChart` | **Clean.** Catalog-confirmed: `Category` + `Y` roles are exactly what this needs. |
| Plotly treemap (avg precip by month) | `treemap` | **Clean.** `Group` + `Values` confirmed. |
| SVG drought gauge, D0–D4 bands | `gauge` | **Does not translate.** See below. |

**The gauge is the one genuine casualty.** I checked the catalog entry rather than assuming:
`gauge` exposes exactly four data roles — `Y`, `MinValue`, `MaxValue`, `TargetValue` — and
its formatting objects are `axis`, `calloutValue`, `dataPoint`, `general`, `labels`,
`target`. **There is no role or formatting object for classification bands.** The NOAA
D0–D4 scale is five labelled ranges with distinct colors; a native gauge can show the
needle and *one* target line, not five bands.

Three options, and I recommend the third:

1. Native `gauge` with `TargetValue` = 100% of normal. Honest, but throws away the D0–D4
   classification, which is the entire point of the visual.
2. A custom visual. Out of scope — the plan forbids anything but local files, and custom
   visuals add a dependency that must be distributed with the PBIP.
3. **A composite treatment: `gauge` for the needle + a dynamic DAX measure driving a
   textbox/card that names the current band ("Severe Drought (D2)") with band-colored
   conditional formatting.** This preserves both the magnitude *and* the classification,
   which is what the SVG communicated. It looks different from the original. It means the
   same thing.

I'm going with option 3 and calling it out rather than shipping a bandless gauge that
looks close and says less.

### The Drought page ignoring all filters

Achievable, and I recommend the page-isolation route.

The plan lists two options. `REMOVEFILTERS()` on every measure is more faithful but has a
failure mode: it must be applied to *every* measure on the page, and any measure added
later without it silently breaks the guarantee. It also makes those measures unusable
elsewhere, so the Drought measures fork from the rest of the model.

**Recommendation: put no shared slicers on the Drought page, and additionally wrap the
drought measures in `CALCULATE(..., ALL(Date))`.** Belt and braces. The page has no slicer
to propagate from, and the measures are immune even if one is later reused on a filtered
page. Cost is that the drought measures are a separate family in the model — which is
correct, because they *are* semantically different: they are defined against fixed windows,
not against user selection.

Note that cross-highlighting between visuals *within* the Drought page will also be
suppressed by `ALL(Date)`. That matches the HTML, where the drought tab is non-interactive.

### The map

The plan flags maps as tenant-blocked. Refining that: `map` and `filledMap` are
**deprecated in the authoring catalog** (superseded by `azureMap`), which is a separate
issue from the tenant policy. `azureMap` is present, not deprecated, and accepts explicit
`X`/`Y` latitude/longitude overrides — so a single Charlotte station marker **is
authorable**. Whether it *renders* depends on tenant map policy, which I cannot verify
without a tenant connection and which the local-only constraint forbids me from testing.

**Plan: author it with `azureMap`, and if it renders blank in Desktop, replace it with a
station-metadata card.** A one-point map is decorative rather than analytical — it conveys
"this is where the data came from," which a card conveys equally well. This is the lowest
-risk item on the list despite the plan ranking it as risk #4.

### What each tool does better

**Power BI wins:** cross-filtering across all visuals for free (the HTML wires each filter
by hand); drill-through to daily detail from any aggregate; the matrix visual is
substantially better than the HTML's hand-rolled paginated table; field-level formatting is
consistent instead of per-chart; and the model's measures are reusable across pages, where
the HTML recomputes normals independently in the Drought tab.

**HTML wins:** the cascading filter affordance; bespoke layout (the KPI cards and alert
banner are pixel-designed in a way Power BI's grid resists); the SVG gauge with its D0–D4
bands; smooth custom transitions; and free-form annotation. The drought alert banner with
inline colored numbers is achievable in Power BI only as a DAX string measure in a textbox,
which loses the per-number coloring.

---

## Design identity

- **Tone:** *Instrument Panel* — dark surface, high-chroma data ink, restrained chrome.
  Carried directly from `dashboard.html` so the two versions read as one system.
- **Signature:** Cyan-to-rose diverging accent applied consistently by meaning — cyan is
  always "normal / wet / cool", rose is always "deficit / dry / hot". Every page reuses it.
- **Palette** (lifted from the HTML's `COLORS`): background `#0f172a`, panel `#1e293b`,
  cyan `#22d3ee`, amber `#f59e0b`, rose `#f43f5e`, muted `#94a3b8`.

## Page plan (revised)

1. **Charlotte's Climate Since 1940** — Executive Summary — KPI strip, anomaly line
   **with native anomaly detection enabled**, monthly temp area, monthly precip stacked
   bar, season donut.
2. **Temperature Range and Extremes** — Analytical Canvas — yearly high/low/mean lines,
   monthly bars, tmax-vs-tmin scatter colored by season, top-10 extremes table.
3. **Precipitation Rhythm and Volume** — Analytical Canvas — rolling 12-month area
   **with forecast + confidence band**, decade stacked bars, year bubble scatter,
   month treemap, **key influencers** on what drives heavy-precipitation days.
4. **Eighty-Six Years at a Glance** — Comparative Benchmark — **calendar heatmap matrix**
   (Year x Month, color-scaled), **decomposition tree** (Total Precipitation by
   Decade → Season → Month → Precipitation Type), season x decade summary.
5. **The Current Precipitation Deficit** — Narrative Story — alert textbox driven by the
   `Drought Summary` measure, 4 KPI cards, **banded D0–D4 trend chart**, actual-vs-normal
   bars, cumulative area, 10-driest table. **No slicers on this page.**
6. **Daily Records** — drill-through target, hidden from navigation. Filtered daily detail
   reachable by right-click from any aggregate on pages 1–4.

## Model requirements — BUILT AND VALIDATED

Built as `powerbi/CharlotteWeather.SemanticModel`. Import mode, star schema, 2 tables,
27 measures, 0 measure errors.

- **`Date`** — 31,777 rows, 1940-01-01 → 2026-12-31, contiguous, `dataCategory: Time`,
  marked as the date table. Carries Year, Month (sorted), Quarter, Decade (sorted), Season
  (sorted), Day Name/Type, Climatological Period, plus two hidden baseline flags.
- **`Observation`** — 31,545 rows, daily grain, single `Many→One` relationship to `Date`.
- **Derived in Power Query, not DAX** — `Mean Temperature`, `Precipitation Type`,
  `Precipitation Band`. Pushed upstream per the modeling guidelines; DAX calculated columns
  would cost refresh time for no benefit.

**Which were genuinely hard in DAX** — revised after building, since two of my three
predictions were wrong:

1. **Dry-streak length — hard, as predicted, but not for the predicted reason.** The
   date-minus-rank grouping worked first try and matched ground truth exactly (2007: 20,
   2024: 23, 2025: 19). The real difficulty was a **DAX semantics trap**: `[Precipitation]
   < 0.01` evaluates TRUE for BLANK, so the unmeasured 1942–43 gap initially reported as a
   **365-day drought**. Fixed with an explicit `NOT ISBLANK` guard. This is the kind of bug
   that renders as a plausible-looking chart and is wrong.
2. **The normals were harder than expected.** I predicted "routine". The first version
   returned **43,631 inches** instead of 43.57 — `REMOVEFILTERS('Date')` inside
   `ADDCOLUMNS` destroys the row context being iterated, so every month got the grand
   total. Removing it fixed the aggregation.
3. **Window boundaries needed care.** `EDATE(anchor, -12) + 1` gave 28.71 → wrong start
   (2025-05-15). The HTML uses twelve *calendar* months, so `EOMONTH(anchor, -12) + 1` is
   correct.
4. **Genuinely routine:** anomaly baseline, deficit, % of normal, rolling 12-month.
5. **Not built:** the 10-driest-12-month-periods table. Deferred to step 3 — it is a report
   -level top-N over ~1,030 overlapping windows and is better expressed once the page it
   feeds exists.

### Validation results

Every number below was computed independently from the raw JSON first, then checked
against the model. All match.

| Check | Expected | Model | Status |
|---|---|---|---|
| Observation rows | 31,545 | 31,545 | pass |
| Precipitation readings | 30,815 | 30,815 | pass |
| Mean Temperature coverage | 31,545 | 31,545 | pass — COALESCE recovers 1942–43 |
| Normal annual precipitation | 43.57" | 43.5719" | pass |
| Trailing 12-month actual | 28.71" | 28.71" | pass |
| Deficit | 14.86" | 14.8619" | pass |
| % of normal | 66% | 65.9% | pass |
| Drought classification | Severe (D2) | Severe Drought (D2) | pass |
| Longest dry streak 2007 / 2024 / 2025 | 20 / 23 / 19 | 20 / 23 / 19 | pass |
| 1942–43 precipitation | blank, not 0 | blank | pass |
| Measure errors | 0 | 0 | pass |

## Implementation notes

- **Model changes:** greenfield; all model work happens in step 2.
- **PBIR/report authoring:** step 3, after approval.
- **Validation:** `powerbi-report-author validate` after each page; DAX checked against the
  four validation targets above.
- **Publishing boundary:** none. Local files only.
- **Risks:** dry-streak DAX (mitigated by validating against the known value);
  `azureMap` render (mitigated by the card fallback).

## Canonical design contract

Implemented directly in `powerbi/build/build.js`, which is the executable form of the
layout contract: FHD 1920x1080, 32px margin, 24px gutter, 8px snap, a 232px synced slicer
rail on pages 1-4, and a 96px title band on every page. Regenerating is one command.

---

# BUILD COMPLETE

Six pages, 91 visuals, `powerbi-report-author validate` reports **0 errors, 0 warnings**,
and all six pages screenshot-verified in Power BI Desktop with data loaded.

## What Desktop verification caught that validation did not

PBIR validation passed clean while the report still had ten real defects. Each was found
by looking at rendered screenshots, and each is worth recording because validation cannot
detect any of them.

| # | Defect | Why validation missed it | Fix |
|---|---|---|---|
| 1 | Every visual blank | Model was unprocessed after a fresh PBIP open | Refresh Date -> Observation -> Rolling Window in dependency order |
| 2 | **Scale mismatch in Monthly Actual vs Normal** | "Actual" summed all 86 Januaries (304") against a single-month normal (3.48"), so the normal bars were invisible slivers | New `Recent Month Precipitation` measure scoped to the trailing 12-month window |
| 3 | D4 band flooded the drought chart | Reference-line shading is cumulative "before", so the lowest band paints the largest area | Draw top-down, tune per-band transparency, floor the axis at 40% |
| 4 | 2026 plotted as a dramatic cliff | 134 days of a partial year on a per-year axis | Visual-level filter to complete years on the two yearly trend charts |
| 5 | Meaningless "Total" rows | `tableEx` sums every numeric column by default — including ranks, temperatures and percentages | `total.totals = false` on all three tables |
| 6 | Treemap ignored the theme | Categorical palette applied to a magnitude measure | Single-hue cyan gradient via `FillRule` |
| 7 | Key Influencers offered "No Reading" as a class | The 1942-43 gap is a real column value | Visual-level filter excluding it |
| 8 | Tile slicer captions clipped ("Spr", "194…") | Tiles shrink-wrap without an explicit `columnCount` | `layout.columnCount` + heights sized to the tile-row formula |
| 9 | Tile captions rendered **blank** | Styling `label`/`value` with an `{id}` selector validates cleanly but silently blanks the text | Removed; tile text inherits from theme structural colours |
| 10 | Stacked bars hid the comparison series | Stacked is wrong for actual-vs-target | `clusteredColumnChart` |

Defect #2 is the important one: it was a wrong *answer*, not a wrong *pixel*. The chart
rendered perfectly and compared two quantities that were never comparable.

## Model additions for the new visuals

| Object | Purpose |
|---|---|
| `Observation[Precipitation Day Class]` | Heavy / Normal Wet / Dry / No Reading — Key Influencers target. Heavy = 1.4", the 95th percentile of wet days |
| `Observation[Temperature Band]` | Six readable bands — explanatory factor and decomposition level |
| `Rolling Window` (calculated table) | One row per 12-month window with complete daily coverage. 989 rows |
| `[Recent Month Precipitation]` | Trailing-window monthly actuals (fixes defect #2) |
| `[Rolling 12 Month Percent Of Normal]`, `[Driest 12 Month Period Rank]`, `[Complete Window Count]`, `[Drought Rank Statement]`, `[Heavy Precipitation Days]`, `[Heavy Precipitation Day Rate]`, `[Record Span]`, `[Selected Period Label]` | Banded chart series, historical ranking, dynamic subtitles |

### The 3,400x speedup

`Driest 12 Month Period Rank` first iterated every 12-month window at query time: **41.6
seconds**, and wrong — windows overlapping the 1942-43 gap and the empty 2026 tail ranked
as "driest" when they were merely unmeasured. Requiring complete daily coverage fixed the
correctness bug; moving the computation into a calculated table evaluated at refresh took
it to **12 ms**.

Correct answer: the current window ranks **22nd driest of 989** — drier than 98% of the
record. The first, broken version reported rank 1.

## Final validation

| Check | Expected | Rendered |
|---|---|---|
| Avg high / low | 71.5°F / 50.2°F | 71.5°F / 50.2°F |
| Record high / low | 104°F / −5°F | 104°F / −5°F |
| Trailing 12-month | 28.71" | 28.71" |
| Normal annual | 43.57" | 43.57" |
| Deficit / % of normal | 14.86" / 66% | 14.86" / 66% |
| Classification | Severe Drought (D2) | Severe Drought (D2) |
| Driest window | 1985-12 → 1986-11, 24.67" | matches |
| Drought rank | 22 of 989 | 22 |
| PBIR validation | 0 errors | 0 errors, 0 warnings |

## Regenerating

```bash
node powerbi/build/build.js                                   # rewrite all pages
powerbi-report-author validate powerbi/CharlotteWeather.Report # verify
```

The generator is deterministic — page and visual IDs are SHA-derived from stable seeds, so
re-running produces an empty diff unless the design actually changed.

---

# REVISION 2 — usability pass

Six changes requested after reviewing the built report.

| # | Request | Implementation |
|---|---|---|
| 1 | Year slicer accepts any typed value | `data.numericStart` / `numericEnd` clamp the Between slicer to 1940–2026 |
| 2 | Season slicer clipped + 2 empty boxes | `layout.columnCount` **and** `rowCount` pinned to 2×2. Pinning columns alone left the grid reserving a spare row, which rendered as phantom tiles |
| 3 | No page navigation | Nav strip on every page, active page highlighted cyan |
| 4 | KPI cards bland | Split the multi-value card into six single-value cards, each with a coloured left `accentBar` and matching value text. Semantic colour: rose = heat, cyan = cold, blue = water, violet = snow. Drought KPIs follow the same logic (amber = actual, cyan = normal, rose = deficit) |
| 5 | Key Influencers cramped | Page canvas 1080 → **1400px**; visual 272 → **500px**. Bubble chart matched at 500px |
| 6 | Decomposition tree weak | AI splits on (`analysis.aiEnabled`, `aiMode: relative`), 400 → **560px**, 5 → **6** drill dimensions, full dark-theme styling |

All page canvases went 1080 → **1200px** (Precipitation 1400, Patterns 1280) because
the new nav strip pushed the header band from 96px to 152px.

## Nav menu: why not `pageNavigator`

The obvious choice is the built-in `pageNavigator` — no data roles, auto-discovers pages.
It rendered as an **empty strip** through four attempts (adding `showByDefault`, removing
`shape`, dropping `columnCount`, simplifying selectors), validating clean every time.

Replaced with explicit `actionButton` visuals, one per page, each carrying a
`visualLink` of type `PageNavigation` targeting a known page id. Deterministic and
inspectable, at the cost of the nav not auto-updating when a page is added — `NAV_PAGES`
in `build.js` is the list to edit.

**The buttons' own captions also render blank.** `actionButton.text` accepts `text`,
`fontColor` and `show`, validates clean, and displays nothing. The caption is therefore a
textbox laid *over* each button at a higher z-order (textboxes are click-transparent, so
the button underneath still receives the navigation click). An earlier attempt placed the
label below the button and it vanished behind the opaque fill.

This is the third instance of the same class of defect in this build: **a formatting
object that validates cleanly and silently renders nothing** — the tile slicer's
`label`/`value`, `pageNavigator` wholesale, and now `actionButton.text`. Screenshot
verification is the only thing that catches them.

## The decomposition tree cannot be pre-expanded

Asked to default the tree to an expanded view. It is not authorable. Establishing that
took a Desktop crash and two wrong diagnoses, so the findings are recorded here.

**What crashes:** `analysis.aiEnabled = true` **combined with** a hand-authored
`expansionStates` block.

```
ExpansionState.getAILevelInformation
TypeError: Cannot read properties of undefined (reading 'AIInformation')
```

With AI splits on, Desktop walks each expansion level looking for an `AIInformation`
member that only its own runtime creates. A PBIR-authored level does not have one, the
lookup throws, and the whole page fails to render.

**Two wrong turns worth recording:**

1. First blamed `expansionStates` alone and removed it. The page still crashed, because
   `aiEnabled` was still set — and Desktop's `VisualContainerPersistProperties` had
   written its own state back into the file.
2. Then blamed `aiEnabled` alone and disabled it. That fixed the crash but removed a
   working feature: Desktop itself re-enables `aiEnabled` and runs fine with it, so
   long as no authored `expansionStates` is present.

**Final state:** `aiEnabled: true`, `aiMode: relative`, no `expansionStates`.

**Why a default expansion is impossible:** every `decompositionTreeVisual` on this
machine — including ones Desktop authored — was checked. **None persists an expansion
path.** Desktop holds the drill state in the session and writes nothing to the file, so
the tree always opens collapsed no matter who authored it. Forcing it open by hand hits
the crash above.

The lever that does exist is **`ExplainBy` field order**, which decides what the first
click offers. It is ordered Period → Season → Intensity → Decade → Month → Day Class.

## Known limitations

- **Reload resets the model to unprocessed.** `powerbi-desktop reload` re-applies the TMDL,
  which drops loaded data. Refresh the three tables afterwards or visuals render blank.
  Not a report defect; it is how Desktop handles TMDL reloads.
- **Forecast is enabled but not visibly projecting.** The `forecast` formatting object has
  no `forecastLength` property — the horizon is set through the analytics pane, not PBIR.
  Documented rather than faked.
- **Anomaly markers are configured but sparse.** Detection is on; the series simply has few
  points the algorithm flags at the default sensitivity, which is not PBIR-settable either.
- **No map.** Replaced by the calendar heat grid, per the user's direction. The single
  station marker was decorative; the 86-year grid is the densest visual in the report.
