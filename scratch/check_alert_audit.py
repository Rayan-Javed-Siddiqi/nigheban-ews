import psycopg2

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

try:
    conn = psycopg2.connect(CONN_STRING)
    cursor = conn.cursor()
    
    # Check if there are any audit logs at all
    cursor.execute("SELECT count(*) FROM audit_log;")
    count = cursor.fetchone()[0]
    print("Total audit logs:", count)
    
    # Check policies on audit_log
    cursor.execute("""
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
        FROM pg_policies 
        WHERE tablename = 'audit_log';
    """)
    policies = cursor.fetchall()
    print("\nPolicies on audit_log:")
    for pol in policies:
        print(pol)
        
    # Check triggers on alert_candidate
    cursor.execute("""
        SELECT trigger_name, event_manipulation, action_statement 
        FROM information_schema.triggers 
        WHERE event_object_table = 'alert_candidate';
    """)
    triggers = cursor.fetchall()
    print("\nTriggers on alert_candidate:")
    for trg in triggers:
        print(trg)
        
    conn.close()
except Exception as e:
    print("Error:", e)
