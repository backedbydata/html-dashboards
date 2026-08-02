'use strict';
/**
 * Shared PBIR authoring helpers for the Charlotte Weather report.
 *
 * Everything here emits plain objects that are JSON.stringify'd by build.js.
 * No regex/string surgery on JSON anywhere in this build.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Schemas — copied from the scaffolded files; do not bump.
// ---------------------------------------------------------------------------
const SCHEMA = {
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json',
  // `expansionStates` is not declared in any published visualContainer schema,
  // but Desktop writes it and reads it. 2.5.0 is the version Desktop itself
  // stamps on visuals that carry it, so use that for those visuals only.
  visualExpansion: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.5.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
};

// ---------------------------------------------------------------------------
// Palette — must stay in sync with the theme JSON.
// ---------------------------------------------------------------------------
const C = {
  canvas: '#0F172A',
  panel: '#1E293B',
  panelAlt: '#16233A',
  border: '#334155',
  grid: '#1F3247',
  text: '#E2E8F0',
  textBright: '#F1F5F9',
  muted: '#94A3B8',
  cyan: '#22D3EE',
  cyanDim: '#0B3B47',
  rose: '#F43F5E',
  amber: '#F59E0B',
  violet: '#A78BFA',
  green: '#34D399',
  blue: '#60A5FA',
  orange: '#FB923C',
  // NOAA drought classification bands
  d0: '#22D3EE',
  d1: '#EAB308',
  d2: '#F59E0B',
  d3: '#EF4444',
  d4: '#F43F5E',
};

// Deterministic ID generation: same input name -> same hex id on every run,
// so regenerating the report produces a stable diff instead of churn.
function idFor(seed, len = 20) {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, len);
}
const visualId = (page, key) => idFor(`visual:${page}:${key}`, 20);
const pageId = (key) => idFor(`page:${key}`, 20);
const filterId = (seed) => 'Filter' + idFor(`filter:${seed}`, 24);

// ---------------------------------------------------------------------------
// Expression builders
// ---------------------------------------------------------------------------
const col = (entity, property) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const msr = (entity, property) => ({
  Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const agg = (entity, property, fn) => ({
  Aggregation: {
    Expression: { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } },
    Function: fn,
  },
});
const AGG = { Sum: 0, Avg: 1, Count: 2, Min: 3, Max: 4, CountNonNull: 5 };

/** Projection for a model measure. */
function pMeasure(entity, property, displayName) {
  const p = {
    field: msr(entity, property),
    queryRef: `${entity}.${property}`,
    nativeQueryRef: displayName || property,
  };
  return p;
}
/** Projection for a raw column. */
function pColumn(entity, property, displayName) {
  return {
    field: col(entity, property),
    queryRef: `${entity}.${property}`,
    nativeQueryRef: displayName || property,
  };
}
/** Projection for an aggregated column. */
function pAgg(entity, property, fn, fnName, displayName) {
  return {
    field: agg(entity, property, fn),
    queryRef: `${fnName}(${entity}.${property})`,
    nativeQueryRef: displayName || property,
  };
}

// ---------------------------------------------------------------------------
// Formatting value encoding (PBIR expression wrappers)
// ---------------------------------------------------------------------------
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const litStr = (s) => lit(`'${s}'`);
const litNum = (n) => lit(`${n}D`);
const litInt = (n) => lit(`${n}L`);
const litBool = (b) => lit(b ? 'true' : 'false');
const solid = (hex) => ({ solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } } });

