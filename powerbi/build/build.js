'use strict';
/**
 * Generates the Charlotte Weather PBIR report definition.
 *
 * Run:  node powerbi/build/build.js
 *
 * Rewrites definition/pages/** from scratch each run. report.json,
 * version.json, definition.pbir, .platform and the theme are NOT touched.
 */

const fs = require('fs');
const path = require('path');
const L = require('./lib');
const { C, AGG } = L;

const REPORT = path.resolve(__dirname, '..', 'CharlotteWeather.Report');
const PAGES_DIR = path.join(REPORT, 'definition', 'pages');

const OBS = 'Observation';
const DATE = 'Date';
const WIN = 'Rolling Window';

/**
 * 2026 holds only 134 days (record ends 2026-05-14), so on a per-year axis it
 * renders as a dramatic cliff that reads as a real climate signal. Exclude it
 * from yearly trend visuals; the full record still drives every aggregate.
 */
function excludePartialYear(seed) {
  return {
    name: L.filterId(seed),
    field: L.col(DATE, 'Year'),
    type: 'Advanced',
    howCreated: 'User',
    // Hidden from the consumer filter pane: this is an authoring decision
    // (2026 is a partial year), not something a viewer should toggle. Without
    // this it shows up in the published report as "Year is less than or equal
    // to 2025" — confusing, and it does not appear in Desktop's editing view.
    isHiddenInViewMode: true,
    filter: {
      Version: 2,
      From: [{ Name: 'd', Entity: DATE, Type: 0 }],
      Where: [
        {
          Condition: {
            Comparison: {
              ComparisonKind: 4,
              Left: { Column: { Expression: { SourceRef: { Source: 'd' } }, Property: 'Year' } },
              Right: { Literal: { Value: '2025L' } },
            },
          },
        },
      ],
    },
  };
}

// Canvas: FHD. margin 32, gutter 24, snap 8.
const M = 32;
const W = 1920;
const NAV_H = 36;             // nav button height
// Header band: title + subtitle on the left, nav buttons right-aligned on the
// same rows. Sitting the nav beside the title rather than above it saves ~56px
// of vertical space on every page.
const HEADER_H = 96;
const RAIL_W = 232;           // synced slicer rail
const BODY_X = M + RAIL_W + 24;
const BODY_W = W - BODY_X - M;

// Observed data bounds. The date slicer is clamped to these so its pickers
// cannot select a period outside the record. The record ends 2026-05-14.
const DATA_START = '1940-01-01';
const DATA_END = '2026-05-14';

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------
// Visible pages, in nav order. The hidden drill-through target is excluded.
const NAV_PAGES = [
  { key: 'overview', label: 'Overview' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'precipitation', label: 'Precipitation' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'drought', label: 'Drought' },
];

/**
 * One actionButton per page, with the current page styled as active.
 *
 * The caption lives on the button's own `text` object (unscoped — see
 * lib.js). An earlier version overlaid a textbox to supply the caption,
 * which left the middle of each button unclickable in the Power BI Service.
 */
const NAV_BW = 132;           // nav button width
const NAV_GAP = 8;
const NAV_TOTAL_W = NAV_PAGES.length * NAV_BW + (NAV_PAGES.length - 1) * NAV_GAP;

function navBar(page) {
  // Right-aligned in the header band, level with the page title.
  const startX = W - M - NAV_TOTAL_W;
  const navY = 26;
  const out = [];
  NAV_PAGES.forEach((n, i) => {
    const bx = startX + i * (NAV_BW + NAV_GAP);
    const active = n.key === page;
    out.push(
      L.makeNavButton({
        page, key: `nav_${n.key}`, x: bx, y: navY, w: NAV_BW, h: NAV_H, z: 90 + i,
        label: n.label, targetPageId: L.pageId(n.key), isActive: active,
      })
    );
  });
  return out;
}

function pageTitle(page, title, sub) {
  // Title column stops well short of the nav block. A 32px gap left the
  // textbox edge butting against the first button and rendering as a sliver;
  // 64px keeps them visually separate.
  const titleW = W - 2 * M - NAV_TOTAL_W - 64;
  /**
   * Textbox heights follow the skill's formula:
   *   max(18, ceil(fontSize * 25/16)) + padding_top + padding_bottom
   * Under-sizing makes Desktop render a scrollbar, which shows up as a white
   * bar down the right edge of the textbox.
   *   title at 20pt -> ceil(31.25) = 32, +8 slack = 40
   *   sub   at 10pt -> max(18, 16)  = 18, +8 slack = 26
   */
  return [
    ...navBar(page),
    L.makeTextbox({
      page, key: 'page_title', x: M, y: 16, w: titleW, h: 40, z: 100,
      runs: [{ text: title, size: 20, bold: true, color: C.textBright, family: 'Segoe UI Light' }],
    }),
    L.makeTextbox({
      page, key: 'page_sub', x: M, y: 58, w: titleW, h: 26, z: 101,
      runs: [{ text: sub, size: 10, color: C.muted }],
    }),
    L.makeShape({
      page, key: 'title_rule', x: M, y: HEADER_H - 8, w: W - 2 * M, h: 2, z: 99, fill: C.border,
    }),
  ];
}

