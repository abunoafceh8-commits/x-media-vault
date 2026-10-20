const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) : {};
  const username = (body.username || req.query?.username || '').replace('@', '').trim();
  if (!username) return res.status(400).json({ error: 'Username required' });

  const media = [];
  const profile = { username, found: false };

  // Method 1: Syndication API for profile
  try {
    const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    
    if (html.includes(username)) {
      profile.found = true;
      profile.displayName = html.match(/<title>(.*?)\s*\(/)?.[1] || username;
      profile.bio = html.match(/<meta name="description" content="(.*?)"/)?.[1] || '';
      
      // Extract tweets with media
      const tweets = [...html.matchAll(/data-tweet-id="(\d+)"[\s\S]*?<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
      const images = [...html.matchAll(/src="(https:\/\/pbs\.twimg\.com\/media\/[^"]+)"/g)];
      const videos = [...html.matchAll(/data-video-url="([^"]+)"/g)];
      
      images.forEach((m, i) => {
        media.push({
          type: 'photo',
          url: m[1].replace(/&amp;/g, '&'),
          thumb: m[1].replace(/&amp;/g, '&') + ':thumb',
          tweetId: tweets[i]?.[1] || '',
          tweetUrl: `https://twitter.com/${username}/status/${tweets[i]?.[1] || ''}`
        });
      });
      
      videos.forEach(m => {
        media.push({
          type: 'video',
          url: m[1].replace(/&amp;/g, '&'),
          thumb: '',
          tweetId: '',
          tweetUrl: ''
        });
      });
    }
  } catch {}

  // Method 2: Nitter instances (alternative Twitter frontend)
  const nitters = ['https://nitter.net', 'https://nitter.privacydev.net', 'https://nitter.poast.org'];
  for (const nitter of nitters) {
    if (media.length >= 20) break;
    try {
      const r = await fetch(`${nitter}/${username}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000)
      });
      const html = await r.text();
      
      // Extract media from Nitter
      const imgs = [...html.matchAll(/<img[^>]+src="([^"]+pic\.media[^"]+)"/g)];
      const vids = [...html.matchAll(/poster="([^"]+)"/g)];
      
      imgs.forEach(m => {
        if (!media.find(x => x.url === m[1])) {
          media.push({
            type: 'photo',
            url: m[1].startsWith('http') ? m[1] : nitter + m[1],
            thumb: m[1].startsWith('http') ? m[1] : nitter + m[1],
            tweetId: '',
            tweetUrl: '',
            source: 'nitter'
          });
        }
      });
      
      vids.forEach(m => {
        if (!media.find(x => x.url === m[1])) {
          media.push({
            type: 'video',
            url: m[1].startsWith('http') ? m[1] : nitter + m[1],
            thumb: m[1].startsWith('http') ? m[1] : nitter + m[1],
            tweetId: '',
            tweetUrl: '',
            source: 'nitter'
          });
        }
      });
    } catch {}
  }

  res.json({
    profile,
    media: media.slice(0, 100),
    counts: {
      photos: media.filter(m => m.type === 'photo').length,
      videos: media.filter(m => m.type === 'video').length,
      total: media.length
    },
    scannedTweets: 0,
    timestamp: new Date().toISOString()
  });
}
