"""Empty all ML output tables (Part B), so the batch job can rebuild them.

    uv run python db/reset_derived.py --yes

Source data (users, merchants, uploads, transactions) is never touched.
"""

import argparse

from db import get_conn

# Every Part B table. All listed together, so TRUNCATE needs no CASCADE.
DERIVED_TABLES = [
    "rec_feedback",
    "recommendations",
    "user_neighbours",
    "user_segment",
    "segments",
    "user_features",
    "user_merchant_stats",
    "model_runs",
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="really empty the tables")
    args = parser.parse_args()

    if not args.yes:
        print("This empties: " + ", ".join(DERIVED_TABLES))
        print("Refusing to run without --yes.")
        raise SystemExit(1)

    with get_conn() as conn:
        conn.execute("TRUNCATE " + ", ".join(DERIVED_TABLES) + " RESTART IDENTITY")
    print("Emptied: " + ", ".join(DERIVED_TABLES))


if __name__ == "__main__":
    main()
