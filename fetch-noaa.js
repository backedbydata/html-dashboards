import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load token from .env manually (no dotenv dependency needed)
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const tokenMatch = envContent.match(/NOAA_API_TOKEN=(.+)/);
if (!tokenMatch) {
  console.error("NOAA_API_TOKEN not found in .env");
  process.exit(1);
}
const TOKEN = tokenMatch[1].trim();

const BASE_URL = "https://www.ncdc.noaa.gov/cdo-web/api/v2/data";
const STATION_ID = "GHCND:USW00013881"; // Charlotte Douglas Airport
const DATATYPES = ["TMAX", "TMIN", "TAVG", "PRCP", "SNOW", "SNWD"];
const START_YEAR = 1940;
const END_YEAR = new Date().getFullYear();
const LIMIT = 1000;

async function fetchChunk(startDate, endDate, offset) {
  const params = new URLSearchParams({
    datasetid: "GHCND",
    stationid: STATION_ID,
    startdate: startDate,
    enddate: endDate,
    datatypeid: DATATYPES.join(","),
    units: "standard",
    limit: LIMIT,
    offset,
  });

  const res = await fetch(`${BASE_URL}?${params}`, {
    headers: { token: TOKEN },
  });

  if (res.status === 429) {
    console.log("  Rate limited — waiting 30s...");
    await new Promise((r) => setTimeout(r, 30000));
    return fetchChunk(startDate, endDate, offset);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

async function fetchYear(year) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const allResults = [];
  let offset = 1;

  while (true) {
    console.log(`  Fetching ${year} offset ${offset}...`);
    const data = await fetchChunk(startDate, endDate, offset);

    if (!data.results || data.results.length === 0) break;
    allResults.push(...data.results);

    if (allResults.length >= data.metadata.resultset.count) break;
    offset += LIMIT;

    // Respect NOAA's rate limit (5 req/sec)
    await new Promise((r) => setTimeout(r, 250));
  }

  return allResults;
}

function transformRecords(records) {
  // Pivot flat records into one object per date
  const byDate = {};
  for (const r of records) {
    const date = r.date.slice(0, 10);
    if (!byDate[date]) byDate[date] = { date };
    byDate[date][r.datatype] = r.value;
  }

  return Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      tmax: d.TMAX ?? null, // tenths of °F
      tmin: d.TMIN ?? null,
      tavg: d.TAVG ?? null,
      prcp: d.PRCP ?? null, // tenths of inches
      snow: d.SNOW ?? null, // mm
      snwd: d.SNWD ?? null, // mm
    }));
}

async function main() {
  const allRecords = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    console.log(`Fetching year ${year}...`);
    try {
      const records = await fetchYear(year);
      allRecords.push(...records);
      console.log(`  ${records.length} records`);
    } catch (err) {
      console.error(`  Error for ${year}: ${err.message}`);
    }

    // Brief pause between years to be polite
    await new Promise((r) => setTimeout(r, 500));
  }

  const transformed = transformRecords(allRecords);

  const outPath = path.join(__dirname, "charlotte-weather.json");
  fs.writeFileSync(outPath, JSON.stringify(transformed, null, 2));
  console.log(`\nDone. ${transformed.length} daily records saved to charlotte-weather.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
