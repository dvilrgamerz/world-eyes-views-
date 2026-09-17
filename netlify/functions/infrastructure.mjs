const CACHE_MS = 10 * 60_000;
const cache = new Map();

export default async (request) => {
  const url = new URL(request.url);
  const lat = clamp(Number(url.searchParams.get('lat') || 0), -85, 85);
  const lon = clamp(Number(url.searchParams.get('lon') || 0), -180, 180);
  const radius = clamp(Number(url.searchParams.get('radius') || 180000), 10_000, 300_000);
  const kind = ['all', 'datacenters', 'dams'].includes(url.searchParams.get('kind'))
    ? url.searchParams.get('kind')
    : 'all';

  const key = `${Math.round(lat * 2) / 2}:${Math.round(lon * 2) / 2}:${Math.round(radius / 25000)}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json({ ...hit.body, cache: 'hit' }, 200, 120);

  try {
    const query = buildQuery({ lat, lon, radius, kind });
    const payload = await fetchOverpass(query);
    const infrastructure = (payload.elements || [])
      .map(normalizeElement)
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .slice(0, 350);

    const body = {
      source: 'OpenStreetMap / Overpass',
      fetchedAt: new Date().toISOString(),
      center: { latitude: lat, longitude: lon, radiusMeters: radius },
      total: infrastructure.length,
      infrastructure,
    };
    cache.set(key, { at: Date.now(), body });
    pruneCache();
    return json({ ...body, cache: 'miss' }, 200, 120);
  } catch (error) {
    if (hit) return json({ ...hit.body, cache: 'stale', warning: error.message }, 200, 30);
    return json({ error: 'infrastructure_unavailable', message: error.message, infrastructure: [] }, 502, 5);
  }
};

function buildQuery({ lat, lon, radius, kind }) {
  const around = `(around:${Math.round(radius)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const parts = [];
  if (kind === 'all' || kind === 'datacenters') {
    parts.push(`node["man_made"="data_centre"]${around};way["man_made"="data_centre"]${around};relation["man_made"="data_centre"]${around};`);
  }
  if (kind === 'all' || kind === 'dams') {
    parts.push(`node["waterway"="dam"]${around};way["waterway"="dam"]${around};relation["waterway"="dam"]${around};node["man_made"="dam"]${around};way["man_made"="dam"]${around};`);
  }
  return `[out:json][timeout:18];(${parts.join('')});out center tags 350;`;
}

async function fetchOverpass(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'user-agent': 'WorldEyesView/2.0 (+public-open-data-dashboard)',
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Overpass unavailable');
}

function normalizeElement(element) {
  const tags = element.tags || {};
  const isDatacenter = tags.man_made === 'data_centre';
  const latitude = number(element.lat ?? element.center?.lat);
  const longitude = number(element.lon ?? element.center?.lon);
  return {
    id: `${element.type}:${element.id}`,
    type: isDatacenter ? 'Datacenter' : 'Dam',
    name: String(tags.name || tags.operator || (isDatacenter ? 'Data centre' : 'Dam')),
    operator: String(tags.operator || ''),
    website: String(tags.website || tags['contact:website'] || ''),
    wikidata: String(tags.wikidata || ''),
    latitude,
    longitude,
  };
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function pruneCache() {
  if (cache.size <= 30) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  while (entries.length > 24) {
    const [key] = entries.shift();
    cache.delete(key);
  }
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
