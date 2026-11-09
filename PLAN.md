# National Park Tracker — Plan

A full-screen, interactive 3D satellite map of the US showing the national parks I've visited — just the map, nothing around it.
Visited parks glow orange; clicking one flies down into the park in 3D, shows the date(s) I was there, and draws the road trip it was part of.

Mockups (sample data — open in a browser):
- [`mockup/index.html`](mockup/index.html) — **current direction:** full-screen satellite map with 3D terrain.
- [`mockup/journal-2d.html`](mockup/journal-2d.html) — earlier flat, hand-drawn paper map (kept for reference).

---

## 1. Look & feel — full-screen 3D satellite map

| Element | Design |
|---|---|
| Map | Fills the whole screen. Real satellite imagery (nature's own colors: desert reds, forest greens, blue lakes) with hillshading |
| 3D | Real elevation terrain (1.6x exaggerated) so mountains and canyons stand up; the camera is tilted, with a sky and a soft haze on the horizon |
| 3D park beacons | Orange 3D columns rise from every visited park (tall at country view, slim when zoomed in) |
| Visited parks | Glowing orange dots with a pulse ring; handwritten labels appear for the selected trip's parks |
| Unvisited parks | Soft white translucent dots ("still to see") |
| Road trips | Faint dotted lines for all trips; the selected trip draws itself in bright orange, draped over the terrain, while a little marker drives along it |
| State borders | Faint cream dashed lines that fade as you zoom in |
| Park info card | Small paper-colored popup on the map: park name, visit date(s), and trip name + "day X of Y" |
| Map overlays | Small paper-colored cards only: a legend (top-left), region buttons + 3D switch (bottom-left), zoom/tilt controls (top-right) |
| Typography | Fraunces (vintage serif) for buttons and park names, Lora for text, Caveat (handwriting) for labels and the trip name |
| Alaska / Hawaii | Buttons over the map (Lower 48 / Alaska / Hawaiʻi) fly the camera there; the 3D button switches between 3D and flat |

### Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│ [· visited ○ still to see — the road]                         [+]    │
│                                                               [−]    │
│                                                               [⦿]    │
│            3D satellite terrain, orange beacons,                     │
│            the selected road trip drawn in orange                    │
│                      ┌───────────────────────┐                       │
│                      │ Arches                │                       │
│                      │ Monday, June 17, 2024 │                       │
│                      │ Southwest Loop · day 5 of 9                   │
│                      └──────────●────────────┘                       │
│                                                                      │
│ [Lower 48][Alaska][Hawaiʻi][3D]                      © attribution   │
└──────────────────────────────────────────────────────────────────────┘
```

### Interactions
- **Hover an unvisited park** → small card with its name + state.
- **Click a visited park** → the camera flies down into the park in 3D (tilted ~68°, close enough to see the mountains/canyons),
  the info card opens with the date(s) and trip, the trip's road lights up orange and draws itself, and the trip's parks get handwritten labels.
- **Drag / right-drag / scroll** → pan, rotate + tilt, zoom.
- **Lower 48 button / Esc** → back to the country overview; closes the card.
- **Alaska / Hawaiʻi buttons** → fly there. **3D button** → toggle terrain and beacons.
- Mobile: the legend hides; everything else stays on the map.

---

## 2. Tech stack

- **Vite + TypeScript** (static site, no backend needed)
- **MapLibre GL JS** (free, open source, no API key) for the 3D map:
  - Satellite tiles: **Esri World Imagery** (free with attribution for personal/non-commercial use).
    If the site ever gets heavy traffic or goes commercial, swap in **MapTiler Satellite** or **Mapbox Satellite** (free tiers, need an API key).
  - Elevation: **AWS Terrain Tiles** (Terrarium format, free) → MapLibre `terrain` + `hillshade` + `sky`.
  - 3D beacons: `fill-extrusion` layer; routes: `line` layer with `line-gradient` for the draw-in animation.
- **D3** only for date formatting; **`us-atlas`** for state borders.
- **Data files** checked into the repo:
  - `data/parks.json` — all 63 parks: id, name, state, lat/lon (from the NPS API or a static list).
  - `data/trips.json` — my trips, generated from Google Maps data (below) or edited by hand.
- **Deploy**: Vercel or GitHub Pages (plain static build).

### Data model
```ts
type Park  = { id: string; name: string; state: string; lat: number; lon: number };
type Visit = { parkId: string; date: string /* YYYY-MM-DD */; endDate?: string };
type Trip  = {
  id: string; name: string; start: string; end: string;
  miles?: number;
  visits: Visit[];
  route: [lon: number, lat: number][];   // simplified polyline
};
```

---

## 3. Using my Google Maps data

Google Maps **Timeline** (location history) has exactly what's needed: where I was, when, and the path I drove.

### Step 1 — Export (done by me, on my phone)
Timeline data now lives on the device, not in Google's cloud, so Google Takeout usually no longer includes it.
- **Android:** Settings → Location → Location services → Timeline → *Export Timeline data* → saves `Timeline.json`.
- **iPhone:** Google Maps → profile picture → Settings → Personal content → *Export Timeline data*.
- (If I have an older Takeout export, `Semantic Location History/YYYY/YYYY_MONTH.json` also works.)
- Bonus: Takeout → *Maps (your places)* → `Saved Places.json` gives starred places (no dates, but useful for checking).

Put the file in `raw/` — this folder is **git-ignored**, so my full location history never gets committed or published.

### Step 2 — Import script (`scripts/import-timeline.ts`, runs locally)
1. **Parse** `semanticSegments` → `visit` entries (place + start/end time) and `timelinePath` / `activity` entries (GPS path points).
2. **Match parks:** check each visit/path point against NPS park **boundary polygons**
   (NPS public boundary GeoJSON) with a point-in-polygon test (`@turf/boolean-point-in-polygon`).
   Fallback: within ~15 km of the park's center point.
3. **Group into road trips:** sort park visits by date; consecutive visits with a gap of ≤ 3 days
   (and no long stretch back at "home") belong to the same trip.
4. **Build the route:** collect the path points between the trip's start and end, simplify them
   (`@turf/simplify`, ~1 km tolerance) so the file stays small, and compute miles driven.
5. **Write** `data/trips.json` with only: park ids, dates, and the simplified route —
   nothing else from my history leaves my computer.
6. **Manual overrides** in `data/overrides.json` (rename trips, add visits from before Timeline existed, hide a park).

### Step 3 — Review
Run `npm run import`, which prints a summary ("Found 11 parks across 3 trips…") so I can check it before committing.

---

## 4. Build steps

1. Scaffold Vite + TS, add a full-screen MapLibre map with satellite imagery, 3D terrain and sky.
2. Add `parks.json` (all 63, including American Samoa + Virgin Islands) and plot visited vs. unvisited + 3D beacons.
3. Info card + click/hover interactions + region buttons and 3D switch.
4. Trip routes with draw animation + fly-to-park camera.
5. Google Timeline import script + overrides.
6. Polish: mobile touch controls, keyboard support, a slow orbit around the selected park, phone performance (turn terrain off on low-end devices).
7. Deploy.
