import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

SQL = """
CREATE OR REPLACE FUNCTION public.get_district_mask_geojson()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT ST_AsGeoJSON(
        ST_Difference(
            ST_MakeEnvelope(-180, -90, 180, 90, 4326),
            ST_Union(geom)
        )
    )::jsonb INTO result
    FROM public.district;
    
    RETURN result;
END;
$$;
"""

def main():
    try:
        conn = psycopg2.connect(CONN_STRING)
        cur = conn.cursor()
        cur.execute(SQL)
        conn.commit()
        print("Mask RPC created successfully.")
    except Exception as e:
        print(f"Update failed: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
