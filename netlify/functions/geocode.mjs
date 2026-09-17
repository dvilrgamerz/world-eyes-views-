const cache = new Map();

export default async (request) => {
  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 180);
  if (q.length < 2) return json({ results: [] }, 200, 5);

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return json({ results: hit.results, cache: 'hit' }, 200, 120);

  try {
    const upstream = new URL('https://nominatim.openstreetmap.org/search');
    upstream.searchParams.set('q', q);
    upstream.searchParams.set('format', 'jsonv2');
    upstream.searchParams.set('limit', '6');
    upstream.searchParams.set('addressdetails', '1');
    const response = await fetch(upstream, {
      headers: {
        'User-Agent': 'WorldEyesView/2.0 (public map search; contact via GitHub dvilrgamerz/world-eyes-views-)',
        'Accept-Language': 'en',
      },
    });
    if (!response.ok) throw new Error(`Nominatim ${response.status}`);
    const payload = await response.json();
    const results = payload.map((item) => ({
      name: String(item.display_name || ''),
      type: String(item.type || item.category || ''),
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      boundingbox: Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : null,
    })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
    cache.set(key, { at: Date.now(), results });
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    return json({ results, cache: 'miss' }, 200, 120);
  } catch (error) {
    return json({ error: 'geocode_unavailable', message: error.message, results: [] }, 502, 5);
  }
};

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
