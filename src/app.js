(() => {
  'use strict';

  if (!window.Cesium) {
    document.body.innerHTML = '<div style="padding:24px;color:white;background:#05080d;font-family:system-ui">Cesium failed to load. Check your internet connection and reload.</div>';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const Cesium = window.Cesium;

  const state = {
    viewer: null,
    layerIds: {
      flights: new Set(),
      satellites: new Set(),
      quakes: new Set(),
      trade: new Set(),
    },
    visible: {
      flights: true,
      satellites: true,
      quakes: true,
      trade: true,
    },
    lastUpdated: {},
    news: [],
    flights: [],
    satellites: [],
    quakes: [],
    trade: [],
    selectedEntity: null,
    loadingCount: 0,
    refreshTimers: [],
  };

  const colors = {
    flights: Cesium.Color.fromCssColorString('#55ddff'),
    satellites: Cesium.Color.fromCssColorString('#b69cff'),
    quakes: Cesium.Color.fromCssColorString('#ff6b7a'),
    trade: Cesium.Color.fromCssColorString('#ffd166'),
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
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 200;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 55000000;

    state.viewer = viewer;
    setBasemap('satellite');

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-20, 24, 21000000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });

    viewer.camera.changed.addEventListener(updateCameraReadout);
    viewer.camera.percentageChanged = 0.03;

    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      if (Cesium.defined(picked) && picked.id && picked.id._worldEyesData) {
        showEntityDetails(picked.id);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
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
        url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        maximumLevel: 19,
        credit: '© OpenStreetMap contributors © CARTO',
        customTags: { r: () => '' },
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

  function updateCameraReadout() {
    const cartographic = Cesium.Cartographic.fromCartesian(state.viewer.camera.positionWC);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    $('cameraCoords').textContent = `LAT ${lat.toFixed(4)}° // LON ${lon.toFixed(4)}°`;
  }

  function setLoading(on) {
    state.loadingCount += on ? 1 : -1;
    state.loadingCount = Math.max(0, state.loadingCount);
    $('loadingBar').classList.toggle('active', state.loadingCount > 0);
    if (!state.loadingCount) {
      $('loadingBar').style.width = '100%';
      setTimeout(() => { $('loadingBar').style.width = '0'; }, 250);
    }
  }

  function setHealth(feed, mode) {
    const dot = $(`health${capitalize(feed)}`);
    if (!dot) return;
    dot.className = `health-dot ${mode}`;
    if (mode === 'ok') state.lastUpdated[feed] = Date.now();
    updateConnectionState();
  }

  function updateHealthAges() {
    ['news', 'flights', 'satellites', 'quakes', 'trade'].forEach((feed) => {
      const target = $(`age${capitalize(feed)}`);
      if (!target) return;
      const ts = state.lastUpdated[feed];
      target.textContent = ts ? `${formatAge(Date.now() - ts)} ago` : 'waiting';
    });
  }

  function updateConnectionState() {
    const ready = Object.keys(state.lastUpdated).length;
    $('connectionState').textContent = ready >= 4 ? 'WORLD LINK ONLINE' : ready ? `FEEDS ONLINE ${ready}/5` : 'CONNECTING';
  }

  function beginFeed(feed) {
    setHealth(feed, 'loading');
    setLoading(true);
  }

  function endFeed(feed, ok = true) {
    setHealth(feed, ok ? 'ok' : 'error');
    setLoading(false);
  }

  async function fetchJson(url, options = {}, timeoutMs = 18000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadNews(query = 'world') {
    beginFeed('news');
    try {
      let payload;
      try {
        payload = await fetchJson(`/api/news?q=${encodeURIComponent(query)}`);
      } catch (serverError) {
        const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=40&format=json&sort=DateDesc&timespan=6h`;
        payload = await fetchJson(gdeltUrl);
      }

      const raw = payload.articles || payload.items || [];
      state.news = raw.slice(0, 50).map(normalizeNewsArticle).filter((item) => item.title && item.url);
      renderNews();
      renderTicker();
      $('metricNews').textContent = formatNumber(state.news.length);
      pushSignal({
        type: 'NEWS',
        title: `${state.news.length} recent world headlines loaded`,
        meta: query === 'world' ? 'Global feed' : `Query: ${query}`,
      });
      endFeed('news', true);
    } catch (error) {
      console.error('News feed error', error);
      toast(`News feed unavailable: ${error.message}`);
      endFeed('news', false);
    }
  }

  function normalizeNewsArticle(article) {
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
    beginFeed('flights');
    try {
      let payload;
      try {
        payload = await fetchJson('/api/flights?limit=2600', {}, 22000);
      } catch (serverError) {
        const direct = await fetchJson('https://opensky-network.org/api/states/all', {}, 22000);
        payload = { states: normalizeOpenSkyRows(direct.states || []) };
      }

      state.flights = (payload.states || []).filter(hasCoordinates);
      upsertFlightEntities(state.flights);
      updateLayerCount('flights', state.flights.length);
      $('metricFlights').textContent = formatNumber(state.flights.length);
      pushSignal({ type: 'AIR', title: `${state.flights.length} aircraft positions refreshed`, meta: 'OpenSky' });
      endFeed('flights', true);
    } catch (error) {
      console.error('Aircraft feed error', error);
      toast('Aircraft feed is limited or unavailable. Add OpenSky credentials in Netlify for more reliable access.');
      endFeed('flights', false);
    }
  }

  function normalizeOpenSkyRows(rows) {
    return rows.map((s) => ({
      icao24: s[0], callsign: (s[1] || '').trim(), originCountry: s[2],
      longitude: s[5], latitude: s[6], baroAltitude: s[7], onGround: s[8],
      velocity: s[9], heading: s[10], verticalRate: s[11], geoAltitude: s[13], squawk: s[14],
      lastContact: s[4],
    }));
  }

  async function loadSatellites() {
    beginFeed('satellites');
    const group = $('satelliteGroup').value;
    try {
      const payload = await fetchJson(`/api/satellites?group=${encodeURIComponent(group)}&limit=900`, {}, 25000);
      state.satellites = (payload.satellites || []).filter(hasCoordinates);
      upsertSatelliteEntities(state.satellites);
      updateLayerCount('satellites', state.satellites.length);
      $('metricSatellites').textContent = formatNumber(state.satellites.length);
      pushSignal({ type: 'ORBIT', title: `${state.satellites.length} satellite positions propagated`, meta: `CelesTrak / ${group}` });
      endFeed('satellites', true);
    } catch (error) {
      console.error('Satellite feed error', error);
      toast('Satellite layer requires the Netlify serverless function. Deploy this repo on Netlify to enable it.');
      endFeed('satellites', false);
    }
  }

  async function loadQuakes() {
    beginFeed('quakes');
    try {
      let payload;
      try {
        payload = await fetchJson('/api/quakes');
      } catch (serverError) {
        const raw = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
        payload = { earthquakes: raw.features.map((feature) => ({
          id: feature.id,
          magnitude: feature.properties.mag,
          place: feature.properties.place,
          time: feature.properties.time,
          url: feature.properties.url,
          longitude: feature.geometry.coordinates[0],
          latitude: feature.geometry.coordinates[1],
          depthKm: feature.geometry.coordinates[2],
        })) };
      }
      state.quakes = (payload.earthquakes || []).filter(hasCoordinates);
      upsertQuakeEntities(state.quakes);
      updateLayerCount('quakes', state.quakes.length);
      $('metricQuakes').textContent = formatNumber(state.quakes.length);
      const strongest = [...state.quakes].sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))[0];
      if (strongest) pushSignal({ type: 'SEISMIC', title: `M${Number(strongest.magnitude).toFixed(1)} — ${strongest.place}`, meta: 'USGS / last 24h' });
      endFeed('quakes', true);
    } catch (error) {
      console.error('Earthquake feed error', error);
      endFeed('quakes', false);
    }
  }

  async function loadTrade() {
    beginFeed('trade');
    try {
      const payload = await fetchJson('/api/trade', {}, 25000);
      state.trade = (payload.countries || []).filter(hasCoordinates);
      upsertTradeEntities(state.trade);
      updateLayerCount('trade', state.trade.length);
      renderTrade();
      endFeed('trade', true);
    } catch (error) {
      console.error('Trade feed error', error);
      $('tradeList').innerHTML = '<div class="data-note">Trade data needs the Netlify function in this repository. The globe still works with the other public feeds.</div>';
      endFeed('trade', false);
    }
  }

  function upsertFlightEntities(items) {
    syncEntityLayer('flights', items, (f) => `flight:${f.icao24}`, (f) => ({
      name: f.callsign || f.icao24?.toUpperCase() || 'Aircraft',
      position: Cesium.Cartesian3.fromDegrees(Number(f.longitude), Number(f.latitude), Math.max(400, Number(f.geoAltitude || f.baroAltitude || 1400))),
      point: {
        pixelSize: f.onGround ? 3 : 5,
        color: colors.flights.withAlpha(f.onGround ? .45 : .92),
        outlineColor: Cesium.Color.BLACK.withAlpha(.45),
        outlineWidth: 1,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 23000000),
      },
      data: { type: 'Aircraft', ...f },
    }));
  }

  function upsertSatelliteEntities(items) {
    syncEntityLayer('satellites', items, (s) => `sat:${s.id || s.noradId || s.name}`, (s) => ({
      name: s.name || `NORAD ${s.noradId || ''}`,
      position: Cesium.Cartesian3.fromDegrees(Number(s.longitude), Number(s.latitude), Math.max(120000, Number(s.altitudeKm || 400) * 1000)),
      point: {
        pixelSize: 4,
        color: colors.satellites.withAlpha(.9),
        outlineColor: Cesium.Color.BLACK.withAlpha(.5),
        outlineWidth: 1,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000000),
      },
      data: { type: 'Satellite', ...s },
    }));
  }

  function upsertQuakeEntities(items) {
    syncEntityLayer('quakes', items, (q) => `quake:${q.id}`, (q) => ({
      name: `M${Number(q.magnitude || 0).toFixed(1)} ${q.place || 'Earthquake'}`,
      position: Cesium.Cartesian3.fromDegrees(Number(q.longitude), Number(q.latitude), 6000),
      point: {
        pixelSize: Math.min(18, Math.max(7, 5 + Number(q.magnitude || 0) * 1.7)),
        color: colors.quakes.withAlpha(.82),
        outlineColor: Cesium.Color.WHITE.withAlpha(.35),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      data: { type: 'Earthquake', ...q },
    }));
  }

  function upsertTradeEntities(items) {
    const maxValue = Math.max(...items.map((t) => Number(t.exports || 0)), 1);
    syncEntityLayer('trade', items, (t) => `trade:${t.code}`, (t) => ({
      name: t.country || t.code,
      position: Cesium.Cartesian3.fromDegrees(Number(t.longitude), Number(t.latitude), 25000),
      point: {
        pixelSize: 8 + 15 * Math.sqrt(Math.max(0, Number(t.exports || 0)) / maxValue),
        color: colors.trade.withAlpha(.3),
        outlineColor: colors.trade.withAlpha(.9),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      data: { type: 'Trade', ...t },
    }));
  }

  function syncEntityLayer(layer, items, idFn, buildFn) {
    const viewer = state.viewer;
    const oldIds = state.layerIds[layer];
    const nextIds = new Set();

    for (const item of items) {
      const id = idFn(item);
      if (!id || nextIds.has(id)) continue;
      nextIds.add(id);
      const built = buildFn(item);
      let entity = viewer.entities.getById(id);
      if (!entity) {
        entity = viewer.entities.add({ id, name: built.name, position: built.position, point: built.point, show: state.visible[layer] });
      } else {
        entity.name = built.name;
        entity.position = built.position;
        entity.point = built.point;
        entity.show = state.visible[layer];
      }
      entity._worldEyesLayer = layer;
      entity._worldEyesData = built.data;
    }

    for (const id of oldIds) {
      if (!nextIds.has(id)) {
        const entity = viewer.entities.getById(id);
        if (entity) viewer.entities.remove(entity);
      }
    }

    state.layerIds[layer] = nextIds;
    viewer.scene.requestRender();
    renderSignalList();
  }

  function toggleLayer(layer, enabled) {
    state.visible[layer] = enabled;
    for (const id of state.layerIds[layer]) {
      const entity = state.viewer.entities.getById(id);
      if (entity) entity.show = enabled;
    }
    state.viewer.scene.requestRender();
  }

  function clearLayer(layer) {
    for (const id of state.layerIds[layer]) {
      const entity = state.viewer.entities.getById(id);
      if (entity) state.viewer.entities.remove(entity);
    }
    state.layerIds[layer].clear();
  }

  function updateLayerCount(layer, count) {
    $(`count${capitalize(layer)}`).textContent = formatNumber(count);
  }

  function renderNews() {
    const container = $('newsList');
    container.innerHTML = '';
    if (!state.news.length) {
      container.innerHTML = '<div class="data-note">No recent matching headlines were returned.</div>';
      return;
    }

    state.news.slice(0, 35).forEach((article) => {
      const card = document.createElement('article');
      card.className = 'news-card';
      const a = document.createElement('a');
      a.href = article.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML = `
        <div class="card-top"><span class="domain">${escapeHtml(article.domain || 'source')}</span><span>${escapeHtml(formatNewsTime(article.seenDate))}</span></div>
        <div class="card-title">${escapeHtml(article.title)}</div>
        <div class="card-meta">${escapeHtml([article.sourceCountry, article.language].filter(Boolean).join(' · '))}</div>`;
      card.appendChild(a);
      container.appendChild(card);
    });
  }

  function renderTicker() {
    const track = $('tickerTrack');
    track.innerHTML = '';
    const top = state.news.slice(0, 12);
    if (!top.length) {
      const span = document.createElement('span');
      span.textContent = 'Waiting for world headlines…';
      track.appendChild(span);
      return;
    }
    top.forEach((article) => {
      const span = document.createElement('span');
      span.textContent = article.title;
      track.appendChild(span);
    });
  }

  function renderTrade() {
    const container = $('tradeList');
    container.innerHTML = '';
    const sorted = [...state.trade].sort((a, b) => Number(b.exports || 0) - Number(a.exports || 0));
    sorted.forEach((t) => {
      const card = document.createElement('article');
      card.className = 'trade-card';
      card.addEventListener('click', () => focusDataEntity(`trade:${t.code}`));
      card.innerHTML = `
        <div class="card-top"><span>${escapeHtml(t.code || '')}</span><span>${escapeHtml(String(t.year || 'latest'))}</span></div>
        <div class="card-title">${escapeHtml(t.country || t.code || 'Country')}</div>
        <div class="trade-values">
          <div><small>EXPORTS</small><b>${formatMoney(t.exports)}</b></div>
          <div><small>IMPORTS</small><b>${formatMoney(t.imports)}</b></div>
        </div>`;
      container.appendChild(card);
    });
  }

  const signalBuffer = [];
  function pushSignal(signal) {
    signalBuffer.unshift({ ...signal, time: Date.now() });
    if (signalBuffer.length > 20) signalBuffer.length = 20;
    renderSignalList();
  }

  function renderSignalList() {
    const list = $('signalList');
    list.innerHTML = '';
    signalBuffer.slice(0, 12).forEach((signal) => {
      const card = document.createElement('div');
      card.className = 'signal-card';
      card.innerHTML = `
        <div class="card-top"><span class="badge">${escapeHtml(signal.type)}</span><span>${formatAge(Date.now() - signal.time)} ago</span></div>
        <div class="card-title">${escapeHtml(signal.title)}</div>
        <div class="card-meta">${escapeHtml(signal.meta || '')}</div>`;
      list.appendChild(card);
    });
  }

  function showEntityDetails(entity) {
    state.selectedEntity = entity;
    const data = entity._worldEyesData || {};
    $('detailType').textContent = String(data.type || 'SIGNAL').toUpperCase();
    $('detailTitle').textContent = entity.name || data.name || 'World signal';
    const rows = detailRows(data);
    $('detailBody').innerHTML = rows.map(([label, value]) => `
      <div class="detail-row"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('');
    const dialog = $('detailDialog');
    if (!dialog.open) dialog.showModal();
  }

  function detailRows(data) {
    if (data.type === 'Aircraft') {
      return [
        ['Callsign', data.callsign || '—'], ['ICAO24', data.icao24 || '—'],
        ['Country', data.originCountry || '—'], ['Altitude', formatAltitude(data.geoAltitude || data.baroAltitude)],
        ['Speed', formatSpeed(data.velocity)], ['Heading', isFiniteNumber(data.heading) ? `${Number(data.heading).toFixed(0)}°` : '—'],
        ['Latitude', coord(data.latitude)], ['Longitude', coord(data.longitude)],
        ['On ground', data.onGround ? 'Yes' : 'No'], ['Squawk', data.squawk || '—'],
      ];
    }
    if (data.type === 'Satellite') {
      return [
        ['Name', data.name || '—'], ['NORAD', String(data.noradId || data.id || '—')],
        ['Altitude', isFiniteNumber(data.altitudeKm) ? `${Number(data.altitudeKm).toFixed(0)} km` : '—'],
        ['Latitude', coord(data.latitude)], ['Longitude', coord(data.longitude)],
        ['Epoch', data.epoch ? new Date(data.epoch).toISOString().replace('.000Z', 'Z') : '—'],
      ];
    }
    if (data.type === 'Earthquake') {
      return [
        ['Magnitude', `M${Number(data.magnitude || 0).toFixed(1)}`], ['Place', data.place || '—'],
        ['Depth', isFiniteNumber(data.depthKm) ? `${Number(data.depthKm).toFixed(1)} km` : '—'],
        ['Time', data.time ? new Date(Number(data.time)).toLocaleString() : '—'],
        ['Latitude', coord(data.latitude)], ['Longitude', coord(data.longitude)],
      ];
    }
    if (data.type === 'Trade') {
      return [
        ['Country', data.country || '—'], ['Year', String(data.year || '—')],
        ['Exports', formatMoney(data.exports)], ['Imports', formatMoney(data.imports)],
        ['Dataset', 'World Bank merchandise trade'], ['Freshness', 'Latest available annual value'],
      ];
    }
    return Object.entries(data).slice(0, 10).map(([key, value]) => [key, String(value ?? '—')]);
  }

  function focusDataEntity(id) {
    const entity = state.viewer.entities.getById(id);
    if (!entity) return;
    showEntityDetails(entity);
    state.viewer.flyTo(entity, { duration: 1.8, offset: new Cesium.HeadingPitchRange(0, -0.65, 1800000) });
  }

  function trackSelected() {
    const entity = state.selectedEntity;
    if (!entity) return;
    const layer = entity._worldEyesLayer;
    const range = layer === 'satellites' ? 2400000 : layer === 'flights' ? 260000 : 1300000;
    state.viewer.flyTo(entity, { duration: 2.1, offset: new Cesium.HeadingPitchRange(0, -0.65, range) });
    $('detailDialog').close();
  }

  function searchLoaded(query) {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const candidates = state.viewer.entities.values.filter((entity) => entity._worldEyesData);
    const exact = candidates.find((entity) => {
      const d = entity._worldEyesData;
      const haystack = [entity.name, d.callsign, d.icao24, d.noradId, d.id, d.country, d.code, d.place].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (!exact) {
      toast(`No loaded object matched “${query}”. Try a callsign, satellite name, country, or ICAO code.`);
      return;
    }
    state.selectedEntity = exact;
    const range = exact._worldEyesLayer === 'satellites' ? 2200000 : 650000;
    state.viewer.flyTo(exact, { duration: 1.8, offset: new Cesium.HeadingPitchRange(0, -0.6, range) });
    showEntityDetails(exact);
  }

  async function refreshAll() {
    $('refreshButton').disabled = true;
    await Promise.allSettled([loadNews($('newsQuery').value || 'world'), loadFlights(), loadSatellites(), loadQuakes(), loadTrade()]);
    $('refreshButton').disabled = false;
  }

  function setupTimers() {
    state.refreshTimers.push(setInterval(() => { if (!document.hidden) loadFlights(); }, 30000));
    state.refreshTimers.push(setInterval(() => { if (!document.hidden) loadSatellites(); }, 60000));
    state.refreshTimers.push(setInterval(() => { if (!document.hidden) loadNews($('newsQuery').value || 'world'); }, 90000));
    state.refreshTimers.push(setInterval(() => { if (!document.hidden) loadQuakes(); }, 120000));
    state.refreshTimers.push(setInterval(() => { if (!document.hidden) loadTrade(); }, 6 * 60 * 60 * 1000));
    state.refreshTimers.push(setInterval(updateHealthAges, 1000));
  }

  function setupUi() {
    setInterval(() => {
      $('utcClock').textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
    }, 250);

    ['flights', 'satellites', 'quakes', 'trade'].forEach((layer) => {
      $(`layer${capitalize(layer)}`).addEventListener('change', (event) => toggleLayer(layer, event.target.checked));
    });

    $('satelliteGroup').addEventListener('change', () => {
      clearLayer('satellites');
      loadSatellites();
    });
    $('mapStyle').addEventListener('change', (event) => setBasemap(event.target.value));
    $('refreshButton').addEventListener('click', refreshAll);
    $('homeButton').addEventListener('click', resetGlobe);
    $('detailClose').addEventListener('click', () => $('detailDialog').close());
    $('trackButton').addEventListener('click', trackSelected);

    $('globalSearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') searchLoaded(event.target.value);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        $('globalSearch').focus();
      }
      if (event.key === 'Escape') {
        if ($('detailDialog').open) $('detailDialog').close();
        $('leftPanel').classList.remove('open');
        $('rightPanel').classList.remove('open');
      }
    });

    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => openTab(button.dataset.tab));
    });

    $('newsButton').addEventListener('click', () => { openTab('news'); $('rightPanel').classList.add('open'); });
    $('newsSearchButton').addEventListener('click', () => loadNews($('newsQuery').value || 'world'));
    $('newsQuery').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadNews(event.target.value || 'world'); });

    $('menuButton').addEventListener('click', () => $('leftPanel').classList.add('open'));
    $('closeLayers').addEventListener('click', () => $('leftPanel').classList.remove('open'));
    $('closeRight').addEventListener('click', () => $('rightPanel').classList.remove('open'));

    document.querySelectorAll('[data-mobile-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.mobileAction;
        if (action === 'layers') $('leftPanel').classList.toggle('open');
        if (action === 'feed') $('rightPanel').classList.toggle('open');
        if (action === 'home') resetGlobe();
      });
    });
  }

  function openTab(name) {
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
    $(`tab${capitalize(name)}`).classList.add('active');
  }

  function resetGlobe() {
    state.viewer.trackedEntity = undefined;
    state.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-20, 24, 21000000),
      duration: 1.8,
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });
  }

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => element.classList.remove('show'), 4500);
  }

  function hasCoordinates(item) {
    return Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
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

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value) || 0);
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(number);
  }

  function formatAge(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }

  function formatNewsTime(value) {
    if (!value) return 'recent';
    const raw = String(value);
    const parsed = /^\d{14}$/.test(raw)
      ? new Date(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(8,10)}:${raw.slice(10,12)}:${raw.slice(12,14)}Z`)
      : new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 'recent' : formatAge(Date.now() - parsed.getTime()) + ' ago';
  }

  function safeDomain(value) {
    try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  async function boot() {
    initGlobe();
    setupUi();
    updateCameraReadout();
    await refreshAll();
    setupTimers();
    toast('World Eyes View connected. Live data coverage depends on each public provider and its rate limits.');
  }

  boot().catch((error) => {
    console.error(error);
    $('connectionState').textContent = 'STARTUP ERROR';
    toast(`Startup error: ${error.message}`);
  });
})();