/** The synced filter rail — identical on pages 1-4. */
function filterRail(page) {
  const x = M;
  let y = HEADER_H + 16;
  const out = [
    L.makeTextbox({
      page, key: 'rail_label', x, y: y - 4, w: RAIL_W, h: 20, z: 200,
      runs: [{ text: 'FILTERS', size: 9, bold: true, color: C.muted }],
    }),
  ];
  y += 24;

  // Real date range with draggable handles, bounded to the record so the
  // pickers cannot select a period with no data. Taller than a numeric
  // Between slicer because the slider bar sits below the two date boxes.
  out.push(L.makeSlicer({
    page, key: 'slicer_year', x, y, w: RAIL_W, h: 104, z: 201,
    entity: DATE, column: 'Date', header: 'Date Range', mode: 'Between',
    syncGroup: 'DateSync', dateMin: DATA_START, dateMax: DATA_END,
  }));
  y += 120;

  // 4 seasons, 2 columns x 2 rows exactly. rowCount is pinned so the grid does
  // not reserve a spare row (which rendered as 2 empty tiles).
  out.push(L.makeSlicer({
    page, key: 'slicer_season', x, y, w: RAIL_W, h: 152, z: 202,
    entity: DATE, column: 'Season', header: 'Season',
    type: 'advancedSlicerVisual', syncGroup: 'SeasonSync', columns: 2, rows: 2,
  }));
  y += 168;

  // 9 decades, 3 columns x 3 rows exactly.
  out.push(L.makeSlicer({
    page, key: 'slicer_decade', x, y, w: RAIL_W, h: 200, z: 203,
    entity: DATE, column: 'Decade', header: 'Decade',
    type: 'advancedSlicerVisual', syncGroup: 'DecadeSync', columns: 3, rows: 3,
  }));
  y += 216;

  out.push(L.makeSlicer({
    page, key: 'slicer_period', x, y, w: RAIL_W, h: 80, z: 204,
    entity: DATE, column: 'Climatological Period', header: 'Climatological Period',
    mode: 'Dropdown', syncGroup: 'PeriodSync',
  }));
  y += 96;

  out.push(L.makeSlicer({
    page, key: 'slicer_ptype', x, y, w: RAIL_W, h: 80, z: 205,
    entity: OBS, column: 'Precipitation Type', header: 'Precipitation Type',
    mode: 'Dropdown', syncGroup: 'PTypeSync',
  }));
  y += 96;

  // No context/summary panel. Several treatments were tried (single-value
  // cards, a multi-value card, a pivotTable with valuesOnRow) and none read
  // well in a 264px rail — the rail is for controls, not readouts. The filter
  // state is already legible from the slicers themselves.

  return out;
}

/**
 * KPI strip: one multi-value cardVisual, per the skill's consolidation rule.
 * Use when the tiles share styling.
 */
function kpiStrip(page, x, y, w, h, z, measures) {
  return L.makeVisual({
    page, key: 'kpi_strip', type: 'cardVisual', x, y, w, h, z,
    title: null,
    query: {
      queryState: {
        Data: { projections: measures.map((m) => L.pMeasure(m.entity || OBS, m.name, m.label)) },
      },
    },
    objects: {
      value: [{ properties: { fontSize: L.litNum(24), fontColor: L.solid(C.textBright) }, selector: { id: 'default' } }],
      label: [{ properties: { fontSize: L.litNum(10), fontColor: L.solid(C.muted) }, selector: { id: 'default' } }],
      cardCalloutArea: [
        {
          properties: {
            show: L.litBool(true),
            backgroundFillColor: L.solid(C.panel),
            backgroundTransparency: L.litNum(0),
            rectangleRoundedCurve: L.litInt(8),
          },
          selector: { id: 'default' },
        },
      ],
    },
  });
}

/**
 * Accented KPI row: one cardVisual per measure so each can carry its own
 * left accent bar and value colour. A multi-value card shares one accentBar
 * across all tiles, so per-KPI colour requires separate cards.
 */
function kpiRow(page, x, y, w, h, z, cards) {
  const gap = 16;
  const cw = Math.floor((w - gap * (cards.length - 1)) / cards.length);
  return cards.map((c, i) =>
    L.makeVisual({
      page, key: `kpi_${i}`, type: 'cardVisual',
      x: x + i * (cw + gap), y, w: cw, h, z: z + i,
      title: null,
      query: {
        queryState: { Data: { projections: [L.pMeasure(c.entity || OBS, c.name, c.label)] } },
      },
      objects: {
        value: [
          { properties: { fontSize: L.litNum(26), fontColor: L.solid(c.color) }, selector: { id: 'default' } },
        ],
        label: [
          { properties: { fontSize: L.litNum(10), fontColor: L.solid(C.muted) }, selector: { id: 'default' } },
        ],
        accentBar: L.accentBar(c.color, 5),
        fillCustom: [
          { properties: { fillColor: L.solid(C.panel), transparency: L.litNum(0) }, selector: { id: 'default' } },
        ],
      },
    })
  );
}

