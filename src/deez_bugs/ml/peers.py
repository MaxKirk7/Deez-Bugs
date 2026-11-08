"""Peer habits: HOW your 20 nearest neighbours (KNN, model.py) spend in one category, next to you.

    from deez_bugs.ml.peers import peer_habits
    peer_habits(cc_num, "food_dining")

For you and for each peer, over the last 90 days of their data:
  - visits a month    how many purchases in that category
  - per visit         average amount per purchase
  - a month           visits x per visit
Peers are averaged (median, so one unusual peer doesn't skew it). This turns "you spend 15%
vs their 5%" into something you can act on: "they go 4 times a month, you go 9".
Also returns the peers' most popular shops in that category (dataset names).
"""

import pandas as pd

from deez_bugs.db import connect
from deez_bugs.ml.model import LABELS, get_model

WINDOW_DAYS = 90
MONTHS = WINDOW_DAYS / 30.44


def _habits(df: pd.DataFrame) -> dict:
    """visits a month, average per visit, money a month, for one person's purchases in a category."""
    visits = len(df) / MONTHS
    per_visit = float(df["amount"].mean()) if len(df) else 0.0
    return {"visits_a_month": round(visits, 1), "per_visit": round(per_visit, 2), "a_month": round(visits * per_visit, 2)}


def peer_habits(cc_num: int, category: str) -> dict:
    """You vs your peers in one category. Raises KeyError for an unknown user or category."""
    if category not in LABELS:
        raise KeyError(category)
    peers = [n["cc_num"] for n in get_model().insights(cc_num)["neighbours"]]
    people = [cc_num, *peers]
    with connect() as conn:
        rows = conn.execute(
            """WITH last AS (SELECT cc_num, MAX(ts) AS m FROM transactions
                             WHERE cc_num = ANY(%s) GROUP BY cc_num)
               SELECT t.cc_num, t.merchant, t.amount::float
               FROM transactions t JOIN last USING (cc_num)
               WHERE t.category = %s AND t.is_fraud IS NOT TRUE
                 AND t.ts > last.m - make_interval(days => %s)""",
            (people, category, WINDOW_DAYS),
        ).fetchall()
    df = pd.DataFrame(rows, columns=["cc_num", "merchant", "amount"])
    you = _habits(df[df.cc_num == cc_num])
    each = pd.DataFrame([_habits(df[df.cc_num == p]) for p in peers])
    them = {k: round(float(each[k].median()), 2) for k in each.columns}
    peer_rows = df[df.cc_num != cc_num]
    shops = (peer_rows.groupby("merchant")["cc_num"].nunique().sort_values(ascending=False).head(3))
    return {
        "cc_num": cc_num,
        "category": category,
        "label": LABELS[category],
        "peers": len(peers),
        "window_days": WINDOW_DAYS,
        "you": you,
        "peers_median": them,
        "peer_shops": [{"merchant": m, "peers": int(n)} for m, n in shops.items()],
    }
