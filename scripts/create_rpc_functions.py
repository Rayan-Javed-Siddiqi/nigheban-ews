"""
Create RPC functions: get_glacial_lakes_geojson and get_drought_geojson.
"""
import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

GET_GLACIAL_LAKES_GEOJSON = """
CREATE OR REPLACE FUNCTION get_glacial_lakes_geojson()
RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(gl.geom)::json,
        'properties', json_build_object(
          'id', gl.id,
          'name', gl.name,
          'valley', gl.valley,
          'hazard_class', gl.hazard_class,
          'downstream_population', gl.downstream_population,
          'source', gl.source
        )
      )
    ), '[]'::json)
  )
  FROM public.glacial_lake gl;
$$;
"""

GET_DROUGHT_GEOJSON = """
CREATE OR REPLACE FUNCTION get_drought_geojson()
RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(d.geom)::json,
        'properties', json_build_object(
          'district_id', d.id,
          'name_en', d.name_en,
          'province', d.province,
          'spi_3', di.spi_3,
          'date', di.date
        )
      )
    ), '[]'::json)
  )
  FROM public.district d
  INNER JOIN LATERAL (
    SELECT spi_3, date
    FROM public.drought_index
    WHERE district_id = d.id
    ORDER BY date DESC
    LIMIT 1
  ) di ON true;
$$;
"""

def main():
    print("=== Creating RPC Functions ===")
    sys.stdout.flush()

    print("Connecting to database...")
    sys.stdout.flush()
    conn = psycopg2.connect(CONN_STRING, connect_timeout=10)
    print("Connected successfully.")
    sys.stdout.flush()

    conn.autocommit = True
    cur = conn.cursor()

    try:
        print("Creating get_glacial_lakes_geojson()...")
        sys.stdout.flush()
        cur.execute(GET_GLACIAL_LAKES_GEOJSON)
        print("  Done.")

        print("Creating get_drought_geojson()...")
        sys.stdout.flush()
        cur.execute(GET_DROUGHT_GEOJSON)
        print("  Done.")

        # Verify functions exist
        cur.execute("""
            SELECT routine_name FROM information_schema.routines
            WHERE routine_schema = 'public'
              AND routine_name IN ('get_glacial_lakes_geojson', 'get_drought_geojson')
            ORDER BY routine_name;
        """)
        funcs = [row[0] for row in cur.fetchall()]
        print(f"\nVerified functions exist: {funcs}")

        # Quick test of get_glacial_lakes_geojson
        cur.execute("SELECT get_glacial_lakes_geojson();")
        result = cur.fetchone()[0]
        if isinstance(result, dict):
            feature_count = len(result.get('features', []))
        else:
            import json
            parsed = json.loads(result) if isinstance(result, str) else result
            feature_count = len(parsed.get('features', []))
        print(f"get_glacial_lakes_geojson() returned {feature_count} features.")

        sys.stdout.flush()

    except Exception as e:
        print(f"Failed: {e}")
        sys.stdout.flush()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

    print("\n=== RPC Functions Created ===")

if __name__ == "__main__":
    main()
