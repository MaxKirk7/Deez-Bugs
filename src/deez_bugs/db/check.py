"""Check we can reach Tiger Data.  Run:  uv run tiger-check"""

from deez_bugs.db import connect


def main() -> None:
    with connect() as conn:
        pg = conn.execute("SHOW server_version").fetchone()[0]
        ts = conn.execute(
            "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
        ).fetchone()
        print(f"✅ Connected to Tiger Data (Postgres {pg})")
        print(f"   TimescaleDB extension: {ts[0] if ts else 'NOT INSTALLED'}")

        exists = conn.execute("SELECT to_regclass('transactions')").fetchone()[0]
        if exists:
            n = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
            print(f"   transactions table: {n:,} rows")
        else:
            print("   transactions table: not created yet (run: uv run tiger-load)")


if __name__ == "__main__":
    main()
