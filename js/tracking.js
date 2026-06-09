/**
 * Waypoint Journeys — Tracking & Lead Attribution
 * ============================================================================
 * ONE place to configure every ad / analytics ID. Paste real values into the
 * CFG block below to go live. Until a value is filled in it stays a
 * __PLACEHOLDER__ and the related tag simply does NOT load — so this file is
 * safe to ship before the Pixel / GA4 / Ads accounts exist. Nothing fires and
 * nothing breaks.
 *
 * Loaded sitewide (one <script src="/js/tracking.js"> per page). Exposes a
 * small helper API on window.WPTrack for pages that need to fire events
 * (ViewContent, InitiateInquiry, Lead) and to read captured attribution.
 *
 * Full setup + test guide: see /MARKETING.md
 * ============================================================================
 */
(function (w, d) {
  'use strict';

  /* ============================== CONFIG =================================== */
  /* Replace each __PLACEHOLDER__ with the real value (see MARKETING.md §IDs).  */
  var CFG = {
    META_PIXEL_ID:         '1025894849786420',         // e.g. '1234567890123456'
    GA4_ID:                'G-L363W4XVF0',     // e.g. 'G-XXXXXXXXXX'
    GOOGLE_ADS_ID:         'AW-18219996111',          // e.g. 'AW-XXXXXXXXXX'
    GOOGLE_ADS_LEAD_LABEL: 'KZ-JCKDRrLocEM-n_O9D',  // Ads conversion label for the Lead action
    LEAD_ENDPOINT:         'https://script.google.com/macros/s/AKfycbxLuT6oryPqymAZFXjAVqTdoqebEXKn507IiUMmOccD4P9LaGN6C2FkG2GFQ7pJMXMsEw/exec', // Apps Script web-app /exec URL (lead delivery + CAPI)
    WHATSAPP_URL:          'https://wa.me/message/4D3P4QCBYG5SG1',
    INBOX:                 'info@wpjourneys.com',
    PHONE:                 '',  // optional tel: number e.g. '+15551234567' ('' hides the Call buttons)

    // Consent. 'soft'  = load tags immediately + show a dismissible notice (current, US-focused).
    //          'gated' = GDPR/UK: load tags ONLY after the visitor clicks Accept.
    // ▶ FLIP THIS TO 'gated' BEFORE OPENING THE UK / EU MARKET. (see MARKETING.md §Consent)
    CONSENT_MODE:          'soft'
  };

  /* ============================ small utils =============================== */
  function isSet(v) { return !!v && !/^__.*__$/.test(v); }            // configured (not a placeholder)?
  function getCookie(k) {
    try { var m = d.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
    catch (e) { return null; }
  }
  function setCookie(k, v, days) {
    try { d.cookie = k + '=' + encodeURIComponent(v) + ';path=/;max-age=' + (days * 86400) + ';SameSite=Lax'; } catch (e) {}
  }
  function readJSON(k) { var v = getCookie(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
  function writeJSON(k, o, days) { setCookie(k, JSON.stringify(o), days); }

  /* ===================== attribution capture (UTMs etc.) ================== */
  /* Capture campaign params on the LANDING page and persist them so they
     survive navigation to /inquire/. First-touch for referrer/landing path;
     latest-touch for the UTM/click-id set.                                   */
  var ATTR_COOKIE = 'wp_attribution', ATTR_DAYS = 30;
  function captureAttribution() {
    var p, stored = readJSON(ATTR_COOKIE) || {}, touched = false;
    try { p = new URLSearchParams(w.location.search); } catch (e) { return stored; }
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']
      .forEach(function (k) { var v = p.get(k); if (v) { stored[k] = v; touched = true; } });
    if (!stored.referrer) {
      var r = d.referrer || '';
      if (r && r.indexOf('//' + w.location.host) === -1) { stored.referrer = r; touched = true; }
    }
    if (!stored.page_path) { stored.page_path = w.location.pathname; touched = true; }   // first landing page
    if (!stored.first_seen) { stored.first_seen = new Date().toISOString(); touched = true; }
    if (touched) writeJSON(ATTR_COOKIE, stored, ATTR_DAYS);
    return stored;
  }
  function getAttribution() {
    var a = readJSON(ATTR_COOKIE) || {};
    a.landing_path = a.page_path;                 // keep the first-touch path under page_path
    a.current_path = w.location.pathname + w.location.search;
    // Meta browser-id cookies set by the Pixel (needed server-side for CAPI matching)
    a.fbp = getCookie('_fbp') || '';
    a.fbc = getCookie('_fbc') || '';
    return a;
  }

  /* ============================ Meta Pixel ================================ */
  function loadMetaPixel() {
    if (!isSet(CFG.META_PIXEL_ID) || w.fbq) return;
    /* Official Meta base code */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(w, d, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    w.fbq('init', CFG.META_PIXEL_ID);
    w.fbq('track', 'PageView');
  }

  /* ===================== Google GA4 + Google Ads ========================= */
  function loadGoogle() {
    var ga4 = isSet(CFG.GA4_ID), ads = isSet(CFG.GOOGLE_ADS_ID);
    if (!ga4 && !ads) return;
    var first = ga4 ? CFG.GA4_ID : CFG.GOOGLE_ADS_ID;
    var s = d.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + first;
    d.head.appendChild(s);
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
    w.gtag('js', new Date());
    if (ga4) w.gtag('config', CFG.GA4_ID);
    if (ads) w.gtag('config', CFG.GOOGLE_ADS_ID);
  }

  /* ============================ event helpers ============================ */
  function fbq() { if (w.fbq) w.fbq.apply(null, arguments); }
  function gtag() { if (w.gtag) w.gtag.apply(null, arguments); }

  function genEventId() {
    try { if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID(); } catch (e) {}
    return 'wp-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // ViewContent — fire on expedition / destination pages.
  function viewContent(name) {
    fbq('track', 'ViewContent', name ? { content_name: name } : {});
  }

  // InitiateInquiry (custom) — a WhatsApp / email / call CTA was clicked.
  function initiateInquiry(method, destination) {
    var data = { method: method || 'unknown' };
    if (destination) data.destination = destination;
    fbq('trackCustom', 'InitiateInquiry', data);
    gtag('event', 'initiate_inquiry', data);
  }

  // Lead ★ — fire ONLY on a successful inquiry-form submit.
  // Pass the SAME eventId that the server (CAPI) will use, so Meta dedupes.
  function lead(opts) {
    opts = opts || {};
    var eventId = opts.eventId || genEventId();
    var dest = opts.destination || '';
    fbq('track', 'Lead',
      { content_name: dest, value: opts.value || 0, currency: opts.currency || 'USD' },
      { eventID: eventId });
    // Google: GA4 conversion + (optional) Ads conversion, with Enhanced Conversions email.
    if (opts.email) gtag('set', 'user_data', { email: String(opts.email).trim().toLowerCase() });
    gtag('event', 'generate_lead', { currency: opts.currency || 'USD', value: opts.value || 0 });
    if (isSet(CFG.GOOGLE_ADS_ID) && isSet(CFG.GOOGLE_ADS_LEAD_LABEL)) {
      gtag('event', 'conversion', { send_to: CFG.GOOGLE_ADS_ID + '/' + CFG.GOOGLE_ADS_LEAD_LABEL });
    }
    return eventId;
  }

  /* ============== auto-wire InitiateInquiry on contact CTAs =============== */
  /* Any WhatsApp / mailto / tel link fires InitiateInquiry automatically.
     Destination comes from the link's data-destination, else <body
     data-wp-viewcontent>.                                                    */
  function classify(href) {
    if (!href) return null;
    if (href.indexOf('wa.me') !== -1 || href.indexOf('api.whatsapp.com') !== -1) return 'whatsapp';
    if (href.indexOf('mailto:') === 0) return 'email';
    if (href.indexOf('tel:') === 0) return 'call';
    return null;
  }
  function wireInquiryClicks() {
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var method = classify(a.getAttribute('href'));
      if (!method) return;
      var dest = a.getAttribute('data-destination') || (d.body && d.body.getAttribute('data-wp-viewcontent')) || '';
      initiateInquiry(method, dest);
    }, true);
  }
  function autoViewContent() {
    var name = d.body && d.body.getAttribute('data-wp-viewcontent');
    if (name) viewContent(name);
  }

  /* ========================= soft consent notice ========================= */
  var CONSENT_COOKIE = 'wp_consent';
  function tagsAllowed() {
    if (CFG.CONSENT_MODE !== 'gated') return true;          // soft mode: always allowed
    return getCookie(CONSENT_COOKIE) === 'accepted';         // gated: only after Accept
  }
  function loadTags() {
    if (!tagsAllowed()) return;
    loadMetaPixel();
    loadGoogle();
    autoViewContent();
  }
  // Cookie consent banner removed at the site owner's request (US-focused, soft consent).
  // Kept as a no-op so any existing references stay safe. Flip CONSENT_MODE to 'gated'
  // and restore a banner before opening the UK/EU market.
  function showConsentBanner() { /* intentionally disabled */ }

  /* ============================== public API ============================= */
  w.WPTrack = {
    config: CFG,
    isSet: isSet,
    genEventId: genEventId,
    getAttribution: getAttribution,
    getFbCookies: function () { return { fbp: getCookie('_fbp') || '', fbc: getCookie('_fbc') || '' }; },
    viewContent: viewContent,
    initiateInquiry: initiateInquiry,
    lead: lead,
    leadEndpoint: function () { return isSet(CFG.LEAD_ENDPOINT) ? CFG.LEAD_ENDPOINT : ''; }
  };

  /* ================================ init ================================= */
  function init() {
    captureAttribution();   // always — independent of consent (first-party, functional)
    wireInquiryClicks();
    loadTags();             // soft: loads now. gated: loads only if previously accepted.
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();

})(window, document);
