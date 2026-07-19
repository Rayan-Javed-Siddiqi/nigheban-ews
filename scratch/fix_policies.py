import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def main():
    conn = psycopg2.connect(CONN_STRING)
    cur = conn.cursor()
    
    print("Updating policies for public.glacial_lake...")
    cur.execute("DROP POLICY IF EXISTS \"Allow public read access\" ON public.glacial_lake")
    cur.execute("CREATE POLICY \"Allow public read access\" ON public.glacial_lake FOR SELECT TO public USING (true)")
    
    print("Updating policies for public.drought_index...")
    cur.execute("DROP POLICY IF EXISTS \"Allow public read access\" ON public.drought_index")
    cur.execute("CREATE POLICY \"Allow public read access\" ON public.drought_index FOR SELECT TO public USING (true)")
    
    conn.commit()
    print("Policies updated successfully!")
    
    # Verification
    cur.execute("SET ROLE authenticated")
    cur.execute("SELECT count(*) FROM public.glacial_lake")
    print("Authenticated count for glacial_lake after fix:", cur.fetchone())
    
    cur.execute("SELECT count(*) FROM public.drought_index")
    print("Authenticated count for drought_index after fix:", cur.fetchone())
    
    conn.close()

if __name__ == "__main__":
    main()
