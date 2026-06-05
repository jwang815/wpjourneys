// Waypoint Journeys — daily ads brief (Vercel serverless function, triggered by Vercel Cron)
// Pulls yesterday + since-launch numbers from Meta and POSTs a formatted brief to the
// Apps Script lead webhook, which emails the team. Fully cloud-side; no laptop needed.
const CAMPAIGN_ID = '120249500641590782';
const API = 'https://graph.facebook.com/v19.0';
const EXEC = 'https://script.google.com/macros/s/AKfycbxLuT6oryPqymAZFXjAVqTdoqebEXKn507IiUMmOccD4P9LaGN6C2FkG2GFQ7pJMXMsEw/exec';
const TO = 'admin@wpjourneys.com, jwang815@gmail.com, michaeldu001@gmail.com, weipeng1996@gmail.com, info@wpjourneys.com';
const DESTS = ['Socotra','Turkmenistan','Pakistan','Mongolia','Libya','Custom'];

export default async function handler(req, res) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua.includes('vercel-cron') && (req.query.key || '') !== 'wpj7392kx') return res.status(401).json({ error: 'unauthorized' });
  const TOKEN = process.env.META_TOKEN;
  if (!TOKEN) return res.status(200).json({ error: 'no token' });

  const usd = n => '$' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const intc = n => (parseInt(n) || 0).toLocaleString('en-US');
  async function insights(preset) {
    const u = `${API}/${CAMPAIGN_ID}/insights?level=adset&fields=adset_name,spend,impressions,clicks,actions&date_preset=${preset}&limit=100&access_token=${encodeURIComponent(TOKEN)}`;
    const r = await fetch(u); const j = await r.json(); return j.data || [];
  }
  function agg(rows) {
    const t = { spend: 0, impr: 0, clk: 0, leads: 0 }, by = {};
    rows.forEach(x => {
      const n = (x.adset_name || '').split('|')[0].trim();
      let l = 0; (x.actions || []).forEach(a => { if (a.action_type === 'offsite_conversion.fb_pixel_lead') l += parseFloat(a.value) || 0; });
      const sp = parseFloat(x.spend) || 0, im = parseInt(x.impressions) || 0, ck = parseInt(x.clicks) || 0;
      t.spend += sp; t.impr += im; t.clk += ck; t.leads += l;
      by[n] = { spend: sp, impr: im, clk: ck, leads: l };
    });
    return { t, by };
  }

  try {
    const [yRows, aRows] = await Promise.all([insights('yesterday'), insights('maximum')]);
    const Y = agg(yRows), A = agg(aRows);
    const dateStr = new Date(Date.now() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const yCtr = Y.t.impr ? (Y.t.clk / Y.t.impr * 100).toFixed(2) + '%' : '—';
    const yCpl = Y.t.leads ? usd(Y.t.spend / Y.t.leads) : '—';
    const aCpl = A.t.leads ? usd(A.t.spend / A.t.leads) : '—';
    const ranked = DESTS.map(d => ({ d, ...(A.by[d] || { spend: 0, impr: 0, clk: 0, leads: 0 }) })).sort((p, q) => (q.leads - p.leads) || (q.spend - p.spend));
    const rows = ranked.map(x => `<tr><td style="padding:7px 10px;border-top:1px solid #eee">${x.d}</td><td align="right" style="padding:7px 10px;border-top:1px solid #eee">${usd(x.spend)}</td><td align="right" style="padding:7px 10px;border-top:1px solid #eee">${x.leads}</td><td align="right" style="padding:7px 10px;border-top:1px solid #eee">${x.leads ? usd(x.spend / x.leads) : '—'}</td></tr>`).join('');
    const top = ranked.find(x => x.leads > 0);
    const headline = Y.t.leads > 0
      ? `Yesterday brought <b>${Y.t.leads}</b> ${Y.t.leads === 1 ? 'inquiry' : 'inquiries'} at <b>${yCpl}</b> each.`
      : (Y.t.spend > 0 ? `Spent ${usd(Y.t.spend)} yesterday, no inquiries yet — still early in the learning phase.` : `No spend recorded yesterday (ads may still be in review).`);

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:#14110d;color:#e4c079;padding:16px 20px;border-radius:10px 10px 0 0">
        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase">Waypoint Journeys</div>
        <div style="font-size:20px;margin-top:4px;color:#efe9dc">Daily Ads Brief · ${dateStr}</div>
      </div>
      <div style="border:1px solid #eee;border-top:none;padding:18px 20px;border-radius:0 0 10px 10px">
        <p style="font-size:15px;margin:0 0 14px">${headline}</p>
        <p style="margin:0 0 4px;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Yesterday</p>
        <p style="margin:0 0 14px"><b>${usd(Y.t.spend)}</b> spent · <b>${Y.t.leads}</b> inquiries · <b>${yCpl}</b>/inquiry · ${intc(Y.t.impr)} impressions · ${intc(Y.t.clk)} clicks · ${yCtr} CTR</p>
        <p style="margin:0 0 4px;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Since launch</p>
        <p style="margin:0 0 16px"><b>${usd(A.t.spend)}</b> spent · <b>${A.t.leads}</b> inquiries · <b>${aCpl}</b>/inquiry</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr style="background:#f3efe6"><th align="left" style="padding:7px 10px">Destination</th><th align="right" style="padding:7px 10px">Spend</th><th align="right" style="padding:7px 10px">Inquiries</th><th align="right" style="padding:7px 10px">Cost/Inq</th></tr>
          ${rows}
        </table>
        ${top ? `<p style="margin:14px 0 0;font-size:14px">🏆 <b>${top.d}</b> is leading on inquiries so far.</p>` : ''}
        <p style="margin:16px 0 0;padding:12px 14px;background:#fbf3df;border-radius:8px;font-size:14px"><b>Reminder:</b> reply to every new inquiry within the hour — it's the single biggest driver of bookings.</p>
        <p style="margin:16px 0 0"><a href="https://wpjourneys.com/dashboard/" style="color:#b8860b;font-weight:bold">Open the live dashboard →</a></p>
      </div>
    </div>`;
    const subject = `Waypoint Ads — Daily Brief (${dateStr}): ${Y.t.leads} ${Y.t.leads === 1 ? 'inquiry' : 'inquiries'}, ${usd(Y.t.spend)} spend`;
    const r = await fetch(EXEC, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ brief: true, to: TO, subject, html }) });
    return res.status(200).json({ ok: true, sent: true, webhook_status: r.status });
  } catch (e) {
    return res.status(200).json({ error: String(e) });
  }
}
