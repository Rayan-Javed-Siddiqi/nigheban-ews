import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

SQL = """
SELECT ST_AsGeoJSON(ST_Difference(
    ST_MakeEnvelope(-180, -90, 180, 90, 4326),
    (SELECT ST_Union(geom) FROM public.district)
));
"""

try:
    conn = psycopg2.connect(CONN_STRING)
    cur = conn.cursor()
    cur.execute(SQL)
    res = cur.fetchone()[0]
    print(res[:100] + "...")
except Exception as e:
    print(f"Error: {e}")
