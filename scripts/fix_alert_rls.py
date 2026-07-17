import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

SQL = """
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.alert_candidate;
CREATE POLICY "Allow authenticated update access" ON public.alert_candidate FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
"""

def main():
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        cur.execute(SQL)
        conn.commit()
        print("RLS policy for alert_candidate updated successfully.")
    except Exception as e:
        print(f"Update failed: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
