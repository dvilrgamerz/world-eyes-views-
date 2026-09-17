const CACHE_MS = 6 * 60 * 60_000;
let cached = null;
let cachedAt = 0;

const COORDS = {
  USA: [-98.5, 39.8], CHN: [104.0, 35.8], DEU: [10.4, 51.0], NLD: [5.3, 52.1],
  JPN: [138.0, 36.0], KOR: [127.8, 36.3], FRA: [2.2, 46.2], ITA: [12.5, 42.5],
  GBR: [-3.4, 55.4], IND: [78.9, 22.5], MEX: [-102.5, 23.6], CAN: [-106.3, 56.1],
  SGP: [103.82, 1.35], ARE: [54.3, 24.4], BRA: [-51.9, -14.2], ESP: [-3.7, 40.4],
  BEL: [4.7, 50.8], CHE: [8.2, 46.8], AUS: [133.8, -25.3], VNM: [108.3, 14.1],
};

export default async () => {
  if (cached && Date.now() - cachedAt < CACHE_MS) return json(cached, 200, 3600);

  try {
    const [exportsRows, importsRows] = await Promise.all([
      getIndicator('TX.VAL.MRCH.CD.WT'),
      getIndicator('TM.VAL.MRCH.CD.WT'),
    ]);

    const exportMap = latestByCountry(exportsRows);
    const importMap = latestByCountry(importsRows);
    const countries = [];

    for (const [code, [longitude, latitude]] of Object.entries(COORDS)) {
      const ex = exportMap.get(code);
      const im = importMap.get(code);
      if (!ex && !im) continue;
      countries.push({
        code,
        country: ex?.country?.value || im?.country?.value || code,
        year: String(Math.max(Number(ex?.date || 0), Number(im?.date || 0)) || ''),
        exports: ex?.value ?? null,
        imports: im?.value ?? null,
        longitude,
        latitude,
      });
    }

    cached = {
      source: 'World Bank World Development Indicators / WTO',
      note: 'Merchandise imports and exports are latest-available annual values, not live shipment telemetry.',
      fetchedAt: new Date().toISOString(),
      countries,
    };
    cachedAt = Date.now();
    return json(cached, 200, 3600);
  } catch (error) {
    return json({ error: 'trade_unavailable', message: error.message, countries: [] }, 502, 60);
  }
};

async function getIndicator(indicator) {
  const endpoint = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&mrnev=1&per_page=500`;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'WorldEyesView/1.0 (+public-open-data-dashboard)' },
  });
  if (!response.ok) throw new Error(`World Bank ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.[1]) ? data[1] : [];
}

function latestByCountry(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = row.countryiso3code;
    if (!code || !COORDS[code] || row.value === null) continue;
    const existing = map.get(code);
    if (!existing || Number(row.date) > Number(existing.date)) map.set(code, row);
  }
  return map;
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
