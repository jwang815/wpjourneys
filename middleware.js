// Vercel Edge Middleware — gate ONLY /hanno-internal behind a password page.
// Password is checked server-side here; the page content is never served without
// the unlock cookie. Everything else on wpjourneys.com is untouched.
// NOTE: this repo is public, so this password is visible in source — make the
// repo private (or move PASSWORD to a Vercel env var) for real secrecy.

export const config = {
  matcher: ['/hanno-internal', '/hanno-internal/', '/hanno-internal/:path*', '/hanno-internal.html'],
};

const PASSWORD = '12345';
const COOKIE = 'wp_hi';
const TOKEN = 'unlocked-7f3a91';

function loginPage(err) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Waypoint Journeys — Internal</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Source Sans 3',Segoe UI,sans-serif;
background:radial-gradient(120% 80% at 50% 0,rgba(196,148,74,.16),transparent 50%),
radial-gradient(circle at 50% 50%,rgba(196,148,74,.05) 1px,transparent 1px) 0 0/24px 24px,
linear-gradient(165deg,#123039,#1A1A1A 60%,#0e0e0e);color:#F5EDE0;padding:24px}
.card{width:min(92vw,400px);text-align:center}
.mark{color:#C4944A;font-size:1.5rem}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:600;color:#fff;font-size:1.95rem;line-height:1.1;margin:12px 0 6px}
.sub{text-transform:uppercase;letter-spacing:.26em;font-size:.66rem;font-weight:600;color:#C4944A;margin-bottom:28px}
input{width:100%;padding:15px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(196,148,74,.5);
color:#fff;font-size:1rem;letter-spacing:.12em;text-align:center;outline:none;font-family:inherit}
input:focus{border-color:#C4944A;background:rgba(255,255,255,.09)}
button{width:100%;margin-top:12px;padding:15px;background:#C4944A;color:#1A1A1A;border:none;
text-transform:uppercase;letter-spacing:.16em;font-weight:600;font-size:.8rem;cursor:pointer;transition:.2s;font-family:inherit}
button:hover{background:#D4A85C}
.err{color:#e7a07a;font-size:.85rem;margin-top:14px;min-height:1.1em}
.note{color:#9c8b70;font-size:.72rem;margin-top:24px;letter-spacing:.02em}
</style></head>
<body><form class="card" method="GET" action="/hanno-internal/" autocomplete="off">
<div class="mark">&#10022;</div>
<h1>The Hanno Expedition</h1>
<div class="sub">Internal &middot; Restricted</div>
<input type="password" name="pw" placeholder="Enter password" autofocus aria-label="Password">
<button type="submit">Unlock</button>
<div class="err">${err}</div>
<div class="note">Waypoint Journeys &mdash; confidential costing &amp; feasibility</div>
</form></body></html>`;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const pw = url.searchParams.get('pw');
  const cookie = request.headers.get('cookie') || '';
  const authed = cookie.split(';').some(c => c.trim() === COOKIE + '=' + TOKEN);

  // A password was submitted from the login form.
  if (pw !== null) {
    if (pw === PASSWORD) {
      return new Response(null, {
        status: 303,
        headers: {
          'Location': '/hanno-internal/',
          'Set-Cookie': COOKIE + '=' + TOKEN + '; Path=/hanno-internal; HttpOnly; SameSite=Lax; Max-Age=43200',
          'Cache-Control': 'no-store',
        },
      });
    }
    return new Response(loginPage('Incorrect password.'), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Already unlocked → let the request continue to the real page.
  if (authed) return;

  // Otherwise show the password page.
  return new Response(loginPage(''), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
