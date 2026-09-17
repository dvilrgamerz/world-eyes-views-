import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';

const params = new URLSearchParams(window.location.search);
const safeMode = params.has('safe');

window.__WEV_BOOT__ = [];
function markBoot(stage, details = {}) {
  const event = { stage, at: Math.round(performance.now()), ...details };
  window.__WEV_BOOT__.push(event);
  document.documentElement.dataset.wevBootStage = stage;
  console.info('[WEV:BOOT]', event);
}

window.addEventListener('error', (event) => {
  console.error('[WEV:WINDOW_ERROR]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[WEV:UNHANDLED_REJECTION]', event.reason);
});
document.addEventListener('securitypolicyviolation', (event) => {
  console.error('[WEV:CSP]', {
    directive: event.violatedDirective,
    blocked: event.blockedURI,
  });
});

markBoot('DOM_READY', { safeMode });

const application = createStandaloneApplication({
  googleApiKey: safeMode ? '' : import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: safeMode ? '' : import.meta.env.CESIUM_ION_TOKEN,
  safeMode,
  allowQaRegistration: import.meta.env.DEV,
});

markBoot('APP_STARTING');
application
  .start()
  .then(() => {
    markBoot('APP_INTERACTIVE');
    document.documentElement.dataset.wevRenderState = 'ready';
  })
  .catch((error) => {
    markBoot('APP_FAILED', { message: describeError(error) });
    document.documentElement.dataset.wevRenderState = 'error';
    console.error('World Eyes View initialization failed:', error);
    const loaderStatus = document.querySelector('#loading-screen .loader-status');
    if (loaderStatus) {
      loaderStatus.textContent = `Error: ${describeError(error)} — try adding ?safe=1 to the URL.`;
      loaderStatus.style.color = '#ff4444';
    }
  });

export { application, safeMode };
