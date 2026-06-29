// Vercel Edge Middleware — password-gate ONLY the /hanno-internal page.
// Everything else on wpjourneys.com is unaffected.
// Basic-auth: any username, password = 12345.

export const config = {
  matcher: ['/hanno-internal', '/hanno-internal/', '/hanno-internal/:path*', '/hanno-internal.html'],
};

const PASSWORD = '12345';

export default function middleware(request) {
  const auth = request.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');

  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = atob(encoded);
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (pass === PASSWORD) {
        return; // authorized — let the request continue to the static file
      }
    } catch (e) {
      // fall through to 401
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Waypoint Journeys — Internal", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
