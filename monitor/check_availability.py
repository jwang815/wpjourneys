"""Check Hyatt.com for availability at Lindner Hotel Antwerp.

Pure detector: writes structured output and exits with a status code.
The GitHub Actions workflow handles email notification + kill-switch commit.

Configured via env vars:
  HYATT_HOTEL_CODE   Hyatt property code (default: anlsl, Lindner Hotel Antwerp).
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

from playwright.sync_api import (
    Browser,
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
    r"are\s+not\s+available",
    r"unavailable\s+for\s+the\s+selected",
]


@dataclass
class CheckResult:
    available: bool
    confidence: str  # "high" | "low"
    reason: str
    url: str


class TransientError(RuntimeError):
    """Raised for retryable failures (timeouts, navigation errors)."""


def build_url() -> str:
    return (
        f"https://www.hyatt.com/shop/rooms/{HOTEL_CODE}"
        f"?checkinDate={CHECKIN}&checkoutDate={CHECKOUT}"
        f"&rooms={ROOMS}&adults={ADULTS}&kids=0"
    )


def dismiss_cookie_banner(page: Page) -> None:
    """Hyatt uses OneTrust. Click any 'accept' style button if present."""
    selectors = [
        "#onetrust-accept-btn-handler",
        "button:has-text('Accept All Cookies')",
        "button:has-text('Accept All')",
        "button:has-text('Accept')",
        "button:has-text('I Accept')",
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=1500):
                btn.click(timeout=2000)
                page.wait_for_timeout(500)
                return
        except Exception:
            continue


def classify_page(page: Page) -> CheckResult:
    """Inspect rendered DOM/text to decide availability."""
    url = page.url
    try:
        body_text = page.locator("body").inner_text(timeout=10_000)
    except PWTimeout as exc:
        raise TransientError(f"timed out reading body: {exc}") from exc

    lower = body_text.lower()

    for pat in UNAVAILABLE_PATTERNS:
        if re.search(pat, lower):
            return CheckResult(
                available=False,
                confidence="high",
                reason=f"matched unavailability phrase /{pat}/",
                url=url,
            )

    price_hits = len(re.findall(r"(?:€|EUR|USD|\$)\s*\d{2,4}", body_text))
    book_buttons = 0
    for sel in [
        "button:has-text('Select')",
        "button:has-text('Book')",
        "a:has-text('Select Room')",
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
            reason=f"prices={price_hits}, book_buttons={book_buttons}",
            url=url,
        )
    if price_hits >= 2:
        return CheckResult(
            available=True,
            confidence="low",
            reason=f"prices={price_hits} but no clear booking buttons",
            url=url,
        )

    return CheckResult(
        available=False,
        confidence="low",
        reason=(
            f"no unavailability phrase, no clear booking signals "
            f"(prices={price_hits}, buttons={book_buttons})"
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
            page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        except PWTimeout as exc:
            raise TransientError(f"navigation timeout: {exc}") from exc

        dismiss_cookie_banner(page)

        try:
            page.wait_for_load_state("networkidle", timeout=20_000)
        except PWTimeout:
            pass
        page.wait_for_timeout(2_000)

        result = classify_page(page)

        if result.available:
            ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(ARTIFACT_DIR / "available.png"), full_page=True)
            (ARTIFACT_DIR / "available.html").write_text(
                page.content(), encoding="utf-8"
            )
        elif result.confidence == "low":
            ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(ARTIFACT_DIR / "ambiguous.png"), full_page=True)

        return result
    finally:
        context.close()


def emit_outputs(result: CheckResult) -> None:
    """Append result fields to $GITHUB_OUTPUT for the workflow to consume."""
    out = os.environ.get("GITHUB_OUTPUT")
    if not out:
        return
    lines = [
        f"available={'true' if result.available else 'false'}",
        f"confidence={result.confidence}",
        f"reason={result.reason}",
        f"url={result.url}",
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