// ---------------------------------------------------------------------------
// Visual container
// ---------------------------------------------------------------------------
function makeVisual({ page, key, type, x, y, w, h, z, title, subtitle, query, objects, vco, filters, sort, drill, noTotals, expansionStates, schema }) {
  const name = visualId(page, key);
  const visual = { visualType: type };

  if (query) visual.query = query;
  if (sort && visual.query) visual.query.sortDefinition = sort;
  if (objects) visual.objects = objects;

  // tableEx sums every numeric column in a Total row by default, which is
  // meaningless for temperatures, ranks and percentages. Suppress it.
  if (noTotals) {
    visual.objects = visual.objects || {};
    visual.objects.total = [{ properties: { totals: litBool(false) } }];
  }

  const containerObjects = Object.assign({}, vco);
  if (title !== undefined) {
    containerObjects.title = [
      {
        properties: {
          show: litBool(title !== null),
          text: litStr(title || ''),
          fontColor: solid(C.text),
          background: solid(C.panel),
          alignment: litStr('left'),
          fontSize: litNum(12),
        },
      },
    ];
  }
  if (subtitle) {
    containerObjects.subTitle = [
      {
        properties: {
          show: litBool(true),
          text: litStr(subtitle),
          fontColor: solid(C.muted),
          fontSize: litNum(9),
          alignment: litStr('left'),
        },
      },
    ];
  }
  if (Object.keys(containerObjects).length) visual.visualContainerObjects = containerObjects;

  // Sits on `visual`, NOT on `visual.query` — and requires a schema >= 2.5.0,
  // which is why callers using it pass `schema: SCHEMA.visualExpansion`.
  //
  // WARNING: do not use on decompositionTreeVisual. That visual reads an
  // `AIInformation` member off each level (ExpansionState.getAILevelInformation)
  // which is not part of the authorable shape, and Desktop hard-crashes the
  // page render with "Cannot read properties of undefined". Safe on
  // pivotTable and hierarchy slicers, which is where Desktop itself writes it.
  if (expansionStates) visual.expansionStates = expansionStates;

  const out = {
    $schema: schema || SCHEMA.visual,
    name,
    position: { x, y, z: z || 0, width: w, height: h, tabOrder: z || 0 },
    visual,
  };
  if (filters) out.filterConfig = { filters };
  if (drill) out.visual.drillFilterOtherVisuals = true;
  return out;
}

/** Textbox — paragraphs is a native array, never a stringified blob. */
function makeTextbox({ page, key, x, y, w, h, z, runs, align }) {
  const paragraphs = [
    {
      horizontalTextAlignment: align || 'left',
      textRuns: runs.map((r) => ({
        value: r.text,
        textStyle: Object.assign(
          { fontSize: `${r.size || 11}pt`, color: r.color || C.text },
          r.bold ? { fontWeight: 'bold' } : {},
          r.family ? { fontFamily: r.family } : {}
        ),
      })),
    },
  ];
  return {
    $schema: SCHEMA.visual,
    name: visualId(page, key),
    position: { x, y, z: z || 0, width: w, height: h, tabOrder: z || 0 },
    visual: {
      visualType: 'textbox',
      objects: { general: [{ properties: { paragraphs } }] },
      visualContainerObjects: {
        background: [{ properties: { show: litBool(false), transparency: litNum(100) } }],
        border: [{ properties: { show: litBool(false) } }],
        padding: [{ properties: { top: litNum(0), bottom: litNum(0), left: litNum(0), right: litNum(0) } }],
      },
    },
  };
}

