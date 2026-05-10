"""Check Hyatt.com for availability at Lindner Hotel Antwerp.

Pure detector: writes structured output and exits with a status code.
The GitHub Actions workflow handles email notification + kill-switch commit.

Configured via env vars:
  HYATT_HOTEL_CODE   Hyatt property code (default: anrja, Lindner Hotel Antwerp).
  CHECKIN_DATE       YYYY-MM-DD (default: 2026-07-16).
  CHECKOUT_DATE      YYYY-MM-DD (default: 2026-07-20).
  ROOMS              integer (default: 1).
  ADULTS             integer (default: 2).
  ARTIFACT_DIR       Where to write screenshot/html on a successful detection.
  GITHUB_OUTPUT      (CI) file we append key=value lines to.

Exit codes:
  0  Run completed; no availability detected.
  2  Availability detected — workflow should send email and trip the kill switch.
  3  Page returned ambiguous content after retries; artifacts uploaded for review.
  1  Hard failure (network, browser).
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import (
    Browser,
    Error as PWError,
    Page,
    TimeoutError as PWTimeout,
    sync_playwright,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)


HOTEL_CODE = os.environ.get("HYATT_HOTEL_CODE", "anrja")
CHECKIN = os.environ.get("CHECKIN_DATE", "2026-07-16")
CHECKOUT = os.environ.get("CHECKOUT_DATE", "2026-07-20")
ROOMS = os.environ.get("ROOMS", "1")
ADULTS = os.environ.get("ADULTS", "2")
ARTIFACT_DIR = Path(os.environ.get("ARTIFACT_DIR", "monitor/artifacts"))

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

UNAVAILABLE_PATTERNS = [
    r"sold\s*out",
    r"no\s+rooms?\s+available",
    r"no\s+availability",
    r"hotel\s+is\s+not\s+available",
    r"not\s+available\s+during\s+(?:those|these|the\s+selected)\s+dates?",
    r"unavailable\s+for\s+the\s+selected",
]

# Page titles / phrases Hyatt/Akamai serve when the request is being challenged.
BOT_CHALLENGE_PATTERNS = [
    r"just\s+a\s+moment",
    r"access\s+denied",
    r"pardon\s+our\s+interruption",
    r"checking\s+your\s+browser",
    r"are\s+you\s+a\s+human",
]

# Whitelist of characters allowed in `reason` so it is safe to interpolate
# into shell strings / commit messages downstream. Anything else is dropped.
SAFE_REASON_RE = re.compile(r"[^A-Za-z0-9 ._=,/+:\-]")


@dataclass
class CheckResult:
    available: bool
    confidence: str  # "high" | "low"
    reason: str
    url: str


class TransientError(RuntimeError):
    """Raised for retryable failures (timeouts, navigation errors, bot challenges)."""


def build_url() -> str:
    return (
        f"https://www.hyatt.com/shop/rooms/{HOTEL_CODE}"
        f"?checkinDate={CHECKIN}&checkoutDate={CHECKOUT}"
        f"&rooms={ROOMS}&adults={ADULTS}&kids=0"
    )


def is_property_page(url: str) -> bool:
    """True if the URL is still on the property's /shop/rooms/<code> page.

    Hyatt redirects unavailable searches to /search/hotels/... — that page
    lists OTHER hotels' rates and must NOT be classified as availability
    for our property.
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.netloc.lower() not in {"www.hyatt.com", "hyatt.com"}:
        return False
    path = parsed.path.lower().rstrip("/")
    return path == f"/shop/rooms/{HOTEL_CODE.lower()}"


def dismiss_cookie_banner(page: Page) -> None:
    """Hyatt uses OneTrust. Click any 'accept' or 'close' style button if present."""
    selectors = [
        "#onetrust-accept-btn-handler",
        "#onetrust-close-btn-container button",
        "button:has-text('Accept All Cookies')",
        "button:has-text('Accept All')",
        "button:has-text('Accept')",
        "button:has-text('I Accept')",
        "button:has-text('Close')",
        "button[aria-label*='cookie' i]",
        "button[aria-label='Close']",
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=1500):
                btn.click(timeout=2000)
                page.wait_for_timeout(500)
                return
        except Exception as exc:
            print(f"dismiss_cookie_banner: selector {sel!r} skipped: {exc!r}")
            continue


