import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const viewerSource = readFileSync(new URL('./app/viewer.js', import.meta.url), 'utf8');
const sceneSource = readFileSync(new URL('./app/scene.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

test('viewer exposes a visible provider-independent recovery globe on first frame', () => {
  assert.match(viewerSource, /viewer\.scene\.globe\.show = true;/);
  assert.match(viewerSource, /viewer\.scene\.globe\.baseColor = RECOVERY_GLOBE_COLOR;/);
  assert.match(viewerSource, /viewer\.scene\.backgroundColor = RECOVERY_BACKGROUND_COLOR;/);
});

test('safe mode is user-addressable and disables optional map credentials', () => {
  assert.match(mainSource, /params\.has\('safe'\)/);
  assert.match(mainSource, /googleApiKey: safeMode \? '' : import\.meta\.env\.GOOGLE_MAPS_API_KEY/);
  assert.match(mainSource, /cesiumToken: safeMode \? '' : import\.meta\.env\.CESIUM_ION_TOKEN/);
  assert.match(sceneSource, /safeMode\s*\? \{ tileset: null, route: 'safe-mode', errors: \[\] \}/);
});

test('provider failure keeps the recovery globe visible and reports degraded startup', () => {
  assert.match(sceneSource, /viewer\.scene\.globe\.show = true;/);
  assert.match(sceneSource, /BASEMAP_DEGRADED/);
  assert.match(sceneSource, /Map imagery is unavailable\. Showing the recovery globe/);
});

test('startup exposes diagnostics instead of a silent black-screen failure', () => {
  assert.match(mainSource, /window\.__WEV_BOOT__/);
  assert.match(mainSource, /WEV:UNHANDLED_REJECTION/);
  assert.match(mainSource, /securitypolicyviolation/);
  assert.match(mainSource, /try adding \?safe=1 to the URL/);
});
