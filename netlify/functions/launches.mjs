const CACHE_MS = 5 * 60_000;
let cached = null;
let cachedAt = 0;

export default async () => {
  if (cached && Date.now() - cachedAt < CACHE_MS) {
    return json({ ...cached, cache: 'hit' }, 200, 120);
  }

  try {
    const upstream = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=60&ordering=net&mode=normal';
    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'WorldEyesView/2.0 (+public-open-data-dashboard)' },
    });
    if (!response.ok) throw new Error(`Launch Library 2 ${response.status}`);

    const payload = await response.json();
    const launches = (payload.results || [])
      .map(normalizeLaunch)
      .filter((launch) => Number.isFinite(launch.latitude) && Number.isFinite(launch.longitude));

    cachedAt = Date.now();
    cached = {
      source: 'The Space Devs / Launch Library 2',
      fetchedAt: new Date(cachedAt).toISOString(),
      total: launches.length,
      launches,
    };
    return json({ ...cached, cache: 'miss' }, 200, 120);
  } catch (error) {
    if (cached) return json({ ...cached, cache: 'stale', warning: error.message }, 200, 30);
    return json({ error: 'launches_unavailable', message: error.message, launches: [] }, 502, 5);
  }
};

function normalizeLaunch(item) {
  const pad = item.pad || {};
  const location = pad.location || {};
  const rocket = item.rocket?.configuration || item.rocket || {};
  const provider = item.launch_service_provider || item.lsp || {};
  const mission = item.mission || {};
  return {
    id: String(item.id || ''),
    name: String(item.name || mission.name || 'Upcoming launch'),
    net: item.net || item.window_start || null,
    windowStart: item.window_start || null,
    windowEnd: item.window_end || null,
    status: String(item.status?.name || item.status?.abbrev || ''),
    provider: String(provider.name || ''),
    rocket: String(rocket.full_name || rocket.name || ''),
    mission: String(mission.name || ''),
    missionDescription: String(mission.description || '').slice(0, 1200),
    orbit: String(mission.orbit?.name || mission.orbit?.abbrev || ''),
    pad: String(pad.name || ''),
    location: String(location.name || ''),
    latitude: toNumber(pad.latitude ?? location.latitude),
    longitude: toNumber(pad.longitude ?? location.longitude),
    webcast: firstUrl(item.vidURLs || item.vid_urls || item.video_url),
    image: String(item.image?.image_url || item.image || ''),
  };
}

function firstUrl(value) {
  if (Array.isArray(value)) {
    const entry = value.find((v) => typeof v === 'string' || v?.url);
    return String(typeof entry === 'string' ? entry : entry?.url || '');
  }
  return String(value || '');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
