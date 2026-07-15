# Charlotte Weather Dashboard — Project Overview

## Purpose

This project is a historical weather data dashboard for Charlotte, NC. It was built to demonstrate the power of a modern JavaScript visualization stack using real climatological data sourced directly from NOAA. The goal is a professional, interactive, dark-themed dashboard that makes 85+ years of weather history explorable and meaningful.

---

## Data Source

**NOAA Climate Data Online (CDO)** — https://www.ncdc.noaa.gov/cdo-web/

Data was fetched via the NOAA CDO REST API (v2) from **Charlotte Douglas Airport**, station ID `GHCND:USW00013881`. The dataset covers **1940–2026** and contains **31,545 daily records** stored in `charlotte-weather.json` (~4MB).

Fields in the dataset:

| Field  | Description                  | Unit    |
|--------|------------------------------|---------|
| `date` | ISO date string (YYYY-MM-DD) |         |
| `tmax` | Daily high temperature       | °F      |
| `tmin` | Daily low temperature        | °F      |
| `tavg` | Daily mean (computed when null as `(tmax+tmin)/2`) | °F |
| `prcp` | Precipitation                | inches  |
| `snow` | Snowfall                     | inches  |
| `snwd` | Snow depth                   | inches  |

The API token is stored in `.env` as `NOAA_API_TOKEN`. The fetch script is `fetch-noaa.js` — it paginates automatically (1,000 records/request) and loops year-by-year, respecting NOAA's ~5 req/sec rate limit.

Climatological normals (1991–2020 baseline) are computed in-browser from the raw data and used in the Drought tab for deficit analysis.

---

## Files

| File                     | Purpose                                                      |
|--------------------------|--------------------------------------------------------------|
| `dashboard.html`         | Main dashboard — single self-contained HTML file             |
| `charlotte-weather.json` | Raw NOAA daily weather records (1940–2026)                   |
| `fetch-noaa.js`          | Node.js script that fetches and saves the NOAA data          |
| `.env`                   | API credentials (not committed)                              |
| `notes.md`               | Research notes on all libraries and data sources used        |

---

## Tech Stack

All libraries are loaded via CDN — no build tools or npm required to run the dashboard.

| Library | Role | CDN |
|---------|------|-----|
| **React 18** | UI component tree, state, memoization | unpkg |
| **Recharts** | Bar, line, area, scatter, stacked bar, bubble charts | unpkg |
| **Plotly.js** | Treemap, interactive map | cdn.plot.ly |
| **D3.js** | Donut chart, color scales | d3js.org |
| **Tailwind CSS** | Layout, spacing, utility styling | cdn.tailwindcss.com |
| **Babel Standalone** | In-browser JSX transpilation | unpkg |

See `notes.md` for full descriptions of each library and additional tools (shadcn/ui, TanStack Table/Query, Zustand, date-fns, Vite) recommended for a production version of this project.

---

## Dashboard Structure

The dashboard is organized into 5 tabs:

### Overview
- 4 KPI cards: Avg High Temp, Total Annual Precip, Snow Days/Year, Record High
- Climate anomaly line chart (yearly avg vs. 1940–1980 baseline)
- Monthly average temperature area chart
- Monthly precipitation stacked bar chart (rain vs. snow)
- D3 donut chart: precipitation by season

### Temperature
- Yearly avg high/low/mean line chart (1940–2026)
- Average temperature by month bar chart
- Daily tmax vs. tmin scatter plot, colored by season
- Top 10 hottest and coldest days table

### Precipitation
- Rolling 12-month precipitation area chart
- Monthly precipitation by decade stacked bar chart
- Bubble chart: each year as a bubble (x=avg temp, y=total precip, size=snow days)
- Plotly treemap: avg precipitation by month of year

### Trends
- Season × decade breakdown table
- Paginated tabular view with Day / Month / Quarter / Year toggle
- Plotly OpenStreetMap with Charlotte station marker

### Drought
- Alert banner with plain-language severity summary
- 4 KPI cards: deficit, % of normal, dry streak, current 12-mo total
- SVG gauge meter showing % of normal with NOAA drought classification (D0–D4)
- Monthly actual vs. normal bar chart (last 12 months)
- Cumulative precipitation vs. normal area chart
- Rolling 12-month precipitation line chart (2020–present)
- Historical table of the 10 driest 12-month periods on record

---

## Filters

The collapsible left sidebar contains 10 cascading filters. Changing one filter updates all charts and constrains valid values in dependent filters.

1. **Year Range** — dual-handle slider (1940–2026)
2. **Season** — multi-select pills (Spring / Summer / Fall / Winter)
3. **Month** — checkboxes, grayed when outside selected seasons
4. **Decade** — multi-select pills (1940s–2020s)
5. **Temperature Range** — dual slider on daily high
6. **Precipitation Type** — All / Rain Only / Snow Only / Mixed
7. **Precipitation Amount** — None / Light / Moderate / Heavy
8. **Extreme Events Only** — toggle (top/bottom 5% of temp or precip)
9. **Day of Week** — All / Weekday / Weekend
10. **Climatological Period** — All / Pre-1980 / Post-1980 / Last 30 Years

> Note: the Drought tab bypasses the sidebar filters and always operates on the full unfiltered dataset, since drought analysis requires the complete historical record for accurate baseline computation.

---

## Running the Dashboard

The dashboard loads `charlotte-weather.json` via `fetch()`, so it must be served over HTTP — not opened directly as a `file://` URL.

```bash
# From the project directory:
npx serve .
# Then open: http://localhost:3000/dashboard.html
```

The server started during development is running on port 3000. To restart it:

```bash
cd c:\dev\dashboards
npx serve . --listen 3000
```

---

## Refreshing the Data

To pull fresh NOAA data (e.g., after several months have passed):

```bash
cd c:\dev\dashboards
node fetch-noaa.js
```

The script will re-fetch all years from 1940 to the current year and overwrite `charlotte-weather.json`. Expect it to take 5–10 minutes due to NOAA rate limits.
