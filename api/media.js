const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, type = 'all' } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cleanUser = username.replace('@', '').trim();
  const mediaItems = [];

  try {
    // Method 1: Syndication
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      
      // Find all image URLs
      const imgUrls = new Set();
      const matches = html.match(/https:\/\/pbs\.twimg\.com\/media\/[A-Za-z0-9_-]+\.[a-z]+(\?[^\s"<>]*)?/g);
      if (matches) matches.forEach(u => imgUrls.add(u.split('?')[0] + '?format=jpg&name=orig'));
      
      // Find video poster images
      const videoMatches = html.match(/https:\/\/pbs\.twimg\.com\/[^\s"<>]*video[^\s"<>]*/g);
      if (videoMatches) videoMatches.forEach(u => imgUrls.add(u));
      
      // Find tweet-specific media
      const tweetMedia = html.match(/https:\/\/pbs\.twimg\.com\/media\/[A-Za-z0-9_-]+/g);
      if (tweetMedia) tweetMedia.forEach(u => imgUrls.add(u + '?format=jpg&name=orig'));
      
      imgUrls.forEach(url => {
        const isVideo = url.includes('video');
        mediaItems.push({
          type: isVideo ? 'video' : 'image',
          url,
          thumbnail: url.replace('name=orig', 'name=thumb'),
          name: url.match(/([A-Za-z0-9_-]+)\?/)?.[1] || url.split('/').pop()
        });
      });
    } catch {}

    // Method 2: Try Nitter for more media
    const nitters = ['https://nitter.poast.org', 'https://nitter.privacydev.net'];
    for (const nitter of nitters) {
      if (mediaItems.length >= 30) break;
      try {
        const r = await fetch(`${nitter}/${cleanUser}/media`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(6000),
          redirect: 'follow'
        });
        if (r.ok) {
          const html = await r.text();
          const imgs = html.match(/https:\/\/pbs\.twimg\.com\/media\/[A-Za-z0-9_-]+\.[a-z]+/g);
          if (imgs) {
            imgs.forEach(url => {
              if (!mediaItems.find(m => m.url.startsWith(url.split('.')[0]))) {
                mediaItems.push({
                  type: 'image',
                  url: url + '?name=orig',
                  thumbnail: url + '?name=thumb',
                  name: url.split('/').pop()
                });
              }
            });
          }
        }
      } catch {}
    }

    // Filter
    let filtered = mediaItems;
    if (type === 'images') filtered = mediaItems.filter(m => m.type === 'image');
    else if (type === 'videos') filtered = mediaItems.filter(m => m.type === 'video');

    // Deduplicate
    const seen = new Set();
    filtered = filtered.filter(m => {
      const key = m.url.split('?')[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({
      username: cleanUser,
      media: filtered,
      total: filtered.length,
      hasMore: false,
      stats: { images: filtered.filter(m => m.type === 'image').length, videos: filtered.filter(m => m.type === 'video').length }
    });
  } catch (e) {
    return res.json({ error: e.message, media: mediaItems, total: mediaItems.length, stats: { images: 0, videos: 0 } });
  }
}
