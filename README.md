<div align="center">

# 🌍 WORLD EYES VIEW V2

### Live and near-live public world signals on one interactive 3D globe

**News · civil + military aircraft · ships · satellites · earthquakes · natural events · rocket launches · infrastructure · trade**

[![CI](https://github.com/dvilrgamerz/world-eyes-views-/actions/workflows/ci.yml/badge.svg)](https://github.com/dvilrgamerz/world-eyes-views-/actions/workflows/ci.yml)

</div>

---

## What it is

World Eyes View is an open-data situational-awareness dashboard with a responsive Cesium 3D globe and intelligence-style HUD. V2 substantially expands the first build with more real-world layers, target tracking, cockpit-style following, trails, sensor looks, world place search, and shareable views.

The project is inspired by and was developed after reviewing **Bilawal Sidhu's God's Eye View** open-source project. God's Eye View currently publishes its source under the MIT License, which permits reuse and modification when its copyright and permission notice are retained. That notice and the third-party-data caveat are preserved in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

World Eyes View does **not** claim ownership of God's Eye View, its branding, or third-party datasets/assets. Upstream third-party models, camera media, bundled datasets, and provider data are not automatically covered by the MIT source-code license and are not blindly copied here.

## V2 features

- 🌐 Interactive 3D Earth with satellite, street, and dark basemaps
- 📰 Continuously refreshing worldwide news feed and headline ticker
- ✈️ Civil aircraft positions from OpenSky
- 🎖️ Military aircraft contacts from adsb.lol
- 🚢 Optional AISStream vessel tracking around the current camera view
- 🛰️ Satellite positions propagated from CelesTrak orbital elements using SGP4
- 🌎 USGS M2.5+ earthquakes
- 🔥 NASA EONET natural events, including wildfire/storm/volcano/flood filters
- 🚀 Upcoming rocket launches and launch sites from Launch Library 2
- 🏢 Camera-aware OpenStreetMap/Overpass infrastructure lookup for datacenters and dams
- 📦 Latest-available annual merchandise trade context
- 🔎 Search loaded contacts, world places, or `latitude, longitude`
- 🎯 Click-to-inspect and fly to objects
- 🛩️ Cockpit/ride tracking for aircraft, vessels, and satellites
- 〰️ Short in-session trails for moving contacts
- 👁️ Normal, CRT, NVG, thermal-style, and noir display modes (`1`–`5`)
- 🖥️ HUD toggle (`H`), search shortcut (`/`), and escape/reset interactions
- 🔗 Copy a shareable URL containing camera, layers, basemap, sensor, and satellite group
- 📱 Responsive phone UI with scrollable layer/feed panels and bottom navigation
- 🟢 Per-feed freshness/health reporting
- ⚡ Netlify Functions for cross-origin APIs, caching, and server-side secrets
- ✅ GitHub Actions syntax validation

## Data freshness

| Layer | Source | Behavior |
| --- | --- | --- |
| News | GDELT | Recent global reporting; refreshed repeatedly |
| Civil aircraft | OpenSky | Near-real-time state vectors; refreshes about every 30s |
| Military aircraft | adsb.lol | Near-real-time ADS-B contacts; refreshes about every 22s |
| Vessels | AISStream | Live sampled AIS contacts for the current view; requires your API key |
| Satellites | CelesTrak + satellite.js | Orbital elements propagated to the current time |
| Earthquakes | USGS | M2.5+ recent earthquake feed |
| Natural events | NASA EONET | Open active-event catalog, periodically refreshed |
| Rocket launches | Launch Library 2 | Upcoming schedule/site metadata; schedules can change |
| Infrastructure | OpenStreetMap / Overpass | Queried around the current view when enabled |
| Trade | World Bank / WTO series | Latest available **annual** values; not live cargo telemetry |

### Honest limits

“Live world view” does not mean every object on Earth is visible. Coverage depends on each source's sensors, reporting delay, API limits, blocked/disabled transponders, licenses, network availability, and the device rendering the globe. Large feeds are sampled/capped where necessary to keep phones responsive.

Sensor modes in V2 are visualization styles; they are **not** actual thermal/NVG sensors. Cockpit mode follows the public telemetry point; it is not a real cockpit camera.

## Deploy on Netlify

This repository is already configured for Netlify.

1. Import `dvilrgamerz/world-eyes-views-` into Netlify.
2. Leave the publish directory as `.`; `netlify.toml` configures the functions automatically.
3. Deploy.
4. For stronger OpenSky access, optionally add:

```text
OPENSKY_CLIENT_ID=your_client_id
OPENSKY_CLIENT_SECRET=your_client_secret
```

5. To turn on the **Live Vessels** layer, add your own AISStream key:

```text
AISSTREAM_API_KEY=your_aisstream_key
```

Secrets remain in Netlify Functions and are not intentionally sent to the browser.

## Run locally

Requires Node.js 24+.

```bash
npm install
npm run dev
```

For a syntax-only validation pass:

```bash
npm run check
```

## Controls

| Control | Action |
| --- | --- |
| Click a marker | Inspect target |
| Track / Fly To | Move to the selected target; moving contacts become tracked |
| Cockpit | Follow a moving aircraft/vessel/satellite more closely |
| Trail | Show positions collected during this browser session |
| `/` | Focus world search |
| `1`–`5` | Normal / CRT / NVG / thermal-style / noir |
| `H` | Toggle HUD overlays |
| `Esc` | Exit tracking/close panels and dialogs |
| Copy View | Copy camera/layer/style state into a shareable URL |

## Project structure

```text
.
├── index.html
├── v2.css
├── src/
│   ├── world-eyes-v2.js
│   └── app.js                 # retained V1 engine
├── netlify/functions/
│   ├── news.mjs
│   ├── flights.mjs
│   ├── military.mjs
│   ├── vessels.mjs
│   ├── satellites.mjs
│   ├── quakes.mjs
│   ├── events.mjs
│   ├── launches.mjs
│   ├── infrastructure.mjs
│   ├── geocode.mjs
│   └── trade.mjs
├── THIRD_PARTY_NOTICES.md
├── .github/workflows/ci.yml
├── netlify.toml
├── package.json
└── .env.example
```

## Data providers and credits

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the full notice. Current runtime providers include GDELT, OpenSky, adsb.lol, AISStream, CelesTrak, USGS, NASA EONET, The Space Devs / Launch Library 2, OpenStreetMap/Overpass/Nominatim, World Bank, Esri, CARTO, and CesiumJS.

Always follow each provider's current terms, attribution requirements, quotas, and commercial-use restrictions.

## Security / privacy

- Put private API credentials in Netlify environment variables or a local ignored `.env`, never in committed JavaScript.
- `.env` files are ignored by Git.
- The current V2 page does not request camera, microphone, or geolocation permissions.
- External links use separate browser tabs where appropriate.
- Provider failures are surfaced as feed health/errors instead of inventing data.

## Backup

The pre-V2 state was preserved in the branch:

```text
backup-before-gev-upgrade
```

## License

World Eyes View's own code is MIT licensed. Where code or implementation concepts are adapted from God's Eye View, the upstream MIT notice is preserved in `THIRD_PARTY_NOTICES.md`. Third-party datasets, tiles, APIs, models, and media remain under their respective owners' terms.
