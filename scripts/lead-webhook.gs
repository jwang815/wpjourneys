/**
 * Waypoint Journeys — Lead webhook (Google Apps Script)
 * ============================================================================
 * ONE endpoint that the /inquire/ form POSTs to. On each lead it:
 *   1. appends a row to the Leads Google Sheet,
 *   2. emails the full lead to the team (subject: NEW LEAD — <dest> — <name>),
 *   3. mirrors the `Lead` event to Meta's Conversions API (CAPI), using the
 *      SAME event_id the browser Pixel used, so Meta de-duplicates,
 *   4. (optional) pushes a Slack message.
 *
 * ── SETUP (see /MARKETING.md §Apps Script for the full walkthrough) ─────────
 *   1. Create the Google Sheet that will hold leads; copy its ID from the URL.
 *   2. Extensions → Apps Script in that Sheet; paste this file in.
 *   3. Fill in the CONFIG block below.
 *   4. Deploy → New deployment → type "Web app":
 *        Execute as: Me      Who has access: Anyone
 *      Copy the /exec URL → paste it into js/tracking.js  LEAD_ENDPOINT.
 *   5. Re-deploy (Manage deployments → Edit → Version: New) after any edit.
 *
 * The browser posts with Content-Type text/plain + mode 'no-cors' to avoid a
 * CORS preflight (Apps Script can't answer one). We read e.postData.contents.
 * ============================================================================
 */

/* ============================== CONFIG ================================== */
var CONFIG = {
  SHEET_ID:        '1PdgkiFQIyKRz7Hx5m0DhSCaJVd3eHES-BFtDmiacb0k',          // the Leads spreadsheet ID
  SHEET_TAB:       '',                             // '' = first sheet, or a tab name e.g. 'Leads'
  NOTIFY_EMAIL:    'admin@wpjourneys.com, jwang815@gmail.com, michaeldu001@gmail.com, weipeng1996@gmail.com, info@wpjourneys.com',          // where lead emails go (comma-separate for several)

  META_PIXEL_ID:   '1025894849786420',            // same Pixel ID as in js/tracking.js
  META_CAPI_TOKEN: '__META_CAPI_ACCESS_TOKEN__',   // Events Manager → Settings → Conversions API → token
  META_API_VERSION:'v19.0',
  META_TEST_CODE:  '',                             // optional: Test Events code while testing, '' in production

  SLACK_WEBHOOK_URL: ''                            // optional Slack Incoming Webhook URL ('' = off)
};

var SHEET_HEADERS = ['Timestamp', 'Name', 'Email', 'Phone', 'Destination', 'Travel dates',
  'Group size', 'Budget', 'Message', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'utm_term', 'fbclid', 'gclid', 'referrer', 'page_path', 'Lang', 'Event ID'];

/* ============================ entry points ============================== */
function doPost(e) {
  try { var __wpjb = JSON.parse(e.postData.contents); if (__wpjb && __wpjb.brief) { MailApp.sendEmail({ to: __wpjb.to || CONFIG.NOTIFY_EMAIL, subject: __wpjb.subject || 'Waypoint Ads — Daily Brief', htmlBody: __wpjb.html || '' }); return ContentService.createTextOutput(JSON.stringify({ ok: true, brief: true })).setMimeType(ContentService.MimeType.JSON); } } catch (__e) {}

  var data;
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json({ ok: false, error: 'bad_json' }); }

  // Honeypot: bots fill 'company'. Accept silently, store nothing.
  if (data.company) return json({ ok: true });

  // Minimal validation.
  if (!data.email || !data.name) return json({ ok: false, error: 'missing_fields' });

  var results = { sheet: false, email: false, capi: false, slack: false };
  try { appendToSheet(data); results.sheet = true; } catch (err) { log_('sheet', err); }
  try { emailLead(data);     results.email = true; } catch (err) { log_('email', err); }
  try { results.capi = sendCAPI(data); }            catch (err) { log_('capi', err); }
  try { results.slack = pushSlack(data); }          catch (err) { log_('slack', err); }

  return json({ ok: true, results: results });
}

// Quick health check in a browser.
function doGet() { return json({ ok: true, service: 'wp-lead-webhook' }); }

