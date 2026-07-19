import psycopg2
conn = psycopg2.connect('postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()
cur.execute("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'hazard_event_hazard_check'")
print(cur.fetchone()[0])
conn.close()
