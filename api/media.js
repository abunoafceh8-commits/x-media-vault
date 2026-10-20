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
    // Method 1: Syndication API (rich data)
    const syndUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`;
    const r1 = await fetch(syndUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (r1.ok) {
      const html = await r1.text();
      profile.found = true;
      
      // Extract title (display name)
      const titleMatch = html.match(/<title>(.*?)\s*\(/);
      if (titleMatch) profile.displayName = titleMatch[1].trim();
      
      // Extract bio from meta
      const bioMatch = html.match(/<meta name="description" content="([^"]+)"/);
      if (bioMatch) profile.bio = bioMatch[1];
      
      // Extract stats
      const followersMatch = html.match(/(\d+(?:\.\d+)?[KMB]?)\s*Followers/i);
      const followingMatch = html.match(/(\d+(?:\.\d+)?[KMB]?)\s*Following/i);
      if (followersMatch) profile.followers = parseNumber(followersMatch[1]);
      if (followingMatch) profile.following = parseNumber(followingMatch[1]);
      
      // Extract profile image
      const imgMatch = html.match(/src="(https:\/\/pbs\.twimg\.com\/profile_images[^"]+)"/);
      if (imgMatch) profile.profileImage = imgMatch[1].replace(/&amp;/g, '&');
      
      // Extract banner
      const bannerMatch = html.match(/src="(https:\/\/pbs\.twimg\.com\/profile_banners[^"]+)"/);
      if (bannerMatch) profile.profileBanner = bannerMatch[1].replace(/&amp;/g, '&');
      
      // Check verification
      profile.isVerified = html.includes('verified') || html.includes('Verified');
      profile.isProtected = html.includes('protected') || html.includes('Protected');
    }
    
    // Method 2: Nitter instances (alternative frontend)
    const nitters = [
      'https://nitter.net',
      'https://nitter.privacydev.net',
      'https://nitter.poast.org'
    ];
    
    for (const nitter of nitters) {
      try {
        const r2 = await fetch(`${nitter}/${username}`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(8000)
        });
        
        if (r2.ok) {
          const html = await r2.text();
          
          // Extract more detailed info
          const joinMatch = html.match(/Joined\s+(\w+\s+\d{4})/);
          if (joinMatch) profile.joinDate = joinMatch[1];
          
          const locationMatch = html.match(/<span class="profile-location">([^<]+)</);
          if (locationMatch) profile.location = locationMatch[1].trim();
          
          const websiteMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*class="profile-website"/);
          if (websiteMatch) profile.website = websiteMatch[1];
          
          const tweetsMatch = html.match(/(\d+(?:,\d+)*)\s*Tweets/i);
          if (tweetsMatch) profile.tweets = parseInt(tweetsMatch[1].replace(/,/g, ''));
          
          const likesMatch = html.match(/(\d+(?:,\d+)*)\s*Likes/i);
          if (likesMatch) profile.likes = parseInt(likesMatch[1].replace(/,/g, ''));
          
          break; // Success, stop trying other nitters
        }
      } catch {}
    }
    
  } catch (e) {
    profile.error = e.message;
  }
  
  return profile;
}

function parseNumber(str) {
  const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
  const match = str.match(/(\d+(?:\.\d+)?)([KMB])?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const mult = match[2] ? multipliers[match[2]] : 1;
  return Math.round(num * mult);
}

// Advanced media extraction from tweets
async function extractMedia(username, profile) {
  const media = {
    photos: [],
    videos: [],
    gifs: [],
    total: 0
  };
  
  try {
    // Method 1: Syndication API
    const syndUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`;
    const r1 = await fetch(syndUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000)
    });
    
    if (r1.ok) {
      const html = await r1.text();
      
      // Extract photos
      const photoMatches = [...html.matchAll(/src="(https:\/\/pbs\.twimg\.com\/media\/[^"]+)"/g)];
      const seenUrls = new Set();
      
      photoMatches.forEach(m => {
        const url = m[1].replace(/&amp;/g, '&');
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          
          // Determine type
          const isVideo = url.includes('video') || url.includes('tweet_video');
          const isGif = url.includes('gif');
          
          const mediaItem = {
            url,
            thumb: url + ':thumb',
            type: isVideo ? 'video' : isGif ? 'gif' : 'photo',
            source: 'syndication',
            tweetUrl: '',
            timestamp: ''
          };
          
          if (isVideo) media.videos.push(mediaItem);
          else if (isGif) media.gifs.push(mediaItem);
          else media.photos.push(mediaItem);
        }
      });
      
      // Extract video URLs
      const videoMatches = [...html.matchAll(/data-video-url="([^"]+)"/g)];
      videoMatches.forEach(m => {
        const url = m[1].replace(/&amp;/g, '&');
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          media.videos.push({
            url,
            thumb: '',
            type: 'video',
            source: 'syndication'
          });
        }
      });
    }
    
    // Method 2: Nitter instances
    const nitters = ['https://nitter.net', 'https://nitter.privacydev.net'];
    for (const nitter of nitters) {
      try {
        const r2 = await fetch(`${nitter}/${username}`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(8000)
        });
        
        if (r2.ok) {
          const html = await r2.text();
          
          // Extract images
          const imgMatches = [...html.matchAll(/<img[^>]+src="([^"]+pic\.media[^"]+)"/g)];
          imgMatches.forEach(m => {
            const url = m[1].startsWith('http') ? m[1] : nitter + m[1];
            if (!media.photos.find(p => p.url === url)) {
              media.photos.push({
                url,
                thumb: url,
                type: 'photo',
                source: 'nitter'
              });
            }
          });
          
          // Extract videos
          const videoMatches = [...html.matchAll(/poster="([^"]+)"/g)];
          videoMatches.forEach(m => {
            const url = m[1].startsWith('http') ? m[1] : nitter + m[1];
            if (!media.videos.find(v => v.url === url)) {
              media.videos.push({
                url,
                thumb: url,
                type: 'video',
                source: 'nitter'
              });
            }
          });
        }
      } catch {}
    }
    
    media.total = media.photos.length + media.videos.length + media.gifs.length;
    
  } catch (e) {
    media.error = e.message;
  }
  
  return media;
}

