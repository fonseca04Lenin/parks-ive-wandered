# Parks I've Wandered

A 3D satellite map of the US national parks I've visited. Visited parks, nature spots and other places show as glowing 3D pickup items. Clicking one flies down into the terrain and shows when I was there, and the road trip draws itself in orange.

- **Map:** `mockup/index.html` (served at `/`). Built with MapLibre GL (satellite imagery + terrain) and three.js (the animated items).
- **Data:** `data/` holds the 63 parks, my trips (`trips.json` / `trips.js`, generated) and hand edits (`overrides.json`).
- **Import:** `scripts/import-timeline.mjs` turns a Google Maps Timeline export into `data/trips.*`. The raw export goes in `raw/`, which is never committed or deployed. Routes are trimmed near home.

## Update the data

```bash
node scripts/import-timeline.mjs raw/Timeline.json
```

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/mockup/index.html.

See [PLAN.md](PLAN.md) for the full plan.
