# Plan: Power BI version of the Charlotte Weather Dashboard

> **Status:** not started. This is a live plan — delete it once the Power BI build is
> done and fold anything durable into [Agents.md](Agents.md).

Goal: rebuild the existing HTML dashboard as a Power BI report (PBIP project on disk),
using the `powerbi-authoring` plugin skills. The original was a 1-shot challenge between
Claude Code and Codex; this is deliberately **not** 1-shot, for reasons in "Why sequenced"
below.

---

## The prompt to use

Run this from `C:\dev\dashboards`:

```
Build a Power BI version of this project's Charlotte weather dashboard as a PBIP
project in a new `powerbi/` folder. Read Agents.md first — it documents the tab
structure, all 5 tabs' visuals, the 10 sidebar filters, and the data dictionary.
dashboard.html is the Claude build and codex-dashboard.html is the Codex build;
treat dashboard.html as the reference design.

Source data is charlotte-weather.json — 31,545 flat daily records (date, tmax,
tmin, tavg, prcp, snow, snwd) from NOAA station GHCND:USW00013881, 1940–2026.

Work in this order and stop for my approval after step 2:

1. Use powerbi-report-planning to produce a spec. I want your judgment on what
   changes in the translation, not a literal port. Specifically call out:
   - Which of the 10 cascading sidebar filters become slicers, which become
     report/page-level filters, and which have no good Power BI equivalent.
   - What replaces the D3 donut, the Plotly treemap, and the SVG drought gauge.
   - Whether the Drought tab's "bypasses all filters" behavior is achievable, and
     at what cost.
   - Anything in the HTML version that Power BI does better, and vice versa.

2. Design the semantic model before any visuals. The JSON is a flat daily fact
   table with no date dimension and a nullable tavg. I want a proper star schema:
   a real Date table marked as such, a Season/Decade/climatological-period
   dimension, and DAX measures for the derived values the HTML computes in
   JavaScript — 1991–2020 normals, precipitation deficit, % of normal, dry-streak
   length, rolling 12-month totals, and the 1940–1980 anomaly baseline. Use
   semantic-model-authoring. Tell me which of these are genuinely hard in DAX.

3. Then build the report with powerbi-report-authoring, and use
   powerbi-report-design for the dark theme so it reads as one system rather than
   default Power BI styling.

Constraints:
- Everything must be local PBIP/PBIR + TMDL on disk. Do not publish to Fabric,
  do not create workspace items, and do not use any tenant connection.
- Validate the PBIR after each page. If a visual type you want isn't in
  `powerbi-report-author catalog list`, tell me rather than substituting silently.
- Don't invent visualType strings. If you're unsure a type exists, check the
  catalog first.

Where a chart genuinely can't be reproduced, say so and explain why instead of
shipping an approximation that looks close but means something different.
```

---

## Why sequenced, not 1-shot

Power BI has a dependency the JS version does not: report visuals bind to a semantic
model. If the model is wrong, every visual gets rebuilt. The skills are layered to match
(`powerbi-report-planning` → `powerbi-report-design` → `powerbi-report-authoring`), and
jumping straight to authoring is the reliable way to produce a report you have to redo.

The approval gate sits after step 2 because that is the last cheap moment to change course.

---

## The hard part is the semantic model, not the visuals

The HTML computes derived values in JavaScript at render time. Power BI needs them as DAX
measures over a star schema. This is where the project actually succeeds or fails.

| HTML computes in JS | Power BI needs |
|---|---|
| 1991–2020 climatological normals | Measure over a filtered date window, reusable across tabs |
| Precipitation deficit, % of normal | Ratio measures against the normals baseline |
| Dry-streak length | Hardest of the set — consecutive-day-run logic in DAX |
| Rolling 12-month precipitation | `DATESINPERIOD` / `DATEADD` over a marked Date table |
| 1940–1980 anomaly baseline | Second independent baseline window |
| `tavg` fallback `(tmax+tmin)/2` | Computed column or a coalescing measure |

Structural work the flat JSON does not provide:

- **A real Date table**, marked as a date table. 31,545 daily rows with a `date` string is
  a fact table with no dimension.
- **Season / Decade / climatological-period dimensions.** The sidebar filters on all three;
  they need to be modeled, not derived per visual.
- **Nullable `tavg`.** Present in the raw data and already handled in JS — decide whether
  it is a computed column or a measure, and be consistent.

---

## Known translation risks

Ordered by how likely they are to force a design change.

**1. The 10 cascading filters.** The sidebar cascades — Month grays out when outside the
selected Seasons. Power BI slicers do not natively cascade that way. Expect a mix of
slicers, page-level filters, and at least one behavior that simply does not survive.

**2. The Drought tab ignores all filters** (documented in Agents.md, because drought needs
the complete record for baselines). That fights Power BI's filter propagation model
directly. Options are a separate page with no shared slicers, or measures wrapped in
`ALL()`/`REMOVEFILTERS()` — the latter is more faithful but has to be applied consistently
to every measure on the page.

**3. Three visuals have no direct equivalent:**
   - D3 donut → native donut chart exists, should be fine
   - Plotly treemap → native treemap exists, should be fine
   - SVG drought gauge with NOAA D0–D4 bands → native gauge exists but will not do
     classification bands without work; may need conditional formatting or a custom visual

**4. Maps are blocked by tenant policy, not by code.** Confirmed during the NeonScribe
Power BI visual audit: `map` and `filledMap` are disabled at the tenant level, not by a
local toggle. The Trends tab's Plotly OpenStreetMap station marker may be unbuildable in
this tenant regardless of how the report is authored. Worth testing early rather than at
the end.

---

## Guardrails carried over from the NeonScribe work

Both of these are things that audit found the hard way. See
`c:\dev\neon-scribe\docs\POWER-BI-VISUAL-COVERAGE.md` for the full reference.

**Never invent a `visualType` string.** The NeonScribe audit (ROADMAP #16) found **eight
invented type strings** in that parser that no sample had ever exercised —
`stackedBarChart`, `stackedColumnChart`, `funnelChart`, `kpiVisual`, `rVisual`,
`decompositionTree`, `smartNarrativeVisual`, `anomalyDetection`. All were plausible
camelCase guesses. Plain `barChart` / `columnChart` **are** the stacked forms. The
authoritative list is `powerbi-report-author catalog list` (57 native types); a ribbon
label is not a type string.

**Validate PBIR as you go**, not at the end. A wrong type string renders as nothing, and
finding that after five pages is expensive.

---

## Local-only constraint

Several skills in this plugin set reach Fabric by default, and `powerbi-report-management`
publishes. This project wants files on disk that can be diffed and iterated on, so the
prompt forbids publishing, workspace items, and tenant connections.

If a Fabric round-trip is ever wanted, that is a separate, deliberate step — not something
to let happen as a side effect of authoring.

---

## Follow-up worth doing after the first build

`codex-dashboard.html` is a second interpretation of the same brief. Once the Power BI
version exists, comparing the three is a genuinely interesting question: which choices
translate to Power BI, which were JS-specific flourishes, and where the BI tool is simply
better (cross-filtering, drill-through) or worse (bespoke layout, custom interactions).

Deliberately kept out of the initial prompt so the first build has one clear reference.
