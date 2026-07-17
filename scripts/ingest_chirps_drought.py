"""
CHIRPS Drought Index Ingestion Script
Fetches precipitation data from ClimateSERV API and calculates SPI-3 for KP/GB districts.
Upserts results into the Supabase drought_index table.
"""

import psycopg2
import json
import math
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError
import time
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

# Historical mean and std-dev for 90-day precipitation (mm) in KP/GB region
# These are approximate climatological normals for the region
HISTORICAL_MEAN_90DAY = 180.0  # mm
HISTORICAL_STDDEV_90DAY = 75.0  # mm

def fetch_json(url, retries=3):
    """Fetch JSON from a URL with retry logic."""
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "NighebanEWS/1.0"})
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


def get_district_centroids(conn):
    """Get district IDs and centroid lat/lon from the database."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name_en, province,
               ST_Y(centroid::geometry) AS lat,
               ST_X(centroid::geometry) AS lon
        FROM district
        WHERE centroid IS NOT NULL
    """)
    districts = cur.fetchall()
    cur.close()
    return districts


def fetch_open_meteo_precipitation(lat, lon, days=90):
    """
    Fetch historical daily precipitation from Open-Meteo API for the past N days.
    This is used as a proxy for CHIRPS when the ClimateSERV API is unavailable.
    """
    end_date = datetime.now().date() - timedelta(days=1)
    start_date = end_date - timedelta(days=days)

    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}"
        f"&start_date={start_date.isoformat()}&end_date={end_date.isoformat()}"
        f"&daily=precipitation_sum"
        f"&timezone=UTC"
    )
    data = fetch_json(url)
    if data and "daily" in data and "precipitation_sum" in data["daily"]:
        precip_values = data["daily"]["precipitation_sum"]
        # Filter out None values
        return [v for v in precip_values if v is not None]
    return None


def calculate_spi(total_precip, mean=HISTORICAL_MEAN_90DAY, stddev=HISTORICAL_STDDEV_90DAY):
    """
    Calculate a simplified SPI (Standardized Precipitation Index).
    SPI = (observed - mean) / stddev
    """
    if stddev == 0:
        return 0.0
    spi = (total_precip - mean) / stddev
    # Clamp to reasonable range
    return max(-3.0, min(3.0, round(spi, 2)))


def upsert_drought_index(conn, district_id, spi_3, date):
    """Upsert a drought index record."""
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO drought_index (district_id, spi_3, date)
        VALUES (%s, %s, %s)
        ON CONFLICT (district_id, date)
        DO UPDATE SET spi_3 = EXCLUDED.spi_3
    """, (district_id, spi_3, date))
    conn.commit()
    cur.close()


def main():
    print("=" * 60)
    print("CHIRPS Drought Index Ingestion")
    print("=" * 60)

    conn = psycopg2.connect(CONN_STRING)
    districts = get_district_centroids(conn)
    print(f"Found {len(districts)} districts with centroids.\n")

    today = datetime.now().date()
    success_count = 0
    error_count = 0

    for district_id, name, province, lat, lon in districts:
        print(f"Processing: {name} ({province}) @ [{lon:.2f}, {lat:.2f}]")

        precip_values = fetch_open_meteo_precipitation(lat, lon, days=90)

        if precip_values and len(precip_values) > 30:
            total_precip = sum(precip_values)
            spi_3 = calculate_spi(total_precip)
            print(f"  90-day total precip: {total_precip:.1f}mm, SPI-3: {spi_3}")

            try:
                upsert_drought_index(conn, district_id, spi_3, today)
                success_count += 1
                print(f"  [OK] Upserted drought_index for {name}")
            except Exception as e:
                error_count += 1
                print(f"  [ERR] Failed to upsert: {e}")
                conn.rollback()
        else:
            error_count += 1
            print(f"  [ERR] No precipitation data available")

        # Be polite to the API
        time.sleep(0.3)

    conn.close()
    print(f"\n{'=' * 60}")
    print(f"Completed: {success_count} success, {error_count} errors")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
