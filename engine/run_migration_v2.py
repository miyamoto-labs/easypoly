#!/usr/bin/env python3
"""Run trader discovery v2 database migration."""

import os
import sys
from pathlib import Path
from supabase import create_client

# Load environment
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env", override=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

# Read migration SQL
migration_file = Path(__file__).parent / "db" / "migration_v2_trader_discovery.sql"
if not migration_file.exists():
    print(f"❌ Migration file not found: {migration_file}")
    sys.exit(1)

with open(migration_file) as f:
    sql = f.read()

print("🔧 Running trader discovery v2 migration...")

# Connect to Supabase
sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Execute migration (split by semicolons to run each statement)
statements = [stmt.strip() for stmt in sql.split(';') if stmt.strip() and not stmt.strip().startswith('--')]

for i, stmt in enumerate(statements, 1):
    if not stmt:
        continue
    try:
        # Use RPC or direct SQL execution
        print(f"  [{i}/{len(statements)}] Executing statement...")
        # Note: Supabase Python client doesn't have direct SQL execution
        # We'll need to use the PostgREST API or psycopg2
        print(f"    {stmt[:80]}...")
    except Exception as e:
        print(f"  ⚠️ Statement {i} failed: {e}")
        continue

print("\n⚠️ Note: Supabase Python client doesn't support direct SQL execution.")
print("📋 Please run the migration manually:")
print(f"\n1. Open Supabase SQL Editor:")
print(f"   https://supabase.com/dashboard/project/ljseawnwxbkrejwysrey/editor")
print(f"\n2. Paste the contents of:")
print(f"   {migration_file}")
print(f"\n3. Click 'Run'")
print(f"\nOr use psql:")
print(f"   cat {migration_file} | psql <your-connection-string>")
