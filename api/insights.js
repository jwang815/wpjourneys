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
  const base = { updated:new Date().toISOString(), campaign_status:'PAUSED', daily_budget:66, currency:'USD', window:'Since launch' }; // $33 Meta + $33 Google

  // 1) Form truth (inquiries by requested destination) — independent of Meta.
  let form = null;
  try {
    const f = await fetch(STATS_URL, { redirect:'follow' }).then(r => r.json());
    if (f && f.ok) form = f;
  } catch (e) { /* form feed unreachable; inquiries render as unavailable, never as ad-attributed counts */ }
  const byDest = {};
  if (form) {
    for (const k of Object.keys(form.byDestination || {})) {
      const n = norm(k);
      byDest[n] = (byDest[n] || 0) + form.byDestination[k];
    }
  }
  const formMeta = form
    ? { ok:true, total:form.total||0, people:form.people||0, bySource:form.bySource||{}, lastLeadAt:form.lastLeadAt||null }
    : { ok:false };
  // Google spend, pushed hourly by the "WPJ Spend Sync" Google Ads Script (no Ads API here).
  const googleSpend = (form && form.googleSpend && typeof form.googleSpend.total === 'number')
    ? { total:form.googleSpend.total, today:form.googleSpend.today||0, yesterday:form.googleSpend.yesterday||0, at:form.googleSpend.at||null }
    : null;
  const otherInquiries = form
    ? Object.keys(byDest).filter(k => !DESTS.some(d => d.name === k)).map(k => ({ name:k, inquiries:byDest[k] })).sort((a,b)=>b.inquiries-a.inquiries)
    : [];

  // 2) Meta media metrics per ad set.
  if (!TOKEN) return res.status(200).json({ ...base, destinations:blank(), other_inquiries:otherInquiries, form:formMeta, google_spend:googleSpend, note:'META_TOKEN not set' });
  try {
    const insUrl = `${API}/${CAMPAIGN_ID}/insights?level=adset&fields=adset_name,spend,impressions,reach,clicks,actions&date_preset=maximum&limit=100&access_token=${encodeURIComponent(TOKEN)}`;
    const stUrl  = `${API}/${CAMPAIGN_ID}?fields=effective_status&access_token=${encodeURIComponent(TOKEN)}`;
    const [ins, st] = await Promise.all([ fetch(insUrl).then(r=>r.json()), fetch(stUrl).then(r=>r.json()) ]);
    if (ins.error) return res.status(200).json({ ...base, destinations:blank(), other_inquiries:otherInquiries, form:formMeta, google_spend:googleSpend, note:'meta: '+(ins.error.message||'error') });
    const by = {};
    (ins.data||[]).forEach(row => {
      const dn = (row.adset_name||'').split('|')[0].trim();
      let metaLeads = 0;
      (row.actions||[]).forEach(a => { if (a.action_type === 'offsite_conversion.fb_pixel_lead') metaLeads += parseFloat(a.value)||0; });
      by[dn] = { spend:parseFloat(row.spend)||0, impressions:parseInt(row.impressions)||0, reach:parseInt(row.reach)||0, clicks:parseInt(row.clicks)||0, meta_leads:metaLeads };
    });
    const destinations = DESTS.map(d => ({
      ...d, ...(by[d.name]||zero()),
      inquiries: form ? (byDest[d.name]||0) : null   // form truth; null = feed down (never substitute ad attribution)
    }));
    const campaign_status = (st && st.effective_status === 'ACTIVE') ? 'ACTIVE' : 'PAUSED';
    return res.status(200).json({ ...base, campaign_status, destinations, other_inquiries:otherInquiries, form:formMeta, google_spend:googleSpend });
  } catch (e) {
    return res.status(200).json({ ...base, destinations:blank(), other_inquiries:otherInquiries, form:formMeta, google_spend:googleSpend, note:'fetch_error' });
  }
}
