"""Apply the SQL files in db/migrations/ in order.  Run:  uv run python db/migrate.py

Each file that succeeds is recorded in the schema_migrations table and is skipped next
time, so running this twice is safe. Files whose names start with 099 are optional and
are never applied automatically.
"""

from pathlib import Path

import sqlparse

from db import get_conn

MIGRATIONS = Path(__file__).with_name("migrations")
SKIP_PREFIXES = ("099_",)


def main() -> None:
    # autocommit: continuous aggregates can't be created inside a transaction.
    with get_conn(autocommit=True) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                   filename   TEXT PRIMARY KEY,
                   applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"""
        )
        conn.execute("COMMENT ON TABLE schema_migrations IS 'Which db/migrations/*.sql files have been applied.'")
        done = {row[0] for row in conn.execute("SELECT filename FROM schema_migrations")}

        applied = 0
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in done or path.name.startswith(SKIP_PREFIXES):
                continue
            print(f"Applying {path.name} ...")
            # Run statements one at a time: sent together they'd share one transaction.
            # sqlparse splits correctly around $$ ... $$ blocks and comments.
            for statement in sqlparse.split(path.read_text()):
                if sqlparse.format(statement, strip_comments=True).strip():
                    conn.execute(statement)
            conn.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (path.name,))
            applied += 1

    print(f"Done. {applied} migration(s) applied." if applied else "Nothing to do: database is up to date.")


if __name__ == "__main__":
    main()