/* ============================ Google Sheet ============================= */
function appendToSheet(d) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sh = CONFIG.SHEET_TAB ? ss.getSheetByName(CONFIG.SHEET_TAB) : ss.getSheets()[0];
  if (!sh) sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(SHEET_HEADERS);   // write header once
  sh.appendRow([
    new Date(), d.name || '', d.email || '', d.phone || '', d.destination || '',
    d.travel_dates || '', d.group_size || '', d.budget || '', d.message || '',
    d.utm_source || '', d.utm_medium || '', d.utm_campaign || '', d.utm_content || '',
    d.utm_term || '', d.fbclid || '', d.gclid || '', d.referrer || '', d.page_path || '',
    d.lang || '', d.event_id || ''
  ]);
}

/* ============================== Email ================================= */
function emailLead(d) {
  var subject = 'NEW LEAD — ' + (d.destination || 'Custom') + ' — ' + (d.name || 'Unknown');
  var lines = [
    'New inquiry from wpjourneys.com',
    '',
    'Name:        ' + (d.name || ''),
    'Email:       ' + (d.email || ''),
    'Phone:       ' + (d.phone || ''),
    'Destination: ' + (d.destination || ''),
    'Dates:       ' + (d.travel_dates || ''),
    'Group size:  ' + (d.group_size || ''),
    'Budget:      ' + (d.budget || ''),
    '',
    'Message:',
    (d.message || '(none)'),
    '',
    '— Attribution —',
    'Source / Medium: ' + (d.utm_source || '-') + ' / ' + (d.utm_medium || '-'),
    'Campaign:        ' + (d.utm_campaign || '-'),
    'Content / Term:  ' + (d.utm_content || '-') + ' / ' + (d.utm_term || '-'),
    'fbclid / gclid:  ' + (d.fbclid || '-') + ' / ' + (d.gclid || '-'),
    'Referrer:        ' + (d.referrer || '-'),
    'Landing page:    ' + (d.page_path || '-'),
    'Submitted from:  ' + (d.page_url || '-'),
    'Language:        ' + (d.lang || '-'),
    'Event ID:        ' + (d.event_id || '-')
  ];
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: subject,
    replyTo: d.email || CONFIG.NOTIFY_EMAIL,
    body: lines.join('\n')
  });
}

/* ===================== Meta Conversions API (CAPI) ==================== */
function sendCAPI(d) {
  if (!isSet(CONFIG.META_PIXEL_ID) || !isSet(CONFIG.META_CAPI_TOKEN)) return false;

  var ud = { client_user_agent: d.user_agent || '' };
  if (d.email) ud.em = [sha256Hex(String(d.email).trim().toLowerCase())];
  if (d.phone) { var ph = String(d.phone).replace(/[^0-9]/g, ''); if (ph) ud.ph = [sha256Hex(ph)]; }
  if (d.fbp) ud.fbp = d.fbp;
  if (d.fbc) ud.fbc = d.fbc;

  var event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: d.event_id || '',                 // ★ same id as the browser Pixel → dedup
    action_source: 'website',
    event_source_url: d.page_url || 'https://wpjourneys.com/inquire/',
    user_data: ud,
    custom_data: { content_name: d.destination || '', currency: 'USD', value: 0 }
  };
  var payload = { data: [event], access_token: CONFIG.META_CAPI_TOKEN };
  if (CONFIG.META_TEST_CODE) payload.test_event_code = CONFIG.META_TEST_CODE;

  var url = 'https://graph.facebook.com/' + CONFIG.META_API_VERSION + '/' +
            CONFIG.META_PIXEL_ID + '/events';
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) { log_('capi_http_' + code, res.getContentText()); return false; }
  return true;
}

/* ============================== Slack ================================ */
function pushSlack(d) {
  if (!CONFIG.SLACK_WEBHOOK_URL) return false;
  var text = '*New lead — ' + (d.destination || 'Custom') + '*\n' +
    (d.name || '') + ' · ' + (d.email || '') + (d.phone ? ' · ' + d.phone : '') +
    (d.budget ? ' · ' + d.budget : '') +
    (d.utm_campaign ? '\nCampaign: ' + d.utm_campaign : '');
  UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ text: text }), muteHttpExceptions: true
  });
  return true;
}

/* ============================== helpers ============================== */
function isSet(v) { return !!v && !/^__.*__$/.test(v); }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function sha256Hex(s) {
  if (!s) return '';
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function log_(where, err) { try { console.error('[lead-webhook] ' + where + ': ' + err); } catch (e) {} }
