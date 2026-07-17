import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

try:
    conn = psycopg2.connect(CONN_STRING, connect_timeout=5)
    print("Connection successful!")
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print("Version:", cur.fetchone())
    cur.close()
    conn.close()
except Exception as e:
    print("Connection failed:", e)
