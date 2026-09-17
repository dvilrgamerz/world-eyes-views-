const CACHE_MS = 60_000;
let cached = null;
let cachedAt = 0;

export default async (request) => {
  const url = new URL(request.url);
  const category = sanitizeCategory(url.searchParams.get('category'));
  const days = clamp(Number(url.searchParams.get('days') || 30), 1, 365);
  const cacheKey = `${category || 'all'}:${days}`;

  if (cached?.key === cacheKey && Date.now() - cachedAt < CACHE_MS) {
    return json({ ...cached.body, cache: 'hit' }, 200, 45);
  }

  try {
    const upstream = new URL('https://eonet.gsfc.nasa.gov/api/v3/events/geojson');
    upstream.searchParams.set('status', 'open');
    upstream.searchParams.set('limit', '350');
    upstream.searchParams.set('days', String(days));
    if (category) upstream.searchParams.set('category', category);

    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'WorldEyesView/2.0 (+public-open-data-dashboard)' },
    });
    if (!response.ok) throw new Error(`NASA EONET ${response.status}`);

    const payload = await response.json();
    const events = (payload.features || [])
      .map(normalizeEvent)
      .filter((event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude));

    const body = {
      source: 'NASA EONET',
      fetchedAt: new Date().toISOString(),
      total: events.length,
      events,
    };
    cached = { key: cacheKey, body };
    cachedAt = Date.now();
    return json({ ...body, cache: 'miss' }, 200, 45);
  } catch (error) {
    if (cached?.key === cacheKey) return json({ ...cached.body, cache: 'stale', warning: error.message }, 200, 10);
    return json({ error: 'events_unavailable', message: error.message, events: [] }, 502, 5);
  }
};

function normalizeEvent(feature) {
  const props = feature.properties || {};
  const coords = representativeCoordinate(feature.geometry);
  const category = Array.isArray(props.categories) ? props.categories[0] : props.category;
  const source = Array.isArray(props.sources) ? props.sources[0] : null;
  return {
    id: String(feature.id || props.id || ''),
    title: String(props.title || props.name || 'Natural event'),
    category: String(category?.id || category?.title || category || 'event'),
    categoryTitle: String(category?.title || category?.id || category || 'Event'),
    description: String(props.description || ''),
    date: props.date || props.closed || props.geometry?.[0]?.date || null,
    sourceName: String(source?.id || source?.source || ''),
    sourceUrl: String(source?.url || props.link || ''),
    longitude: coords?.[0] ?? null,
    latitude: coords?.[1] ?? null,
  };
}

function representativeCoordinate(geometry) {
  if (!geometry) return null;
  const c = geometry.coordinates;
  if (geometry.type === 'Point' && Array.isArray(c)) return [Number(c[0]), Number(c[1])];
  if (geometry.type === 'MultiPoint' && Array.isArray(c?.[0])) return [Number(c[0][0]), Number(c[0][1])];
  if (geometry.type === 'LineString' && Array.isArray(c) && c.length) {
    const p = c[Math.floor(c.length / 2)];
    return [Number(p[0]), Number(p[1])];
  }
  if (geometry.type === 'Polygon' && Array.isArray(c?.[0]) && c[0].length) {
    const p = c[0][Math.floor(c[0].length / 2)];
    return [Number(p[0]), Number(p[1])];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(c?.[0]?.[0]) && c[0][0].length) {
    const ring = c[0][0];
    const p = ring[Math.floor(ring.length / 2)];
    return [Number(p[0]), Number(p[1])];
  }
  return null;
}

function sanitizeCategory(value) {
  if (!value) return '';
  return String(value).replace(/[^a-zA-Z0-9,_-]/g, '').slice(0, 80);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      'access-control-allow-origin': '*',
    },
  });
}