def submit_dates_form_if_present(page: Page) -> bool:
    """If Hyatt renders a 'Select Dates and Guests' modal (older flow),
    submit it. On the current site, deep-linked URL params auto-fire the
    rates search and no modal appears, so this is conditional.
    Returns True if a button was actually clicked.
    """
    # Detect the modal first; if it isn't there, do nothing.
    modal_indicators = [
        "form:has-text('Select Dates')",
        "div:has-text('Select Dates and Guests')",
        "[role='dialog']:has-text('BOOK NOW')",
    ]
    modal_present = False
    for ind in modal_indicators:
        try:
            if page.locator(ind).first.is_visible(timeout=1000):
                modal_present = True
                break
        except Exception:
            continue
    if not modal_present:
        return False

    # Use exact-text matching to avoid clicking unrelated promo "Book now" CTAs.
    selectors = [
        "button:text-is('BOOK NOW')",
        "button:text-is('Book Now')",
        "button:text-is('Find Rooms')",
        "button:text-is('Search')",
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=1500):
                btn.click(timeout=3000)
                try:
                    page.wait_for_load_state("networkidle", timeout=20_000)
                except PWTimeout:
                    pass
                page.wait_for_timeout(2_000)
                return True
        except Exception as exc:
            print(f"submit_dates_form: selector {sel!r} skipped: {exc!r}")
            continue
    return False


def detect_bot_challenge(page: Page, body_text_lower: str) -> bool:
    title_lower = ""
    try:
        title_lower = (page.title() or "").lower()
    except Exception:
        pass
    for pat in BOT_CHALLENGE_PATTERNS:
        if re.search(pat, title_lower) or re.search(pat, body_text_lower):
            return True
    return False


def classify_page(page: Page) -> CheckResult:
    """Inspect rendered DOM/text to decide availability.

    Order of checks:
      1. If the URL has redirected away from /shop/rooms/<code>, the search
         is unavailable (Hyatt routes unavailable property searches to a
         generic /search/hotels/... results page that lists OTHER hotels).
      2. If we hit a bot-challenge page, raise TransientError so we retry.
      3. If the page contains an unavailability phrase, return unavailable.
      4. Otherwise look for prices + booking CTAs scoped to the rates section.
    """
    url = page.url

    # (1) Redirect guard — non-retryable, this is high-confidence unavailable.
    if not is_property_page(url):
        return CheckResult(
            available=False,
            confidence="high",
            reason=f"redirected off property page to {urlparse(url).path}",
            url=url,
        )

    try:
        body_text = page.locator("body").inner_text(timeout=10_000)
    except PWTimeout as exc:
        raise TransientError(f"timed out reading body: {exc}") from exc
    except PWError as exc:
        raise TransientError(f"playwright error reading body: {exc}") from exc

    lower = body_text.lower()

    # (2) Bot challenge — retry.
    if detect_bot_challenge(page, lower):
        raise TransientError("bot-challenge / interstitial page detected")

    # (3) Unavailability phrases.
    for pat in UNAVAILABLE_PATTERNS:
        if re.search(pat, lower):
            return CheckResult(
                available=False,
                confidence="high",
                reason=f"matched unavailability phrase /{pat}/",
                url=url,
            )

    # (4) Availability heuristic — scoped to the rates section, not the
    # full body, to avoid counting prices in unrelated marketing modules.
    rates_section = None
    for sel in [
        "[data-testid*='room-card']",
        "[data-testid*='rate-card']",
        "section:has(button:text-is('Select Room'))",
        "main",
    ]:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                rates_section = loc
                break
        except Exception:
            continue

    scoped_text = body_text
    if rates_section is not None:
        try:
            scoped_text = "\n".join(rates_section.all_inner_texts())
        except Exception:
            scoped_text = body_text

    price_hits = len(re.findall(r"(?:€|EUR|USD|\$)\s*\d{2,4}", scoped_text))
    book_buttons = 0
    for sel in [
        "button:text-is('Select Room')",
        "button:text-is('Select')",
        "a:text-is('Select Room')",
        "[data-testid*='select-room']",
        "[data-testid*='room-card']",
    ]:
        try:
            book_buttons += page.locator(sel).count()
        except Exception:
            pass

    if price_hits >= 1 and book_buttons >= 1:
        return CheckResult(
            available=True,
            confidence="high",
            reason=f"prices={price_hits} book_buttons={book_buttons}",
            url=url,
        )
    if price_hits >= 2 and book_buttons >= 1:
        return CheckResult(
            available=True,
            confidence="low",
            reason=f"prices={price_hits} book_buttons={book_buttons} (weak)",
            url=url,
        )

    return CheckResult(
        available=False,
        confidence="low",
        reason=(
            f"no unavailability phrase no clear booking signals "
            f"prices={price_hits} buttons={book_buttons}"
        ),
        url=url,
    )


