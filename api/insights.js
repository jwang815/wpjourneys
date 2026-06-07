// Waypoint Journeys — live ads data endpoint (Vercel serverless function)
// Runs in Vercel's cloud on each request; needs env var META_TOKEN (a Meta
// ads_read access token). The token stays server-side and is never sent to the browser.
//
// INQUIRY COUNTS COME FROM THE WEBSITE FORM (Apps Script stats endpoint), keyed by the
// destination the traveler actually selected — NOT from Meta's ad-click attribution.
// (Meta credits every pixel Lead to the last ad clicked: one Turkmenistan ad click
// followed by Syria/Libya/Eritrea form submissions = "3 Turkmenistan leads". Wrong.)
// Meta is used only for media metrics: spend / impressions / clicks / status.
const CAMPAIGN_ID = '120249500641590782';
const API = 'https://graph.facebook.com/v19.0';
const STATS_URL = 'https://script.google.com/macros/s/AKfycbxLuT6oryPqymAZFXjAVqTdoqebEXKn507IiUMmOccD4P9LaGN6C2FkG2GFQ7pJMXMsEw/exec?action=stats';
const DESTS = [
  { name:'Socotra',      tag:'The Alien Island',   img:'/images/ads/AD_Socotra_4x5.jpg',      url:'https://wpjourneys.com/socotra/' },
  { name:'Turkmenistan', tag:'Door to Hell',       img:'/images/ads/AD_Turkmenistan_4x5.jpg', url:'https://wpjourneys.com/turkmenistan-expedition/' },
  { name:'Pakistan',     tag:'The Karakoram',      img:'/images/ads/AD_Pakistan_4x5.jpg',     url:'https://wpjourneys.com/pakistan-expedition/' },
  { name:'Mongolia',     tag:'Eternal Sky',        img:'/images/ads/AD_Mongolia_4x5.jpg',     url:'https://wpjourneys.com/mongolia-expedition/' },
  { name:'Libya',        tag:'Roman Africa',       img:'/images/ads/AD_Libya_4x5.jpg',        url:'https://wpjourneys.com/libya-expedition/' },
  { name:'Custom',       tag:'Anywhere on Earth',  img:'/images/ads/AD_Custom_4x5.jpg',       url:'https://wpjourneys.com/' }
];
const zero = () => ({ spend:0, impressions:0, reach:0, clicks:0, meta_leads:0 });
const blank = () => DESTS.map(d => ({ ...d, ...zero(), inquiries:null }));
// "Custom / not sure" on the form → the Custom ad row.
const norm = k => /^custom/i.test(String(k).trim()) ? 'Custom' : String(k).trim();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  const TOKEN = process.env.META_TOKEN;
  const base = { updated:new Date().toISOString(), campaign_status:'PAUSED', daily_budget:33, currency:'USD', window:'Since launch' };

  // 1) Form truth (inquiries by requested destination) — independent of Meta.
  let form = null;
  try {
    const f = await fetch(STATS_URL, { redirect:'follow' }).then(r => r.json());
    if (f && f.ok) form = f;
  } catch (e) { /* form feed unreachable; inquiries render as unavailable, never as ad-attributed counts */ }
  const byDest = {};
  if (form) for (const k of Object.keys(form.byDestination || {})) {
    const n = norm(k);
    byDest[n] = (byDest[n] || 0) + form.byDestination[k];
  }
  const formMeta = form
    ? { ok:true, total:form.total||0, people:form.people||0, bySource:form.bySource||{}, lastLeadAt:form.lastLeadAt||null }
    : { ok:false };
  const otherInquiries = form
    ? Obje