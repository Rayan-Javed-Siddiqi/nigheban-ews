import psycopg2
conn = psycopg2.connect('postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()
cur.execute("SELECT tablename, policyname, roles, cmd, qual FROM pg_policies WHERE tablename IN ('district', 'glacial_lake', 'drought_index')")
for row in cur.fetchall():
    print(row)
conn.close()
