import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def main():
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        
        # Get a district_id to test on
        cur.execute("SELECT id FROM public.district LIMIT 1")
        district_id = cur.fetchone()[0]
        
        print(f"Testing on district: {district_id}")
        
        # 1. UPSERT a high rainfall reading (120mm)
        cur.execute("""
            INSERT INTO public.weather_reading (district_id, precipitation, temperature, fetched_at)
            VALUES (%s, 120, 30, now())
            ON CONFLICT (district_id) DO UPDATE 
            SET precipitation = 120, temperature = 30, fetched_at = now()
            RETURNING id
        """, (district_id,))
        weather_id_1 = cur.fetchone()[0]
        print(f"Upserted high rainfall reading: {weather_id_1}")
        
        # 2. UPSERT a high temperature reading (50C)
        cur.execute("""
            INSERT INTO public.weather_reading (district_id, precipitation, temperature, fetched_at)
            VALUES (%s, 0, 50, now())
            ON CONFLICT (district_id) DO UPDATE 
            SET precipitation = 0, temperature = 50, fetched_at = now()
            RETURNING id
        """, (district_id,))
        weather_id_2 = cur.fetchone()[0]
        print(f"Upserted high temperature reading: {weather_id_2}")
        
        # 3. Insert a high water level reading (8m) - manual reading doesn't have unique constraint on district_id
        cur.execute("""
            INSERT INTO public.manual_reading (source, station_name, district_id, reading_type, value, unit, entered_at)
            VALUES ('test', 'Test Station', %s, 'water_level', 8, 'm', now())
            RETURNING id
        """, (district_id,))
        manual_id = cur.fetchone()[0]
        print(f"Inserted high water level reading: {manual_id}")
        
        conn.commit()
        
        # 4. Check hazard events created
        print("Checking hazard_event table...")
        cur.execute("""
            SELECT hazard, severity, title, external_id FROM public.hazard_event 
            WHERE external_id IN (%s, %s, %s)
        """, (f'weather_precip_{weather_id_1}', f'weather_temp_{weather_id_2}', f'manual_water_{manual_id}'))
        
        events = cur.fetchall()
        for e in events:
            print(f"-> Created Alert: {e}")
            
        if len(events) == 3:
            print("SUCCESS! Alert Engine generated 3 expected hazard events.")
        else:
            print("FAILED! Expected 3 events, got", len(events))
            
    except Exception as e:
        print(f"Test failed: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
