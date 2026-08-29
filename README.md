# Promet SI · LIVE — GPS dashboard (Node.js)

Multi-operator **read-only** live vehicle dashboard for Slovenia:
- 🚌 **Javni promet** — brezavta.si open API (buses/trains, all operators incl. Murska Sobota)
- 🚕 **Taxi** — Laguna + Maribor (NetCab endpoints)
- 🛴 **Micromobility** — brezavta.si micromobility (floating bikes/scooters)

Frontend: Leaflet + CARTO Voyager tiles. Backend polls every `LAGUNA_INTERVAL`
seconds, writes `laguna_data.json` + `laguna_dashboard.html`, serves both.

## Features
- `still-pulls` gate: buses that report the SAME spot 4 polls (~80s) are hidden
  (parked at a stop), reappear on movement. Slow regional buses (e.g. Murska
  Sobota) stay visible since the gate is position-based, not speed-based.
- Teleport/GPS-jump rejection: bad readings keep last good spot.
- Speed from GPS delta (API `speed` is 0 for ~88% of buses).
- Self-ping every 10 min so Render's free tier never sleeps → 24/7.

## Run locally
```bash
npm install
PORT=8098 LAGUNA_INTERVAL=20 node server.js
# open http://localhost:8098/laguna_dashboard.html
```

## Deploy to Render (free, 24/7)
1. Push this folder to a GitHub repo.
2. Render.com → New → Blueprint → select repo (uses `render.yaml`).
3. Free plan, Frankfurt region. Deploy.
4. URL: `https://<yours>.onrender.com/laguna_dashboard.html`

Env vars (set in `render.yaml` or dashboard):
- `PORT` — Render injects this (default 10000).
- `LAGUNA_INTERVAL` — poll seconds (default 20).

## Project layout
```
server.js          # everything: poll + serve + frontend HTML
package.json
render.yaml        # Render Blueprint (free web service)
.gitignore
```
