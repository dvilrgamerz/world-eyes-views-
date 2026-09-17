import * as Cesium from 'cesium';

const RECOVERY_GLOBE_COLOR = Cesium.Color.fromCssColorString('#173452');
const RECOVERY_BACKGROUND_COLOR = Cesium.Color.fromCssColorString('#02060c');

/** Create the standard globe viewer in caller-owned, visible containers. */
export function createApplicationViewer({ container, creditContainer }) {
  if (!container || !creditContainer)
    throw new TypeError('Viewer and credit containers are required');
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    msaaSamples: 4,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });
  try {
    viewer.targetFrameRate = 60;

    // Keep a visible, provider-independent Earth from the very first frame.
    // Previously the globe started hidden while the async map stack loaded;
    // when both the primary imagery provider and its fallback failed this
    // could leave users staring at a black canvas. Photorealistic 3D switches
    // the globe off later, only after a tileset has actually loaded.
    viewer.scene.globe.show = true;
    viewer.scene.globe.baseColor = RECOVERY_GLOBE_COLOR;
    viewer.scene.backgroundColor = RECOVERY_BACKGROUND_COLOR;

    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18;
    viewer.scene.skyAtmosphere.saturationShift = -0.12;
    viewer.scene.skyAtmosphere.brightnessShift = -0.08;

    const canvas = viewer.scene.canvas;
    const onContextLost = () => {
      console.error('[WEV:WEBGL_CONTEXT_LOST] The 3D rendering context was lost.');
      document.documentElement.dataset.wevRenderState = 'webgl-context-lost';
    };
    const onContextRestored = () => {
      console.info('[WEV:WEBGL_CONTEXT_RESTORED]');
      document.documentElement.dataset.wevRenderState = 'recovering';
      viewer.scene.requestRender();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const destroyViewer = viewer.destroy.bind(viewer);
    viewer.destroy = () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      return destroyViewer();
    };

    return viewer;
  } catch (error) {
    viewer.destroy();
    throw error;
  }
}