// Tweet analysis and extraction
async function analyzeTweets(username) {
  const analysis = {
    tweets: [],
    total: 0,
    hashtags: [],
    mentions: [],
    links: [],
    engagement: {
      likes: 0,
      retweets: 0,
      replies: 0
    },
    activity: {
      tweetsPerDay: 0,
      mostActiveTime: '',
      languages: {}
    }
  };
  
  try {
    // Syndication API
    const syndUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`;
    const r = await fetch(syndUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000)
    });
    
    if (r.ok) {
      const html = await r.text();
      
      // Extract tweets
      const tweetMatches = [...html.matchAll(/data-tweet-id="(\d+)"[\s\S]*?<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
      
      tweetMatches.forEach((m, i) => {
        const tweetId = m[1];
        const text = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        
        const tweet = {
          id: tweetId,
          text,
          url: `https://twitter.com/${username}/status/${tweetId}`,
          timestamp: new Date(parseInt(tweetId) / 4194304 + 1288834974657).toISOString()
        };
        
        analysis.tweets.push(tweet);
        
        // Extract hashtags
        const hashtags = text.match(/#\w+/g) || [];
        analysis.hashtags.push(...hashtags);
        
        // Extract mentions
        const mentions = text.match(/@\w+/g) || [];
        analysis.mentions.push(...mentions);
        
        // Extract links
        const links = text.match(/https?:\/\/\S+/g) || [];
        analysis.links.push(...links);
      });
      
      analysis.total = analysis.tweets.length;
      
      // Deduplicate
      analysis.hashtags = [...new Set(analysis.hashtags)];
      analysis.mentions = [...new Set(analysis.mentions)];
      analysis.links = [...new Set(analysis.links)];
    }
  } catch (e) {
    analysis.error = e.message;
  }
  
  return analysis;
}

// Cross-platform correlation
async function crossPlatformCorrelation(username, profile) {
  const correlation = {
    platforms: [],
    connections: 0,
    influence: 0
  };
  
  // Check if username exists on other platforms
  const platforms = [
    { name: 'Instagram', url: `https://www.instagram.com/${username}/` },
    { name: 'TikTok', url: `https://www.tiktok.com/@${username}` },
    { name: 'YouTube', url: `https://www.youtube.com/@${username}` },
    { name: 'Reddit', url: `https://www.reddit.com/user/${username}` },
  ];
  
  const checks = await Promise.allSettled(
    platforms.map(async (p) => {
      try {
        const r = await fetch(p.url, {
          method: 'HEAD',
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(5000)
        });
        return { ...p, found: r.status === 200 };
      } catch {
        return { ...p, found: false };
      }
    })
  );
  
  correlation.platforms = checks
    .filter(c => c.status === 'fulfilled' && c.value.found)
    .map(c => c.value);
  
  correlation.connections = correlation.platforms.length;
  correlation.influence = profile.followers > 10000 ? 90 : profile.followers > 1000 ? 70 : 50;
  
  return correlation;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', __origin(req)); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' 
    ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {})
    : {};
  const username = (body.username || req.query?.username || '').replace('@', '').trim();
  
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  // Run all intelligence gathering in parallel
  const [profile, media, tweets, correlation] = await Promise.allSettled([
    getTwitterProfile(username),
    extractMedia(username),
    analyzeTweets(username),
    crossPlatformCorrelation(username, {})
  ]);

  const twitterProfile = profile.status === 'fulfilled' ? profile.value : { found: false, username };
  const mediaData = media.status === 'fulfilled' ? media.value : { photos: [], videos: [], gifs: [], total: 0 };
  const tweetData = tweets.status === 'fulfilled' ? tweets.value : { tweets: [], total: 0 };
  const correlationData = correlation.status === 'fulfilled' ? correlation.value : { platforms: [], connections: 0 };
  
  // Update correlation with profile data
  if (twitterProfile.found) {
    correlationData.influence = twitterProfile.followers > 10000 ? 90 : twitterProfile.followers > 1000 ? 70 : 50;
  }
  
  res.json({
    success: true,
    username,
    
    // Deep profile
    profile: twitterProfile,
    
    // Media intelligence
    media: [...mediaData.photos, ...mediaData.videos, ...mediaData.gifs],
    counts: {
      photos: mediaData.photos.length,
      videos: mediaData.videos.length,
      gifs: mediaData.gifs.length,
      total: mediaData.total
    },
    
    // Tweet analysis
    tweets: tweetData,
    
    // Cross-platform
    correlation: correlationData,
    
    // Metadata
    scannedTweets: tweetData.total,
    timestamp: new Date().toISOString(),
    version: '2.0-advanced'
  });
}
