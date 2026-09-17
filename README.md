<div align="center">

# 🌍 WORLD EYES VIEW

### Open world signals on one interactive 3D globe

**World news · live aircraft · orbital satellites · earthquakes · trade context**

[![CI](https://github.com/dvilrgamerz/world-eyes-views-/actions/workflows/ci.yml/badge.svg)](https://github.com/dvilrgamerz/world-eyes-views-/actions/workflows/ci.yml)

</div>

---

## What it is

World Eyes View is an original open-data situational-awareness dashboard built from scratch. It combines multiple public data sources into one responsive Cesium 3D globe with a cockpit-style HUD.

The idea is inspired by projects that combine public world signals into a globe, including **God's Eye View**, but this repository does **not** copy that project's source code, branding, assets, or UI. This is a separate implementation.

## Features

- 🌐 Interactive 3D Earth with satellite, street, and dark basemap modes
- 📰 Continuously refreshing worldwide news feed and scrolling headline ticker
- ✈️ Aircraft positions from the OpenSky Network
- 🛰️ Satellite positions propagated from current CelesTrak OMM orbital elements using SGP4
- 🌎 USGS M2.5+ earthquakes from the last 24 hours
- 📦 Latest-available merchandise imports/exports from World Bank / WTO data
- 🔎 Search loaded aircraft, satellites, countries, and signals
- 🎯 Click any globe object for detailed telemetry and fly-to tracking
- 📱 Responsive phone layout with bottom navigation
- 🟢 Per-feed health and freshness indicators
- ⚡ Netlify Functions for API proxying, caching, and secret protection
- ✅ GitHub Actions syntax validation

## Data freshness

| Layer | Source | Typical behavior |
| --- | --- | --- |
| News | GDELT DOC 2.0 | Recent global coverage; UI refreshes every 90 seconds |
| Aircraft | OpenSky Network | Near-real-time state vectors; UI refreshes every 30 seconds |
| Satellites | CelesTrak + satellite.js | Current orbital elements propagated to the present time; refreshes every 60 seconds |
| Earthquakes | USGS | M2.5+ events from the last 24 hours; refreshes every 2 minutes |
| Trade | World Bank / WTO | Latest available **annual** merchandise data; not a live cargo/shipment feed |

### Important limits

No public web app can guarantee literally every aircraft, satellite, headline, or trade movement in real time. Provider coverage, outages, quotas, delayed reporting, blocked transponders, and browser performance all matter.

For performance, this app loads a configurable sample of large satellite groups (900 by default, server cap 1,500) and caps aircraft returned to the browser. The server reports the provider source and the UI labels delayed datasets honestly.

## Deploy on Netlify

This project is already configured for Netlify.

1. Import this GitHub repository into Netlify.
2. Leave the publish directory as `.` — `netlify.toml` already configures it.
3. Deploy.
4. Optional but recommended: create an OpenSky API client and add these Netlify environment variables:

```text
OPENSKY_CLIENT_ID=your_client_id
OPENSKY_CLIENT_SECRET=your_client_secret
```

The OpenSky secret stays inside the serverless function and is never sent to the browser.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Then open the local URL printed by Netlify CLI.

## Project structure

```text
.
├── index.html
├── styles.css
├── src/
│   └── app.js
├── netlify/
│   └── functions/
│       ├── news.mjs
│       ├── flights.mjs
│       ├── satellites.mjs
│       ├── quakes.mjs
│       └── trade.mjs
├── .github/workflows/ci.yml
├── netlify.toml
├── package.json
└── .env.example
```

## Data providers and credits

- [GDELT Project](https://www.gdeltproject.org/) — worldwide news discovery
- [OpenSky Network](https://opensky-network.org/) — aircraft state vectors
- [CelesTrak](https://celestrak.org/) — orbital element data
- [satellite.js](https://github.com/shashwatak/satellite-js) — SGP4/SDP4 propagation
- [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) — earthquake feed
- [World Bank Data](https://data.worldbank.org/) / WTO — merchandise trade indicators
- [CesiumJS](https://cesium.com/platform/cesiumjs/) — 3D globe rendering
- Basemap attribution is displayed in-app for Esri, OpenStreetMap, and CARTO where used.

Always follow each provider's terms, attribution requirements, and rate limits.

## Security / privacy

- API secrets belong in Netlify environment variables, never committed to Git.
- `.env` files are ignored.
- The page does not request camera, microphone, or geolocation permissions.
- External headline links open in a new tab with `noopener noreferrer`.

## Roadmap

Possible next layers include weather radar, wildfire data, rocket launches, public webcams, aviation trails, satellite orbit lines, port data, and an optional AIS ship provider where licensing/API access permits it.

## License

MIT License for the original World Eyes View code in this repository. External data and map tiles remain subject to their respective providers' licenses and terms.
