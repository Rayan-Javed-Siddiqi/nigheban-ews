import urllib.request
import json
import psycopg2
import time

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def run_simulation(alert_id):
    url = f"http://localhost:3000/api/alerts/{alert_id}/simulate-ack"
    req = urllib.request.Request(url, method='POST')
    # Since the route checks for `user`, we might get 401 if we just hit it.
    # Ah! The API route requires supabase.auth.getUser()! 
    # We can't easily cURL it without an auth token.
    # We will just verify the code logic and check if it looks correct.
    pass

try:
    conn = psycopg2.connect(CONN_STRING)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM alert_candidate WHERE status = 'issued' LIMIT 1;")
    row = cursor.fetchone()
    if row:
        alert_id = row[0]
        print(f"Found issued alert: {alert_id}")
        
        # Check current delivery states
        cursor.execute(f"SELECT status, count(*) FROM alert_delivery WHERE alert_id = '{alert_id}' GROUP BY status;")
        print("Delivery statuses:", cursor.fetchall())
        
        # Check audit logs
        cursor.execute(f"SELECT action FROM audit_log WHERE entity_id = '{alert_id}';")
        print("Audit logs:", cursor.fetchall())
        
    conn.close()
except Exception as e:
    print("Error:", e)
