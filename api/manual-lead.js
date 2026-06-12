// Waypoint Journeys — manual lead entry (Vercel serverless function)
// Forwards a lead JSON payload to the Apps Script lead webhook from Vercel's
// egress (Google's front door rejects many non-browser clients, so ad-hoc
// scripts can't reach the /exec URL directly). Used to log leads that arrive
// OUTSIDE the website form — e.g. a direct email to info@ — so the Leads
// Sheet stays the single source of truth and the dashboard counts them.
//
//   POST /api/manual-lead?key=…   body: same JSON shape the /inquire/ form
//                                 sends (name, email, destination, message…)
//   GET  /api/manual-lead?key=…   returns the Apps Script ?action=stats feed
//                                 (fresh, uncached — for verification)
//
// Key-protected with the same shared key as /api/daily-brief.
const EXEC = 'https://script.google.com/macros/s/AKfycbxLuT6oryPqymAZFXjAVqTdoqebEXKn507IiUMmOccD4P9LaGN6C2FkG2GFQ7pJMXMsEw/exec';

// Google's edge serves an "Access Denied" page to UA-less server clients
// (Node fetch default); a browser-like UA is accepted like the website form.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9'
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if ((req.query.key || '') !== 'wpj7392kx') return res.status(401).json({ error: 'unauthorized' });

  if (req.method === 'GET') {
    const r = await fetch(EXEC + '?action=stats', { redirect: 'follow', headers: BROWSER_HEADERS });
    const text = await r.text();
    try { return res.status(200).json(JSON.parse(text)); }
    catch { return res.status(502).json({ error: 'bad_upstream', raw: text.slice(0, 300) }); }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!req.body || !req.body.email || !req.body.name) return res.status(400).json({ error: 'missing_fields' });

  const r = await fetch(EXEC, {
    method: 'POST',
    redirect: 'follow',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'text/plain;charset=utf-8' },   // same content type as the form
    body: JSON.stringify(req.body)
  });
  const text = await r.text();
  let upstream;
  try { upstream = JSON.parse(text); } catch { upstream = { raw: text.slice(0, 300) }; }
  return res.status(200).json({ ok: true, upstream });
}
