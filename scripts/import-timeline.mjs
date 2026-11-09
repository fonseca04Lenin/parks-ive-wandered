// Turns a Google Maps Timeline export into data/trips.json (+ data/trips.js for the map).
// Usage: node scripts/import-timeline.mjs [raw/Timeline.json]
// Only park ids, dates and a simplified, home-trimmed route are written out.
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2] ?? "raw/Timeline.json";
const parks = JSON.parse(readFileSync("data/parks.json", "utf8"));
const overrides = JSON.parse(readFileSync("data/overrides.json", "utf8"));
const raw = JSON.parse(readFileSync(SRC, "utf8"));
const segments = Array.isArray(raw) ? raw : raw.semanticSegments ?? [];

const AWAY_KM = 150;          // farther than this from home counts as "on a trip"
const TRIP_GAP_H = 36;        // a gap longer than this with no away points splits trips
const SIMPLIFY_KM = 1;        // route simplification tolerance
const TRIM_KM = overrides.trimHomeKm ?? 40;

// ---------- helpers ----------
const geo = s => { const [a, b] = String(s).replace("geo:", "").replace("°", "").split(",").map(Number); return [a, b]; };
const toRad = d => d * Math.PI / 180;
function km([lat1, lon1], [lat2, lon2]) {
  const h = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const offsetMin = s => { const m = /([+-])(\d\d):(\d\d)$/.exec(s); return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : null; };

// local-time offsets: some timestamps are UTC ("Z"), so borrow the offset of the nearest record that has one
const offsets = segments.map(s => [Date.parse(s.startTime), offsetMin(s.startTime)]).filter(([, o]) => o !== null).sort((a, b) => a[0] - b[0]);
function localDate(ms) {
  let lo = 0, hi = offsets.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid][0] < ms) lo = mid + 1; else hi = mid; }
  const near = [offsets[lo], offsets[lo - 1]].filter(Boolean).sort((a, b) => Math.abs(a[0] - ms) - Math.abs(b[0] - ms))[0];
  return new Date(ms + (near ? near[1] : -360) * 60000).toISOString().slice(0, 10);
}

// ---------- flatten every location sample ----------
const points = []; // { t, p, kind, minutes }

for (const s of segments) {
  const t = Date.parse(s.startTime), end = Date.parse(s.endTime);
  if (s.visit?.topCandidate?.placeLocation) {
    const loc = s.visit.topCandidate.placeLocation;
    const p = geo(loc.latLng ?? loc), type = s.visit.topCandidate.semanticType;
    points.push({ t, p, kind: "visit", minutes: (end - t) / 60000, type });
    points.push({ t: end, p, kind: "visit-end", minutes: 0, type });   // so "left home at…" uses the departure time
  } else if (s.timelinePath) {
    // note: activity start/end coordinates are skipped on purpose — in this export they belong to only the
    // last leg of a drive, not the segment's start/end time, so they'd put places on the wrong day
    for (const q of s.timelinePath) points.push({ t: t + (+q.durationMinutesOffsetFromStartTime || 0) * 60000, p: geo(q.point), kind: "path" });
  }
}
points.sort((a, b) => a.t - b.t);

// ---------- home = place with the most visit time ----------
const homeVotes = new Map();
for (const pt of points.filter(p => p.kind === "visit")) {
  const key = pt.p.map(v => v.toFixed(2)).join(",");
  homeVotes.set(key, (homeVotes.get(key) ?? 0) + pt.minutes + (pt.type === "Home" ? 10000 : 0));
}
const home = [...homeVotes.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);