/** Bare rectangle used for banding / dividers. Shapes respect small heights; textboxes do not. */
function makeShape({ page, key, x, y, w, h, z, fill, transparency }) {
  return {
    $schema: SCHEMA.visual,
    name: visualId(page, key),
    position: { x, y, z: z || 0, width: w, height: h, tabOrder: z || 0 },
    visual: {
      visualType: 'shape',
      objects: {
        shape: [{ properties: { tileShape: litStr('rectangle'), roundEdge: litNum(0) } }],
        fill: [
          {
            properties: {
              show: litBool(true),
              fillColor: solid(fill),
              transparency: litNum(transparency === undefined ? 0 : transparency),
            },
          },
        ],
      },
      visualContainerObjects: {
        background: [{ properties: { show: litBool(false), transparency: litNum(100) } }],
        border: [{ properties: { show: litBool(false) } }],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Axis reference-line bands — the drought gauge replacement.
// Each band is one y1AxisReferenceLine entry with an { id } selector, shading
// the region *before* its value in the band colour.
// ---------------------------------------------------------------------------
/**
 * NOAA D0-D4 drought bands as shaded axis regions.
 *
 * Each reference line shades "before" (everything below its value), so the
 * lines are drawn from the TOP down and each lower band overpaints the one
 * above it. Painting bottom-up instead makes D4 flood the whole plot in the
 * darkest colour — which is what the first render did.
 *
 * Because shading is cumulative, transparency is tuned per band so the net
 * result reads as five distinct strata rather than one dark wash.
 */
function droughtBands() {
  const bands = [
    { id: 'd0', value: 1.0, color: C.d0, name: 'D0 Abnormally Dry', alpha: 92 },
    { id: 'd1', value: 0.85, color: C.d1, name: 'D1 Moderate', alpha: 92 },
    { id: 'd2', value: 0.75, color: C.d2, name: 'D2 Severe', alpha: 90 },
    { id: 'd3', value: 0.65, color: C.d3, name: 'D3 Extreme', alpha: 90 },
    { id: 'd4', value: 0.5, color: C.d4, name: 'D4 Exceptional', alpha: 88 },
  ];
  return bands.map((b) => ({
    properties: {
      show: litBool(true),
      displayName: litStr(b.name),
      value: litNum(b.value),
      lineColor: solid(b.color),
      transparency: litNum(30),
      width: litNum(1),
      style: litStr('dotted'),
      position: litStr('back'),
      dataLabelShow: litBool(false),
      shadeShow: litBool(true),
      shadeRegion: litStr('before'),
      shadeColor: solid(b.color),
      shadeTransparency: litNum(b.alpha),
    },
    selector: { id: b.id },
  }));
}

/**
 * Single reference line, e.g. the 100%-of-normal marker.
 * `dataLabelText` is an enum (Value|Name|ValueAndName), not free text — the
 * literal caption lives in `displayName`.
 */
function refLine({ id, value, color, label, style }) {
  const props = {
    show: litBool(true),
    value: litNum(value),
    lineColor: solid(color),
    transparency: litNum(0),
    style: litStr(style || 'dotted'),
    position: litStr('front'),
    width: litNum(2),
    shadeShow: litBool(false),
  };
  if (label) {
    props.displayName = litStr(label);
    props.dataLabelShow = litBool(true);
    props.dataLabelText = litStr('Name');
    props.dataLabelColor = solid(color);
    props.dataLabelHorizontalPosition = litStr('left');
    props.dataLabelVerticalPosition = litStr('above');
  } else {
    props.dataLabelShow = litBool(false);
  }
  return { properties: props, selector: { id } };
}

// ---------------------------------------------------------------------------
// Conditional formatting
// ---------------------------------------------------------------------------
/** 2-stop magnitude gradient for pivotTable cells. */
function cellGradient(queryRef, minHex, maxHex) {
  return {
    properties: {
      backColor: {
        solid: {
          color: {
            expr: {
              FillRule: {
                Input: { SelectRef: { ExpressionName: queryRef } },
                FillRule: {
                  linearGradient2: {
                    min: { color: { Literal: { Value: `'${minHex}'` } } },
                    max: { color: { Literal: { Value: `'${maxHex}'` } } },
                    nullColoringStrategy: { strategy: { Literal: { Value: "'noColor'" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: queryRef },
  };
}

/** 3-stop diverging gradient for pivotTable cells (anomaly: cool -> neutral -> hot). */
function cellDiverging(queryRef, lo, mid, hi, loVal, midVal, hiVal) {
  return {
    properties: {
      backColor: {
        solid: {
          color: {
            expr: {
              FillRule: {
                Input: { SelectRef: { ExpressionName: queryRef } },
                FillRule: {
                  linearGradient3: {
                    min: { color: { Literal: { Value: `'${lo}'` } }, value: { Literal: { Value: `${loVal}D` } } },
                    mid: { color: { Literal: { Value: `'${mid}'` } }, value: { Literal: { Value: `${midVal}D` } } },
                    max: { color: { Literal: { Value: `'${hi}'` } }, value: { Literal: { Value: `${hiVal}D` } } },
                    nullColoringStrategy: { strategy: { Literal: { Value: "'noColor'" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: queryRef },
  };
}

/** Chart bar gradient keyed off a measure. Chart selectors must NOT carry metadata. */
function barGradient(entity, property, minHex, maxHex) {
  return [
    {
      properties: {
        fill: {
          solid: {
            color: {
              expr: {
                FillRule: {
                  Input: { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } },
                  FillRule: {
                    linearGradient2: {
                      min: { color: { Literal: { Value: `'${minHex}'` } } },
                      max: { color: { Literal: { Value: `'${maxHex}'` } } },
                      nullColoringStrategy: { strategy: { Literal: { Value: "'noColor'" } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      selector: { data: [{ dataViewWildcard: { matchingOption: 0 } }] },
    },
  ];
}

/** Rules-based bar colour: below threshold -> rose, else cyan. */
function barRule(entity, property, threshold, belowHex, aboveHex) {
  return [
    {
      properties: {
        fill: {
          solid: {
            color: {
              expr: {
                Conditional: {
                  Cases: [
                    {
                      Condition: {
                        Comparison: {
                          ComparisonKind: 3,
                          Left: { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } },
                          Right: { Literal: { Value: `${threshold}D` } },
                        },
                      },
                      Value: { Literal: { Value: `'${belowHex}'` } },
                    },
                  ],
                  DefaultValue: { Literal: { Value: `'${aboveHex}'` } },
                },
              },
            },
          },
        },
      },
    },
  ];
}

/** Static single-series colour. */
const solidSeries = (hex) => [{ properties: { defaultColor: solid(hex) } }];

/** Per-series colour by legend value. */
function seriesColor(hex, queryRef, value) {
  return {
    properties: { fill: solid(hex) },
    selector: {
      data: [
        {
          dataViewWildcard: { matchingOption: 0 },
          scopeId: { Literal: { Value: `'${value}'` } },
        },
      ],
      metadata: queryRef,
    },
  };
}

// ---------------------------------------------------------------------------
// Slicers
//
// Sizing per references/slicers.md. The theme sets *.*.padding = 8/8/8/8, and
// declaring ANY per-visual VCO drops that cascade, so every slicer below
// redeclares padding explicitly and is sized with it included:
//   Dropdown / Between (side-by-side)  h = 60 + 8 + 8 = 76 -> snap 80
//   advancedSlicerVisual (tiles)       h >= 56 per tile row + padding
// ---------------------------------------------------------------------------
const SLICER_PAD = [
  {
    properties: {
      top: litNum(8), bottom: litNum(8), left: litNum(8), right: litNum(8),
    },
  },
];

function makeSlicer({ page, key, x, y, w, h, z, entity, column, header, mode, type, syncGroup, columns, rows, rangeMin, rangeMax, dateMin, dateMax }) {
  const vType = type || 'slicer';
  // advancedSlicerVisual (tile) has no header/items formatting objects —
  // only the classic slicer and filterSlicer do.
  const objects = {};
  if (vType === 'slicer' || vType === 'filterSlicer') {
    objects.header = [
      {
        properties: {
          show: litBool(true),
          text: litStr(header),
          fontColor: solid(C.muted),
          background: solid(C.panel),
          textSize: litNum(10),
          bold: litBool(true),
        },
      },
    ];
    objects.items = [
      {
        properties: {
          fontColor: solid(C.text),
          background: solid(C.canvas),
          textSize: litNum(9),
          padding: litNum(2),
        },
      },
    ];
  }
  if (vType === 'slicer') {
    // Responsive OFF. When on, a Between slicer renders oversized round
    // handles that dominate the rail; off gives the thin line + small handles.
    objects.general = [{ properties: { responsive: litBool(false) } }];
    const dataProps = { mode: litStr(mode || 'Dropdown') };
    // Clamp a numeric Between slicer to the real data range. Without these the
    // two input boxes accept any number the user types (year 3000, year 1) and
    // silently return an empty report.
    if (rangeMin !== undefined) dataProps.numericStart = litNum(rangeMin);
    if (rangeMax !== undefined) dataProps.numericEnd = litNum(rangeMax);
    // Same idea for a date-grain Between slicer.
    if (dateMin) dataProps.startDate = lit(`datetime'${dateMin}'`);
    if (dateMax) dataProps.endDate = lit(`datetime'${dateMax}'`);
    objects.data = [{ properties: dataProps }];
    // Draggable handles on Between slicers. Off by default in PBIR.
    if ((mode || '') === 'Between') {
      // NB: slider colour props take the fill object directly — wrapping them
      // in solid() nests a second `color` key and the validator rejects it.
      objects.slider = [
        {
          properties: {
            show: litBool(true),
            color: solid(C.cyan).solid.color,
            handleFillColor: solid(C.cyan).solid.color,
            handleBorderColor: solid(C.textBright).solid.color,
            secondaryLineColor: solid(C.border).solid.color,
          },
        },
      ];
    }
  }
  if (vType === 'advancedSlicerVisual') {
    // Without an explicit columnCount the tiles shrink-wrap and clip their
    // labels ("Spr", "194..."). Fewer columns = wider tiles.
    //
    // `rowCount` must also be pinned: the grid otherwise reserves a spare row,
    // which renders as empty boxes below the real values (4 seasons in a
    // 2-column grid showed 2 phantom tiles). rows = ceil(items / columns).
    const layoutProps = {
      columnCount: litInt(columns || 2),
      autoGrid: litBool(false),
      cellPadding: litInt(4),
      style: litStr('Table'),
    };
    if (rows) layoutProps.rowCount = litInt(rows);
    objects.layout = [{ properties: layoutProps }];
    // NB: do NOT style `label` or `value` here. Both validate cleanly but
    // render every tile caption blank in Desktop. Tile text inherits from the
    // theme's structural colours instead.
  }

  const vco = {
    padding: SLICER_PAD,
    background: [
      { properties: { show: litBool(true), color: solid(C.panel), transparency: litNum(0) } },
    ],
    border: [
      { properties: { show: litBool(true), color: solid(C.border), radius: litNum(8), width: litNum(1) } },
    ],
  };
  // Tile slicers carry no header object, so the container title supplies the label.
  if (vType === 'advancedSlicerVisual') {
    vco.title = [
      {
        properties: {
          show: litBool(true),
          text: litStr(header),
          fontColor: solid(C.muted),
          background: solid(C.panel),
          fontSize: litNum(10),
          alignment: litStr('left'),
        },
      },
    ];
  }

  const visual = {
    visualType: vType,
    query: {
      queryState: {
        Values: { projections: [pColumn(entity, column)] },
      },
    },
    objects,
    visualContainerObjects: vco,
  };
  if (syncGroup) {
    visual.syncGroup = { groupName: syncGroup, fieldChanges: false, filterChanges: true };
  }

  return {
    $schema: SCHEMA.visual,
    name: visualId(page, key),
    position: { x, y, z: z || 0, width: w, height: h, tabOrder: z || 0 },
    visual,
  };
}

// ---------------------------------------------------------------------------
// Page navigator — built-in visual that lists every visible page as a button
// and handles the navigation itself. No data roles, no per-page wiring, and it
// picks up new pages automatically.
// ---------------------------------------------------------------------------
/**
 * Nav menu built from explicit actionButton visuals rather than the built-in
 * pageNavigator. The navigator repeatedly rendered as an empty strip despite
 * validating clean, so the nav is authored button-by-button: each carries a
 * `visualLink` of type PageNavigation pointing at a known page id. Fully
 * deterministic and inspectable.
 *
 * `isActive` styles the current page's button as selected.
 */
function makeNavButton({ page, key, x, y, w, h, z, label, targetPageId, isActive }) {
  const fillColor = isActive ? C.cyanDim : C.panelAlt;
  const fontColor = isActive ? C.cyan : C.muted;
  return {
    $schema: SCHEMA.visual,
    name: visualId(page, key),
    position: { x, y, z: z || 0, width: w, height: h, tabOrder: z || 0 },
    visual: {
      visualType: 'actionButton',
      objects: {
        shape: [{ properties: { tileShape: litStr('rectangleRounded'), rectangleRoundedCurve: litInt(6) } }],
        fill: [
          {
            properties: { show: litBool(true), fillColor: solid(fillColor), transparency: litNum(0) },
            selector: { id: 'default' },
          },
          {
            properties: { show: litBool(true), fillColor: solid(C.border), transparency: litNum(0) },
            selector: { id: 'hover' },
          },
        ],
        /**
         * Button caption. Desktop writes this as TWO entries and both are
         * required:
         *   1. an UNSCOPED entry that only turns the text on
         *   2. a { id: 'default' } entry carrying the text and its styling
         *
         * Supplying just one or the other renders nothing, which is what sent
         * this through three failed attempts: unscoped-only, selector-only,
         * and finally a `title` VCO (which paints in the container's header
         * strip and therefore swallows the click).
         */
        text: [
          { properties: { show: litBool(true) } },
          {
            properties: {
              text: litStr(label),
              fontColor: solid(fontColor),
              fontSize: litNum(10),
              bold: litBool(!!isActive),
              horizontalAlignment: litStr('center'),
              verticalAlignment: litStr('middle'),
              leftMargin: litInt(0),
              rightMargin: litInt(0),
            },
            selector: { id: 'default' },
          },
        ],
        outline: [
          {
            properties: {
              show: litBool(!!isActive),
              lineColor: solid(C.cyan),
              transparency: litNum(0),
              weight: litNum(1),
            },
            selector: { id: 'default' },
          },
        ],
      },
      visualContainerObjects: {
        visualLink: [
          {
            properties: {
              show: litBool(true),
              type: litStr('PageNavigation'),
              navigationSection: litStr(targetPageId),
              tooltip: litStr(`Go to ${label}`),
            },
          },
        ],
        // Container title OFF. It renders in the header strip above the
        // button surface, so showing it covers the button and eats the click.
        // The caption comes from objects.text instead.
        title: [{ properties: { show: litBool(false) } }],
        background: [{ properties: { show: litBool(false), transparency: litNum(100) } }],
        border: [{ properties: { show: litBool(false) } }],
        padding: [{ properties: { top: litNum(0), bottom: litNum(0), left: litNum(0), right: litNum(0) } }],
      },
    },
  };
}

/**
 * Left accent bar for KPI cards. Requires the { id: 'default' } selector —
 * without it the properties validate but render unchanged.
 */
function accentBar(hex, width) {
  return [
    {
      properties: {
        show: litBool(true),
        position: litStr('Left'),
        color: solid(hex),
        width: litNum(width || 4),
        transparency: litNum(0),
      },
      selector: { id: 'default' },
    },
  ];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function makePage({ key, displayName, visuals, hidden, drillthrough, interactions, height, displayOption }) {
  const page = {
    $schema: SCHEMA.page,
    name: pageId(key),
    displayName,
    // FitToPage squeezes the whole canvas into the viewport, so making a page
    // taller under FitToPage renders everything *smaller* — the opposite of
    // the intent. Tall pages use FitToWidth: scale to the window width and
    // scroll vertically, preserving the extra height.
    displayOption: displayOption || 'FitToPage',
    width: 1920,
    // 1120 by default. The nav sits beside the title rather than above it, so
    // the header band is 96px and the standard three-row body fits without the
    // extra height the stacked header used to need.
    height: height || 1120,
    objects: {
      background: [{ properties: { color: solid(C.canvas), transparency: litNum(0) } }],
      outspace: [{ properties: { color: solid(C.canvas), transparency: litNum(0) } }],
      /**
       * Filter pane styling.
       *
       * This lives on the page, not the theme — the theme's visualStyles
       * rejected `outspacePane`/`filterCard` as unknown objects. The pane does
       * not inherit the theme's structural colours either, so without these
       * entries it renders in default light chrome: unreadable against the
       * dark canvas, and only visible after publishing (Desktop's editing view
       * shows the authoring pane instead).
       */
      outspacePane: [
        {
          properties: {
            backgroundColor: solid(C.panel),
            foregroundColor: solid(C.text),
            borderColor: solid(C.border),
            border: litBool(true),
            checkboxAndApplyColor: solid(C.cyan),
            inputBoxColor: solid(C.canvas),
            titleSize: litNum(12),
            headerSize: litNum(11),
            searchTextSize: litNum(9),
            fontFamily: litStr('Segoe UI'),
            transparency: litNum(0),
          },
        },
      ],
      filterCard: [
        {
          properties: {
            backgroundColor: solid(C.panelAlt),
            foregroundColor: solid(C.text),
            borderColor: solid(C.border),
            border: litBool(true),
            inputBoxColor: solid(C.canvas),
            textSize: litNum(9),
            transparency: litNum(0),
          },
          selector: { id: 'Available' },
        },
        {
          properties: {
            backgroundColor: solid(C.cyanDim),
            foregroundColor: solid(C.textBright),
            borderColor: solid(C.cyan),
            border: litBool(true),
            inputBoxColor: solid(C.canvas),
            textSize: litNum(9),
            transparency: litNum(0),
          },
          selector: { id: 'Applied' },
        },
      ],
    },
  };
  if (hidden) page.visibility = 'HiddenInViewMode';
  if (interactions) page.visualInteractions = interactions;

  if (drillthrough) {
    const fid = filterId(`drill:${key}:${drillthrough.property}`);
    page.filterConfig = {
      filters: [
        {
          name: fid,
          field: col(drillthrough.entity, drillthrough.property),
          type: 'Categorical',
          howCreated: 'Drillthrough',
        },
      ],
    };
    page.pageBinding = {
      name: 'Pod',
      type: 'Drillthrough',
      parameters: [
        {
          name: `Param_${fid}`,
          boundFilter: fid,
          fieldExpr: col(drillthrough.entity, drillthrough.property),
        },
      ],
    };
  }
  return { page, visuals };
}

module.exports = {
  SCHEMA, C, AGG,
  makeSlicer, makePage, makeNavButton, accentBar, SLICER_PAD,
  idFor, visualId, pageId, filterId,
  col, msr, agg, pMeasure, pColumn, pAgg,
  lit, litStr, litNum, litInt, litBool, solid,
  makeVisual, makeTextbox, makeShape,
  droughtBands, refLine,
  cellGradient, cellDiverging, barGradient, barRule, solidSeries, seriesColor,
};