// ===========================================================================
// PAGE 1 — Overview
// ===========================================================================
function pageOverview() {
  const p = 'overview';
  const v = [].concat(
    pageTitle(p,
      'Charlotte Has Warmed 2.9°F Since the Mid-Century Baseline',
      'Daily observations from NOAA station GHCND:USW00013881 (Charlotte Douglas Airport) · 1940–2026 · 31,545 days'),
    filterRail(p)
  );

  const y0 = HEADER_H + 16;

  // Semantic colour: warm hues for heat, cool for cold, blue/violet for water.
  v.push(...kpiRow(p, BODY_X, y0, BODY_W, 128, 300, [
    { name: 'Average High Temperature', label: 'AVG HIGH', color: C.rose },
    { name: 'Average Low Temperature', label: 'AVG LOW', color: C.cyan },
    { name: 'Total Precipitation', label: 'TOTAL PRECIPITATION', color: C.blue },
    { name: 'Snow Days', label: 'SNOW DAYS', color: C.violet },
    { name: 'Record High', label: 'RECORD HIGH', color: C.orange },
    { name: 'Record Low', label: 'RECORD LOW', color: C.green },
  ]));

  // Anomaly line with native anomaly detection.
  v.push(L.makeVisual({
    page: p, key: 'anomaly_line', type: 'lineChart',
    x: BODY_X, y: y0 + 152, w: BODY_W, h: 340, z: 301,
    title: 'Yearly Temperature Anomaly vs. the 1940–1980 Baseline',
    subtitle: 'Anomaly detection is on — flagged points are statistically unusual years, with explanations on hover. 2026 excluded: only 134 days on record.',
    filters: [excludePartialYear('overview:anomaly:no-2026')],
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Year')] },
        Y: { projections: [L.pMeasure(OBS, 'Temperature Anomaly', 'Anomaly (°F)')] },
      },
    },
    objects: {
      dataPoint: L.solidSeries(C.amber),
      lineStyles: [{ properties: { strokeWidth: L.litNum(2), lineStyle: L.litStr('solid'), showMarker: L.litBool(false) } }],
      // anomalyDetection takes raw values, not `expr` wrappers — the validator
      // reports PBIR_FORMATTING_PROP_NESTED for anything wrapped here.
      anomalyDetection: [
        {
          properties: {
            show: true,
            displayName: 'Unusual years',
            markerShow: true,
            markerShape: 'circle',
            markerShapeSize: 7,
            markerColor: L.solid(C.rose),
            confidenceBandShow: true,
            confidenceBandStyle: 'fill',
            confidenceBandColor: L.solid(C.blue),
            transparency: 85,
          },
        },
      ],
      y1AxisReferenceLine: [
        L.refLine({ id: 'zero', value: 0, color: C.cyan, label: '1940–1980 baseline', style: 'dashed' }),
      ],
      legend: [{ properties: { show: L.litBool(false) } }],
    },
  }));

  const rowY = y0 + 516;
  const colW = Math.floor((BODY_W - 2 * 24) / 3);
  // Match the filter rail's bottom edge (y=1030) so the three charts and the
  // rail finish level instead of leaving a ragged 46px step.
  const rowH = 346;

  v.push(L.makeVisual({
    page: p, key: 'monthly_temp', type: 'areaChart',
    x: BODY_X, y: rowY, w: colW, h: rowH, z: 302,
    title: 'Average Temperature by Month',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Month Short', 'Month')] },
        Y: {
          projections: [
            L.pMeasure(OBS, 'Average High Temperature', 'High'),
            L.pMeasure(OBS, 'Average Mean Temperature', 'Mean'),
            L.pMeasure(OBS, 'Average Low Temperature', 'Low'),
          ],
        },
      },
    },
    objects: {
      dataPoint: [
        { properties: { fill: L.solid(C.rose) }, selector: { metadata: `${OBS}.Average High Temperature` } },
        { properties: { fill: L.solid(C.amber) }, selector: { metadata: `${OBS}.Average Mean Temperature` } },
        { properties: { fill: L.solid(C.cyan) }, selector: { metadata: `${OBS}.Average Low Temperature` } },
      ],
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'monthly_precip', type: 'columnChart',
    x: BODY_X + colW + 24, y: rowY, w: colW, h: rowH, z: 303,
    title: 'Precipitation by Month — Rain and Snow',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Month Short', 'Month')] },
        Y: {
          projections: [
            L.pMeasure(OBS, 'Total Precipitation', 'Precipitation'),
            L.pMeasure(OBS, 'Total Snowfall', 'Snowfall'),
          ],
        },
      },
    },
    objects: {
      dataPoint: [
        { properties: { fill: L.solid(C.blue) }, selector: { metadata: `${OBS}.Total Precipitation` } },
        { properties: { fill: L.solid(C.violet) }, selector: { metadata: `${OBS}.Total Snowfall` } },
      ],
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'season_donut', type: 'donutChart',
    x: BODY_X + 2 * (colW + 24), y: rowY, w: colW, h: rowH, z: 304,
    title: 'Share of Precipitation by Season',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Season')] },
        Y: { projections: [L.pMeasure(OBS, 'Total Precipitation', 'Precipitation')] },
      },
    },
  }));

  return L.makePage({ key: p, displayName: 'Overview', visuals: v });
}

// ===========================================================================
// PAGE 2 — Temperature
// ===========================================================================
function pageTemperature() {
  const p = 'temperature';
  const v = [].concat(
    pageTitle(p,
      'Temperature: Range, Rhythm, and Records',
      'Daily highs and lows across 86 years — seasonal structure and the extremes that define the record'),
    filterRail(p)
  );

  const y0 = HEADER_H + 16;
  const halfW = Math.floor((BODY_W - 24) / 2);

  v.push(L.makeVisual({
    page: p, key: 'yearly_lines', type: 'lineChart',
    x: BODY_X, y: y0, w: BODY_W, h: 320, z: 300,
    title: 'Yearly Average High, Mean, and Low',
    subtitle: '1940–2025 complete years. 2026 is excluded — the record ends 14 May 2026, so a partial year would plot as a false cliff.',
    filters: [excludePartialYear('temp:yearly:no-2026')],
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Year')] },
        Y: {
          projections: [
            L.pMeasure(OBS, 'Average High Temperature', 'High'),
            L.pMeasure(OBS, 'Average Mean Temperature', 'Mean'),
            L.pMeasure(OBS, 'Average Low Temperature', 'Low'),
          ],
        },
      },
    },
    objects: {
      dataPoint: [
        { properties: { fill: L.solid(C.rose) }, selector: { metadata: `${OBS}.Average High Temperature` } },
        { properties: { fill: L.solid(C.amber) }, selector: { metadata: `${OBS}.Average Mean Temperature` } },
        { properties: { fill: L.solid(C.cyan) }, selector: { metadata: `${OBS}.Average Low Temperature` } },
      ],
      lineStyles: [{ properties: { strokeWidth: L.litNum(2), showMarker: L.litBool(false) } }],
      trend: [{ properties: { show: L.litBool(true), lineColor: L.solid(C.muted), style: L.litStr('dashed'), transparency: L.litNum(40) } }],
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'temp_scatter', type: 'scatterChart',
    x: BODY_X, y: y0 + 344, w: halfW, h: 340, z: 301,
    title: 'Daily High vs. Low, Coloured by Season',
    subtitle: 'Each point is one day; the diagonal spread shows the daily temperature range',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(OBS, 'Date', 'Day')] },
        X: { projections: [L.pAgg(OBS, 'Low Temperature', AGG.Avg, 'Avg', 'Low')] },
        Y: { projections: [L.pAgg(OBS, 'High Temperature', AGG.Avg, 'Avg', 'High')] },
        Series: { projections: [L.pColumn(DATE, 'Season')] },
      },
    },
    objects: {
      categoryAxis: [{ properties: { showAxisTitle: L.litBool(true), labelColor: L.solid(C.muted) } }],
      valueAxis: [{ properties: { showAxisTitle: L.litBool(true), labelColor: L.solid(C.muted) } }],
      bubbles: [{ properties: { bubbleSize: L.litNum(-30) } }],
      fillPoint: [{ properties: { style: L.litStr('Fill only') } }],
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'temp_band_bar', type: 'clusteredBarChart',
    x: BODY_X + halfW + 24, y: y0 + 344, w: halfW, h: 340, z: 302,
    title: 'Days per Temperature Band',
    subtitle: 'How often Charlotte reaches each daily-high range',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(OBS, 'Temperature Band', 'Band')] },
        Y: { projections: [L.pMeasure(OBS, 'Observation Days', 'Days')] },
      },
    },
    sort: { sort: [{ field: L.msr(OBS, 'Observation Days'), direction: 'Descending' }], isDefaultSort: false },
    objects: {
      dataPoint: L.barGradient(OBS, 'Observation Days', '#0B3B47', C.cyan),
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'extremes_table', type: 'tableEx',
    x: BODY_X, y: y0 + 708, w: BODY_W, h: 236, z: 303,
    title: 'Hottest Days on Record',
    subtitle: 'Right-click any row to drill through to the full daily detail',
    query: {
      queryState: {
        Values: {
          projections: [
            L.pColumn(OBS, 'Date', 'Date'),
            L.pColumn(DATE, 'Season'),
            L.pMeasure(OBS, 'Record High', 'High'),
            L.pMeasure(OBS, 'Record Low', 'Low'),
            L.pMeasure(OBS, 'Total Precipitation', 'Precipitation'),
          ],
        },
      },
    },
    sort: { sort: [{ field: L.msr(OBS, 'Record High'), direction: 'Descending' }], isDefaultSort: false },
    noTotals: true,
    objects: {
      columnHeaders: [{ properties: { autoSizeColumnWidth: L.litBool(true), columnAdjustment: L.litStr('growToFit') } }],
    },
    // TopN must be visual-level, and the subquery's OrderBy must use an
    // Aggregation (not a Measure) or Desktop throws in rewriteOrderBy.
    filters: [
      {
        name: L.filterId('temp:top-days'),
        field: L.col(OBS, 'Date'),
        type: 'TopN',
        howCreated: 'User',
        // Hidden: the table is *defined* as a top-15 list. Exposing the filter
        // would let a viewer turn it into something the title contradicts.
        isHiddenInViewMode: true,
        filter: {
          Version: 2,
          From: [
            {
              Name: 'subquery',
              Expression: {
                Subquery: {
                  Query: {
                    Version: 2,
                    From: [{ Name: 'o', Entity: OBS, Type: 0 }],
                    Select: [
                      {
                        Column: { Expression: { SourceRef: { Source: 'o' } }, Property: 'Date' },
                        Name: 'field',
                      },
                    ],
                    OrderBy: [
                      {
                        Direction: 2,
                        Expression: {
                          Aggregation: {
                            Expression: {
                              Column: { Expression: { SourceRef: { Source: 'o' } }, Property: 'High Temperature' },
                            },
                            Function: AGG.Max,
                          },
                        },
                      },
                    ],
                    Top: 15,
                  },
                },
              },
              Type: 2,
            },
            { Name: 'o2', Entity: OBS, Type: 0 },
          ],
          Where: [
            {
              Condition: {
                In: {
                  Expressions: [
                    { Column: { Expression: { SourceRef: { Source: 'o2' } }, Property: 'Date' } },
                  ],
                  Table: { SourceRef: { Source: 'subquery' } },
                },
              },
            },
          ],
        },
      },
    ],
  }));

  return L.makePage({ key: p, displayName: 'Temperature', visuals: v });
}

