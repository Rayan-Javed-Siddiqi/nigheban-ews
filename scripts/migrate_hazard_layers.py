"""
Migration: Create drought_index and glacial_lake tables with RLS policies.
"""
import psycopg2
import sys

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

MIGRATION_SQL = """
-- ============================================================
-- drought_index table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.drought_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES public.district(id),
  spi_3 numeric NOT NULL,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(district_id, date)
);

ALTER TABLE public.drought_index ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'drought_index' AND policyname = 'Allow public read access'
  ) THEN
    CREATE POLICY "Allow public read access" ON public.drought_index FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'drought_index' AND policyname = 'Allow service role full access'
  ) THEN
    CREATE POLICY "Allow service role full access" ON public.drought_index FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ============================================================
-- glacial_lake table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.glacial_lake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  valley text NOT NULL,
  district_id uuid REFERENCES public.district(id),
  hazard_class text NOT NULL CHECK (hazard_class IN ('High', 'Medium', 'Low')),
  downstream_population integer,
  geom geometry(Point, 4326) NOT NULL,
  source text NOT NULL DEFAULT 'UNDP/ICIMOD',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.glacial_lake ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'glacial_lake' AND policyname = 'Allow public read access'
  ) THEN
    CREATE POLICY "Allow public read access" ON public.glacial_lake FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'glacial_lake' AND policyname = 'Allow service role full access'
  ) THEN
    CREATE POLICY "Allow service role full access" ON public.glacial_lake FOR ALL TO service_role USING (true);
  END IF;
END $$;
"""

def main():
    print("=== Hazard Layers Migration ===")
    sys.stdout.flush()

    print("Connecting to database...")
    sys.stdout.flush()
    conn = psycopg2.connect(CONN_STRING, connect_timeout=10)
    print("Connected successfully.")
    sys.stdout.flush()

    conn.autocommit = True
    cur = conn.cursor()

    try:
        print("Running migration SQL...")
        sys.stdout.flush()
        cur.execute(MIGRATION_SQL)
        print("Migration executed successfully.")
        sys.stdout.flush()

        # Verify tables exist
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN ('drought_index', 'glacial_lake')
            ORDER BY table_name;
        """)
        tables = [row[0] for row in cur.fetchall()]
        print(f"Verified tables exist: {tables}")

        # Verify RLS is enabled
        cur.execute("""
            SELECT tablename, rowsecurity FROM pg_tables
            WHERE schemaname = 'public' AND tablename IN ('drought_index', 'glacial_lake')
            ORDER BY tablename;
        """)
        for row in cur.fetchall():
            print(f"  Table '{row[0]}' - RLS enabled: {row[1]}")

        # Verify policies
        cur.execute("""
            SELECT tablename, policyname FROM pg_policies
            WHERE tablename IN ('drought_index', 'glacial_lake')
            ORDER BY tablename, policyname;
        """)
        for row in cur.fetchall():
            print(f"  Policy on '{row[0]}': {row[1]}")

        sys.stdout.flush()

    except Exception as e:
        print(f"Migration failed: {e}")
        sys.stdout.flush()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

    print("=== Migration Complete ===")

if __name__ == "__main__":
    main()
