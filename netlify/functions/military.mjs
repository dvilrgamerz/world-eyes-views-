const CACHE_MS = 12_000;
let cached = null;
let cachedAt = 0;

export default async () => {
  if (cached && Date.now() - cachedAt < CACHE_MS) {
    return json({ ...cached, cache: 'hit' }, 200, 8);
  }

  try {
    const response = await fetch('https://api.adsb.lol/v2/mil', {
      headers: { 'User-Agent': 'WorldEyesView/2.0 (+public-open-data-dashboard)' },
    });

    if (!response.ok) {
      if (cached) return json({ ...cached, cache: 'stale', upstreamStatus: response.status }, 200, 5);
      throw new Error(`adsb.lol ${response.status}`);
    }

    const payload = await response.json();
    const aircraft = (payload.ac || payload.aircraft || [])
      .map(normalizeAircraft)
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

    cachedAt = Date.now();
    cached = {
      source: 'adsb.lol military feed',
      fetchedAt: new Date(cachedAt).toISOString(),
      total: aircraft.length,
      aircraft,
    };

    return json({ ...cached, cache: 'miss' }, 200, 8);
  } catch (error) {
    if (cached) return json({ ...cached, cache: 'stale', warning: error.message }, 200, 3);
    return json({ error: 'military_unavailable', message: error.message, aircraft: [] }, 502, 3);
  }
};

function normalizeAircraft(a) {
  return {
    icao24: String(a.hex || a.icao || a.icao24 || '').trim().toLowerCase(),
    callsign: String(a.flight || a.callsign || '').trim(),
    registration: String(a.r || a.registration || '').trim(),
    aircraftType: String(a.t || a.type || '').trim(),
    description: String(a.desc || '').trim(),
    longitude: number(a.lon ?? a.longitude),
    latitude: number(a.lat ?? a.latitude),
    baroAltitude: feetToMeters(a.alt_baro),
    geoAltitude: feetToMeters(a.alt_geom),
    velocity: knotsToMetersPerSecond(a.gs),
    heading: number(a.track ?? a.true_heading ?? a.mag_heading),
    verticalRate: feetPerMinuteToMetersPerSecond(a.baro_rate ?? a.geom_rate),
    squawk: String(a.squawk || ''),
    category: a.category || '',
    emergency: a.emergency || '',
    dbFlags: a.dbFlags ?? a.db_flags ?? null,
    lastSeenSeconds: number(a.seen),
  };
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function feetToMeters(value) {
  if (value === 'ground') return 0;
  const n = number(value);
  return n === null ? null : n * 0.3048;
}

function knotsToMetersPerSecond(value) {
  const n = number(value);
  return n === null ? null : n * 0.514444;
}

function feetPerMinuteToMetersPerSecond(value) {
  const n = number(value);
  return n === null ? null : n * 0.00508;
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
