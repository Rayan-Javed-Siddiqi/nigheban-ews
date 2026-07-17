import psycopg2
import os

CONN_STRING = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def dump_schema():
    conn = psycopg2.connect(CONN_STRING)
    cur = conn.cursor()
    
    schema_sql = []
    schema_sql.append("-- Nigheban EWS Database Schema Backup\n")
    
    # 1. Get Tables & Columns
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'spatial_ref_sys';
    """)
    tables = [row[0] for row in cur.fetchall()]
    
    for table in tables:
        schema_sql.append(f"-- Table: {table}")
        cur.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = %s AND table_schema = 'public'
            ORDER BY ordinal_position;
        """, (table,))
        cols = cur.fetchall()
        
        col_defs = []
        for col in cols:
            col_name, data_type, is_nullable, col_default = col
            null_str = " NULL" if is_nullable == "YES" else " NOT NULL"
            default_str = f" DEFAULT {col_default}" if col_default else ""
            col_defs.append(f"  {col_name} {data_type}{null_str}{default_str}")
            
        schema_sql.append(f"CREATE TABLE public.\"{table}\" (\n" + ",\n".join(col_defs) + "\n);\n")
        
    # 2. Get Views
    cur.execute("""
        SELECT table_name, view_definition
        FROM information_schema.views
        WHERE table_schema = 'public';
    """)
    views = cur.fetchall()
    for name, definition in views:
        schema_sql.append(f"-- View: {name}")
        if definition:
            clean_def = definition.strip()
            if not clean_def.endswith(";"):
                clean_def += ";"
            schema_sql.append(f"CREATE OR REPLACE VIEW public.\"{name}\" AS\n{clean_def}\n")
        else:
            schema_sql.append(f"-- View definition not available for {name}\n")
        
    # 3. Get Functions (RPCs)
    cur.execute("""
        SELECT p.proname, pg_get_functiondef(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prokind = 'f';
    """)
    funcs = cur.fetchall()
    for name, definition in funcs:
        schema_sql.append(f"-- Function: {name}")
        schema_sql.append(f"{definition};\n")
        
    # 4. Get RLS Policies
    cur.execute("""
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public';
    """)
    policies = cur.fetchall()
    for table, name, permissive, roles, cmd, qual, with_check in policies:
        schema_sql.append(f"-- RLS Policy on {table}: {name}")
        roles_str = ", ".join(roles)
        cmd_str = cmd if cmd else "ALL"
        permissive_str = "PERMISSIVE" if permissive == "YES" else "RESTRICTIVE"
        
        qual_str = f" USING ({qual})" if qual else ""
        check_str = f" WITH CHECK ({with_check})" if with_check else ""
        
        schema_sql.append(f"CREATE POLICY \"{name}\" ON public.\"{table}\"\n  AS {permissive_str}\n  FOR {cmd_str}\n  TO {roles_str}{qual_str}{check_str};\n")
        
    cur.close()
    conn.close()
    
    # Write to supabase/schema.sql
    os.makedirs("supabase", exist_ok=True)
    schema_file = "supabase/schema.sql"
    with open(schema_file, "w", encoding="utf-8") as f:
        f.write("\n".join(schema_sql))
        
    print(f"Schema dumped successfully to {schema_file}")

if __name__ == "__main__":
    dump_schema()
