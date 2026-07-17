"""
Seed: Insert 33 glacial lakes into the glacial_lake table.
Looks up district_id by matching district name.
"""
import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

# Each tuple: (name, valley, district_name, hazard_class, downstream_pop, lon, lat)
LAKES = [
    ("Shisper Lake", "Hassanabad Valley", "Hunza", "High", 7000, 74.57, 36.42),
    ("Passu Lake", "Passu Valley", "Hunza", "High", 3000, 74.89, 36.49),
    ("Ghulkin Glacier Lake", "Ghulkin Valley", "Hunza", "High", 2500, 74.83, 36.44),
    ("Borith Lake", "Borith Valley", "Hunza", "Medium", 1500, 74.85, 36.44),
    ("Attabad Lake", "Attabad Valley", "Hunza", "Medium", 25000, 74.83, 36.32),
    ("Batura Glacier Lake", "Batura Valley", "Hunza", "High", 5000, 74.70, 36.55),
    ("Khurdopin Glacier Lake", "Shimshal Valley", "Hunza", "High", 4000, 75.60, 36.37),
    ("Hinarchi Lake", "Bagrot Valley", "Gilgit", "Medium", 3000, 74.55, 36.02),
    ("Karambar Lake", "Ishkoman Valley", "Ghizer", "High", 8000, 73.70, 36.90),
    ("Darkut Lake", "Darkut Valley", "Ghizer", "Medium", 2000, 73.55, 36.75),
    ("Badswat Lake", "Yasin Valley", "Ghizer", "Medium", 1800, 73.30, 36.65),
    ("Thui Glacier Lake", "Thui Valley", "Chitral", "High", 6000, 71.85, 36.55),
    ("Golen Gol Lake", "Golen Valley", "Chitral", "High", 5000, 71.70, 35.90),
    ("South Chitral GLOF-1", "Lotkoh Valley", "Chitral", "Medium", 3500, 71.50, 35.70),
    ("Chitral Gol Lake", "Chitral Gol", "Chitral", "Low", 1000, 71.75, 35.88),
    ("Mastuj Lake", "Mastuj Valley", "Chitral", "Medium", 4000, 71.90, 36.30),
    ("Reshun Lake", "Reshun Valley", "Chitral", "Low", 2000, 71.82, 36.00),
    ("Swat Kalam Lake-1", "Kalam Valley", "Swat", "Medium", 5000, 72.58, 35.50),
    ("Mahodand Lake", "Mahodand Valley", "Swat", "Low", 2000, 72.64, 35.71),
    ("Ushu Glacier Lake", "Ushu Valley", "Swat", "Medium", 3000, 72.55, 35.52),
    ("Gabral Lake", "Gabral Valley", "Swat", "Low", 1500, 72.40, 35.40),
    ("Daral Lake", "Daral Valley", "Swat", "Low", 1200, 72.22, 35.30),
    ("Kundol Lake", "Kundol Valley", "Dir Upper", "Low", 800, 72.08, 35.40),
    ("Tirich Mir Lake", "Tirich Valley", "Chitral", "High", 3000, 71.80, 36.25),
    ("Ratti Gali Lake", "Ratti Gali Valley", "Neelum", "Low", 500, 74.35, 34.80),
    ("Saiful Muluk Lake", "Kaghan Valley", "Mansehra", "Low", 2000, 73.69, 34.88),
    ("Lulusar Lake", "Lulusar Valley", "Mansehra", "Low", 1000, 73.89, 35.09),
    ("Babusar Glacier Lake", "Babusar Valley", "Diamer", "Medium", 4500, 74.05, 35.15),
    ("Rama Lake", "Rama Valley", "Astore", "Low", 1000, 74.80, 35.33),
    ("Deosai Sheosar Lake", "Deosai Plateau", "Skardu", "Low", 500, 75.19, 35.09),
    ("Satpara Lake", "Satpara Valley", "Skardu", "Medium", 50000, 75.63, 35.24),
    ("Upper Kachura Lake", "Kachura Valley", "Skardu", "Low", 3000, 75.48, 35.42),
    ("Shangrila Lower Kachura", "Kachura Valley", "Skardu", "Low", 3000, 75.49, 35.41),
]


def main():
    print("=== Seeding 33 Glacial Lakes ===")
    sys.stdout.flush()

    print("Connecting to database...")
    sys.stdout.flush()
    conn = psycopg2.connect(CONN_STRING, connect_timeout=10)
    print("Connected successfully.")
    sys.stdout.flush()

    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Load district lookup: name_en -> id  (case-insensitive)
        cur.execute("SELECT id, name_en FROM public.district;")
        district_rows = cur.fetchall()
        district_map = {}
        for did, dname in district_rows:
            district_map[dname.strip().lower()] = did
        print(f"Loaded {len(district_map)} districts for lookup.")
        sys.stdout.flush()

        inserted = 0
        skipped_districts = []

        for name, valley, district_name, hazard_class, pop, lon, lat in LAKES:
            district_id = district_map.get(district_name.strip().lower())
            if district_id is None:
                skipped_districts.append(district_name)

            cur.execute(
                """
                INSERT INTO public.glacial_lake
                    (name, valley, district_id, hazard_class, downstream_population, geom)
                VALUES
                    (%s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                ON CONFLICT DO NOTHING;
                """,
                (name, valley, district_id, hazard_class, pop, lon, lat),
            )
            inserted += 1
            print(f"  [{inserted}/33] {name} (district_id={'found' if district_id else 'NULL - ' + district_name})")

        conn.commit()
        print(f"\nInserted {inserted} lakes.")
        sys.stdout.flush()

        if skipped_districts:
            unique_skipped = sorted(set(skipped_districts))
            print(f"Districts not found (district_id set to NULL): {unique_skipped}")
            sys.stdout.flush()

        # Verify count
        cur.execute("SELECT COUNT(*) FROM public.glacial_lake;")
        count = cur.fetchone()[0]
        print(f"\nVerification: {count} rows in glacial_lake table.")

        # Show a sample
        cur.execute("""
            SELECT name, valley, hazard_class, downstream_population,
                   ST_X(geom) as lon, ST_Y(geom) as lat
            FROM public.glacial_lake
            ORDER BY name
            LIMIT 5;
        """)
        print("\nSample rows:")
        for row in cur.fetchall():
            print(f"  {row[0]} | {row[1]} | {row[2]} | pop={row[3]} | ({row[4]}, {row[5]})")

        sys.stdout.flush()

    except Exception as e:
        conn.rollback()
        print(f"Seeding failed, rolled back: {e}")
        sys.stdout.flush()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

    print("\n=== Seeding Complete ===")

if __name__ == "__main__":
    main()
