// ═══════════════════════════════════════════════════════════════════════════
//  Tickrix Search API — Vercel serverless function
//  Lives at: https://tickrix.com/api/search?q=apple
//
//  Why this exists:
//  Yahoo Finance API blocks browser requests (CORS).
//  This function runs on Vercel's servers, fetches Yahoo, returns to browser.
//  Same-domain request → no CORS issues.
//
//  Returns: { quotes: [...] } — same shape as Yahoo's response.
//  Free Vercel hobby tier: 100k requests/day. Way more than we need.
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // Allow CORS for our own domain (and any during dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Get search query from URL parameter
  const q = (req.query.q || '').toString().trim();

  if (!q) {
    res.status(400).json({ error: 'Query parameter q is required' });
    return;
  }

  // Limit query length to prevent abuse
  if (q.length > 100) {
    res.status(400).json({ error: 'Query too long' });
    return;
  }

  try {
    // Yahoo Finance search endpoint
    const yahooUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;

    // Fetch from Yahoo (server-to-server, no CORS issues here)
    const response = await fetch(yahooUrl, {
      headers: {
        // Yahoo sometimes blocks requests without a User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      res.status(502).json({ error: 'Upstream Yahoo error', status: response.status });
      return;
    }

    const data = await response.json();

    // Cache results for 60 seconds at edge (fewer Yahoo calls)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    // Return only the parts we need (slimmer response)
    const quotes = (data.quotes || []).map(item => ({
      symbol: item.symbol,
      shortname: item.shortname,
      longname: item.longname,
      quoteType: item.quoteType,
      exchange: item.exchange
    })).filter(q => q.symbol);

    res.status(200).json({ quotes });

  } catch (error) {
    console.error('Search proxy error:', error);
    res.status(500).json({ error: 'Internal error', message: error.message });
  }
}
