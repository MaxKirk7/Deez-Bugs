"""Train and test the model.  Run:  uv run python -m deez_bugs.ml.train

Prints:
  1. How many groups fit the data best (silhouette score for 3-9 groups)
  2. Whether the 6 groups are stable (same groups with different random starts)
  3. What each of the 6 groups looks like
  4. Whether neighbours really are "people like you": do they predict a user's
     NEXT 3 months of spending better than simple guesses?
  5. An example result for one user
"""

import json

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

from deez_bugs.db import CATEGORIES, connect
from deez_bugs.ml.model import LABELS, N_NEIGHBOURS, N_SEGMENTS, SEED, SpendingModel, get_model


def split_spend() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Each reference user's spend per category: first 9 months (early) vs last 3 months (late)."""
    with connect() as conn:
        rows = conn.execute(
            """WITH cut AS (
                   SELECT t.cc_num, MAX(t.ts) - INTERVAL '3 months' AS at
                   FROM transactions t JOIN users u USING (cc_num)
                   WHERE u.source = 'reference' GROUP BY t.cc_num)
               SELECT t.cc_num, t.category, t.ts > cut.at AS late, SUM(t.amount)::float
               FROM transactions t JOIN cut USING (cc_num)
               GROUP BY 1, 2, 3"""
        ).fetchall()
    df = pd.DataFrame(rows, columns=["cc_num", "category", "late", "spend"])
    out = []
    for late in (False, True):
        part = df[df.late == late].pivot_table(index="cc_num", columns="category", values="spend", fill_value=0.0)
        part = part.reindex(columns=CATEGORIES, fill_value=0.0)
        out.append(part.div(part.sum(axis=1), axis=0))
    early, late = out
    users = early.index.intersection(late.index)
    return early.loc[users], late.loc[users]


def main() -> None:
    model = get_model()
    X, n = model.X, len(model.X)
    print(f"Trained on {n} reference users, {len(CATEGORIES)} category shares each.\n")

    print("1. How many groups? (silhouette: higher = clearer groups)")
    for k in range(3, 10):
        labels = KMeans(k, n_init=10, random_state=SEED).fit_predict(X)
        print(f"   {k} groups: {silhouette_score(X, labels):.3f}{'   <- we use this' if k == N_SEGMENTS else ''}")

    ari = [adjusted_rand_score(model.kmeans.labels_, KMeans(N_SEGMENTS, n_init=10, random_state=s).fit_predict(X))
           for s in range(1, 6)]
    print(f"\n2. Stability: same groups with 5 other random starts? ARI = {np.mean(ari):.2f} (1.0 = identical)")

    print("\n3. The groups (average % of spending, top 3 categories):")
    for seg, profile in model.profiles.iterrows():
        top = ", ".join(f"{LABELS[c]} {v:.0%}" for c, v in profile.sort_values(ascending=False).head(3).items())
        size = int((model.segment_of == seg).sum())
        spend = model.monthly[model.segment_of == seg].median()
        print(f"   {seg}. {model.names[seg]:<55} {size:>4} users, median {spend:>6,.0f}/month | {top}")

    print("\n4. Do neighbours predict the future? (predict each user's last-3-month mix from")
    print("   their first 9 months; error = average % points off per category, lower = better)")
    early, late = split_spend()
    m = SpendingModel().fit(early, pd.Series(1.0, index=early.index))
    population = early.mean()
    err = {"everyone's average": [], "own group's average": [], f"{N_NEIGHBOURS} nearest neighbours": [],
           f"{N_NEIGHBOURS} random users": []}
    rng = np.random.default_rng(SEED)
    for cc in early.index:
        truth = late.loc[cc]
        nb = m.neighbours(early.loc[cc], exclude=cc)
        rand = rng.choice(early.index[early.index != cc], N_NEIGHBOURS, replace=False)
        guesses = {
            "everyone's average": population,
            "own group's average": m.profiles.loc[m.segment_of[cc]],
            f"{N_NEIGHBOURS} nearest neighbours": early.loc[nb.cc_num].mean(),
            f"{N_NEIGHBOURS} random users": early.loc[rand].mean(),
        }
        for name, guess in guesses.items():
            err[name].append((guess - truth).abs().mean() * 100)
    base = np.mean(err["everyone's average"])
    for name, e in err.items():
        print(f"   {name:<26} {np.mean(e):.2f} pts   ({(1 - np.mean(e) / base):+.0%} vs everyone's average)")

    scores = {cc: model.compare(model.shares.loc[cc], model.monthly[cc], exclude=cc)["score"] for cc in model.shares.index}
    s = pd.Series(scores)
    print(f"\n   Scores across the 908 users: median {s.median():.0f}, lowest {s.min()}, highest {s.max()}; "
          f"{(s < 900).sum()} users score below 900")
    example = int(s.idxmin())          # the user who differs most from people like them
    result = model.insights(example)
    print(f"\n5. Example: user {example} (the one most different from their neighbours)")
    print(json.dumps({k: result[k] for k in ("segment", "score", "monthly_spend", "recommendations")}, indent=2))
    print(f"   nearest neighbours: {[r['cc_num'] for r in result['neighbours'][:5]]} ...")


if __name__ == "__main__":
    main()
