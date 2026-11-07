"""Delete my data: remove one user and everything about them.

    uv run python db/delete_user.py 42 --yes

Deleting the users row removes everything else through ON DELETE CASCADE: their
transactions, uploads, features, segment, neighbours (both directions),
recommendations and feedback. The continuous aggregates are then refreshed over the
user's date range, so their totals disappear from the summary views too.
"""

import argparse

from db import get_conn, refresh_aggregates

# Tables that hold a user_id column, used to report what was deleted.
USER_TABLES = [
    "transactions",
    "statement_uploads",
    "user_merchant_stats",
    "user_features",
    "user_segment",
    "user_neighbours",
    "recommendations",
    "rec_feedback",
]


def delete_user(user_id: int) -> dict[str, int]:
    """Delete a user. Returns {table: rows removed}. Raises if the user doesn't exist."""
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM users WHERE user_id = %s", (user_id,)).fetchone() is None:
            raise ValueError(f"No user with user_id = {user_id}")

        counts = {
            table: conn.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = %s", (user_id,)).fetchone()[0]
            for table in USER_TABLES  # table names come from our fixed list, not user input
        }
        counts["user_neighbours (as neighbour)"] = conn.execute(
            "SELECT COUNT(*) FROM user_neighbours WHERE neighbour_id = %s", (user_id,)
        ).fetchone()[0]
        first_ts, last_ts = conn.execute(
            "SELECT MIN(ts), MAX(ts) FROM transactions WHERE user_id = %s", (user_id,)
        ).fetchone()

        conn.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
        counts["users"] = 1
        # Leaving the `with` block commits.

    # Remove the user's totals from the summary views too.
    if first_ts is not None:
        refresh_aggregates(first_ts, last_ts)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("user_id", type=int)
    parser.add_argument("--yes", action="store_true", help="really delete")
    args = parser.parse_args()

    if not args.yes:
        print(f"This permanently deletes user {args.user_id} and all their data.")
        print("Refusing to run without --yes.")
        raise SystemExit(1)

    for table, n in delete_user(args.user_id).items():
        print(f"  {table:32} {n:>7,} rows deleted")
    print(f"User {args.user_id} deleted.")


if __name__ == "__main__":
    main()
