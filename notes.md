# Dashboard Visualization Resources

## [NOAA Climate Data Online (CDO)](https://www.ncdc.noaa.gov/cdo-web/)

NOAA's Climate Data Online is the primary source of historical weather data for this project. It provides access to decades of daily observations from weather stations across the US via a REST API (v2). For this project, data was pulled from **Charlotte Douglas Airport (station GHCND:USW00013881)** covering **1940–2026** — 31,545 daily records totaling ~4MB of JSON.

Data fields retrieved: `TMAX` (daily high °F), `TMIN` (daily low °F), `TAVG` (daily mean °F), `PRCP` (precipitation in inches), `SNOW` (snowfall in inches), `SNWD` (snow depth in inches).

The API paginates at 1,000 records per request and enforces a rate limit of ~5 requests/second. The fetch script (`fetch-noaa.js`) handles pagination automatically and loops year-by-year from 1940 to present, saving the result to `charlotte-weather.json`. A free API token is required and obtained at `https://www.ncdc.noaa.gov/cdo-web/token`.

Climatological normals (1991–2020 baseline) were computed from the raw data and used in the Drought tab to calculate monthly and annual precipitation deficits.

---

## [React](https://react.dev/)

The UI library underpinning this entire stack. React renders dashboard components as a tree of reusable, stateful elements and re-renders only what changes — critical for dashboards that update frequently with live data. All other libraries here (Recharts, shadcn/ui, TanStack Table/Query, Zustand) are React-native or have first-class React bindings. Current stable version is React 19, which introduces the Actions API and improved concurrent rendering.

---

## [Recharts](https://recharts.github.io/en-US/)

A composable charting library built on React and D3. Provides ready-made chart components (line, bar, pie, area, scatter, radar, etc.) that integrate naturally into JSX. Best for teams that want declarative, React-first charts without writing low-level SVG. Highly customizable via props and supports responsive containers out of the box.

---

## [D3.js](https://d3js.org/)

The low-level standard for data-driven SVG/Canvas graphics in the browser. Gives full control over scales, axes, transitions, and layouts. Steeper learning curve than higher-level libraries, but nothing matches it for custom or novel visualizations. Often used as the engine underneath other chart libraries (including Recharts and Plotly).

---

## [Plotly.js](https://plotly.com/javascript/)

A high-level, declarative charting library built on D3 and WebGL. Offers a large catalog of chart types including 3D plots, statistical charts (box, violin, histogram), maps, and financial charts. Strong support for scientific and analytical dashboards. Has official React (`react-plotly.js`) and Python wrappers, making it popular in data science workflows.

---

## [Tailwind CSS](https://tailwindcss.com/)

A utility-first CSS framework. Rather than pre-built components, it provides atomic classes (`flex`, `gap-4`, `text-sm`, etc.) that you compose directly in markup. Ideal for building dashboard layouts — grids, sidebars, responsive containers — without writing custom CSS. Pairs well with any of the chart libraries above.

---

## [shadcn/ui](https://ui.shadcn.com/)

A collection of copy-paste UI components built on Radix UI primitives and styled with Tailwind CSS. Not a traditional npm package — you own the source. Includes cards, tables, dialogs, dropdowns, and a dedicated `Chart` component wrapper around Recharts with consistent theming. A natural fit for React dashboards that already use Tailwind.

---

## [TanStack Table](https://tanstack.com/table/latest)

A headless, framework-agnostic table library (formerly React Table). Handles sorting, filtering, pagination, column pinning, and row selection with zero opinion on markup or styles — you bring the HTML and CSS. Essential for dashboards that display large datasets in grid form. Pairs directly with Tailwind and shadcn/ui's table primitives.

---

## [TanStack Query](https://tanstack.com/query/latest)

Async state management for fetching, caching, and synchronizing server data. Eliminates boilerplate around loading/error states and keeps dashboard data fresh via background refetching and cache invalidation. Works with any data source (REST, GraphQL, WebSockets). The de-facto standard for data-fetching in React dashboards.

---

## [Zustand](https://zustand.docs.pmnd.rs/)

A minimal React state management library. Useful for sharing dashboard state (selected date ranges, active filters, sidebar open/closed) across components without prop drilling. Much lighter than Redux — a single small store with no boilerplate. Pairs well with TanStack Query (server state) since Zustand handles client/UI state.

---

## [date-fns](https://date-fns.org/)

A modular JavaScript date utility library. Provides tree-shakeable functions for formatting, parsing, comparing, and manipulating dates. Dashboards almost always need date range filtering and axis label formatting — date-fns covers both cleanly and integrates well with Recharts' tick formatters and TanStack Table's sort functions.

---

## [Vite](https://vitejs.dev/)

A fast frontend build tool and dev server. The recommended starting point for new React projects (including dashboard apps) — significantly faster than Create React App. Supports TypeScript, path aliases, and environment variables out of the box. Used by many shadcn/ui project templates.