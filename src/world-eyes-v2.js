(() => {
  'use strict';

  const Cesium = window.Cesium;
  const $ = (id) => document.getElementById(id);
  if (!Cesium) {
    document.body.innerHTML = '<div style="padding:24px;background:#02060a;color:#fff;font-family:system-ui">Cesium failed to load. Check the connection and reload.</div>';
    return;
  }

  const LAYERS = ['flights', 'military', 'vessels', 'satellites', 'quakes', 'events', 'launches', 'infrastructure', 'trade'];
  const MOTION_LAYERS = new Set(['flights', 'military', 'vessels', 'satellites']);
  const colors = {
    flights: Cesium.Color.fromCssColorString('#57dcff'),
    military: Cesium.Color.fromCssColorString('#ffb85c'),
    vessels: Cesium.Color.fromCssColorString('#65f1da'),
    satellites: Cesium.Color.fromCssColorString('#b08cff'),
    quakes: Cesium.Color.fromCssColorString('#ff687a'),
    events: Cesium.Color.fromCssColorString('#ff884d'),
    launches: Cesium.Color.fromCssColorString('#f6fbff'),
    infrastructure: Cesium.Color.fromCssColorString('#72a5ff'),
    trade: Cesium.Color.fromCssColorString('#ffd166'),
  };

  const state = {
    viewer: null,
    layerIds: Object.fromEntries(LAYERS.map((layer) => [layer, new Set()])),
    visible: {
      flights: true,
      military: true,
      vessels: false,
      satellites: true,
      quakes: true,
      events: true,
      launches: true,
      infrastructure: false,
      trade: false,
    },
    data: Object.fromEntries(LAYERS.map((layer) => [layer, []])),
    news: [],
    signals: [],
    selected: null,
    history: new Map(),
    trailEntityId: 'world-eyes-active-trail',
    lastUpdated: {},
    feedState: {},
    loadingCount: 0,
    timers: [],
    cameraRefreshTimer: null,
    missingVesselKeyNotified: false,
    hoverEntity: null,
    booted: false,
  };

  function initGlobe() {
    const viewer = new Cesium.Viewer('cesiumContainer', {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      timeline: false,
      animation: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
      vrButton: false,
      scene3DOnly: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });

    viewer.scene.globe.enableLighting = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#061017');
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 180;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 65_000_000;
    viewer.camera.percentageChanged = 0.025;

    state.viewer = viewer;
    setBasemap('satellite');

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-20, 24, 21_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });

    viewer.camera.changed.addEventListener(updateCameraReadout);
    viewer.camera.moveEnd.addEventListener(scheduleViewportFeeds);

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      if (Cesium.defined(picked) && picked.id?._worldEyesData) selectEntity(picked.id, true);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.endPosition);
      const entity = Cesium.defined(picked) && picked.id?._worldEyesData ? picked.id : null;
      updateHoverHud(entity);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  function setBasemap(style) {
    const viewer = state.viewer;
    if (!viewer) return;
    viewer.imageryLayers.removeAll(true);
    let provider;
    if (style === 'street') {
      provider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
        credit: '© OpenStreetMap contributors',
      });
    } else if (style === 'dark') {
      provider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        maximumLevel: 19,
        credit: '© OpenStreetMap contributors © CARTO',
      });
    } else {
      provider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        credit: 'Tiles © Esri',
      });
    }
    viewer.imageryLayers.addImageryProvider(provider);
    viewer.scene.requestRender();
  }

  function setSensorStyle(style) {
    const app = $('app');
    ['normal', 'crt', 'nvg', 'thermal', 'noir'].forEach((name) => app.classList.remove(`sensor-${name}`));
    app.classList.add(`sensor-${style}`);
    $('sensorStyle').value = style;
  }

  function updateCameraReadout() {
    const viewer = state.viewer;
    if (!viewer) return;
    const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const alt = Math.max(0, cartographic.height);
    $('cameraCoords').textContent = `LAT ${lat.toFixed(4)}° // LON ${lon.toFixed(4)}°`;
    $('cameraAltitude').textContent = `ALT ${formatDistance(alt)}`;
  }

  function cameraCenter() {
    const viewer = state.viewer;
    const center = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2), viewer.scene.globe.ellipsoid);
    if (center) {
      const c = Cesium.Cartographic.fromCartesian(center);
      return { latitude: Cesium.Math.toDegrees(c.latitude), longitude: Cesium.Math.toDegrees(c.longitude) };
    }
    const c = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    return { latitude: Cesium.Math.toDegrees(c.latitude), longitude: Cesium.Math.toDegrees(c.longitude) };
  }

  function cameraAltitude() {
    const c = Cesium.Cartographic.fromCartesian(state.viewer.camera.positionWC);
    return Math.max(0, c.height);
  }

  async function fetchJson(url, options = {}, timeoutMs = 22_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.message || payload.error || `${response.status} ${response.statusText}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  function beginFeed(feed) {
    state.loadingCount += 1;
    state.feedState[feed] = 'loading';
    updateHealth(feed, 'loading');
    $('loadingBar').classList.add('active');
  }

  function endFeed(feed, ok = true, mode = null) {
    state.loadingCount = Math.max(0, state.loadingCount - 1);
    state.feedState[feed] = mode || (ok ? 'ok' : 'error');
    if (ok) state.lastUpdated[feed] = Date.now();
    updateHealth(feed, mode || (ok ? 'ok' : 'error'));
    if (!state.loadingCount) {
      $('loadingBar').classList.remove('active');
      $('loadingBar').style.width = '100%';
      setTimeout(() => { $('loadingBar').style.width = '0'; }, 220);
    }
    updateConnectionState();
    renderDataStatus();
  }

  function updateHealth(feed, mode) {
    const dot = $(`health${capitalize(feed)}`);
    if (dot) dot.className = `health-dot ${mode}`;
    const age = $(`age${capitalize(feed)}`);
    if (age && mode === 'off') age.textContent = 'off';
  }

  function updateHealthAges() {
    ['news', 'flights', 'military', 'vessels', 'satellites', 'quakes', 'events', 'launches'].forEach((feed) => {
      const target = $(`age${capitalize(feed)}`);
      if (!target) return;
      if (state.feedState[feed] === 'off') {
        target.textContent = 'off';
        return;
      }
      const ts = state.lastUpdated[feed];
      target.textContent = ts ? `${formatAge(Date.now() - ts)} ago` : state.feedState[feed] === 'error' ? 'error' : 'waiting';
    });
  }

  function updateConnectionState() {
    const healthy = Object.values(state.feedState).filter((value) => value === 'ok').length;
    const activeCount = LAYERS.filter((layer) => state.visible[layer]).length + 1;
    $('linkState').textContent = healthy >= 5 ? 'LIVE' : healthy ? `${healthy} FEEDS` : 'LINKING';
    $('connectionState').textContent = `${healthy}/${activeCount} ONLINE`;
  }

  async function loadNews(query = 'world') {
    beginFeed('news');
    try {
      let payload;
      try {
        payload = await fetchJson(`/api/news?q=${encodeURIComponent(query)}`);
      } catch {
        const gdelt = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=50&format=json&sort=DateDesc&timespan=6h`;
        payload = await fetchJson(gdelt, {}, 18_000);
      }
      const raw = payload.articles || payload.items || [];
      state.news = raw.slice(0, 60).map(normalizeNews).filter((item) => item.title && item.url);
      renderNews();
      renderTicker();
      pushSignal('NEWS', `${state.news.length} recent headlines loaded`, query === 'world' ? 'Global feed' : `Query: ${query}`);
      endFeed('news', true);
    } catch (error) {
      console.error('news', error);
      endFeed('news', false);
    }
  }

  function normalizeNews(article) {
    return {
      title: String(article.title || ''),
      url: String(article.url || article.link || ''),
      domain: String(article.domain || safeDomain(article.url || article.link || '')),
      sourceCountry: String(article.sourcecountry || article.sourceCountry || ''),
      language: String(article.language || ''),
      seenDate: article.seendate || article.pubDate || article.date || '',
    };
  }

  async function loadFlights() {
    if (!state.visible.flights) return;
    beginFeed('flights');
    try {
      const payload = await fetchJson('/api/flights?limit=3200', {}, 24_000);
      const items = (payload.states || []).filter(hasCoordinates);
      state.data.flights = items;
      syncMotionLayer('flights', items, (f) => `flight:${f.icao24}`, (f) => ({
        name: f.callsign || String(f.icao24 || '').toUpperCase() || 'Aircraft',
        longitude: Number(f.longitude), latitude: Number(f.latitude),
        altitude: Math.max(250, Number(f.geoAltitude || f.baroAltitude || 1600)),
        pixelSize: f.onGround ? 3 : 5,
        alpha: f.onGround ? .42 : .88,
        data: { type: 'Aircraft', ...f },
      }));
      setLayerCount('flights', items.length);
      $('metricFlights').textContent = formatNumber(items.length);
      pushSignal('AIR', `${items.length.toLocaleString()} civil aircraft refreshed`, 'OpenSky');
      endFeed('flights', true);
    } catch (error) {
      console.error('flights', error);
      toast('Civil aircraft feed is temporarily unavailable or rate-limited.');
      endFeed('flights', false);
    }
  }

  async function loadMilitary() {
    if (!state.visible.military) return;
    beginFeed('military');
    try {
      const payload = await fetchJson('/api/military', {}, 18_000);
      const items = (payload.aircraft || []).filter(hasCoordinates);
      state.data.military = items;
      syncMotionLayer('military', items, (f) => `mil:${f.icao24 || `${f.latitude}:${f.longitude}:${f.callsign}`}`, (f) => ({
        name: f.callsign || f.registration || f.icao24?.toUpperCase() || 'Military aircraft',
        longitude: Number(f.longitude), latitude: Number(f.latitude),
        altitude: Math.max(350, Number(f.geoAltitude || f.baroAltitude || 1900)),
        pixelSize: 6, alpha: .95,
        data: { type: 'Military Aircraft', ...f },
      }));
      setLayerCount('military', items.length);
      $('metricMilitary').textContent = formatNumber(items.length);
      if (items.length) pushSignal('MIL', `${items.length} military aircraft contacts`, 'adsb.lol');
      endFeed('military', true);
    } catch (error) {
      console.error('military', error);
      endFeed('military', false);
    }
  }

  async function loadVessels() {
    if (!state.visible.vessels) return;
    beginFeed('vessels');
    try {
      const center = cameraCenter();
      const spanLat = clamp(cameraAltitude() / 420_000, 2.5, 20);
      const spanLon = clamp(spanLat * 1.5, 4, 32);
      const params = new URLSearchParams({
        minLat: String(clamp(center.latitude - spanLat, -88, 88)),
        maxLat: String(clamp(center.latitude + spanLat, -88, 88)),
        minLon: String(clamp(center.longitude - spanLon, -179, 179)),
        maxLon: String(clamp(center.longitude + spanLon, -179, 179)),
        sampleMs: '3000',
        maxRows: '1000',
      });
      const payload = await fetchJson(`/api/vessels?${params}`, {}, 11_000);
      const items = (payload.vessels || []).filter(hasCoordinates);
      state.data.vessels = items;
      syncMotionLayer('vessels', items, (v) => `vessel:${v.mmsi}`, (v) => ({
        name: v.name || `MMSI ${v.mmsi}`,
        longitude: Number(v.longitude), latitude: Number(v.latitude), altitude: 120,
        pixelSize: 5, alpha: .9,
        data: { type: 'Vessel', ...v },
      }));
      setLayerCount('vessels', items.length);
      if (items.length) pushSignal('SEA', `${items.length} vessels sampled in current view`, 'AISStream');
      endFeed('vessels', true);
    } catch (error) {
      console.error('vessels', error);
      if (error.status === 503 || /AISSTREAM_API_KEY/i.test(error.message)) {
        state.feedState.vessels = 'off';
        updateHealth('vessels', 'off');
        if (!state.missingVesselKeyNotified) {
          state.missingVesselKeyNotified = true;
          toast('Ship tracking is ready but needs AISSTREAM_API_KEY in Netlify environment variables.');
        }
        endFeed('vessels', false, 'off');
      } else {
        endFeed('vessels', false);
      }
    }
  }

  async function loadSatellites() {
    if (!state.visible.satellites) return;
    beginFeed('satellites');
    try {
      const group = $('satelliteGroup').value;
      const payload = await fetchJson(`/api/satellites?group=${encodeURIComponent(group)}&limit=1200`, {}, 28_000);
      const items = (payload.satellites || []).filter(hasCoordinates);
      state.data.satellites = items;
      syncMotionLayer('satellites', items, (s) => `sat:${s.id || s.noradId || s.name}`, (s) => ({
        name: s.name || `NORAD ${s.noradId || s.id || ''}`,
        longitude: Number(s.longitude), latitude: Number(s.latitude),
        altitude: Math.max(120_000, Number(s.altitudeKm || 400) * 1000),
        pixelSize: 4, alpha: .9,
        data: { type: 'Satellite', ...s },
      }));
      setLayerCount('satellites', items.length);
      $('metricSatellites').textContent = formatNumber(items.length);
      pushSignal('ORBIT', `${items.length} satellites propagated`, `CelesTrak / ${group}`);
      endFeed('satellites', true);
    } catch (error) {
      console.error('satellites', error);
      endFeed('satellites', false);
    }
  }

  async function loadQuakes() {
    if (!state.visible.quakes) return;
    beginFeed('quakes');
    try {
      const payload = await fetchJson('/api/quakes');
      const items = (payload.earthquakes || []).filter(hasCoordinates);
      state.data.quakes = items;
      syncStaticLayer('quakes', items, (q) => `quake:${q.id}`, (q) => ({
        name: `M${Number(q.magnitude || 0).toFixed(1)} ${q.place || 'Earthquake'}`,
        longitude: Number(q.longitude), latitude: Number(q.latitude), altitude: 6500,
        pixelSize: Math.min(18, Math.max(7, 5 + Number(q.magnitude || 0) * 1.7)),
        alpha: .84,
        data: { type: 'Earthquake', ...q, sourceUrl: q.url || '' },
      }));
      setLayerCount('quakes', items.length);
      const strongest = [...items].sort((a, b) => Number(b.magnitude || 0) - Number(a.magnitude || 0))[0];
      if (strongest) pushSignal('SEISMIC', `M${Number(strongest.magnitude).toFixed(1)} — ${strongest.place}`, 'USGS / last 24h');
      endFeed('quakes', true);
    } catch (error) {
      console.error('quakes', error);
      endFeed('quakes', false);
    }
  }

  async function loadEvents() {
    if (!state.visible.events) return;
    beginFeed('events');
    try {
      const category = $('eventCategory').value;
      const payload = await fetchJson(`/api/events?days=60&category=${encodeURIComponent(category)}`, {}, 22_000);
      const items = (payload.events || []).filter(hasCoordinates);
      state.data.events = items;
      syncStaticLayer('events', items, (event) => `event:${event.id}`, (event) => ({
        name: event.title || event.categoryTitle || 'Natural event',
        longitude: Number(event.longitude), latitude: Number(event.latitude), altitude: 8500,
        pixelSize: eventPointSize(event), alpha: .9,
        color: eventColor(event),
        data: { type: 'Natural Event', ...event, sourceUrl: event.sourceUrl || '' },
      }));
      setLayerCount('events', items.length);
      $('metricEvents').textContent = formatNumber(items.length);
      const wildfireCount = items.filter((item) => /wildfire/i.test(item.category)).length;
      pushSignal('PLANET', `${items.length} active natural events`, wildfireCount ? `${wildfireCount} wildfire events` : 'NASA EONET');
      endFeed('events', true);
    } catch (error) {
      console.error('events', error);
      endFeed('events', false);
    }
  }

  async function loadLaunches() {
    if (!state.visible.launches) return;
    beginFeed('launches');
    try {
      const payload = await fetchJson('/api/launches', {}, 24_000);
      const items = (payload.launches || []).filter(hasCoordinates);
      state.data.launches = items;
      syncStaticLayer('launches', items, (launch) => `launch:${launch.id}`, (launch) => ({
        name: launch.name || 'Upcoming launch',
        longitude: Number(launch.longitude), latitude: Number(launch.latitude), altitude: 15_000,
        pixelSize: 8, alpha: .92,
        data: { type: 'Rocket Launch', ...launch, sourceUrl: launch.webcast || '' },
      }));
      setLayerCount('launches', items.length);
      renderLaunches();
      const next = [...items].filter((item) => item.net && new Date(item.net) > new Date()).sort((a, b) => new Date(a.net) - new Date(b.net))[0];
      if (next) pushSignal('LAUNCH', next.name, `${formatFuture(next.net)} · ${next.location || next.pad || 'launch site'}`);
      endFeed('launches', true);
    } catch (error) {
      console.error('launches', error);
      endFeed('launches', false);
    }
  }

  async function loadInfrastructure() {
    if (!state.visible.infrastructure) return;
    beginFeed('infrastructure');
    try {
      const center = cameraCenter();
      const radius = Math.round(clamp(cameraAltitude() * .16, 50_000, 260_000));
      const kind = $('infrastructureKind').value;
      const params = new URLSearchParams({ lat: center.latitude.toFixed(5), lon: center.longitude.toFixed(5), radius: String(radius), kind });
      const payload = await fetchJson(`/api/infrastructure?${params}`, {}, 28_000);
      const items = (payload.infrastructure || []).filter(hasCoordinates);
      state.data.infrastructure = items;
      syncStaticLayer('infrastructure', items, (item) => `infra:${item.id}`, (item) => ({
        name: item.name || item.type,
        longitude: Number(item.longitude), latitude: Number(item.latitude), altitude: 1000,
        pixelSize: item.type === 'Datacenter' ? 6 : 5, alpha: .88,
        color: item.type === 'Datacenter' ? colors.infrastructure : Cesium.Color.fromCssColorString('#57d7c5'),
        data: { type: item.type || 'Infrastructure', ...item, sourceUrl: item.website || '' },
      }));
      setLayerCount('infrastructure', items.length);
      pushSignal('INFRA', `${items.length} nearby infrastructure objects`, `OpenStreetMap · ${Math.round(radius / 1000)} km radius`);
      endFeed('infrastructure', true);
    } catch (error) {
      console.error('infrastructure', error);
      endFeed('infrastructure', false);
    }
  }

  async function loadTrade() {
    if (!state.visible.trade) return;
    beginFeed('trade');
    try {
      const payload = await fetchJson('/api/trade', {}, 25_000);
      const items = (payload.countries || []).filter(hasCoordinates);
      state.data.trade = items;
      const maxValue = Math.max(...items.map((item) => Number(item.exports || 0)), 1);
      syncStaticLayer('trade', items, (item) => `trade:${item.code}`, (item) => ({
        name: item.country || item.code,
        longitude: Number(item.longitude), latitude: Number(item.latitude), altitude: 9000,
        pixelSize: 5 + Math.sqrt(Math.max(0, Number(item.exports || 0)) / maxValue) * 12,
        alpha: .65,
        data: { type: 'Trade', ...item },
      }));
      setLayerCount('trade', items.length);
      endFeed('trade', true);
    } catch (error) {
      console.error('trade', error);
      endFeed('trade', false);
    }
  }

  function syncMotionLayer(layer, items, idFor, build) {
    const current = new Set();
    for (const item of items) {
      const id = idFor(item);
      if (!id) continue;
      current.add(id);
      const spec = build(item);
      upsertPointEntity(layer, id, spec);
      rememberPosition(layer, id, spec.longitude, spec.latitude, spec.altitude, item);
    }
    removeStaleEntities(layer, current);
    state.layerIds[layer] = current;
    refreshActiveTrail();
  }

  function syncStaticLayer(layer, items, idFor, build) {
    const current = new Set();
    for (const item of items) {
      const id = idFor(item);
      if (!id) continue;
      current.add(id);
      upsertPointEntity(layer, id, build(item));
    }
    removeStaleEntities(layer, current);
    state.layerIds[layer] = current;
  }

  function upsertPointEntity(layer, id, spec) {
    const viewer = state.viewer;
    const position = Cesium.Cartesian3.fromDegrees(spec.longitude, spec.latitude, Math.max(0, Number(spec.altitude || 0)));
    const color = spec.color || colors[layer] || colors.flights;
    let entity = viewer.entities.getById(id);
    if (!entity) {
      entity = viewer.entities.add({
        id,
        name: spec.name,
        position,
        point: {
          pixelSize: spec.pixelSize || 5,
          color: color.withAlpha(spec.alpha ?? .9),
          outlineColor: Cesium.Color.BLACK.withAlpha(.55),
          outlineWidth: 1,
          disableDepthTestDistance: layer === 'quakes' || layer === 'events' || layer === 'launches' ? Number.POSITIVE_INFINITY : 0,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, layer === 'infrastructure' ? 4_000_000 : 55_000_000),
        },
        show: state.visible[layer],
      });
      entity._worldEyesLayer = layer;
    } else {
      entity.position = position;
      entity.name = spec.name;
      entity.show = state.visible[layer];
      if (entity.point) {
        entity.point.pixelSize = spec.pixelSize || 5;
        entity.point.color = color.withAlpha(spec.alpha ?? .9);
      }
    }
    entity._worldEyesData = spec.data || {};
    entity._worldEyesLayer = layer;
  }

  function removeStaleEntities(layer, current) {
    for (const id of state.layerIds[layer]) {
      if (!current.has(id)) state.viewer.entities.removeById(id);
    }
  }

  function clearLayer(layer) {
    for (const id of state.layerIds[layer]) state.viewer.entities.removeById(id);
    state.layerIds[layer].clear();
    state.data[layer] = [];
    setLayerCount(layer, 0);
  }

  function toggleLayer(layer, visible) {
    state.visible[layer] = visible;
    for (const id of state.layerIds[layer]) {
      const entity = state.viewer.entities.getById(id);
      if (entity) entity.show = visible;
    }
    if (!visible) {
      state.feedState[layer] = 'off';
      updateHealth(layer, 'off');
      if (state.selected?._worldEyesLayer === layer) closeDetail();
    } else {
      loadLayer(layer);
    }
    state.viewer.scene.requestRender();
    updateConnectionState();
  }

  function loadLayer(layer) {
    const loaders = {
      flights: loadFlights, military: loadMilitary, vessels: loadVessels, satellites: loadSatellites,
      quakes: loadQuakes, events: loadEvents, launches: loadLaunches, infrastructure: loadInfrastructure, trade: loadTrade,
    };
    return loaders[layer]?.();
  }

  function rememberPosition(layer, id, longitude, latitude, altitude, raw) {
    const key = `${layer}:${id}`;
    const list = state.history.get(key) || [];
    const next = { longitude, latitude, altitude, time: Date.now(), heading: Number(raw?.heading ?? raw?.course ?? 0) };
    const last = list[list.length - 1];
    if (!last || Math.abs(last.longitude - longitude) > .00002 || Math.abs(last.latitude - latitude) > .00002 || Math.abs(last.altitude - altitude) > 20) {
      list.push(next);
      if (list.length > 100) list.shift();
      state.history.set(key, list);
    }
  }

  function refreshActiveTrail() {
    if (!state.selected || !MOTION_LAYERS.has(state.selected._worldEyesLayer)) return;
    const entity = state.viewer.entities.getById(state.selected.id);
    if (entity) state.selected = entity;
    if (state.viewer.entities.getById(state.trailEntityId)) drawSelectedTrail(false);
  }

  function drawSelectedTrail(showToast = true) {
    const selected = state.selected;
    if (!selected || !MOTION_LAYERS.has(selected._worldEyesLayer)) return;
    const key = `${selected._worldEyesLayer}:${selected.id}`;
    const history = state.history.get(key) || [];
    state.viewer.entities.removeById(state.trailEntityId);
    if (history.length < 2) {
      if (showToast) toast('Trail history builds as live refreshes arrive. Keep this target selected for a few updates.');
      return;
    }
    state.viewer.entities.add({
      id: state.trailEntityId,
      polyline: {
        positions: history.map((p) => Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude)),
        width: 2,
        material: (colors[selected._worldEyesLayer] || colors.flights).withAlpha(.72),
        arcType: Cesium.ArcType.NONE,
      },
    });
    state.viewer.scene.requestRender();
  }

  function selectEntity(entity, openDialog = false) {
    state.selected = entity;
    const data = entity._worldEyesData || {};
    $('objectHud').hidden = false;
    $('objectHudType').textContent = String(data.type || entity._worldEyesLayer || 'TARGET').toUpperCase();
    $('objectHudTitle').textContent = entity.name || data.name || 'World target';
    $('objectHudMeta').textContent = objectMeta(entity);
    if (openDialog) showEntityDetails(entity);
  }

  function updateHoverHud(entity) {
    state.hoverEntity = entity;
    if (!entity) {
      if (!state.selected) $('objectHud').hidden = true;
      else selectEntity(state.selected, false);
      return;
    }
    const data = entity._worldEyesData || {};
    $('objectHud').hidden = false;
    $('objectHudType').textContent = String(data.type || entity._worldEyesLayer || 'TARGET').toUpperCase();
    $('objectHudTitle').textContent = entity.name || data.name || 'World target';
    $('objectHudMeta').textContent = objectMeta(entity);
  }

  function objectMeta(entity) {
    const d = entity._worldEyesData || {};
    if (entity._worldEyesLayer === 'flights' || entity._worldEyesLayer === 'military') return `${formatAltitude(d.geoAltitude || d.baroAltitude)} · ${formatSpeed(d.velocity)} · ${isFiniteNumber(d.heading) ? `${Number(d.heading).toFixed(0)}°` : '—'}`;
    if (entity._worldEyesLayer === 'satellites') return `${isFiniteNumber(d.altitudeKm) ? `${Math.round(Number(d.altitudeKm))} km` : 'orbit'} · NORAD ${d.noradId || d.id || '—'}`;
    if (entity._worldEyesLayer === 'vessels') return `${isFiniteNumber(d.speedKnots) ? `${Number(d.speedKnots).toFixed(1)} kt` : '—'} · MMSI ${d.mmsi || '—'}`;
    if (entity._worldEyesLayer === 'quakes') return `M${Number(d.magnitude || 0).toFixed(1)} · ${d.place || ''}`;
    if (entity._worldEyesLayer === 'launches') return `${d.provider || ''} · ${d.net ? formatFuture(d.net) : 'schedule TBD'}`;
    return d.categoryTitle || d.type || entity._worldEyesLayer || '';
  }

  function showEntityDetails(entity) {
    selectEntity(entity, false);
    const data = entity._worldEyesData || {};
    $('detailType').textContent = String(data.type || entity._worldEyesLayer || 'SIGNAL').toUpperCase();
    $('detailTitle').textContent = entity.name || data.name || 'World signal';
    $('detailBody').innerHTML = detailRows(entity).map(([label, value]) => `<div class="detail-row"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('');

    const moving = MOTION_LAYERS.has(entity._worldEyesLayer);
    $('cockpitButton').hidden = !moving;
    $('trailButton').hidden = !moving;
    const sourceUrl = sourceUrlFor(data);
    const sourceButton = $('sourceButton');
    sourceButton.hidden = !sourceUrl;
    if (sourceUrl) sourceButton.href = sourceUrl;

    const dialog = $('detailDialog');
    if (!dialog.open) dialog.showModal();
  }

  function detailRows(entity) {
    const d = entity._worldEyesData || {};
    const layer = entity._worldEyesLayer;
    if (layer === 'flights' || layer === 'military') return [
      ['Callsign', d.callsign || '—'], ['ICAO24', d.icao24 || '—'], ['Registration', d.registration || '—'],
      ['Aircraft', d.aircraftType || d.description || '—'], ['Country', d.originCountry || '—'], ['Altitude', formatAltitude(d.geoAltitude || d.baroAltitude)],
      ['Speed', formatSpeed(d.velocity)], ['Heading', isFiniteNumber(d.heading) ? `${Number(d.heading).toFixed(0)}°` : '—'],
      ['Latitude', coord(d.latitude)], ['Longitude', coord(d.longitude)], ['Squawk', d.squawk || '—'], ['Emergency', d.emergency || '—'],
    ];
    if (layer === 'satellites') return [
      ['Name', d.name || '—'], ['NORAD', String(d.noradId || d.id || '—')], ['Altitude', isFiniteNumber(d.altitudeKm) ? `${Number(d.altitudeKm).toFixed(0)} km` : '—'],
      ['Latitude', coord(d.latitude)], ['Longitude', coord(d.longitude)], ['Epoch', d.epoch ? new Date(d.epoch).toISOString() : '—'],
    ];
    if (layer === 'vessels') return [
      ['Name', d.name || '—'], ['MMSI', d.mmsi || '—'], ['IMO', d.imo || '—'], ['Type', d.type || '—'],
      ['Destination', d.destination || '—'], ['Speed', isFiniteNumber(d.speedKnots) ? `${Number(d.speedKnots).toFixed(1)} kt` : '—'], ['Course', isFiniteNumber(d.course) ? `${Number(d.course).toFixed(0)}°` : '—'],
      ['Latitude', coord(d.latitude)], ['Longitude', coord(d.longitude)], ['Timestamp', d.timestamp ? new Date(d.timestamp).toLocaleString() : '—'],
    ];
    if (layer === 'quakes') return [
      ['Magnitude', `M${Number(d.magnitude || 0).toFixed(1)}`], ['Place', d.place || '—'], ['Depth', isFiniteNumber(d.depthKm) ? `${Number(d.depthKm).toFixed(1)} km` : '—'],
      ['Time', d.time ? new Date(Number(d.time)).toLocaleString() : '—'], ['Latitude', coord(d.latitude)], ['Longitude', coord(d.longitude)],
    ];
    if (layer === 'events') return [
      ['Category', d.categoryTitle || d.category || '—'], ['Event', d.title || '—'], ['Source', d.sourceName || 'NASA EONET'], ['Date', d.date ? new Date(d.date).toLocaleString() : 'Active'],
      ['Latitude', coord(d.latitude)], ['Longitude', coord(d.longitude)],
    ];
    if (layer === 'launches') return [
      ['Provider', d.provider || '—'], ['Rocket', d.rocket || '—'], ['Status', d.status || '—'], ['Launch time', d.net ? new Date(d.net).toLocaleString() : 'TBD'],
      ['Mission', d.mission || '—'], ['Orbit', d.orbit || '—'], ['Pad', d.pad || '—'], ['Location', d.location || '—'],
    ];
    if (layer === 'infrastructure') return [
      ['Type', d.type || 'Infrastructure'], ['Name', d.name || '—'], ['Operator', d.operator || '—'], ['Latitude', coord(d.latitude)], ['Longitude', coord(d.longitude)], ['Source', 'OpenStreetMap / Overpass'],
    ];
    if (layer === 'trade') return [
      ['Country', d.country || '—'], ['Year', String(d.year || '—')], ['Exports', formatMoney(d.exports)], ['Imports', formatMoney(d.imports)], ['Freshness', 'Latest available annual value'],
    ];
    return Object.entries(d).slice(0, 12).map(([key, value]) => [key, String(value ?? '—')]);
  }

  function sourceUrlFor(data) {
    const value = data.sourceUrl || data.url || data.webcast || data.website || '';
    try { return value ? new URL(value).toString() : ''; } catch { return ''; }
  }

  function trackSelected() {
    const entity = state.selected;
    if (!entity) return;
    const layer = entity._worldEyesLayer;
    const range = layer === 'satellites' ? 2_500_000 : layer === 'flights' || layer === 'military' ? 230_000 : layer === 'vessels' ? 90_000 : 1_200_000;
    if (MOTION_LAYERS.has(layer)) state.viewer.trackedEntity = entity;
    state.viewer.flyTo(entity, { duration: 1.7, offset: new Cesium.HeadingPitchRange(0, -.6, range) });
    closeDetail();
  }

  function cockpitSelected() {
    const entity = state.selected;
    if (!entity || !MOTION_LAYERS.has(entity._worldEyesLayer)) return;
    state.viewer.trackedEntity = entity;
    const layer = entity._worldEyesLayer;
    const range = layer === 'satellites' ? 480_000 : layer === 'vessels' ? 4_500 : 9_000;
    const heading = Number(entity._worldEyesData?.heading ?? entity._worldEyesData?.course ?? 0);
    state.viewer.flyTo(entity, {
      duration: 1.6,
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(Number.isFinite(heading) ? heading : 0), -.16, range),
    });
    closeDetail();
    toast(layer === 'satellites' ? 'Orbital ride mode enabled.' : 'Cockpit tracking enabled. Live position updates will move the camera with the target.');
  }

  function closeDetail() {
    if ($('detailDialog').open) $('detailDialog').close();
  }

  function eventColor(event) {
    const category = String(event.category || event.categoryTitle || '').toLowerCase();
    if (category.includes('wildfire')) return Cesium.Color.fromCssColorString('#ff6b35');
    if (category.includes('storm')) return Cesium.Color.fromCssColorString('#71d9ff');
    if (category.includes('volcano')) return Cesium.Color.fromCssColorString('#d36cff');
    if (category.includes('flood')) return Cesium.Color.fromCssColorString('#4c8cff');
    if (category.includes('ice')) return Cesium.Color.fromCssColorString('#d8f5ff');
    return colors.events;
  }

  function eventPointSize(event) {
    const category = String(event.category || '').toLowerCase();
    return category.includes('storm') ? 9 : category.includes('wildfire') ? 8 : 7;
  }

  function pushSignal(type, title, meta = '') {
    const key = `${type}:${title}`;
    if (state.signals[0]?.key === key) return;
    state.signals.unshift({ key, type, title, meta, at: Date.now() });
    state.signals = state.signals.slice(0, 45);
    renderSignals();
  }

  function renderSignals() {
    const list = $('signalList');
    list.innerHTML = state.signals.slice(0, 30).map((signal) => `<article class="signal-card"><div class="card-kicker">${escapeHtml(signal.type)}</div><h4>${escapeHtml(signal.title)}</h4><p>${escapeHtml(signal.meta || '')}</p><div class="card-meta"><span>${formatAge(Date.now() - signal.at)} ago</span></div></article>`).join('') || '<div class="data-note">Waiting for live signals…</div>';
  }

  function renderNews() {
    $('newsList').innerHTML = state.news.map((article) => `<article class="news-card" data-url="${escapeAttr(article.url)}"><div class="card-kicker">${escapeHtml(article.domain || article.sourceCountry || 'NEWS')}</div><h4>${escapeHtml(article.title)}</h4><div class="card-meta"><span>${escapeHtml(article.sourceCountry || '')}</span><span>${escapeHtml(formatNewsTime(article.seenDate))}</span></div></article>`).join('') || '<div class="data-note">No recent headlines matched this search.</div>';
    document.querySelectorAll('.news-card[data-url]').forEach((card) => card.addEventListener('click', () => window.open(card.dataset.url, '_blank', 'noopener,noreferrer')));
  }

  function renderTicker() {
    const items = state.news.slice(0, 18);
    if (!items.length) {
      $('tickerTrack').innerHTML = '<span>Global news feed unavailable.</span>';
      return;
    }
    const html = items.map((article) => `<a href="${escapeAttr(article.url)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(article.domain || 'NEWS')}</b> · ${escapeHtml(article.title)}</a>`).join('<span>◆</span>');
    $('tickerTrack').innerHTML = html + '<span>◆</span>' + html;
  }

  function renderLaunches() {
    const items = [...state.data.launches].sort((a, b) => new Date(a.net || 0) - new Date(b.net || 0));
    $('launchList').innerHTML = items.map((launch) => `<article class="launch-card" data-entity-id="${escapeAttr(`launch:${launch.id}`)}"><div class="card-kicker">${escapeHtml(launch.status || 'UPCOMING')}</div><h4>${escapeHtml(launch.name)}</h4><p>${escapeHtml(launch.provider || '')}${launch.rocket ? ` · ${escapeHtml(launch.rocket)}` : ''}</p><div class="card-meta"><span>${escapeHtml(launch.net ? formatFuture(launch.net) : 'TBD')}</span><span>${escapeHtml(launch.location || launch.pad || '')}</span></div></article>`).join('') || '<div class="data-note">No geolocated upcoming launches loaded.</div>';
    document.querySelectorAll('.launch-card[data-entity-id]').forEach((card) => card.addEventListener('click', () => focusEntity(card.dataset.entityId)));
  }

  function renderDataStatus() {
    const rows = [
      ['News', 'GDELT', state.feedState.news], ['Civil aircraft', 'OpenSky', state.feedState.flights], ['Military aircraft', 'adsb.lol', state.feedState.military],
      ['Vessels', 'AISStream (optional key)', state.feedState.vessels || 'off'], ['Satellites', 'CelesTrak + SGP4', state.feedState.satellites], ['Earthquakes', 'USGS', state.feedState.quakes],
      ['Natural events', 'NASA EONET', state.feedState.events], ['Rocket launches', 'Launch Library 2', state.feedState.launches],
      ['Infrastructure', 'OpenStreetMap / Overpass', state.feedState.infrastructure || (state.visible.infrastructure ? 'idle' : 'off')], ['Trade', 'World Bank annual data', state.feedState.trade || (state.visible.trade ? 'idle' : 'off')],
    ];
    $('dataStatusList').innerHTML = rows.map(([name, source, mode]) => `<div class="status-card"><div><b>${escapeHtml(name)}</b><small>${escapeHtml(source)}</small></div><span class="status-pill ${mode === 'ok' ? 'ok' : mode === 'error' ? 'error' : 'idle'}">${escapeHtml(String(mode || 'idle').toUpperCase())}</span></div>`).join('');
  }

  function setLayerCount(layer, count) {
    const target = $(`count${capitalize(layer)}`);
    if (target) target.textContent = formatNumber(count);
  }

  function focusEntity(id) {
    const entity = state.viewer.entities.getById(id);
    if (!entity) return;
    selectEntity(entity, true);
    const layer = entity._worldEyesLayer;
    const range = layer === 'satellites' ? 2_200_000 : layer === 'launches' ? 650_000 : 520_000;
    state.viewer.flyTo(entity, { duration: 1.7, offset: new Cesium.HeadingPitchRange(0, -.55, range) });
  }

  async function searchWorld(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const coordinateMatch = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
    if (coordinateMatch) {
      const lat = Number(coordinateMatch[1]);
      const lon = Number(coordinateMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        flyToPlace({ name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, latitude: lat, longitude: lon });
        return;
      }
    }

    const local = state.viewer.entities.values
      .filter((entity) => entity._worldEyesData && entity.id !== state.trailEntityId)
      .filter((entity) => entitySearchText(entity).includes(q.toLowerCase()))
      .slice(0, 6)
      .map((entity) => ({ type: 'entity', entity, name: entity.name || entity.id, meta: entity._worldEyesData?.type || entity._worldEyesLayer }));

    let places = [];
    try {
      const payload = await fetchJson(`/api/geocode?q=${encodeURIComponent(q)}`, {}, 12_000);
      places = (payload.results || []).slice(0, 6).map((place) => ({ type: 'place', place, name: place.name, meta: place.type || 'place' }));
    } catch (error) {
      console.warn('geocode', error);
    }

    showSearchResults([...local, ...places].slice(0, 10));
    if (!local.length && !places.length) toast(`No loaded object or place matched “${q}”.`);
  }

  function entitySearchText(entity) {
    const d = entity._worldEyesData || {};
    return [entity.name, d.callsign, d.icao24, d.registration, d.mmsi, d.noradId, d.id, d.country, d.code, d.place, d.title, d.provider, d.rocket, d.location]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function showSearchResults(results) {
    const box = $('searchResults');
    if (!results.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '';
    for (const result of results) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.innerHTML = `<b>${escapeHtml(result.name)}</b><small>${escapeHtml(result.meta || '')}</small>`;
      button.addEventListener('click', () => {
        box.hidden = true;
        if (result.type === 'entity') focusEntity(result.entity.id);
        else flyToPlace(result.place);
      });
      box.appendChild(button);
    }
    box.hidden = false;
  }

  function flyToPlace(place) {
    $('searchResults').hidden = true;
    state.viewer.trackedEntity = undefined;
    const height = place.boundingbox ? 750_000 : 1_200_000;
    state.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(Number(place.longitude), Number(place.latitude), height),
      duration: 1.8,
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });
    pushSignal('SEARCH', place.name || 'Map location', `${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}`);
  }

  async function refreshActive() {
    $('refreshButton').disabled = true;
    const tasks = [loadNews($('newsQuery').value || 'world')];
    for (const layer of LAYERS) if (state.visible[layer]) tasks.push(loadLayer(layer));
    await Promise.allSettled(tasks);
    $('refreshButton').disabled = false;
  }

  function scheduleViewportFeeds() {
    clearTimeout(state.cameraRefreshTimer);
    state.cameraRefreshTimer = setTimeout(() => {
      if (document.hidden) return;
      if (state.visible.infrastructure) loadInfrastructure();
      if (state.visible.vessels) loadVessels();
    }, 900);
  }

  function setupTimers() {
    const add = (ms, fn) => state.timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms));
    add(30_000, loadFlights);
    add(22_000, loadMilitary);
    add(60_000, loadSatellites);
    add(90_000, () => loadNews($('newsQuery').value || 'world'));
    add(120_000, loadQuakes);
    add(180_000, loadVessels);
    add(5 * 60_000, loadEvents);
    add(10 * 60_000, loadLaunches);
    add(8 * 60_000, loadInfrastructure);
    add(6 * 60 * 60_000, loadTrade);
    add(1000, updateHealthAges);
    add(5000, renderDataStatus);
  }

  function setupUi() {
    setInterval(() => { $('utcClock').textContent = `${new Date().toISOString().slice(11, 19)} UTC`; }, 250);

    document.querySelectorAll('[data-layer]').forEach((input) => {
      const layer = input.dataset.layer;
      input.checked = state.visible[layer];
      input.addEventListener('change', () => toggleLayer(layer, input.checked));
    });

    $('satelliteGroup').addEventListener('change', () => { clearLayer('satellites'); loadSatellites(); });
    $('eventCategory').addEventListener('change', () => { clearLayer('events'); loadEvents(); });
    $('infrastructureKind').addEventListener('change', () => { clearLayer('infrastructure'); if (state.visible.infrastructure) loadInfrastructure(); });
    $('mapStyle').addEventListener('change', (event) => setBasemap(event.target.value));
    $('sensorStyle').addEventListener('change', (event) => setSensorStyle(event.target.value));
    $('refreshButton').addEventListener('click', refreshActive);
    $('homeButton').addEventListener('click', resetGlobe);
    $('shareButton').addEventListener('click', copyViewLink);
    $('hudToggle').addEventListener('click', () => $('app').classList.toggle('hud-off'));

    $('detailClose').addEventListener('click', closeDetail);
    $('trackButton').addEventListener('click', trackSelected);
    $('cockpitButton').addEventListener('click', cockpitSelected);
    $('trailButton').addEventListener('click', () => drawSelectedTrail(true));

    $('globalSearchForm').addEventListener('submit', (event) => { event.preventDefault(); searchWorld($('globalSearch').value); });
    $('globalSearch').addEventListener('input', () => { if (!$('globalSearch').value.trim()) $('searchResults').hidden = true; });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.global-search-wrap')) $('searchResults').hidden = true;
    });

    document.addEventListener('keydown', (event) => {
      const tag = document.activeElement?.tagName;
      if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        event.preventDefault();
        $('globalSearch').focus();
      }
      if (event.key === 'Escape') {
        closeDetail();
        $('leftPanel').classList.remove('open');
        $('rightPanel').classList.remove('open');
        $('searchResults').hidden = true;
        state.viewer.trackedEntity = undefined;
      }
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && ['1', '2', '3', '4', '5'].includes(event.key)) {
        const styles = { '1': 'normal', '2': 'crt', '3': 'nvg', '4': 'thermal', '5': 'noir' };
        setSensorStyle(styles[event.key]);
      }
      if ((event.key === 'h' || event.key === 'H') && tag !== 'INPUT' && tag !== 'TEXTAREA') $('app').classList.toggle('hud-off');
    });

    document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => openTab(button.dataset.tab)));
    $('newsButton').addEventListener('click', () => { openTab('news'); $('rightPanel').classList.add('open'); });
    $('newsSearchButton').addEventListener('click', () => loadNews($('newsQuery').value || 'world'));
    $('newsQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadNews(event.target.value || 'world'); });

    $('menuButton').addEventListener('click', () => $('leftPanel').classList.add('open'));
    $('closeLayers').addEventListener('click', () => $('leftPanel').classList.remove('open'));
    $('closeRight').addEventListener('click', () => $('rightPanel').classList.remove('open'));
    document.querySelectorAll('[data-mobile-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.mobileAction;
      if (action === 'layers') $('leftPanel').classList.toggle('open');
      if (action === 'feed') $('rightPanel').classList.toggle('open');
      if (action === 'home') resetGlobe();
    }));
  }

  function openTab(name) {
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
    $(`tab${capitalize(name)}`)?.classList.add('active');
  }

  function resetGlobe() {
    state.viewer.trackedEntity = undefined;
    state.viewer.entities.removeById(state.trailEntityId);
    state.selected = null;
    $('objectHud').hidden = true;
    state.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-20, 24, 21_000_000),
      duration: 1.7,
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });
  }

  function copyViewLink() {
    const camera = Cesium.Cartographic.fromCartesian(state.viewer.camera.positionWC);
    const params = new URLSearchParams({
      lat: Cesium.Math.toDegrees(camera.latitude).toFixed(5),
      lon: Cesium.Math.toDegrees(camera.longitude).toFixed(5),
      alt: Math.round(camera.height).toString(),
      layers: LAYERS.filter((layer) => state.visible[layer]).join(','),
      map: $('mapStyle').value,
      sensor: $('sensorStyle').value,
      sats: $('satelliteGroup').value,
    });
    const url = `${location.origin}${location.pathname}?${params}`;
    navigator.clipboard?.writeText(url).then(() => toast('View link copied.')).catch(() => {
      prompt('Copy this World Eyes View link:', url);
    });
  }

  function applyViewFromUrl() {
    const params = new URLSearchParams(location.search);
    const map = params.get('map');
    const sensor = params.get('sensor');
    const sats = params.get('sats');
    if (['satellite', 'street', 'dark'].includes(map)) { $('mapStyle').value = map; setBasemap(map); }
    if (['normal', 'crt', 'nvg', 'thermal', 'noir'].includes(sensor)) setSensorStyle(sensor);
    if (sats) $('satelliteGroup').value = sats;

    if (params.has('layers')) {
      const enabled = new Set(String(params.get('layers')).split(',').filter(Boolean));
      for (const layer of LAYERS) {
        state.visible[layer] = enabled.has(layer);
        const box = $(`layer${capitalize(layer)}`);
        if (box) box.checked = state.visible[layer];
      }
    }

    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    const alt = Number(params.get('alt'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      state.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, Number.isFinite(alt) ? clamp(alt, 500, 65_000_000) : 2_000_000),
        orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      });
    }
  }

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => element.classList.remove('show'), 4600);
  }

  function hasCoordinates(item) {
    return Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude));
  }

  function coord(value) {
    return isFiniteNumber(value) ? `${Number(value).toFixed(4)}°` : '—';
  }

  function isFiniteNumber(value) {
    return value !== null && value !== '' && Number.isFinite(Number(value));
  }

  function formatAltitude(value) {
    if (!isFiniteNumber(value)) return '—';
    const meters = Number(value);
    return `${Math.round(meters).toLocaleString()} m / ${Math.round(meters * 3.28084).toLocaleString()} ft`;
  }

  function formatSpeed(value) {
    if (!isFiniteNumber(value)) return '—';
    const ms = Number(value);
    return `${Math.round(ms * 3.6)} km/h / ${Math.round(ms * 1.94384)} kt`;
  }

  function formatDistance(meters) {
    if (meters >= 1_000_000) return `${(meters / 1_000_000).toFixed(1)} Mm`;
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : 1)} km`;
    return `${Math.round(meters)} m`;
  }

  function formatNumber(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat('en-US', { notation: n >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(n);
  }

  function formatAge(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  function formatNewsTime(value) {
    if (!value) return 'recent';
    const raw = String(value);
    const parsed = /^\d{14}$/.test(raw)
      ? new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}Z`)
      : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 'recent' : `${formatAge(Date.now() - parsed.getTime())} ago`;
  }

  function formatFuture(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'TBD';
    const diff = date.getTime() - Date.now();
    if (diff < 0) return `${formatAge(-diff)} ago`;
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `T−${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `T−${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `T−${days}d ${hours % 24}h`;
  }

  function safeDomain(value) {
    try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  async function boot() {
    initGlobe();
    setupUi();
    applyViewFromUrl();
    updateCameraReadout();
    renderDataStatus();
    await refreshActive();
    setupTimers();
    state.booted = true;
    toast('World Eyes View V2 online. Live coverage depends on each public provider and its rate limits.');
  }

  boot().catch((error) => {
    console.error(error);
    $('connectionState').textContent = 'STARTUP ERROR';
    toast(`Startup error: ${error.message}`);
  });
})();
