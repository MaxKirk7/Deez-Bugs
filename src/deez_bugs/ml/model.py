"""K-means groups + KNN neighbours + collaborative-filtering recommendations.

    from deez_bugs.ml.model import get_model
    get_model().insights(cc_num)        # works for reference users AND uploaded users

How it works (details in HOW_IT_WORKS.md):
  1. Each user = 14 numbers: % of their spending per category.
  2. Standardise them, so small categories count as much as big ones.
  3. K-means splits the 908 reference users into 6 groups of similar spenders.
  4. KNN finds each user's 20 most similar reference users.
  5. Collaborative filtering: compare the user with those 20. Categories where the
     user spends a bigger share than people like them become recommendations.
"""

import threading

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from deez_bugs.db import CATEGORIES
from deez_bugs.ml.features import load_spend, monthly_spend, to_shares

LABELS = {
    "grocery_pos": "Groceries (in store)", "grocery_net": "Groceries (online)",
    "food_dining": "Eating out", "gas_transport": "Fuel & transport",
    "shopping_pos": "Shopping (in store)", "shopping_net": "Shopping (online)",
    "home": "Home", "kids_pets": "Kids & pets", "entertainment": "Entertainment",
    "personal_care": "Personal care", "health_fitness": "Health & fitness",
    "travel": "Travel", "misc_pos": "Other (in store)", "misc_net": "Other (online)",
}
N_SEGMENTS = 6
N_NEIGHBOURS = 20
MIN_GAP = 0.03          # only recommend if you're 3+ percentage points above your neighbours
SEED = 42
SCORE_MAX = 999         # same scale as a UK credit score (Experian)


class SpendingModel:
    def fit(self, shares: pd.DataFrame, monthly: pd.Series) -> "SpendingModel":
        """Learn the groups and the neighbour index from the reference users."""
        self.shares = shares[CATEGORIES]
        self.monthly = monthly
        self.scaler = StandardScaler().fit(self.shares)
        self.X = self.scaler.transform(self.shares)
        self.kmeans = KMeans(N_SEGMENTS, n_init=10, random_state=SEED).fit(self.X)
        self.segment_of = pd.Series(self.kmeans.labels_, index=self.shares.index)
        self.knn = NearestNeighbors().fit(self.X)
        # Each segment's average % per category, and a readable name for it.
        self.profiles = self.shares.groupby(self.segment_of).mean()
        overall = self.shares.mean()
        self.names = {}
        for seg, profile in self.profiles.iterrows():
            top = (profile / overall).sort_values(ascending=False).index[:2]
            self.names[seg] = f"More than most on {LABELS[top[0]]} & {LABELS[top[1]]}"
        return self

    # ---- single user -------------------------------------------------------
    def _x(self, share_row: pd.Series) -> np.ndarray:
        return self.scaler.transform(share_row[CATEGORIES].to_frame().T)

    def segment(self, share_row: pd.Series) -> int:
        """Which of the 6 groups this user is closest to."""
        return int(self.kmeans.predict(self._x(share_row))[0])

    def neighbours(self, share_row: pd.Series, exclude: int | None = None, k: int = N_NEIGHBOURS) -> pd.DataFrame:
        """The k most similar reference users (never the user themselves)."""
        dist, idx = self.knn.kneighbors(self._x(share_row), n_neighbors=k + 1)
        nb = pd.DataFrame({"cc_num": self.shares.index[idx[0]], "distance": dist[0]})
        nb = nb[nb.cc_num != exclude].head(k)
        nb["similarity"] = 1 / (1 + nb.distance)          # 1 = identical, -> 0 = very different
        return nb.reset_index(drop=True)

    def compare(self, share_row: pd.Series, monthly: float, exclude: int | None = None) -> dict:
        """Segment, neighbours, category comparison, recommendations and a score for one user."""
        seg = self.segment(share_row)
        nb = self.neighbours(share_row, exclude)
        nb_share = self.shares.loc[nb.cc_num].mean()                 # what people like you do
        gap = share_row[CATEGORIES] - nb_share                       # + = you spend a bigger share

        categories = [
            {"category": c, "label": LABELS[c], "your_share": round(float(share_row[c]), 4),
             "neighbours_share": round(float(nb_share[c]), 4),
             "segment_share": round(float(self.profiles.loc[seg, c]), 4)}
            for c in gap.sort_values(ascending=False).index
        ]
        recommendations = [
            {"category": c, "label": LABELS[c],
             "your_share": round(float(share_row[c]), 4), "neighbours_share": round(float(nb_share[c]), 4),
             "est_monthly_saving": round(float(monthly * gap[c]), 2),
             "message": (f"You spend {share_row[c]:.0%} of your money on {LABELS[c]}; "
                         f"your {len(nb)} most similar users spend {nb_share[c]:.0%}. "
                         f"Matching them would free up about {monthly * gap[c]:,.0f} a month.")}
            for c in gap[gap > MIN_GAP].sort_values(ascending=False).index[:3]
        ]
        # Score out of 999, like a credit score: how much of your spending mix matches people like you
        # (999 = identical).
        score = round(SCORE_MAX * (1 - float(gap.clip(lower=0).sum())))
        return {
            "segment": {"id": seg, "name": self.names[seg], "size": int((self.segment_of == seg).sum())},
            "score": score,
            "monthly_spend": round(float(monthly), 2),
            "neighbours": [{"cc_num": int(r.cc_num), "similarity": round(float(r.similarity), 3)}
                           for r in nb.itertuples()],
            "categories": categories,
            "recommendations": recommendations,
        }

    def insights(self, cc_num: int) -> dict:
        """Everything for one user, reference or uploaded. Raises KeyError if unknown."""
        spend = load_spend(cc_num=cc_num)
        if spend.empty:
            raise KeyError(cc_num)
        result = self.compare(to_shares(spend).iloc[0], float(monthly_spend(spend).iloc[0]), exclude=cc_num)
        return {"cc_num": cc_num, **result}


_model: SpendingModel | None = None
_model_lock = threading.Lock()


def get_model() -> SpendingModel:
    """Train once on the reference users, then reuse (takes a few seconds).

    The lock makes requests that arrive during training wait for it, instead of
    each starting their own training run.
    """
    global _model
    with _model_lock:
        if _model is None:
            spend = load_spend("reference")
            _model = SpendingModel().fit(to_shares(spend), monthly_spend(spend))
        return _model
