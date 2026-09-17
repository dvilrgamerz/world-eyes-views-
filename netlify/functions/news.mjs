const CACHE_MS = 45_000;
let cache = new Map();

export default async (request) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || 'world').trim().slice(0, 160);
  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_MS) return json(cached.payload, 200, 30);

  const params = new URLSearchParams({
    query: q || 'world',
    mode: 'ArtList',
    maxrecords: '50',
    format: 'json',
    sort: 'DateDesc',
    timespan: '6h',
  });

  try {
    const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
      headers: { 'User-Agent': 'WorldEyesView/1.0 (+public-open-data-dashboard)' },
    });
    if (!response.ok) throw new Error(`GDELT ${response.status}`);
    const data = await response.json();
    const articles = (data.articles || []).slice(0, 50).map((article) => ({
      title: article.title || '',
      url: article.url || '',
      domain: article.domain || '',
      language: article.language || '',
      sourcecountry: article.sourcecountry || '',
      seendate: article.seendate || '',
    }));
    const payload = { source: 'GDELT DOC 2.0', fetchedAt: new Date().toISOString(), articles };
    cache.set(key, { time: Date.now(), payload });
    return json(payload, 200, 30);
  } catch (error) {
    return json({ error: 'news_unavailable', message: error.message, articles: [] }, 502, 10);
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
