// Waypoint Journeys — live ads data endpoint (Vercel serverless function)
// Runs in Vercel's cloud on each request; needs env var META_TOKEN (a Meta
// ads_read access token). The token stays server-side and is never sent to the browser.
const CAMPAIGN_ID = '120249500641590782';
const API = 'https://graph.facebook.com/v19.0';
const DESTS = [
  { name:'Socotra',      tag:'The Alien Island',   img:'/images/ads/AD_Socotra_4x5.jpg',      url:'https://wpjourneys.com/socotra/' },
  { name:'Turkmenistan', tag:'Door to Hell',       img:'/images/ads/AD_Turkmenistan_4x5.jpg', url:'https://wpjourneys.com/turkmenistan-expedition/' },
  { name:'Pakistan',     tag:'The Karakoram',      img:'/images/ads/AD_Pakistan_4x5.jpg',     url:'https://wpjourneys.com/pakistan-expedition/' },
  { name:'Mongolia',     tag:'Eternal Sky',        img:'/images/ads/AD_Mongolia_4x5.jpg',     url:'https://wpjourneys.com/mongolia-expedition/' },
  { name:'Libya',        tag:'Roman Africa',       img:'/images/ads/AD_Libya_4x5.jpg',        url:'https://wpjourneys.com/libya-expedition/' },
  { name:'Custom',       tag:'Anywhere on Earth',  img:'/images/ads/AD_Custom_4x5.jpg',       url:'https://wpjourneys.com/' }
];
const zero = () => ({ spend:0, impressions:0, reach:0, clicks:0, leads:0 });
const blank = () => DESTS.map(d => ({ ...d, ...zero() }));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  const TOKEN = process.env.META_TOKEN;
  const base = { updated:new Date().toISOString(), campaign_status:'PAUSED', daily_budget:33, currency:'USD', window:'Since launch' };
  if (!TOKEN) return res.status(200).json({ ...base, destinations:blank(), note:'META_TOKEN not set' });
  try {
    const insUrl = `${API}/${CAMPAIGN_ID}/insights?level=adset&fields=adset_name,spend,impressions,reach,clicks,actions&date_preset=maximum&limit=100&access_token=${encodeURIComponent(TOKEN)}`;
    const stUrl  = `${API}/${CAMPAIGN_ID}?fields=effective_status&access_token=${encodeURIComponent(TOKEN)}`;
    const [ins, st] = await Promise.all([ fetch(insUrl).then(r=>r.json()), fetch(stUrl).then(r=>r.json()) ]);
    if (ins.error) return res.status(200).json({ ...base, destinations:blank(), note:'meta: '+(ins.error.message||'error') });
    const by = {};
    (ins.data||[]).forEach(row => {
      const dn = (row.adset_name||'').split('|')[0].trim();
      let leads = 0;
      (row.actions||[]).forEach(a => { if (a.action_type === 'offsite_conversion.fb_pixel_lead') leads += parseFloat(a.value)||0; });
      by[dn] = { spend:parseFloat(row.spend)||0, impressions:parseInt(row.impressions)||0, reach:parseInt(row.reach)||0, clicks:parseInt(row.clicks)||0, leads };
    });
    const destinations = DESTS.map(d => ({ ...d, ...(by[d.name]||zero()) }));
    const campaign_status = (st && st.effective_status === 'ACTIVE') ? 'ACTIVE' : 'PAUSED';
    return res.status(200).json({ ...base, campaign_status, destinations });
  } catch (e) {
    return res.status(200).json({ ...base, destinations:blank(), note:'fetch_error' });
  }
}
