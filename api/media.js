const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, force = false } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  const cleanUser = username.replace('@', '').trim();
  const media = [];
  let profile = { username: cleanUser, displayName: cleanUser, avatar: null, banner: null, bio: null, verified: false };
  let scannedTweets = 0;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // Method 1: Twitter Syndication API
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000)
      });
      const html = await r.text();
      
      // Extract profile info
      const nameMatch = html.match(/<title>([^<]+)</);
      const avatarMatch = html.match(/https:\/\/pbs\.twimg\.com\/profile_images\/[^\s"<>]+/);
      const bannerMatch = html.match(/https:\/\/pbs\.twimg\.com\/profile_banners\/[^\s"<>]+/);
      
      if (nameMatch || avatarMatch) {
        profile = {
          username: cleanUser,
          displayName: nameMatch?.[1]?.split('(')[0].trim() || cleanUser,
          avatar: avatarMatch?.[0] || null,
          banner: bannerMatch?.[0] || null
        };
      }
      
      // Extract tweets and media
      const tweetBlocks = html.split('data-tweet-id="');
      for (let i = 1; i < tweetBlocks.length; i++) {
        const block = tweetBlocks[i];
        const tweetId = block.match(/^(\d+)/)?.[1];
        if (!tweetId) continue;
        scannedTweets++;
        
        // Extract text
        const textMatch = block.match(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/);
        const tweetText = textMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
        const tweetUrl = `https://twitter.com/${cleanUser}/status/${tweetId}`;
        
        // Extract images
        const imgMatches = block.matchAll(/https:\/\/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)\.([a-z]+)/g);
        for (const match of imgMatches) {
          const mediaId = match[1];
          const ext = match[2];
          const url = `https://pbs.twimg.com/media/${mediaId}.${ext}?format=${ext}&name=orig`;
          if (!media.find(m => m.url === url)) {
            media.push({
              id: `${tweetId}_${media.length}`,
              url,
              type: 'photo',
              width: null,
              height: null,
              duration: null,
              tweetId,
              tweetText,
              tweetUrl,
              ext
            });
          }
        }
        
        // Extract videos
        const videoMatches = block.matchAll(/https:\/\/video\.twimg\.com\/[^\s"<>]+\.mp4[^\s"<>]*/g);
        for (const match of videoMatches) {
          const url = match[0];
          if (!media.find(m => m.url === url)) {
            media.push({
              id: `${tweetId}_${media.length}`,
              url,
              type: 'video',
              width: null,
              height: null,
              duration: null,
              tweetId,
              tweetText,
              tweetUrl,
              ext: 'mp4'
            });
          }
        }
      }
    } catch (e) {
      console.error('Syndication error:', e.message);
    }

    // Method 2: Try Nitter instances for more media
    const nitters = ['https://nitter.poast.org', 'https://nitter.privacydev.net'];
    for (const nitter of nitters) {
      if (media.length >= 50) break;
      try {
        const r = await fetch(`${nitter}/${cleanUser}/media`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(8000),
          redirect: 'follow'
        });
        if (r.ok) {
          const html = await r.text();
          const imgs = html.matchAll(/https:\/\/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)\.([a-z]+)/g);
          for (const match of imgs) {
            const mediaId = match[1];
            const ext = match[2];
            const url = `https://pbs.twimg.com/media/${mediaId}.${ext}?format=${ext}&name=orig`;
            if (!media.find(m => m.url === url)) {
              media.push({
                id: `nitter_${media.length}`,
                url,
                type: 'photo',
                width: null,
                height: null,
                duration: null,
                tweetId: null,
                tweetText: '',
                tweetUrl: null,
                ext
              });
            }
          }
        }
      } catch {}
    }

    // Count by type
    const counts = {
      total: media.length,
      photo: media.filter(m => m.type === 'photo').length,
      video: media.filter(m => m.type === 'video').length,
      gif: media.filter(m => m.type === 'gif').length
    };

    return res.json({
      profile,
      media,
      counts,
      scannedTweets,
      fetchedAt: new Date().toISOString(),
      fromCache: false
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, media: [], counts: { total: 0, photo: 0, video: 0, gif: 0 } });
  }
}
