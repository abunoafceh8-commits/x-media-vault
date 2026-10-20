export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, force = false } = body;
  
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  try {
    // Proxy to the original API
    const originalUrl = 'https://um9knv-igj9wr6gr-arcadawebapps6.vercel.app/api/media';
    const response = await fetch(originalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ username, force }),
      signal: AbortSignal.timeout(30000)
    });
    
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    // Fallback: return empty result
    const cleanUser = username.replace('@', '').trim();
    return res.json({
      profile: {
        username: cleanUser,
        displayName: cleanUser,
        bio: null,
        avatar: null,
        banner: null,
        verified: false
      },
      media: [],
      counts: { total: 0, photo: 0, video: 0, gif: 0 },
      scannedTweets: 0,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      error: e.message
    });
  }
}
