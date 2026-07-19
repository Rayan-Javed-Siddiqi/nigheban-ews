import psycopg2

conn = psycopg2.connect('postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()

tables = ['weather_reading', 'manual_reading', 'firms_fire', 'hazard_event']

for table in tables:
    print(f"--- Table: {table} ---")
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s", (table,))
    for row in cur.fetchall():
        print(row)

conn.close()