// ===========================================================================
// PAGE 3 — Precipitation
// ===========================================================================
function pagePrecipitation() {
  const p = 'precipitation';
  const v = [].concat(
    pageTitle(p,
      'Precipitation: Volume, Rhythm, and What Drives the Heavy Days',
      'Rolling totals, seasonal distribution, and a machine-learning read on which conditions produce heavy rainfall'),
    filterRail(p)
  );

  const y0 = HEADER_H + 16;
  const halfW = Math.floor((BODY_W - 24) / 2);

  // Rolling 12-month with native forecast.
  v.push(L.makeVisual({
    page: p, key: 'rolling_forecast', type: 'lineChart',
    x: BODY_X, y: y0, w: BODY_W, h: 320, z: 300,
    title: 'Rolling 12-Month Precipitation, with Forecast',
    subtitle: 'Native forecasting projects 12 months ahead with a 95% confidence band — no equivalent exists in the HTML build',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Date', 'Date')] },
        Y: { projections: [L.pMeasure(OBS, 'Rolling 12 Month Precipitation', 'Rolling 12-Month')] },
      },
    },
    objects: {
      dataPoint: L.solidSeries(C.cyan),
      lineStyles: [{ properties: { strokeWidth: L.litNum(2), showMarker: L.litBool(false) } }],
      forecast: [
        {
          properties: {
            show: L.litBool(true),
            displayName: L.litStr('Forecast'),
            lineColor: L.solid(C.violet),
            style: L.litStr('dashed'),
            width: L.litNum(2),
            bandLineShow: L.litBool(true),
            bandLineColor: L.solid(C.violet),
            bandLineTransparency: L.litNum(50),
            bandAreaShow: L.litBool(true),
            bandAreaColor: L.solid(C.violet),
            bandAreaTransparency: L.litNum(85),
          },
        },
      ],
      y1AxisReferenceLine: [
        L.refLine({ id: 'normal', value: 43.57, color: C.amber, label: '1991–2020 normal', style: 'dashed' }),
      ],
      legend: [{ properties: { show: L.litBool(false) } }],
    },
  }));

  const rowY = y0 + 344;

  v.push(L.makeVisual({
    page: p, key: 'decade_precip', type: 'columnChart',
    x: BODY_X, y: rowY, w: halfW, h: 292, z: 301,
    title: 'Monthly Precipitation by Decade',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Month Short', 'Month')] },
        Series: { projections: [L.pColumn(DATE, 'Decade')] },
        Y: { projections: [L.pMeasure(OBS, 'Total Precipitation', 'Precipitation')] },
      },
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'month_treemap', type: 'treemap',
    x: BODY_X + halfW + 24, y: rowY, w: halfW, h: 292, z: 302,
    title: 'Average Precipitation by Month',
    subtitle: 'Area is proportional to the monthly mean; colour reinforces it',
    query: {
      queryState: {
        Group: { projections: [L.pColumn(DATE, 'Month')] },
        Values: { projections: [L.pMeasure(OBS, 'Average Precipitation Per Day', 'Avg per Day')] },
      },
    },
    objects: {
      // Magnitude, not category — single-hue gradient rather than the
      // categorical palette, which read as arbitrary rainbow blocks.
      dataPoint: L.barGradient(OBS, 'Average Precipitation Per Day', '#0B3B47', C.cyan),
      labels: [{ properties: { color: L.solid(C.canvas), fontSize: L.litNum(10) } }],
      categoryLabels: [{ properties: { color: L.solid(C.textBright), fontSize: L.litNum(10) } }],
    },
  }));

  const row2Y = rowY + 316;

  v.push(L.makeVisual({
    page: p, key: 'year_bubble', type: 'scatterChart',
    x: BODY_X, y: row2Y, w: halfW, h: 760, z: 303,
    title: 'Every Year as a Bubble',
    subtitle: 'x = mean temperature · y = total precipitation · size = snow days',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Year')] },
        X: { projections: [L.pMeasure(OBS, 'Average Mean Temperature', 'Mean Temp')] },
        Y: { projections: [L.pMeasure(OBS, 'Total Precipitation', 'Precipitation')] },
        Size: { projections: [L.pMeasure(OBS, 'Snow Days', 'Snow Days')] },
      },
    },
    objects: {
      dataPoint: L.solidSeries(C.cyan),
      categoryAxis: [{ properties: { showAxisTitle: L.litBool(true) } }],
      valueAxis: [{ properties: { showAxisTitle: L.litBool(true) } }],
    },
  }));

  // Key influencers — the ML visual.
  v.push(L.makeVisual({
    page: p, key: 'key_influencers', type: 'keyDriversVisual',
    // Key Influencers stacks a lot vertically: tab strip, class dropdown,
    // the ranked influencer list (5+ rows), and a side detail panel whose
    // "Average (excluding selected)" reference label needs headroom above the
    // bars or it overlaps them. 500px still scrolled and clipped that label;
    // 760px shows the full list and clears the annotation.
    x: BODY_X + halfW + 24, y: row2Y, w: halfW, h: 760, z: 304,
    title: 'What Makes a Heavy-Precipitation Day More Likely?',
    subtitle: 'Key Influencers runs ML in-visual to rank the conditions associated with days above 1.4 inches. Use the dropdown to switch the analysed class.',
    query: {
      queryState: {
        Target: { projections: [L.pColumn(OBS, 'Precipitation Day Class', 'Day Class')] },
        ExplainBy: {
          projections: [
            L.pColumn(DATE, 'Season'),
            L.pColumn(DATE, 'Month'),
            L.pColumn(OBS, 'Temperature Band', 'Temperature Band'),
            L.pColumn(DATE, 'Decade'),
          ],
        },
      },
    },
    objects: {
      // The drill panel's bars default to a rose that clashes with the amber
      // "Average (excluding selected)" reference line, making the label hard
      // to read where it crosses them. Mute the bars and put the reference
      // line in bright cyan so the annotation reads over the top of them.
      keyDriversDrillVisual: [
        {
          properties: {
            // Muted slate bars so the selected bar (primaryColor, cyan) and
            // the average reference line both read against them.
            defaultColor: L.solid('#475569'),
            // White reference line + label: the default amber sat on top of
            // the bars and was unreadable where it crossed them.
            referenceLineColor: L.solid('#FFFFFF'),
          },
        },
      ],
      keyInfluencersVisual: [
        {
          properties: {
            canvasColor: L.solid(C.panel),
            fontColor: L.solid(C.text),
            primaryColor: L.solid(C.cyan),
            primaryFontColor: L.solid(C.canvas),
            secondaryColor: L.solid(C.border),
            secondaryFontColor: L.solid(C.text),
          },
        },
      ],
    },
    // Drop the unmeasured 1942-43 rows so "No Reading" is not offered as a class.
    filters: [
      {
        name: L.filterId('precip:ki:measured-only'),
        field: L.col(OBS, 'Precipitation Day Class'),
        type: 'Categorical',
        howCreated: 'User',
        // Hidden: excludes the unmeasured 1942-43 days so "No Reading" is not
        // offered as an analysable class. Data hygiene, not a user choice.
        isHiddenInViewMode: true,
        filter: {
          Version: 2,
          From: [{ Name: 'o', Entity: OBS, Type: 0 }],
          Where: [
            {
              Condition: {
                Not: {
                  Expression: {
                    In: {
                      Expressions: [
                        { Column: { Expression: { SourceRef: { Source: 'o' } }, Property: 'Precipitation Day Class' } },
                      ],
                      Values: [[{ Literal: { Value: "'No Reading'" } }]],
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ],
  }));

  // Content ends at 1532 with the inline nav; +32 bottom margin => 1564.
  // FitToWidth so the extra height is real scroll room, not scaled away.
  return L.makePage({
    key: p, displayName: 'Precipitation', visuals: v,
    height: 1564, displayOption: 'FitToWidth',
  });
}

// ===========================================================================
// PAGE 4 — 86 Years at a Glance
// ===========================================================================
function pagePatterns() {
  const p = 'patterns';
  const v = [].concat(
    pageTitle(p,
      'Eighty-Six Years at a Glance',
      'The full record as a single heat grid, plus an interactive decomposition you steer yourself'),
    filterRail(p)
  );

  const y0 = HEADER_H + 16;

  // Calendar heatmap — pivotTable with value-driven cell colour.
  const precipRef = `${OBS}.Total Precipitation`;
  v.push(L.makeVisual({
    page: p, key: 'calendar_heat', type: 'pivotTable',
    x: BODY_X, y: y0, w: BODY_W, h: 470, z: 300,
    title: 'Precipitation Heat Grid — Year × Month',
    subtitle: 'Every month since 1940. Dark cells are dry, cyan cells are wet. The blank 1942–43 rows are missing observations, not drought.',
    query: {
      queryState: {
        Rows: { projections: [L.pColumn(DATE, 'Year')] },
        Columns: { projections: [L.pColumn(DATE, 'Month Short', 'Month')] },
        Values: { projections: [L.pMeasure(OBS, 'Total Precipitation', 'Precipitation')] },
      },
    },
    objects: {
      values: [
        {
          properties: {
            fontSize: L.litNum(8),
            fontColorPrimary: L.solid(C.text),
            backColorPrimary: L.solid(C.panel),
            fontColorSecondary: L.solid(C.text),
            backColorSecondary: L.solid(C.panel),
          },
        },
        L.cellGradient(precipRef, '#0B1F2B', C.cyan),
      ],
      columnHeaders: [{ properties: { autoSizeColumnWidth: L.litBool(true), columnAdjustment: L.litStr('growToFit'), fontSize: L.litNum(9) } }],
      rowHeaders: [{ properties: { fontSize: L.litNum(8) } }],
      subTotals: [{ properties: { rowSubtotals: L.litBool(false), columnSubtotals: L.litBool(false) } }],
      grid: [{ properties: { rowPadding: L.litNum(1), textSize: L.litNum(8) } }],
    },
    // stylePreset is a visualContainerObject, not a formatting object.
    vco: { stylePreset: [{ properties: { name: L.litStr('None') } }] },
  }));

  const rowY = y0 + 494;
  const halfW = Math.floor((BODY_W - 24) / 2);

  v.push(L.makeVisual({
    page: p, key: 'decomp_tree', type: 'decompositionTreeVisual',
    x: BODY_X, y: rowY, w: halfW, h: 560, z: 301,
    title: 'Decompose Precipitation — Steer It Yourself, or Let AI Pick',
    subtitle: 'Click the + to branch by period, season, intensity, decade, month or day class — or choose "High value" / "Low value" and let Power BI find the split that matters. Drill paths are per-session; the tree opens collapsed.',
    query: {
      queryState: {
        Analyze: { projections: [L.pMeasure(OBS, 'Total Precipitation', 'Precipitation')] },
        ExplainBy: {
          projections: [
            L.pColumn(DATE, 'Climatological Period', 'Period'),
            L.pColumn(DATE, 'Season'),
            L.pColumn(OBS, 'Precipitation Band', 'Intensity'),
            L.pColumn(DATE, 'Decade'),
            L.pColumn(DATE, 'Month'),
            L.pColumn(OBS, 'Precipitation Day Class', 'Day Class'),
          ],
        },
      },
    },
    /**
     * NO expansionStates here, and no way to add one.
     *
     * Verified against every decompositionTreeVisual on this machine,
     * including ones Power BI Desktop authored itself: none persists an
     * expansion path. Desktop keeps the drill state in the session only and
     * writes nothing back to the file, so the tree always opens collapsed.
     *
     * Hand-authoring `expansionStates` to force it open does not work either:
     * combined with aiEnabled it crashes the page render, because Desktop
     * expects an `AIInformation` member on each level that only its runtime
     * creates. That member appears in no published visualContainer schema.
     *
     * Conclusion: a pre-expanded default is not authorable for this visual.
     * The ExplainBy order below is the lever we do control — it decides which
     * field the first click offers.
     */
    objects: {
      /**
       * AI splits ON — the "High value" / "Low value" options that pick the
       * most interesting split for you. Desktop persists this flag itself.
       *
       * The crash we hit earlier ("Cannot read properties of undefined
       * (reading 'AIInformation')" in ExpansionState.getAILevelInformation)
       * required aiEnabled=true *combined with* a hand-authored
       * `expansionStates` block. Desktop walks each expansion level for an
       * `AIInformation` member that only its own runtime creates.
       *
       * aiEnabled on its own is safe and is what Desktop writes. Never pair
       * it with authored expansionStates on this visual type.
       */
      analysis: [{ properties: { aiEnabled: L.litBool(true), aiMode: L.litStr('relative') } }],
      tree: [
        {
          properties: {
            density: L.litStr('default'),
            connectorType: L.litStr('curve'),
            accentColor: L.solid(C.cyan),
            connectorDefaultColor: L.solid(C.border),
            barsPerLevel: L.litInt(10),
            responsiveLayout: L.litBool(true),
            defaultClickAction: L.litStr('select'),
          },
        },
      ],
      dataBars: [
        {
          properties: {
            positiveBarColor: L.solid(C.cyan),
            negativeBarColor: L.solid(C.rose),
            dataBarBackgroundColor: L.solid(C.panelAlt),
            dataBarWidthPercent: L.litInt(70),
            dataBarScalingType: L.litStr('levelMaximum'),
          },
        },
      ],
      dataLabels: [
        {
          properties: {
            dataLabelFontColor: L.solid(C.textBright),
            dataLabelFontSize: L.litNum(11),
            dataLabelPrecision: L.litInt(0),
          },
        },
      ],
      categoryLabels: [
        { properties: { categoryLabelFontColor: L.solid(C.text), categoryLabelFontSize: L.litNum(11) } },
      ],
      levelHeader: [
        {
          properties: {
            levelHeaderBackgroundColor: L.solid(C.panelAlt),
            levelTitleFontColor: L.solid(C.cyan),
            levelTitleFontSize: L.litNum(11),
            levelTitleBold: L.litBool(true),
            showSubtitles: L.litBool(true),
            levelSubtitleFontColor: L.solid(C.muted),
            levelSubtitleFontSize: L.litNum(9),
          },
        },
      ],
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'season_decade', type: 'pivotTable',
    x: BODY_X + halfW + 24, y: rowY, w: halfW, h: 560, z: 302,
    title: 'Season × Decade — Mean Temperature',
    subtitle: 'Warming reads left-to-right down the grid',
    query: {
      queryState: {
        Rows: { projections: [L.pColumn(DATE, 'Decade')] },
        Columns: { projections: [L.pColumn(DATE, 'Season')] },
        Values: { projections: [L.pMeasure(OBS, 'Average Mean Temperature', 'Mean Temp')] },
      },
    },
    objects: {
      values: [
        {
          properties: {
            fontSize: L.litNum(10),
            fontColorPrimary: L.solid(C.text),
            backColorPrimary: L.solid(C.panel),
            fontColorSecondary: L.solid(C.text),
            backColorSecondary: L.solid(C.panel),
          },
        },
        L.cellDiverging(`${OBS}.Average Mean Temperature`, C.cyan, '#1E293B', C.rose, 40, 60, 80),
      ],
      columnHeaders: [{ properties: { autoSizeColumnWidth: L.litBool(true), columnAdjustment: L.litStr('growToFit') } }],
      subTotals: [{ properties: { rowSubtotals: L.litBool(false), columnSubtotals: L.litBool(false) } }],
    },
    vco: { stylePreset: [{ properties: { name: L.litStr('None') } }] },
  }));

  // Taller canvas: the heat grid wants ~470px and the tree/matrix row 560px.
  // Content ends at 1166 with the inline nav; +32 bottom margin => 1200.
  return L.makePage({
    key: p, displayName: 'Patterns', visuals: v,
    height: 1200, displayOption: 'FitToWidth',
  });
}

// ===========================================================================
// PAGE 5 — Drought  (no slicers: measures are filter-immune by design)
// ===========================================================================
function pageDrought() {
  const p = 'drought';
  const v = [].concat(
    pageTitle(p,
      'Charlotte Is in Severe Drought — 66% of Normal Precipitation',
      'This page deliberately ignores every filter. Drought is defined against fixed baselines, so the measures are wrapped in REMOVEFILTERS().')
  );

  const y0 = HEADER_H + 16;
  const fullW = W - 2 * M;

  // Alert banner: accent bar + dynamic narrative measure.
  v.push(L.makeShape({ page: p, key: 'alert_bar', x: M, y: y0, w: 6, h: 84, z: 300, fill: C.amber }));
  v.push(L.makeVisual({
    page: p, key: 'alert_text', type: 'cardVisual',
    x: M + 6, y: y0, w: fullW - 6, h: 84, z: 301,
    title: null,
    query: { queryState: { Data: { projections: [L.pMeasure(OBS, 'Drought Summary', 'Status')] } } },
    objects: {
      value: [{ properties: { fontSize: L.litNum(13), fontColor: L.solid(C.text), horizontalAlignment: L.litStr('left') }, selector: { id: 'default' } }],
      label: [{ properties: { show: L.litBool(false) }, selector: { id: 'default' } }],
      cardCalloutArea: [
        {
          properties: {
            show: L.litBool(true),
            backgroundFillColor: L.solid('#2A2118'),
            backgroundTransparency: L.litNum(0),
            rectangleRoundedCurve: L.litInt(6),
          },
          selector: { id: 'default' },
        },
      ],
    },
  }));

  const kpiY = y0 + 100;
  // Amber = the drought reading, cyan = the normal it is measured against,
  // rose = the shortfall. Colour carries the argument.
  v.push(...kpiRow(p, M, kpiY, fullW, 120, 302, [
    { name: 'Trailing 12 Month Precipitation', label: 'LAST 12 MONTHS', color: C.amber },
    { name: 'Normal Annual Precipitation', label: '1991–2020 NORMAL', color: C.cyan },
    { name: 'Precipitation Deficit', label: 'DEFICIT', color: C.rose },
    { name: 'Percent Of Normal Precipitation', label: '% OF NORMAL', color: C.amber },
    { name: 'Current Dry Streak', label: 'CURRENT DRY STREAK', color: C.orange },
    { name: 'Driest 12 Month Period Rank', label: 'RANK OF 989 (DRIEST = 1)', color: C.violet },
  ]));

  // THE BANDED CHART — the gauge replacement.
  const bandY = kpiY + 144;
  v.push(L.makeVisual({
    page: p, key: 'banded_drought', type: 'lineChart',
    x: M, y: bandY, w: Math.floor(fullW * 0.62), h: 400, z: 303,
    title: 'Rolling 12-Month Precipitation as % of Normal, Against NOAA Drought Bands',
    subtitle: 'Shaded zones are the D0–D4 classification. The native gauge visual cannot encode bands — this shows severity AND how it developed.',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(WIN, 'Window End Date', 'Window End')] },
        Y: { projections: [L.pMeasure(WIN, 'Window Percent Of Normal', '% of Normal')] },
      },
    },
    objects: {
      dataPoint: L.solidSeries(C.textBright),
      lineStyles: [{ properties: { strokeWidth: L.litNum(2), showMarker: L.litBool(false) } }],
      y1AxisReferenceLine: L.droughtBands().concat([
        L.refLine({ id: 'normal100', value: 1.0, color: C.text, label: 'Normal', style: 'solid' }),
      ]),
      // Floor at 40%: the series never drops below ~50%, so starting at zero
      // wasted half the plot and squashed the bands together.
      valueAxis: [{ properties: { start: L.litNum(0.4), end: L.litNum(1.7), labelColor: L.solid(C.muted) } }],
      legend: [{ properties: { show: L.litBool(false) } }],
    },
  }));

  // Band legend, since reference lines don't produce one.
  const legX = M + Math.floor(fullW * 0.62) + 24;
  const legW = fullW - Math.floor(fullW * 0.62) - 24;
  const bands = [
    ['Near or above normal', '≥ 100%', C.text],
    ['D0  Abnormally dry', '85–100%', C.d0],
    ['D1  Moderate drought', '75–85%', C.d1],
    ['D2  Severe drought', '65–75%', C.d2],
    ['D3  Extreme drought', '50–65%', C.d3],
    ['D4  Exceptional drought', '< 50%', C.d4],
  ];
  v.push(L.makeTextbox({
    page: p, key: 'band_legend_title', x: legX, y: bandY, w: legW, h: 24, z: 304,
    runs: [{ text: 'NOAA DROUGHT CLASSIFICATION', size: 9, bold: true, color: C.muted }],
  }));
  bands.forEach((b, i) => {
    const by = bandY + 32 + i * 34;
    v.push(L.makeShape({ page: p, key: `band_sw_${i}`, x: legX, y: by + 4, w: 14, h: 14, z: 305 + i, fill: b[2] }));
    v.push(L.makeTextbox({
      page: p, key: `band_lbl_${i}`, x: legX + 24, y: by, w: legW - 100, h: 22, z: 320 + i,
      runs: [{ text: b[0], size: 10, color: C.text }],
    }));
    v.push(L.makeTextbox({
      page: p, key: `band_val_${i}`, x: legX + legW - 76, y: by, w: 76, h: 22, z: 340 + i,
      runs: [{ text: b[1], size: 10, color: C.muted }],
    }));
  });
  v.push(L.makeTextbox({
    page: p, key: 'rank_note', x: legX, y: bandY + 32 + 6 * 34 + 12, w: legW, h: 60, z: 360,
    runs: [{ text: 'Current window ranks 22nd driest of 989 complete 12-month windows since 1940 — drier than 98% of the record.', size: 10, color: C.amber }],
  }));

  const lowY = bandY + 424;
  const thirdW = Math.floor((fullW - 48) / 3);

  v.push(L.makeVisual({
    page: p, key: 'actual_vs_normal', type: 'clusteredColumnChart',
    x: M, y: lowY, w: thirdW, h: 300, z: 380,
    title: 'Last 12 Months vs. the 1991–2020 Normal, by Month',
    subtitle: 'Trailing-window actuals only — comparing all 86 years against a single-month normal would be a scale mismatch',
    query: {
      queryState: {
        Category: { projections: [L.pColumn(DATE, 'Month Short', 'Month')] },
        Y: {
          projections: [
            L.pMeasure(OBS, 'Recent Month Precipitation', 'Last 12 Months'),
            L.pMeasure(OBS, 'Normal Monthly Precipitation', 'Normal'),
          ],
        },
      },
    },
    objects: {
      dataPoint: [
        { properties: { fill: L.solid(C.amber) }, selector: { metadata: `${OBS}.Recent Month Precipitation` } },
        { properties: { fill: L.solid(C.cyan) }, selector: { metadata: `${OBS}.Normal Monthly Precipitation` } },
      ],
    },
  }));

  v.push(L.makeVisual({
    page: p, key: 'driest_table', type: 'tableEx',
    x: M + thirdW + 24, y: lowY, w: thirdW * 2 + 24, h: 300, z: 381,
    title: 'The Ten Driest 12-Month Periods Since 1940',
    subtitle: 'Overlapping windows are expected — 2001–02 and 2007–08 each appear more than once because the drought persisted across consecutive months',
    query: {
      queryState: {
        Values: {
          projections: [
            L.pColumn(WIN, 'Window Rank', 'Rank'),
            L.pColumn(WIN, 'Window Start Date', 'From'),
            L.pColumn(WIN, 'Window End Date', 'To'),
            L.pMeasure(WIN, 'Window Total Precipitation', 'Total'),
            L.pMeasure(WIN, 'Window Percent Of Normal', '% of Normal'),
          ],
        },
      },
    },
    sort: { sort: [{ field: L.col(WIN, 'Window Rank'), direction: 'Ascending' }], isDefaultSort: false },
    noTotals: true,
    objects: {
      columnHeaders: [{ properties: { autoSizeColumnWidth: L.litBool(true), columnAdjustment: L.litStr('growToFit') } }],
    },
    filters: [
      {
        name: L.filterId('drought:top10'),
        field: L.col(WIN, 'Window Rank'),
        type: 'Advanced',
        howCreated: 'User',
        // Hidden: the visual is titled "The Ten Driest…", so the rank <= 10
        // cut is part of its definition rather than a control.
        isHiddenInViewMode: true,
        filter: {
          Version: 2,
          From: [{ Name: 'w', Entity: WIN, Type: 0 }],
          Where: [
            {
              Condition: {
                Comparison: {
                  ComparisonKind: 4,
                  Left: { Column: { Expression: { SourceRef: { Source: 'w' } }, Property: 'Window Rank' } },
                  Right: { Literal: { Value: '10L' } },
                },
              },
            },
          ],
        },
      },
    ],
  }));

  return L.makePage({ key: p, displayName: 'Drought', visuals: v });
}

// ===========================================================================
// PAGE 6 — Daily Records (drill-through target)
// ===========================================================================
function pageDaily() {
  const p = 'daily';
  const v = [].concat(
    pageTitle(p,
      'Daily Records',
      'Drill-through target — right-click a year, season, or month on any page and choose Drill through to land here filtered')
  );

  const y0 = HEADER_H + 16;
  const fullW = W - 2 * M;

  v.push(kpiStrip(p, M, y0, fullW, 120, 300, [
    { name: 'Observation Days', label: 'Days in Selection' },
    { name: 'Average High Temperature', label: 'Avg High' },
    { name: 'Average Low Temperature', label: 'Avg Low' },
    { name: 'Total Precipitation', label: 'Total Precip' },
    { name: 'Wet Days', label: 'Wet Days' },
    { name: 'Longest Dry Streak', label: 'Longest Dry Streak' },
  ]));

  v.push(L.makeVisual({
    page: p, key: 'daily_table', type: 'tableEx',
    x: M, y: y0 + 144, w: fullW, h: 760, z: 301,
    title: 'Daily Observations',
    query: {
      queryState: {
        Values: {
          projections: [
            L.pColumn(OBS, 'Date', 'Date'),
            L.pColumn(DATE, 'Season'),
            L.pColumn(DATE, 'Day Name', 'Weekday'),
            L.pAgg(OBS, 'High Temperature', AGG.Max, 'Max', 'High'),
            L.pAgg(OBS, 'Low Temperature', AGG.Min, 'Min', 'Low'),
            L.pAgg(OBS, 'Mean Temperature', AGG.Avg, 'Avg', 'Mean'),
            L.pAgg(OBS, 'Precipitation', AGG.Sum, 'Sum', 'Precipitation'),
            L.pAgg(OBS, 'Snowfall', AGG.Sum, 'Sum', 'Snowfall'),
            L.pColumn(OBS, 'Precipitation Day Class', 'Day Class'),
          ],
        },
      },
    },
    sort: { sort: [{ field: L.col(OBS, 'Date'), direction: 'Descending' }], isDefaultSort: false },
    noTotals: true,
    objects: {
      columnHeaders: [{ properties: { autoSizeColumnWidth: L.litBool(true), columnAdjustment: L.litStr('growToFit') } }],
    },
  }));

  return L.makePage({
    key: p, displayName: 'Daily Records', visuals: v, hidden: true,
    drillthrough: { entity: DATE, property: 'Year' },
  });
}

// ===========================================================================
// Emit
// ===========================================================================
function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function main() {
  const built = [
    pageOverview(),
    pageTemperature(),
    pagePrecipitation(),
    pagePatterns(),
    pageDrought(),
    pageDaily(),
  ];

  rmrf(PAGES_DIR);

  const order = [];
  for (const b of built) {
    const dir = path.join(PAGES_DIR, b.page.name);
    writeJson(path.join(dir, 'page.json'), b.page);
    for (const v of b.visuals) {
      writeJson(path.join(dir, 'visuals', v.name, 'visual.json'), v);
    }
    order.push(b.page.name);
    console.log(`  ${b.page.displayName.padEnd(16)} ${String(b.visuals.length).padStart(3)} visuals  ${b.page.name}`);
  }

  writeJson(path.join(PAGES_DIR, 'pages.json'), {
    $schema: L.SCHEMA.pages,
    pageOrder: order,
    activePageName: order[0],
  });

  const total = built.reduce((n, b) => n + b.visuals.length, 0);
  console.log(`\n  ${built.length} pages, ${total} visuals written.`);
}

main();
