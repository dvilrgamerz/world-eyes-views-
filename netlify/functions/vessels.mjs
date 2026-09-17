import WebSocket from 'ws';

const AIS_URL = 'wss://stream.aisstream.io/v0/stream';

export default async (request) => {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return json({
      configured: false,
      source: 'AISStream',
      error: 'AISSTREAM_API_KEY is not configured',
      vessels: [],
    }, 503);
  }

  const url = new URL(request.url);
  const bbox = readBbox(url.searchParams);
  const sampleMs = clamp(Number(url.searchParams.get('sampleMs') || 3200), 1200, 6500);
  const maxRows = clamp(Number(url.searchParams.get('maxRows') || 900), 50, 1800);

  try {
    const vessels = await collectSnapshot({ apiKey, bbox, sampleMs, maxRows });
    return json({
      configured: true,
      source: 'AISStream',
      fetchedAt: new Date().toISOString(),
      bbox,
      total: vessels.length,
      vessels,
    }, 200, 3);
  } catch (error) {
    return json({ configured: true, source: 'AISStream', error: error.message, vessels: [] }, 502);
  }
};

function collectSnapshot({ apiKey, bbox, sampleMs, maxRows }) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(AIS_URL, { handshakeTimeout: 6000 });
    const rows = new Map();
    const staticRows = new Map();
    let settled = false;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.terminate(); } catch {}
      if (error) reject(error);
      else resolve([...rows.values()].slice(0, maxRows));
    };

    const timer = setTimeout(() => finish(), sampleMs + 2500);

    socket.on('open', () => {
      socket.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[
          [bbox.minLat, bbox.minLon],
          [bbox.maxLat, bbox.maxLon],
        ]],
        FilterMessageTypes: [
          'PositionReport',
          'StandardClassBPositionReport',
          'ExtendedClassBPositionReport',
          'ShipStaticData',
          'StaticDataReport',
        ],
      }));
      setTimeout(() => finish(), sampleMs).unref?.();
    });

    socket.on('message', (raw) => {
      if (settled || rows.size >= maxRows) return;
      let envelope;
      try { envelope = JSON.parse(raw.toString()); } catch { return; }
      if (envelope?.error) {
        finish(new Error(String(envelope.error)));
        return;
      }
      ingestEnvelope(envelope, rows, staticRows);
    });

    socket.on('unexpected-response', (_request, response) => {
      finish(new Error(`AISStream upgrade ${response.statusCode || 'failed'}`));
    });
    socket.on('error', (error) => finish(error));
    socket.on('close', () => {
      if (!settled && rows.size) finish();
      else if (!settled) finish(new Error('AISStream closed before data arrived'));
    });
  });
}

function ingestEnvelope(envelope, rows, staticRows) {
  const messageType = envelope?.MessageType;
  const message = envelope?.Message?.[messageType] || {};
  const metadata = envelope?.MetaData || envelope?.Metadata || {};
  const mmsi = string(metadata.MMSI ?? message.UserID ?? message.UserId ?? message.Mmsi);
  if (!mmsi) return;

  if (messageType === 'ShipStaticData' || messageType === 'StaticDataReport') {
    const existing = staticRows.get(mmsi) || {};
    const next = {
      name: string(metadata.ShipName ?? message.Name ?? message.ShipName ?? message.ReportA?.Name ?? existing.name),
      type: string(message.Type ?? message.ShipType ?? message.ReportB?.ShipType ?? existing.type),
      destination: string(message.Destination ?? existing.destination),
      imo: string(message.ImoNumber ?? message.IMO ?? existing.imo),
    };
    staticRows.set(mmsi, next);
    const live = rows.get(mmsi);
    if (live) Object.assign(live, Object.fromEntries(Object.entries(next).filter(([, value]) => value)));
  }

  const lat = number(metadata.latitude ?? metadata.Latitude ?? message.Latitude);
  const lon = number(metadata.longitude ?? metadata.Longitude ?? message.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const extra = staticRows.get(mmsi) || {};
  rows.set(mmsi, {
    mmsi,
    name: string(metadata.ShipName ?? message.Name ?? message.ShipName ?? message.ReportA?.Name ?? extra.name) || `MMSI ${mmsi}`,
    type: string(message.Type ?? message.ShipType ?? message.ReportB?.ShipType ?? extra.type),
    destination: string(message.Destination ?? extra.destination),
    imo: string(message.ImoNumber ?? message.IMO ?? extra.imo),
    latitude: lat,
    longitude: lon,
    speedKnots: number(message.Sog ?? message.SOG),
    course: number(message.Cog ?? message.COG),
    heading: normalizeHeading(message.TrueHeading ?? message.Heading),
    timestamp: metadata.time_utc ?? metadata.TimeUtc ?? null,
  });
}

function readBbox(params) {
  let minLat = clamp(Number(params.get('minLat') ?? -10), -89, 89);
  let minLon = clamp(Number(params.get('minLon') ?? -20), -180, 180);
  let maxLat = clamp(Number(params.get('maxLat') ?? 10), -89, 89);
  let maxLon = clamp(Number(params.get('maxLon') ?? 20), -180, 180);
  if (minLat > maxLat) [minLat, maxLat] = [maxLat, minLat];
  if (minLon > maxLon) [minLon, maxLon] = [maxLon, minLon];
  if (maxLat - minLat > 45) maxLat = minLat + 45;
  if (maxLon - minLon > 70) maxLon = minLon + 70;
  return { minLat, minLon, maxLat, maxLon };
}

function normalizeHeading(value) {
  const n = number(value);
  if (!Number.isFinite(n) || n < 0 || n >= 360) return null;
  return n;
}

function string(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