// ---------- park hits ----------
const hits = new Map(); // "park|date" -> { parkId, date, n, visitMin, closestKm }
for (const pt of points) for (const park of parks) {
  const d = km(pt.p, [park.lat, park.lon]);
  if (d > park.radiusKm) continue;
  const date = localDate(pt.t), key = `${park.id}|${date}`;
  const h = hits.get(key) ?? { parkId: park.id, date, n: 0, visitMin: 0, closestKm: Infinity, t: pt.t };
  h.n++; h.closestKm = Math.min(h.closestKm, d); h.t = Math.min(h.t, pt.t);
  if (pt.kind === "visit") h.visitMin += pt.minutes;
  hits.set(key, h);
}
const excluded = new Set((overrides.exclude ?? []).map(e => `${e.parkId}|${e.date}`));
let parkDays = [...hits.values()].filter(h => !excluded.has(`${h.parkId}|${h.date}`));
for (const inc of overrides.include ?? []) parkDays.push({ parkId: inc.parkId, date: inc.date, n: 0, visitMin: 0, closestKm: 0, t: Date.parse(inc.date + "T18:00:00Z"), manual: true });

// ---------- trips: runs of time spent far from home ----------
const away = points.filter(pt => km(pt.p, home) > AWAY_KM);
const runs = [];
for (const pt of away) {
  const last = runs.at(-1);
  if (last && pt.t - last.end < TRIP_GAP_H * 3600000) { last.end = pt.t; last.pts.push(pt); }
  else runs.push({ start: pt.t, end: pt.t, pts: [pt] });
}

// Douglas–Peucker (in km, using a flat approximation, fine at this scale)
function simplify(line, tol) {
  if (line.length < 3) return line;
  const kx = 111.32 * Math.cos(toRad(line[0][1])), ky = 110.57;
  const xy = line.map(([lon, lat]) => [lon * kx, lat * ky]);
  const keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bi = -1;
    const [x1, y1] = xy[a], [x2, y2] = xy[b], len = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - xy[i][1]) - (x1 - xy[i][0]) * (y2 - y1)) / len; if (d > best) { best = d; bi = i; } }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const parkById = Object.fromEntries(parks.map(p => [p.id, p]));
const trips = [];
for (const run of runs) {
  // widen the window to include the drive out from / back to home
  const before = points.filter(p => p.t < run.start && run.start - p.t < 24 * 3600000);
  const after = points.filter(p => p.t > run.end && p.t - run.end < 24 * 3600000);
  const outStart = [...before].reverse().find(p => km(p.p, home) < TRIM_KM)?.t ?? run.start;
  const backEnd = after.find(p => km(p.p, home) < TRIM_KM)?.t ?? run.end;
  const inTrip = parkDays.filter(h => h.t >= outStart && h.t <= backEnd);
  if (!inTrip.length) continue;

  // visits: merge consecutive days at the same park
  const byPark = new Map();
  for (const h of inTrip.sort((a, b) => a.date.localeCompare(b.date))) {
    const v = byPark.get(h.parkId);
    if (!v) byPark.set(h.parkId, { parkId: h.parkId, date: h.date, endDate: undefined, first: h.t });
    else if (h.date > (v.endDate ?? v.date)) v.endDate = h.date;
  }
  // a park passed twice on one trip (e.g. in and back out) keeps its full date span
  const visits = [...byPark.values()].sort((a, b) => a.first - b.first).map(({ first, ...v }) => (v.endDate ? v : { parkId: v.parkId, date: v.date }));

  const tripPts = points.filter(p => p.t >= outStart && p.t <= backEnd && km(p.p, home) > TRIM_KM);
  const route = simplify(tripPts.map(p => [+p.p[1].toFixed(4), +p.p[0].toFixed(4)]), SIMPLIFY_KM);
  // distance from the GPS trail itself (straight lines between samples, so a slight underestimate)
  const all = points.filter(p => p.t >= outStart && p.t <= backEnd);
  let distKm = 0;
  for (let i = 1; i < all.length; i++) distKm += km(all[i - 1].p, all[i].p);
  const miles = Math.round(distKm / 1.60934);
  const start = localDate(outStart), end = localDate(backEnd);
  const id = `trip-${start}`;
  const names = visits.map(v => parkById[v.parkId].name);
  const autoName = `${names.length > 2 ? names.slice(0, -1).join(", ") + " & " + names.at(-1) : names.join(" & ")} · ${months[+start.slice(5, 7) - 1]} ${start.slice(0, 4)}`;
  trips.push({ id, name: overrides.tripNames?.[id] ?? autoName, start, end, miles, visits, route });
}

