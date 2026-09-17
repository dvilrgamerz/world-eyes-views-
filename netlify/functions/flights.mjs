const CACHE_MS = 18_000;
let cachedStates = null;
let cachedAt = 0;
let tokenCache = { token: null, expiresAt: 0 };

export default async (request) => {
  const url = new URL(request.url);
  const limit = clamp(Number(url.searchParams.get('limit') || 2600), 100, 5000);

  if (cachedStates && Date.now() - cachedAt < CACHE_MS) {
    return json({ source: 'OpenSky Network', fetchedAt: new Date(cachedAt).toISOString(), states: sample(cachedStates, limit) }, 200, 12);
  }

  try {
    const states = await fetchOpenSky();
    cachedStates = states;
    cachedAt = Date.now();
    return json({ source: 'OpenSky Network', fetchedAt: new Date(cachedAt).toISOString(), states: sample(states, limit) }, 200, 12);
  } catch (error) {
    return json({ error: 'flights_unavailable', message: error.message, states: [] }, 502, 5);
  }
};

async function fetchOpenSky() {
  const headers = { 'User-Agent': 'WorldEyesView/1.0 (+public-open-data-dashboard)' };
  const token = await getAccessToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response = await fetch('https://opensky-network.org/api/states/all', { headers });

  if (!response.ok && token) {
    tokenCache = { token: null, expiresAt: 0 };
    response = await fetch('https://opensky-network.org/api/states/all', {
      headers: { 'User-Agent': headers['User-Agent'] },
    });
  }

  if (!response.ok) throw new Error(`OpenSky ${response.status}`);
  const data = await response.json();
  return (data.states || []).map(normalizeState).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
}

async function getAccessToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`OpenSky auth ${response.status}`);
  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 300)) * 1000,
  };
  return tokenCache.token;
}

function normalizeState(s) {
  return {
    icao24: s[0] || '',
    callsign: String(s[1] || '').trim(),
    originCountry: s[2] || '',
    timePosition: s[3],
    lastContact: s[4],
    longitude: toNumber(s[5]),
    latitude: toNumber(s[6]),
    baroAltitude: toNumber(s[7]),
    onGround: Boolean(s[8]),
    velocity: toNumber(s[9]),
    heading: toNumber(s[10]),
    verticalRate: toNumber(s[11]),
    geoAltitude: toNumber(s[13]),
    squawk: s[14] || '',
    spi: Boolean(s[15]),
    positionSource: s[16],
    category: s[17],
  };
}

function sample(items, limit) {
  if (items.length <= limit) return items;
  const out = [];
  const stride = items.length / limit;
  for (let i = 0; i < limit; i++) out.push(items[Math.floor(i * stride)]);
  return out;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
