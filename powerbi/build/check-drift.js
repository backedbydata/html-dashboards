'use strict';
/**
 * Drift detector — run BEFORE build.js.
 *
 * The report pages under definition/pages are generated output. Anything
 * edited in Power BI Desktop's UI is overwritten on the next build. This
 * script detects that situation before it destroys work:
 *
 *   1. Regenerate the pages into a temp folder.
 *   2. Compare against what is currently on disk.
 *   3. If they differ, Desktop (or a hand edit) changed something the
 *      generator does not know about — report it and exit non-zero.
 *
 * Usage:
 *   node powerbi/build/check-drift.js          # report drift, exit 1 if any
 *   node powerbi/build/check-drift.js --list   # also list the changed props
 *
 * Workflow:
 *   node powerbi/build/check-drift.js  ->  clean?  ->  node build.js
 *                                      ->  drift?  ->  fold it into build.js
 *                                                      first, then build
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPORT = path.resolve(__dirname, '..', 'CharlotteWeather.Report');
const LIVE = path.join(REPORT, 'definition', 'pages');
const listMode = process.argv.includes('--list');

function readTree(root) {
  const out = new Map();
  if (!fs.existsSync(root)) return out;
  for (const page of fs.readdirSync(root)) {
    const pdir = path.join(root, page);
    if (!fs.statSync(pdir).isDirectory()) continue;
    const pj = path.join(pdir, 'page.json');
    if (fs.existsSync(pj)) out.set(`${page}/page.json`, fs.readFileSync(pj, 'utf8'));
    const vdir = path.join(pdir, 'visuals');
    if (!fs.existsSync(vdir)) continue;
    for (const v of fs.readdirSync(vdir)) {
      const vj = path.join(vdir, v, 'visual.json');
      if (fs.existsSync(vj)) out.set(`${page}/${v}/visual.json`, fs.readFileSync(vj, 'utf8'));
    }
  }
  return out;
}

/**
 * Properties Power BI Desktop rewrites on its own when it opens or saves a
 * PBIP. These are bookkeeping, not design intent, and flagging them would bury
 * real edits in noise:
 *
 *   $schema                          Desktop stamps its own version (2.11.0)
 *   *.isDefaultSort                  Desktop drops the default value
 *   *.howCreated                     normalised on some filter types
 *
 * Anything NOT on this list is treated as a genuine change worth reporting.
 */
const IGNORE = [
  /^\$schema$/,
  /\.isDefaultSort$/,
  /^visual\.query\.sortDefinition\.isDefaultSort$/,
];
const ignored = (k) => IGNORE.some((re) => re.test(k));

/** Flatten JSON to dotted leaf paths so a diff can name the exact property. */
function leaves(obj, prefix, acc) {
  if (obj === null || typeof obj !== 'object') {
    acc.set(prefix, JSON.stringify(obj));
    return acc;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => leaves(v, `${prefix}[${i}]`, acc));
    return acc;
  }
  for (const k of Object.keys(obj)) leaves(obj[k], prefix ? `${prefix}.${k}` : k, acc);
  return acc;
}

/** Meaningful differences only — Desktop's own normalisation is filtered out. */
function describe(aText, bText) {
  let a, b;
  try { a = JSON.parse(aText); b = JSON.parse(bText); } catch (e) { return ['(unparseable)']; }
  const la = leaves(a, '', new Map());
  const lb = leaves(b, '', new Map());
  const notes = [];
  for (const [k, v] of la) {
    if (ignored(k)) continue;
    if (!lb.has(k)) notes.push(`  - removed by build: ${k} = ${v}`);
    else if (lb.get(k) !== v) notes.push(`  ~ ${k}\n      on disk: ${v}\n      build:   ${lb.get(k)}`);
  }
  for (const k of lb.keys()) if (!ignored(k) && !la.has(k)) notes.push(`  + added by build: ${k}`);
  return notes;
}

// Snapshot live, regenerate, compare, restore.
const live = readTree(LIVE);
const backup = path.join(os.tmpdir(), `pbir-drift-${Date.now()}`);
fs.cpSync(LIVE, backup, { recursive: true });

try {
  execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'pipe' });
} catch (e) {
  console.error('build.js failed; cannot check drift.');
  console.error(e.stdout ? e.stdout.toString() : e.message);
  process.exit(2);
}

const fresh = readTree(LIVE);

// Restore whatever was there so this script is read-only in effect.
fs.rmSync(LIVE, { recursive: true, force: true });
fs.cpSync(backup, LIVE, { recursive: true });
fs.rmSync(backup, { recursive: true, force: true });

const changed = [];
const onlyLive = [];
const onlyFresh = [];
const notes = new Map();
for (const [k, v] of live) {
  if (!fresh.has(k)) { onlyLive.push(k); continue; }
  if (fresh.get(k) === v) continue;
  // Byte-different, but is anything MEANINGFULLY different?
  const n = describe(v, fresh.get(k));
  if (n.length) { changed.push(k); notes.set(k, n); }
}
for (const k of fresh.keys()) if (!live.has(k)) onlyFresh.push(k);

if (!changed.length && !onlyLive.length && !onlyFresh.length) {
  console.log('No drift. Disk matches the generator — safe to run build.js.');
  console.log('(Desktop normalisation such as $schema bumps is ignored.)');
  process.exit(0);
}

console.log('DRIFT DETECTED — disk does not match what build.js produces.');
console.log('Running build.js now would DISCARD the differences below.\n');

if (onlyLive.length) {
  console.log(`Visuals on disk the generator would delete (${onlyLive.length}):`);
  onlyLive.forEach((k) => console.log(`  ${k}`));
  console.log('');
}
if (onlyFresh.length) {
  console.log(`Visuals the generator would add (${onlyFresh.length}):`);
  onlyFresh.forEach((k) => console.log(`  ${k}`));
  console.log('');
}
if (changed.length) {
  console.log(`Visuals that differ (${changed.length}):`);
  for (const k of changed) {
    console.log(`  ${k}`);
    if (listMode) notes.get(k).forEach((n) => console.log(n));
  }
  console.log('');
}

console.log('Fold these into powerbi/build/build.js before rebuilding.');
console.log('Re-run with --list to see the exact properties that differ.');
process.exit(1);
