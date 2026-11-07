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

        for table, hint in [
            ("transactions", "run: uv run python db/migrate.py"),
            ("kaggle_transactions", "run: uv run tiger-load"),
        ]:
            if conn.execute("SELECT to_regclass(%s)", (table,)).fetchone()[0]:
                n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]  # fixed names, not user input
                print(f"   {table} table: {n:,} rows")
            else:
                print(f"   {table} table: not created yet ({hint})")


if __name__ == "__main__":
    main()
