import psycopg2
import json
import decimal
from datetime import datetime, date

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

# Custom JSON encoder to handle Decimal, datetime, and date types
class DBEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        return super(DBEncoder, self).default(obj)

tables_to_dump = [
    "profile",
    "district",
    "station",
    "weather_reading",
    "station_reading",
    "manual_reading",
    "flood_forecast",
    "hazard_event",
    "threshold_rule",
    "alert",
    "alert_delivery",
    "audit_log",
    "ingest_status",
    "district_contact",
    "advisory",
    "scrape_snapshot",
    "maintenance_ticket"
]

def backup():
    conn = psycopg2.connect(CONN_STRING)
    cur = conn.cursor()
    
    backup_data = {}
    
    for table in tables_to_dump:
        try:
            # Get columns
            cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = %s AND table_schema = 'public' ORDER BY ordinal_position;", (table,))
            columns = [row[0] for row in cur.fetchall()]
            
            # Fetch data
            cur.execute(f"SELECT * FROM \"{table}\";")
            rows = cur.fetchall()
            
            table_rows = []
            for row in rows:
                row_dict = {}
                for col_name, val in zip(columns, row):
                    row_dict[col_name] = val
                table_rows.append(row_dict)
                
            backup_data[table] = table_rows
            print(f"Dumped {len(table_rows)} rows from table '{table}'")
        except Exception as e:
            print(f"Error dumping table '{table}':", e)
            conn.rollback()
            
    cur.close()
    conn.close()
    
    # Save to file
    backup_file = "supabase_backup_data.json"
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, cls=DBEncoder, indent=2)
        
    print(f"\nBackup successfully saved to {backup_file}")

if __name__ == "__main__":
    backup()