// ---------- parks I've been to that aren't in the Timeline (from memory) ----------
const onTrips = new Set(trips.flatMap(t => t.visits.map(v => v.parkId)));
const extraVisits = (overrides.alsoVisited ?? [])
  .filter(v => parkById[v.parkId] && !onTrips.has(v.parkId))
  .map(({ parkId, date = null, note }) => ({ parkId, date, ...(note ? { note } : {}) }));

// ---------- other places (not national parks): find their dates in the Timeline when possible ----------
const otherPlaces = (overrides.otherPlaces ?? []).map(pl => {
  const dates = [...new Set(points.filter(pt => km(pt.p, [pl.lat, pl.lon]) <= (pl.radiusKm ?? 3)).map(pt => localDate(pt.t)))].sort();
  const all = [...new Set([...dates, ...(pl.date ? [pl.date] : []), ...(pl.extraDates ?? [])])].sort();
  return { name: pl.name, kind: pl.kind, lat: pl.lat, lon: pl.lon, dates: all };
});

// ---------- write + report ----------
// nature & wilderness spots picked out of the Timeline (reviewed by hand, listed in overrides.json)
const natureSpots = overrides.natureSpots ?? [];

const out = { generated: new Date().toISOString(), source: "Google Maps Timeline", trips, extraVisits, otherPlaces, natureSpots };
writeFileSync("data/trips.json", JSON.stringify(out, null, 1));
writeFileSync("data/trips.js", `// generated by scripts/import-timeline.mjs — do not edit, edit data/overrides.json instead\nwindow.PARKS = ${JSON.stringify(parks)};\nwindow.TRIP_DATA = ${JSON.stringify(out)};\n`);

const span = `${localDate(points[0].t)} → ${localDate(points.at(-1).t)}`;
console.log(`Timeline: ${segments.length} segments, ${points.length} location samples, ${span}`);
console.log(`Park candidates (before overrides):`);
for (const h of [...hits.values()].sort((a, b) => a.t - b.t))
  console.log(`  ${excluded.has(`${h.parkId}|${h.date}`) ? "✗" : "✓"} ${h.date}  ${parkById[h.parkId].name.padEnd(22)} ${String(h.n).padStart(4)} pts  closest ${h.closestKm.toFixed(1)} km${h.visitMin ? `  stopped ${Math.round(h.visitMin)} min` : ""}`);
console.log(`\nFound ${new Set(trips.flatMap(t => t.visits.map(v => v.parkId))).size} parks across ${trips.length} trips:`);
for (const t of trips) {
  console.log(`  ${t.id}  ${t.name}  (${t.start} → ${t.end}, ${t.miles} mi, ${t.route.length} route pts)`);
  for (const v of t.visits) console.log(`     - ${parkById[v.parkId].name}: ${v.date}${v.endDate ? " → " + v.endDate : ""}`);
}
if (extraVisits.length) {
  console.log(`\nAlso visited (from overrides, not in Timeline):`);
  for (const v of extraVisits) console.log(`  - ${parkById[v.parkId].name}: ${v.date ?? "date not recorded"}`);
}
if (otherPlaces.length) {
  console.log(`\nOther places:`);
  for (const pl of otherPlaces) console.log(`  - ${pl.name} (${pl.kind}): ${pl.dates.length ? pl.dates.join(", ") + (pl.dates.length ? "" : "") : "date not recorded"}`);
}
if (natureSpots.length) {
  console.log(`\nNature & wilderness spots:`);
  for (const n of natureSpots) console.log(`  - ${n.date}  ${n.name} (${n.kind}) — ${n.how}`);
}
