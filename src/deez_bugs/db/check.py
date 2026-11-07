"""Check the database.  Run:  uv run tiger-check"""

from deez_bugs.db import connect


def main() -> None:
    with connect() as conn:
        pg = conn.execute("SHOW server_version").fetchone()[0]
        ts = conn.execute("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'").fetchone()
        print(f"✅ Connected to Tiger Data (Postgres {pg}, TimescaleDB {ts[0] if ts else 'missing'})")
        if not conn.execute("SELECT to_regclass('transactions')").fetchone()[0]:
            print("   No tables yet. Run: uv run tiger-load")
            return
        for source, n in conn.execute("SELECT source, COUNT(*) FROM users GROUP BY 1 ORDER BY 1"):
            print(f"   users ({source}): {n:,}")
        print(f"   transactions: {conn.execute('SELECT COUNT(*) FROM transactions').fetchone()[0]:,}")


if __name__ == "__main__":
    main()
