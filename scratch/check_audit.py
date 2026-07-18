import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

try:
    conn = psycopg2.connect(CONN_STRING)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_log LIMIT 10;")
    rows = cursor.fetchall()
    print("Audit logs currently in DB:", rows)
    
    # Check table structure
    cursor.execute("""
        SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'audit_log';
    """)
    columns = cursor.fetchall()
    print("\nTable schema:")
    for col in columns:
        print(col)
        
    conn.close()
except Exception as e:
    print("Error:", e)
