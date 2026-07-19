import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def run_migration():
    conn = psycopg2.connect(CONN_STRING)
    cur = conn.cursor()
    
    print("Creating trigger function prevent_audit_log_modification...")
    cur.execute("""
        CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'audit_log is an append-only table. UPDATE and DELETE are strictly prohibited.';
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    print("Applying trigger to audit_log...")
    cur.execute("""
        DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
        CREATE TRIGGER audit_log_append_only
        BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_log_modification();
    """)
    
    conn.commit()
    cur.close()
    conn.close()
    print("Migration applied successfully.")

if __name__ == "__main__":
    run_migration()
