import { json2satrec, propagate, gstime, eciToGeodetic } from 'satellite.js';

const GROUPS = new Set(['active', 'stations', 'starlink', 'gps-ops', 'weather', 'geo', 'science', 'cubesat']);
const RAW_CACHE_MS = 10 * 60_000;
const rawCache = new Map();

export default async (request) => {
  const url = new URL(request.url);
  const requested = (url.searchParams.get('group') || 'active').toLowerCase();
  const group = GROUPS.has(requested) ? requested : 'active';
  const limit = clamp(Number(url.searchParams.get('limit') || 900), 20, 1500);

  try {
    const elements = await getElements(group);
    const picked = sample(elements, limit);
    const now = new Date();
    const gmst = gstime(now);
    const satellites = [];

    for (const element of picked) {
      try {
        const satrec = json2satrec(element);
        if (satrec.error) continue;
        const state = propagate(satrec, now);
        if (!state?.position) continue;
        const geodetic = eciToGeodetic(state.position, gmst);
        const latitude = radiansToDegrees(geodetic.latitude);
        const longitude = normalizeLongitude(radiansToDegrees(geodetic.longitude));
        const altitudeKm = geodetic.height;
        if (![latitude, longitude, altitudeKm].every(Number.isFinite)) continue;

        satellites.push({
          id: String(element.NORAD_CAT_ID || element.OBJECT_ID || element.OBJECT_NAME || ''),
          noradId: element.NORAD_CAT_ID || null,
          name: element.OBJECT_NAME || `NORAD ${element.NORAD_CAT_ID || ''}`,
          objectId: element.OBJECT_ID || '',
          epoch: element.EPOCH || '',
          latitude,
          longitude,
          altitudeKm,
        });
      } catch {
        // Skip malformed/temporarily unpropagatable orbital elements.
      }
    }

    return json({
      source: 'CelesTrak OMM + satellite.js SGP4',
      group,
      fetchedAt: now.toISOString(),
      totalAvailable: elements.length,
      sampled: picked.length,
      satellites,
    }, 200, 25);
  } catch (error) {
    return json({ error: 'satellites_unavailable', message: error.message, satellites: [] }, 502, 10);
  }
};

async function getElements(group) {
  const cached = rawCache.get(group);
  if (cached && Date.now() - cached.time < RAW_CACHE_MS) return cached.data;

  const endpoint = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group.toUpperCase())}&FORMAT=JSON`;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'WorldEyesView/1.0 (+public-open-data-dashboard)' },
  });
  if (!response.ok) throw new Error(`CelesTrak ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Unexpected CelesTrak response');
  rawCache.set(group, { time: Date.now(), data });
  return data;
}

function sample(items, limit) {
  if (items.length <= limit) return items;
  const out = [];
  const stride = items.length / limit;
  for (let i = 0; i < limit; i++) out.push(items[Math.floor(i * stride)]);
  return out;
}

function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

function normalizeLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
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
