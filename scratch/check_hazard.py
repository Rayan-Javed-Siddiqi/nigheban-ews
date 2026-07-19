import psycopg2
conn = psycopg2.connect('postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hazard_event'")
for row in cur.fetchall(): print(row)
conn.close()
