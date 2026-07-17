"""
NDMA / PDMA Advisories Scraper
Scrapes recent advisories from NDMA (ndma.gov.pk) and PDMA KP websites.
Upserts parsed advisories into the Supabase advisory table.
"""

import psycopg2
import json
import re
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError
import time
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

# Sources to scrape
SOURCES = [
    {
        "name": "ndma",
        "url": "https://ndma.gov.pk",
        "display_name": "NDMA (National Disaster Management Authority)",
    },
    {
        "name": "pdma_kp",
        "url": "https://pdma.gov.pk",
        "display_name": "PDMA KP (Provincial Disaster Management Authority)",
    },
]


def fetch_html(url, timeout=15):
    """Fetch raw HTML from a URL."""
    try:
        req = Request(url, headers={
            "User-Agent": "NighebanEWS/1.0 (Early Warning System)"
        })
        with urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  Failed to fetch {url}: {e}")
        return None


def extract_title_from_html(html):
    """Extract the page title from HTML."""
    match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return "Advisory"


def extract_meta_description(html):
    """Extract meta description from HTML."""
    match = re.search(
        r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']',
        html, re.IGNORECASE
    )
    if match:
        return match.group(1).strip()
    return ""


def extract_text_content(html, max_length=2000):
    """Extract visible text content from HTML (basic extraction without BeautifulSoup)."""
    # Remove script and style blocks
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:max_length]


def extract_advisories_from_html(html, source_name):
    """
    Extract advisory-like content from the HTML.
    Looks for common patterns like headings, press releases, alerts.
    """
    advisories = []

    # Look for press release or alert patterns
    # Pattern 1: Look for <h2>, <h3>, or <h4> tags that might be advisory titles
    heading_pattern = re.compile(
        r'<h[234][^>]*>(.*?)</h[234]>',
        re.IGNORECASE | re.DOTALL
    )
    headings = heading_pattern.findall(html)

    # Filter headings that look like advisories/alerts
    alert_keywords = [
        'flood', 'rain', 'warning', 'alert', 'advisory', 'earthquake',
        'weather', 'cyclone', 'landslide', 'disaster', 'emergency',
        'monsoon', 'GLOF', 'avalanche', 'heat', 'cold', 'storm',
        'drought', 'situation', 'update', 'bulletin', 'forecast'
    ]

    for heading in headings:
        clean_heading = re.sub(r'<[^>]+>', '', heading).strip()
        if not clean_heading or len(clean_heading) < 10:
            continue

        # Check if the heading contains any alert-related keywords
        is_alert = any(kw.lower() in clean_heading.lower() for kw in alert_keywords)
        if is_alert:
            advisories.append({
                "title": clean_heading[:200],
                "body": f"Scraped from {source_name}: {clean_heading}",
                "source": source_name,
            })

    return advisories[:10]  # Limit to 10 per source


def save_scrape_snapshot(conn, source, url, status_code, raw_html, error=None):
    """Save a snapshot of the scrape attempt."""
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO scrape_snapshot (source, url, status_code, raw_html, fetch_error)
        VALUES (%s, %s, %s, %s, %s)
    """, (source, url, status_code, raw_html[:50000] if raw_html else None, error))
    conn.commit()
    cur.close()


def upsert_advisory(conn, title, body, source):
    """Insert an advisory if one with the same title+source doesn't exist."""
    cur = conn.cursor()
    # Check for duplicate
    cur.execute(
        "SELECT id FROM advisory WHERE title = %s AND source = %s",
        (title, source)
    )
    if cur.fetchone():
        cur.close()
        return False  # Already exists

    cur.execute("""
        INSERT INTO advisory (title, body, source, is_demo_data, issued_at)
        VALUES (%s, %s, %s, false, now())
    """, (title, body, source))
    conn.commit()
    cur.close()
    return True


def main():
    print("=" * 60)
    print("NDMA / PDMA Advisories Scraper")
    print("=" * 60)

    conn = psycopg2.connect(CONN_STRING)
    total_new = 0

    for source_info in SOURCES:
        source_name = source_info["name"]
        url = source_info["url"]
        display = source_info["display_name"]

        print(f"\nScraping: {display}")
        print(f"  URL: {url}")

        html = fetch_html(url)

        if html:
            print(f"  [OK] Fetched {len(html)} bytes")
            save_scrape_snapshot(conn, source_name, url, 200, html)

            advisories = extract_advisories_from_html(html, source_name)
            print(f"  Found {len(advisories)} potential advisories")

            for adv in advisories:
                inserted = upsert_advisory(conn, adv["title"], adv["body"], source_name)
                if inserted:
                    total_new += 1
                    print(f"    + New: {adv['title'][:60]}...")
                else:
                    print(f"    = Exists: {adv['title'][:60]}...")
        else:
            print(f"  [ERR] Failed to fetch page")
            save_scrape_snapshot(conn, source_name, url, None, None, "Failed to fetch")

    conn.close()
    print(f"\n{'=' * 60}")
    print(f"Completed: {total_new} new advisories inserted")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
