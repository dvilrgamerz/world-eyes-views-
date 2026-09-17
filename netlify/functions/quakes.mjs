const CACHE_MS = 90_000;
let cached = null;
let cachedAt = 0;

export default async () => {
  if (cached && Date.now() - cachedAt < CACHE_MS) return json(cached, 200, 60);

  try {
    const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', {
      headers: { 'User-Agent': 'WorldEyesView/1.0 (+public-open-data-dashboard)' },
    });
    if (!response.ok) throw new Error(`USGS ${response.status}`);
    const data = await response.json();
    const earthquakes = (data.features || []).map((feature) => ({
      id: feature.id,
      magnitude: feature.properties?.mag ?? null,
      place: feature.properties?.place || '',
      time: feature.properties?.time || null,
      updated: feature.properties?.updated || null,
      url: feature.properties?.url || '',
      longitude: feature.geometry?.coordinates?.[0] ?? null,
      latitude: feature.geometry?.coordinates?.[1] ?? null,
      depthKm: feature.geometry?.coordinates?.[2] ?? null,
    })).filter((q) => Number.isFinite(Number(q.latitude)) && Number.isFinite(Number(q.longitude)));

    cached = { source: 'USGS', fetchedAt: new Date().toISOString(), earthquakes };
    cachedAt = Date.now();
    return json(cached, 200, 60);
  } catch (error) {
    return json({ error: 'quakes_unavailable', message: error.message, earthquakes: [] }, 502, 10);
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
