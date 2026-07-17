import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

try:
    conn = psycopg2.connect(CONN_STRING)
    cur = conn.cursor()
    
    # List tables
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    """)
    tables = cur.fetchall()
    print("Tables in public schema:")
    for t in tables:
        print(" -", t[0])
        
    # List views
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'VIEW';
    """)
    views = cur.fetchall()
    print("\nViews in public schema:")
    for v in views:
        print(" -", v[0])

    cur.close()
    conn.close()
except Exception as e:
    print("Error:", e)
