import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def main():
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        
        cur.execute("SELECT id FROM public.district LIMIT 1")
        district_id = cur.fetchone()[0]
        
        print(f"Testing on district: {district_id}")
        
        # 1. Clear previous candidates
        cur.execute("TRUNCATE public.alert_candidate CASCADE")
        
        # 2. Insert reading at T-10 hours (2m)
        cur.execute("""
            INSERT INTO public.manual_reading (source, station_name, district_id, reading_type, value, unit, entered_at)
            VALUES ('test', 'Test Rate Station', %s, 'water_level', 2, 'm', now() - interval '10 hours')
            RETURNING id
        """, (district_id,))
        
        # 3. Insert reading at T-0 hours (4m) -> Delta = +2m in 10 hours
        cur.execute("""
            INSERT INTO public.manual_reading (source, station_name, district_id, reading_type, value, unit, entered_at)
            VALUES ('test', 'Test Rate Station', %s, 'water_level', 4, 'm', now())
            RETURNING id
        """, (district_id,))
        manual_id = cur.fetchone()[0]
        
        conn.commit()
        
        # 4. Check alert_candidate table
        print("Checking alert_candidate table...")
        cur.execute("""
            SELECT metric_name, severity, title, status FROM public.alert_candidate 
            WHERE external_id = %s
        """, (f'manual_water_{manual_id}',))
        
        candidate = cur.fetchone()
        if candidate:
            print(f"-> Created Alert Candidate: {candidate}")
            if candidate[3] == 'pending':
                print("SUCCESS! Candidate is pending.")
            else:
                print("FAILED! Candidate should be pending.")
        else:
            print("FAILED! No candidate created.")
            
        # 5. Approve the candidate
        print("Approving candidate...")
        cur.execute("""
            UPDATE public.alert_candidate SET status = 'approved' WHERE external_id = %s
        """, (f'manual_water_{manual_id}',))
        conn.commit()
        
        # 6. Check hazard_event
        cur.execute("""
            SELECT hazard, severity, title FROM public.hazard_event WHERE external_id = %s
        """, (f'manual_water_{manual_id}',))
        event = cur.fetchone()
        if event:
            print(f"-> Promoted to Hazard Event: {event}")
            print("SUCCESS! Approval trigger works.")
        else:
            print("FAILED! No hazard_event generated.")
            
    except Exception as e:
        print(f"Test failed: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
