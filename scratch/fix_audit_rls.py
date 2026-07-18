import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

try:
    conn = psycopg2.connect(CONN_STRING)
    cursor = conn.cursor()
    
    # Check if RLS is enabled
    cursor.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;")
    
    # Create SELECT policy for authenticated users
    cursor.execute("""
        DROP POLICY IF EXISTS "Allow authenticated select on audit_log" ON audit_log;
        CREATE POLICY "Allow authenticated select on audit_log" ON audit_log
        FOR SELECT
        TO authenticated
        USING (true);
    """)
    
    conn.commit()
    print("Successfully created RLS SELECT policy on audit_log!")
    conn.close()
except Exception as e:
    print("Error:", e)
