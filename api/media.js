/* AbuNawaf hardened — © 2026 أبو نواف · MIT */
const __RL = new Map();
function __rate(req, res, max = 90, win = 60_000) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'x';
    const key = ip + ':' + (req.url || '');
    const now = Date.now();
    const b = __RL.get(key);
    if (!b || now > b.r) { __RL.set(key, { n: 1, r: now + win }); if (__RL.size > 4000) __RL.clear(); return true; }
    b.n++;
    if (b.n > max) { res.setHeader('Retry-After', String(Math.ceil((b.r - now) / 1000))); res.status(429).json({ error: 'rate_limited', message: 'تم تجاوز الحد المسموح — أعد المحاولة بعد قليل' }); return false; }
    return true;
  } catch { return true; }
}
const __origin = (req) => {
  const o = req.headers.origin || '';
  if (!o) return '*';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  if (/^https?:\/\/[a-z0-9-]+\.(vercel|arcada)\.app$/.test(o)) return o;
  try { if (o === 'https://' + req.headers.host) return o; } catch {}
  return 'null';
};

export default async function handler(req, res) {
  __ABUNAWAF_HARDENED__: if (!__rate(req, res)) return;
  res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
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
