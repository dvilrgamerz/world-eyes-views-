import { createApplicationOperations } from './operations.js';
import * as Cesium from 'cesium';
import { createApplicationViewer } from '../app/viewer.js';
import { registerDataCredits } from '../data/dataCredits.js';
import { configureCreditKeyboardAccess } from '../creditKeyboard.js';
import { MapStackController } from '../mapStackController.js';
import { loadPhotorealisticTileset } from '../mapStartup.js';
import { initLogoGaze } from '../logoGaze.js';
import {
  uninstallRenderGovernor,
  governorRequestRender,
} from '../renderGovernor.js';
import { describeError } from './errors.js';

function markSceneBoot(stage, details = {}) {
  if (typeof window === 'undefined') return;
  const event = { stage, at: Math.round(performance.now()), ...details };
  if (Array.isArray(window.__WEV_BOOT__)) window.__WEV_BOOT__.push(event);
  document.documentElement.dataset.wevBootStage = stage;
  console.info('[WEV:BOOT]', event);
}

/** Construct the application globe using the caller's local configuration. */
export async function createApplicationScene({
  requestServices,
  googleApiKey,
  cesiumToken,
  safeMode = false,
  credits,
  MapController = MapStackController,
  mapOptions = {},
  loaderStatus,
  signal,
  defer,
}) {
  const operations = createApplicationOperations({
    requests: requestServices,
    signal,
  });
  defer(initLogoGaze());
  const previousKey = window.__GOOGLE_MAPS_API_KEY__;
  if (googleApiKey) {
    window.__GOOGLE_MAPS_API_KEY__ = googleApiKey;
    defer(() => {
      if (window.__GOOGLE_MAPS_API_KEY__ !== googleApiKey) return;
      if (previousKey === undefined) delete window.__GOOGLE_MAPS_API_KEY__;
      else window.__GOOGLE_MAPS_API_KEY__ = previousKey;
    });
  }
  loaderStatus.textContent = safeMode
    ? 'Safe mode: configuring recovery globe...'
    : 'Configuring viewer...';
  // Provider attribution stays visible, including clean-view and recording.
  const creditContainer = document.createElement('div');
  creditContainer.id = 'cesium-credits';
  document.body.appendChild(creditContainer);
  defer(() => creditContainer.remove());
  const viewer = createApplicationViewer({
    container: 'cesiumContainer',
    creditContainer,
  });
  markSceneBoot('VIEWER_CREATED', { safeMode });
  document.documentElement.dataset.wevRenderState = 'core-visible';
  defer(() => {
    uninstallRenderGovernor(viewer);
    if (!viewer.isDestroyed()) viewer.destroy();
  });
  registerDataCredits(viewer, credits);
  configureCreditKeyboardAccess(document);

  loaderStatus.textContent = safeMode
    ? 'Safe mode: loading the keyless globe...'
    : googleApiKey || cesiumToken
      ? 'Loading Google 3D Tiles...'
      : 'Loading the keyless globe...';

  const photoreal = safeMode
    ? { tileset: null, route: 'safe-mode', errors: [] }
    : await loadPhotorealisticTileset(Cesium, {
        googleApiKey,
        cesiumToken,
      });
  const tileset = photoreal.tileset;
  // A provider can finish after cancellation; retain ownership of its result.
  defer(() => {
    if (tileset && !tileset.isDestroyed()) {
      if (!viewer.scene.primitives.remove(tileset)) tileset.destroy();
    }
  });
  signal.throwIfAborted();
  if (tileset) {
    viewer.scene.primitives.add(tileset);
    // NOTE: Cesium World Terrain intentionally disabled — conflicts with Google 3D Tiles at high zoom.
    // Google Photorealistic 3D Tiles provide their own terrain/elevation.
    viewer.scene.globe.show = false;
    markSceneBoot('OPTIONAL_3D_READY', { route: photoreal.route });
    console.info(`[Init] Google 3D Tiles loaded via ${photoreal.route}.`);
  } else {
    // The viewer already exposes a provider-independent recovery globe. Keep it
    // visible while Esri/OSM imagery starts so provider failures cannot produce
    // a completely black canvas.
    viewer.scene.globe.show = true;
    if (photoreal.errors.length) {
      const tileError = photoreal.errors.at(-1);
      console.warn(
        '[Init] Google 3D Tiles unavailable, using the keyless globe:',
        tileError,
      );
      const tileErrorDetail = describeError(tileError);
      loaderStatus.textContent = `Google 3D Tiles unavailable (${tileErrorDetail}). Loading the keyless globe...`;
    }
    markSceneBoot('KEYLESS_GLOBE_VISIBLE', { safeMode });
  }

  loaderStatus.textContent = safeMode
    ? 'Safe mode: initializing core systems...'
    : 'Initializing systems...';

  const mapStackController = new MapController(viewer, {
    requestRender: governorRequestRender,
    ...mapOptions,
    googleTileset: tileset,
    cesiumToken,
    initialStack: tileset ? 'photoreal' : 'esri-imagery',
    // Task 5 (height-datum fix): rebroadcast stack changes as a window
    // CustomEvent so data layers (CCTV per-regime ground resolution) can
    // react without coupling MapStackController to layer modules. Fires on
    // 'switching'/'ready'/'error'; listeners derive the surface regime from
    // live scene state, so intermediate emissions are harmless.
    onChange: (state) => {
      window.dispatchEvent(
        new CustomEvent('gev:map-stack-changed', { detail: state }),
      );
    },
    onError: (message) => console.warn('[MapStack]', message),
  });
  defer(() => mapStackController.destroy());
  const mapState = await mapStackController.setStack(
    tileset ? 'photoreal' : 'esri-imagery',
    { silent: true },
  );

  if (!tileset) {
    // Even when Esri and OSM both fail, the colored recovery globe remains
    // visible and interactive. This is intentionally independent of network
    // providers so startup can always produce a useful first frame.
    viewer.scene.globe.show = true;
    viewer.scene.requestRender();
    if (mapState?.lastError) {
      loaderStatus.textContent =
        'Map imagery is unavailable. Showing the recovery globe; provider layers can retry later.';
      markSceneBoot('BASEMAP_DEGRADED', { error: mapState.lastError });
    } else {
      markSceneBoot('BASEMAP_READY', { stack: mapState?.activeId || 'unknown' });
    }
  } else {
    markSceneBoot('BASEMAP_READY', { stack: 'photoreal' });
  }

  document.documentElement.dataset.wevRenderState = 'ready';
  signal.throwIfAborted();
  return { viewer, tileset, mapStackController, operations };
}
