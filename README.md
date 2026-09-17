# 🌐 World Eyes View

[![CI](https://github.com/dvilrgamerz/world-eyes-views-/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dvilrgamerz/world-eyes-views-/actions/workflows/ci.yml)

**World Eyes View** is a browser-based 3D intelligence console for exploring public signals across planet Earth.

It combines a Cesium globe with live or regularly refreshed aircraft, vessels, satellites, earthquakes, public cameras, transit, radio, bikeshare, launch data, active fires, mapped infrastructure, routing, sensor-style visual modes, cockpit tracking, scene playback, annotations, and optional realtime AI voice control.

The actual application lives in the source code. This README is only a setup and project reference.

## Quick start

Requirements: Node.js **24.14.x** or **26.x**.

```bash
git clone https://github.com/dvilrgamerz/world-eyes-views-.git
cd world-eyes-views-
npm ci
npm run doctor
npm run dev
```

Open `http://localhost:4173`.

The app can start without API keys. Esri World Imagery and the keyless terrain/map fallbacks are available at startup, along with the project's keyless data paths.

## Main capabilities

- **Live flights** — civil ADS-B data with tracking, trails, aircraft classes and cockpit mode.
- **Military flights** — separately styled ADS-B military traffic and trace history where available.
- **Live vessels** — AIS vessel tracking when an AISStream key is configured.
- **Satellites** — CelesTrak orbital elements propagated with SGP4.
- **Earthquakes** — recent USGS seismic activity.
- **Traffic** — simulated vehicles on real OSM road geometry, optionally driven by TomTom live flow speeds.
- **Public CCTV** — supported city/highway camera sources projected into the 3D scene.
- **Transit** — supported GTFS-Realtime vehicle feeds.
- **Radio** — geolocated Radio Browser stations.
- **Bikeshare** — live GBFS station availability.
- **Directions** — drive, walk and cycle routes through the globe.
- **Active fires** — NASA FIRMS detections when configured.
- **Space missions** — recent Launch Library 2 launch data and reconstructed trajectory playback.
- **Infrastructure** — bundled datacenters, dams and submarine cables plus viewport-bounded mapped context.
- **Visual modes** — normal, CRT, NVG, thermal/FLIR and other rendering styles.
- **Detection overlay** — screen-space identification overlays for visible contacts.
- **Cockpit** — follow a selected aircraft with terrain-aware camera behavior.
- **Scene Director** — authored camera tours, scene packs, playback and sharing.
- **Annotations** — pins, lines, areas, boundaries and route drawings.
- **Voice control** — optional OpenAI Realtime integration with scene-aware tools and visual grounding.
- **Share state** — camera, layers, visual state and tracked target can be serialized into a URL.

## Optional provider keys

Keys are upgrades, not prerequisites. The in-app **POWER UP → Provider Settings** panel manages supported credentials for local use.

Common optional providers include:

| Provider | Enables |
| --- | --- |
| Cesium ion | Photorealistic 3D/world terrain and additional ion-hosted map stacks, subject to current plan terms |
| Google Maps | Direct Photorealistic 3D and place search; billing-enabled and metered |
| OpenAI | Realtime voice control and AI HUD summaries |
| AISStream | Live global vessel feed |
| NASA FIRMS | Active-fire detections |
| TomTom | Live traffic-flow speeds/congestion context |
| OpenSky credentials | Additional authenticated flight polling capacity where eligible |
| Launch Library 2 token | Higher launch-data request allowance |

Never commit API keys. Browser-visible Google Maps and Cesium tokens should be restricted at the provider.

## Data honesty

World Eyes View intentionally distinguishes observations from models and reconstructions:

- live feeds can be delayed, incomplete, stale or temporarily unavailable;
- traffic vehicles are simulated on real roads, even when live flow speeds influence them;
- public-camera positions may be published while camera pose/view volumes are estimated;
- launch trajectories are reconstructed estimates, not authoritative telemetry;
- mapped infrastructure coverage is incomplete by nature.

Do not use this application for navigation, emergency response, safety-critical operations, medical decisions, investment decisions, or other situations where an incorrect or delayed visualization could cause harm. Verify important information with the authoritative source.

## Development checks

```bash
npm run doctor -- --json
npm run format:check
npm run check:boundaries
npm test
npm run build
```

CI runs the project on Node 24.14.x and Node 26.x and also checks the Windows/Pinokio onboarding path.

## Project structure

```text
src/
├── app/          application composition and runtime ownership
├── layers/       independently managed globe layers
├── sources/      portable source adapters
├── data/         records, orchestration and bundled geospatial data
├── maps/         imagery, terrain and 3D map providers
├── voice/        realtime voice sessions, actions and tool schemas
├── director/     scene playback engine
├── scenes/       scene authoring and orchestration
├── annotations/  map drawing and geographic annotations
└── ui/           panels, cockpit, HUD and visual controls

server/
└── providers/    server-side provider proxies, limits, caches and credential boundaries
```

New sources should stay modular, cancellable, bounded, attributed and honest about freshness/coverage. New layers should fail independently without taking down the globe.

## Security

The development server binds to localhost by default because it can broker configured provider credentials. Exposing it to a LAN or the public internet changes the threat model. Read [`SECURITY.md`](SECURITY.md) before sharing an instance.

## Licensing and attribution

The repository's source-code license is in [`LICENSE`](LICENSE). Copyright notices required by that license remain intact.

Third-party datasets, imagery, 3D models, map providers and runtime feeds keep their own licenses and terms; they are **not automatically covered by the code license**. See [`DATA_SOURCES.md`](DATA_SOURCES.md) and [`public/models/README.md`](public/models/README.md) before redistribution or commercial deployment.

World Eyes View does not remove or override required provider attribution.
