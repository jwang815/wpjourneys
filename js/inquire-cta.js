/**
 * Waypoint Journeys — Inquiry CTAs (sticky button + above-fold hero button)
 * ============================================================================
 * Added 2026-06-09. Self-contained: injects its own CSS, no edits to
 * tracking.js or page stylesheets. Loaded on the homepage and all 25
 * destination pages (see script tags in those files).
 *
 * What it does
 *   1. Styles the above-fold hero "Plan This Expedition" button added in the
 *      page HTML (class .wp-hero-inquire) + its "We reply within 24 hours"
 *      subline (.wp-hero-reply).
 *   2. Builds a sticky "Request Itinerary" button (bottom-right on desktop,
 *      full-width bottom bar on mobile) that appears after ~0.85 viewport of
 *      scroll and links to /inquire/?dest=<slug>.
 *
 * Attribution: gclid / fbclid / UTMs are captured sitewide into the
 * wp_attribution cookie by tracking.js, so plain links to /inquire/ keep
 * lead-source attribution. Clicks fire WPTrack.initiateInquiry when present.
 * ============================================================================
 */
(function (w, d) {
  'use strict';

  var DESTS = ['bangladesh', 'bhutan', 'caribbean', 'central-asia', 'china',
               'egypt', 'eritrea', 'ethiopia', 'gorilla', 'guianas', 'libya',
               'madagascar', 'mauritania', 'mauritius', 'maya-corridor',
               'moldova', 'mongolia', 'myanmar', 'pacific', 'pakistan',
               'socotra', 'syria', 'tunisia-algeria', 'turkmenistan',
               'west-africa'];

  var path = w.location.pathname;
  if (/^\/inquire\b/.test(path)) return;                       // never on the form itself

  var slug = '';
  var m = path.match(/^\/([a-z-]+?)(?:-expedition)?\/?$/);
  if (m && DESTS.indexOf(m[1]) !== -1) slug = m[1];
  var isHome = (path === '/' || path === '/index.html');
  if (!slug && !isHome) return;                                // homepage + destinations only

  var href = '/inquire/' + (slug ? '?dest=' + slug : '');

  /* ------------------------------ styles -------------------------------- */
  var css = '' +
    '.wp-sticky-cta{position:fixed;right:24px;bottom:24px;z-index:1200;display:block;' +
      'background:#C4944A;color:#1A1A1A;text-align:center;text-decoration:none;' +
      "font:600 .78rem/1 'Source Sans 3','Segoe UI',Helvetica,Arial,sans-serif;" +
      'letter-spacing:.16em;text-transform:uppercase;padding:16px 26px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.35);opacity:0;transform:translateY(16px);' +
      'pointer-events:none;transition:opacity .35s ease,transform .35s ease}' +
    '.wp-sticky-cta.wp-on{opacity:1;transform:none;pointer-events:auto}' +
    '.wp-sticky-cta:hover{background:#D4A85C;color:#1A1A1A}' +
    '.wp-sticky-sub{display:block;font:400 .62rem/1.2 \'Source Sans 3\',sans-serif;' +
      'letter-spacing:.08em;text-transform:none;margin-top:5px;opacity:.85}' +
    '@media (max-width:640px){.wp-sticky-cta{left:0;right:0;bottom:0;' +
      'padding:14px 16px calc(14px + env(safe-area-inset-bottom))}}' +
    '@media (prefers-reduced-motion:reduce){.wp-sticky-cta{transition:none}}' +
    '.hero-content .wp-hero-inquire{background:#C4944A;border-color:#C4944A;color:#1A1A1A;margin-left:14px}' +
    '.hero-content .wp-hero-inquire:hover{background:#D4A85C;border-color:#D4A85C;color:#1A1A1A}' +
    '.wp-hero-reply{font-size:.78rem;letter-spacing:.05em;opacity:.8;margin-top:12px}' +
    '@media (max-width:640px){.hero-content .wp-hero-inquire{margin-left:0;margin-top:12px;display:inline-block}}';

  var tag = d.createElement('style');
  tag.textContent = css;
  d.head.appendChild(tag);

  /* --------------------------- tracking hook ---------------------------- */
  function track(method) {
    try {
      if (w.WPTrack && typeof w.WPTrack.initiateInquiry === 'function') {
        w.WPTrack.initiateInquiry(method, slug || 'general');
      }
    } catch (e) { /* never block navigation */ }
  }

  /* ---------------------------- sticky button --------------------------- */
  function init() {
    var a = d.createElement('a');
    a.className = 'wp-sticky-cta';
    a.href = href;
    a.setAttribute('aria-label', 'Request your itinerary — we reply within 24 hours');
    var L = {
      en: { label: 'Request Itinerary', sub: 'We reply within 24 hours' },
      zh: { label: '\u7d22\u53d6\u884c\u7a0b\u65b9\u6848', sub: '\u4e00\u5c0f\u65f6\u5185\u56de\u590d' }
    };
    var lang = /(?:^|; )wp_lang=zh/.test(d.cookie) ? 'zh' : 'en';
    a.innerHTML = '<span data-i18n="wp_cta_sticky">' + L[lang].label + '</span>' +
      '<span class="wp-sticky-sub" data-i18n="wp_cta_sticky_sub">' + L[lang].sub + '</span>';
    a.addEventListener('click', function () { track('sticky_cta'); });
    d.body.appendChild(a);

    var shown = false;
    // On mobile the bar is a fixed full-width strip: pad the body while it is
    // shown so the footer can scroll fully above it (never hidden behind it).
    function padBody() {
      var mobile = w.matchMedia && w.matchMedia('(max-width:640px)').matches;
      d.body.style.paddingBottom = (shown && mobile) ? a.offsetHeight + 'px' : '';
    }
    function onScroll() {
      var on = w.scrollY > w.innerHeight * 0.85;
      if (on !== shown) { shown = on; a.classList.toggle('wp-on', on); padBody(); }
    }
    w.addEventListener('scroll', onScroll, { passive: true });
    w.addEventListener('resize', padBody);
    onScroll();

    // hero button (already in page HTML) — wire tracking
    var hero = d.querySelector('.wp-hero-inquire');
    if (hero) hero.addEventListener('click', function () { track('hero_cta'); });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();

})(window, document);