@retry(
    retry=retry_if_exception_type(TransientError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=30),
    reraise=True,
)
def probe(browser: Browser, url: str) -> CheckResult:
    context = browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1366, "height": 900},
        locale="en-US",
    )
    page = context.new_page()
    try:
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        except PWTimeout as exc:
            raise TransientError(f"navigation timeout: {exc}") from exc
        except PWError as exc:
            raise TransientError(f"navigation error: {exc}") from exc

        if response is not None and response.status >= 500:
            raise TransientError(f"upstream HTTP {response.status}")
        if response is not None and response.status in (403, 429):
            raise TransientError(f"likely bot block HTTP {response.status}")

        dismiss_cookie_banner(page)

        try:
            page.wait_for_load_state("networkidle", timeout=20_000)
        except PWTimeout:
            pass
        page.wait_for_timeout(2_000)

        # No-op on the current Hyatt UI (rates auto-fire from URL params).
        # Kept for resilience in case Hyatt re-introduces the modal flow.
        submit_dates_form_if_present(page)

        result = classify_page(page)

        if result.available:
            ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(ARTIFACT_DIR / "available.png"), full_page=True)
            # NOTE: full HTML may include tracking/session tokens. Keep only
            # screenshot by default; HTML write is opt-in via env var.
            if os.environ.get("MONITOR_DUMP_HTML") == "1":
                (ARTIFACT_DIR / "available.html").write_text(
                    page.content(), encoding="utf-8"
                )
        elif result.confidence == "low":
            ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(ARTIFACT_DIR / "ambiguous.png"), full_page=True)

        return result
    finally:
        context.close()


def sanitize_reason(reason: str) -> str:
    """Strip anything outside the safe-character whitelist so the reason
    string can be safely passed through GitHub Actions outputs / shell."""
    cleaned = SAFE_REASON_RE.sub("", reason)
    # Collapse runs of whitespace and trim length.
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:240]


def emit_outputs(result: CheckResult) -> None:
    """Append result fields to $GITHUB_OUTPUT for the workflow to consume."""
    out = os.environ.get("GITHUB_OUTPUT")
    if not out:
        return
    safe_reason = sanitize_reason(result.reason)
    safe_url = sanitize_reason(result.url)
    lines = [
        f"available={'true' if result.available else 'false'}",
        f"confidence={result.confidence}",
        f"reason={safe_reason}",
        f"url={safe_url}",
        f"checkin={CHECKIN}",
        f"checkout={CHECKOUT}",
        f"adults={ADULTS}",
        f"rooms={ROOMS}",
    ]
    with open(out, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def main() -> int:
    url = build_url()
    print(f"Probing {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            result = probe(browser, url)
        finally:
            browser.close()

    print(
        f"Result: available={result.available} confidence={result.confidence} "
        f"reason={result.reason}"
    )
    emit_outputs(result)

    if result.available:
        return 2
    if result.confidence == "low":
        return 3
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"FATAL: {exc!r}", file=sys.stderr)
        sys.exit(1)
