# Marketing / lead-capture setup — wpjourneys.com

This is the operator's guide for the ad-tracking + lead-capture stack built
from `WebsiteBuildSpec`. Everything ships **wired to placeholders** — nothing
fires and nothing breaks until you paste real IDs. Do the steps below to go
live.

---

## 1. What was built

| Piece | File(s) | Notes |
|---|---|---|
| Tracking engine (Pixel + GA4 + Ads + consent + UTM capture + event API) | `js/tracking.js` | One config block; loaded sitewide |
| Inquiry landing page + form | `inquire/index.html`, `lang/inquire.js` | Destination-aware: `/inquire/?dest=socotra` |
| Privacy policy | `privacy/index.html` | Linked from footer, form, consent notice |
| Lead backend (Sheet + email + CAPI) | `scripts/lead-webhook.gs` | Google Apps Script web app |
| This guide | `MARKETING.md` | — |

**Flow:** ad → `/inquire/?dest=…` (Pixel `PageView` + `ViewContent`) → form submit
→ browser `Lead` fires **and** the form POSTs to Apps Script → Apps Script
appends the Sheet row, emails the team, and mirrors `Lead` to Meta CAPI with
the **same `event_id`** (Meta de-dupes) → thank-you state with WhatsApp.

---

## 2. The only things you must fill in

Everything is a `__PLACEHOLDER__`. There are **two** files to edit.

### A. `js/tracking.js` → the `CFG` block (browser side)
| Key | What | Where to get it |
|---|---|---|
| `META_PIXEL_ID` | Meta Pixel / dataset ID | Events Manager → Data sources → your Pixel |
| `GA4_ID` | `G-XXXXXXXXXX` | GA4 → Admin → Data streams → Web |
| `GOOGLE_ADS_ID` | `AW-XXXXXXXXXX` | Google Ads → Goals → Conversions → tag setup |
| `GOOGLE_ADS_LEAD_LABEL` | conversion label | the Lead conversion action's tag snippet |
| `LEAD_ENDPOINT` | Apps Script `/exec` URL | from step 4 below |
| `PHONE` | optional `tel:` number | leave `''` to hide the "Call" buttons (no number is in the repo today) |

### B. `scripts/lead-webhook.gs` → the `CONFIG` block (server side)
| Key | What |
|---|---|
| `SHEET_ID` | the Leads spreadsheet ID (from its URL) |
| `META_PIXEL_ID` | **same** Pixel ID as above |
| `META_CAPI_TOKEN` | Events Manager → Settings → Conversions API → Generate access token |
| `NOTIFY_EMAIL` | already `info@wpjourneys.com` |
| `SLACK_WEBHOOK_URL` | optional |

> Tip: keep `META_PIXEL_ID` identical in both files, and keep
> `js/tracking.js` cache-busted (it's served with a 1-day cache by `vercel.json`).

---

## 3. Create the accounts (one-time)

**Meta Pixel + CAPI** — In Events Manager create the Pixel → copy its ID.
Then Settings → Conversions API → **Generate access token** (this is
`META_CAPI_TOKEN`). Add `Lead` as a key event.

**GA4** — Create a property + Web data stream → copy `G-…`. In Admin →
Events, mark **`generate_lead`** as a **key event (conversion)**.

**Google Ads** — Link GA4 and import `generate_lead` as a conversion (or
create a native "Lead" conversion action and use its `AW-…` + label). Turn on
**Enhanced Conversions** (the form already passes a hashed email on `Lead`).

---

## 4. Deploy the lead backend (Apps Script)

1. Create the **Leads** Google Sheet → copy its **ID** from the URL
   (`docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`).
2. In that Sheet: **Extensions → Apps Script**. Delete the stub, paste
   `scripts/lead-webhook.gs`, fill the `CONFIG` block, **Save**.
3. **Deploy → New deployment → Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - Authorize when prompted (it needs Sheets, Gmail, external fetch).
4. Copy the **Web app URL** (ends in `/exec`) → paste into `LEAD_ENDPOINT`
   in `js/tracking.js`.
5. After **any** later edit to the script: **Manage deployments → Edit →
   Version: New version → Deploy** (otherwise the old code keeps running).

The header row is written automatically on the first lead.

---

## 5. Consent — read this before UK/EU

Per the build decision, consent is currently a **soft notice**
(`CONFIG.CONSENT_MODE = 'soft'` in `js/tracking.js`): Pixel + GA load
immediately and a dismissible banner links to the privacy policy. This is fine
for US-focused ads but is **not GDPR/UK-sufficient**.

**Before you open the UK/EU market, flip one line:**

```js
CONSENT_MODE: 'gated'   // tags load ONLY after the visitor clicks "Accept"
```

In `gated` mode the banner shows **Accept / Decline**, and no Pixel/GA/Ads tag
loads until Accept. (First-party UTM capture still works — it's functional.)

---

## 6. Test it (acceptance criteria)

- [ ] **Pixel** — install *Meta Pixel Helper*; load any page → `PageView`;
      load `/socotra/` → `ViewContent` (content_name "Socotra").
- [ ] **Lead dedup** — Events Manager → **Test Events**. Submit the form →
      you should see **one** `Lead` from the browser **and** one from the
      server (CAPI), collapsed as **deduplicated** (same `event_id`). Set
      `META_TEST_CODE` in the `.gs` while testing.
- [ ] **Delivery** — within seconds the lead **emails** `info@wpjourneys.com`
      (subject `NEW LEAD — …`) **and** appends a **Sheet** row.
- [ ] **Attribution** — open `/inquire/?utm_source=meta&utm_campaign=test&fbclid=abc123`
      → submit → the Sheet row has those values.
- [ ] **Thank-you** — after submit the WhatsApp button shows.
- [ ] **GA4** — DebugView shows `generate_lead`; it's marked a conversion.
- [ ] **Lighthouse** — mobile Performance ≥ 85 on `/inquire/`.

Quick `curl` smoke test of the backend:
```bash
curl -L -X POST "<LEAD_ENDPOINT>" -H 'Content-Type: text/plain' \
  -d '{"name":"Test","email":"t@example.com","destination":"Socotra","event_id":"test-123"}'
```

---

## 7. How the front end fires events

`window.WPTrack` (from `js/tracking.js`):

- `PageView` — automatic, every page.
- `ViewContent` — automatic on any page whose `<body data-wp-viewcontent="…">`
  is set (done on the 12 expedition pages).
- `InitiateInquiry` — automatic on every WhatsApp / `mailto:` / `tel:` click
  (method + destination inferred). No per-link code needed.
- `Lead` — fired by the `/inquire/` form **only on a successful submit**, with
  the `event_id` shared with CAPI, plus GA4 `generate_lead` and the Ads
  conversion + Enhanced-Conversions email.

To add ViewContent to a new destination page, set on `<body>`:
```html
<body data-wp-viewcontent="Mongolia">
```

---

## 8. Fast-follow (not in this pass)

- Embed the inquiry **section** at the bottom of each expedition page (this
  pass shipped the standalone `/inquire/` page + rewired the primary CTAs).
- Add a real phone number → set `PHONE` to enable the Call buttons.
- Translate `privacy/index.html` body to 中文 (chrome is already bilingual).
- Optional: Meta CAPI Gateway instead of Apps Script if volume grows.
