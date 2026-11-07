"""Training and inference for spending segments and merchant recommendations."""

from __future__ import annotations

from dataclasses import dataclass
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

from .features import build_user_features


@dataclass
class SpendingProfileModel:
    """Reference customer population used to analyse uploaded statements."""

    scaler: StandardScaler
    clusterer: KMeans
    medians: pd.Series
    reference_features: pd.DataFrame
    reference_categories: pd.DataFrame
    reference_merchants: dict[object, dict[str, dict[str, set[str]]]]
    cluster_sizes: dict[int, int]


def _filled_features(
    features: pd.DataFrame,
    medians: pd.Series | None = None,
) -> tuple[pd.DataFrame, pd.Series]:
    """Fill unavailable optional fields consistently for train and inference."""
    medians = features.median() if medians is None else medians
    return features.fillna(medians).fillna(0), medians


def _user_lookup(frame: pd.DataFrame, column: str) -> dict[object, set[str]]:
    """Build a user-to-values lookup for collaborative filtering."""
    return {
        user: set(values.dropna().astype(str))
        for user, values in frame.groupby("cc_num")[column]
    }


def _merchant_categories(frame: pd.DataFrame) -> dict[str, set[str]]:
    return {
        merchant: set(values.astype(str))
        for merchant, values in frame.groupby("merchant")["category"]
    }


def _read_training_csv(path: str | Path | pd.DataFrame) -> pd.DataFrame:
    """Read Kaggle CSVs with or without their exported row-number column."""
    frame = path.copy() if isinstance(path, pd.DataFrame) else pd.read_csv(path)
    first_column = frame.columns[0]
    if str(first_column).lower().startswith("unnamed"):
        frame = frame.drop(columns=[first_column])
    return frame


def train_spending_profile_model(
    train_csv: str | Path | pd.DataFrame,
    *,
    n_clusters: int = 8,
    random_state: int = 42,
) -> SpendingProfileModel:
    """Train segmentation and recommendation indexes without using ``is_fraud``."""
    frame = _read_training_csv(train_csv)
    if frame.empty:
        raise ValueError("Training CSV is empty")
    if n_clusters < 2:
        raise ValueError("n_clusters must be at least 2")

    features = build_user_features(frame)
    filled, medians = _filled_features(features)
    scaler = StandardScaler()
    scaled = scaler.fit_transform(filled)
    cluster_count = min(n_clusters, len(filled))
    clusterer = KMeans(
        n_clusters=cluster_count,
        n_init=10,
        random_state=random_state,
    )
    labels = clusterer.fit_predict(scaled)

    reference_features = pd.DataFrame(scaled, index=features.index)
    reference_features["cluster"] = labels
    reference_categories = (
        pd.crosstab(frame["cc_num"], frame["category"], normalize="index")
        .reindex(features.index, fill_value=0)
        .fillna(0)
    )
    reference_merchants = {}
    for user, user_frame in frame.groupby("cc_num"):
        reference_merchants[user] = {
            "merchants": _user_lookup(user_frame, "merchant").get(user, set()),
            "merchant_categories": _merchant_categories(user_frame),
        }

    return SpendingProfileModel(
        scaler=scaler,
        clusterer=clusterer,
        medians=medians,
        reference_features=reference_features,
        reference_categories=reference_categories,
        reference_merchants=reference_merchants,
        cluster_sizes=pd.Series(labels).value_counts().sort_index().to_dict(),
    )


def save_spending_profile_model(
    model: SpendingProfileModel,
    path: str | Path,
) -> None:
    """Save a trained model atomically to a local pickle file."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    with temporary.open("wb") as file:
        pickle.dump(model, file)
    temporary.replace(destination)


def load_spending_profile_model(path: str | Path) -> SpendingProfileModel:
    """Load a persisted spending profile model."""
    with Path(path).open("rb") as file:
        model = pickle.load(file)
    if isinstance(model, SpendingProfileModel):
        for values in model.reference_merchants.values():
            if "merchant_categories" not in values and "categories" in values:
                values["merchant_categories"] = {
                    merchant: set(values["categories"])
                    for merchant in values.get("merchants", set())
                }
    required_attributes = (
        "scaler",
        "clusterer",
        "medians",
        "reference_features",
        "reference_merchants",
        "cluster_sizes",
    )
    if not isinstance(model, SpendingProfileModel) or not all(
        hasattr(model, attribute) for attribute in required_attributes
    ):
        raise ValueError(
            f"{path} is an incompatible model; retrain it with data/train_model.py"
        )
    return model


def load_or_train_spending_profile_model(
    train_csv: str | Path,
    model_path: str | Path,
    *,
    n_clusters: int = 8,
) -> SpendingProfileModel:
    """Load a persisted model, training and saving it only when absent."""
    path = Path(model_path)
    if path.exists():
        return load_spending_profile_model(path)
    model = train_spending_profile_model(train_csv, n_clusters=n_clusters)
    save_spending_profile_model(model, path)
    return model


def _recommendations(
    model: SpendingProfileModel,
    similar_users: pd.DataFrame,
    uploaded_merchants: set[str],
    uploaded_categories: set[str],
    limit: int,
) -> list[dict]:
    """Rank merchants used by similar users but absent from the upload."""
    candidates: dict[str, dict[str, float | int | set[str]]] = {}
    for row in similar_users.itertuples(index=False):
        for merchant in model.reference_merchants.get(row.user_id, {}).get(
            "merchants", set()
        ):
            if merchant in uploaded_merchants:
                continue
            merchant_categories = model.reference_merchants[row.user_id][
                "merchant_categories"
            ].get(merchant, set())
            if uploaded_categories and not merchant_categories.intersection(
                uploaded_categories
            ):
                continue
            entry = candidates.setdefault(
                merchant,
                {"score": 0.0, "similar_users": 0, "categories": set()},
            )
            entry["score"] += float(row.similarity)
            entry["similar_users"] += 1
            entry["categories"].update(merchant_categories)

    ranked = sorted(
        candidates.items(),
        key=lambda item: (float(item[1]["score"]), int(item[1]["similar_users"])),
        reverse=True,
    )
    recommendations = []
    for merchant, values in ranked[:limit]:
        categories = sorted(set(values["categories"]) & uploaded_categories)
        recommendations.append({
            "merchant": merchant,
            "score": round(float(values["score"]), 4),
            "similar_users": int(values["similar_users"]),
            "category": categories[0] if categories else None,
        })
    return recommendations


def analyse_uploaded_transactions(
    model: SpendingProfileModel,
    transactions: pd.DataFrame,
    *,
    similar_limit: int = 5,
    recommendation_limit: int = 10,
) -> dict:
    """Segment uploaded users, find similar customers, and recommend merchants."""
    features = build_user_features(transactions)
    filled, _ = _filled_features(features, model.medians)
    scaled = model.scaler.transform(filled)
    clusters = model.clusterer.predict(scaled)
    similarities = cosine_similarity(scaled, model.reference_features.drop(columns="cluster"))

    category_sets = _user_lookup(transactions, "category")
    merchant_sets = _user_lookup(transactions, "merchant")
    results = []
    for row_number, user_id in enumerate(features.index):
        reference_order = np.argsort(similarities[row_number])[::-1]
        top_order = reference_order[:similar_limit]
        similar_users = pd.DataFrame({
            "user_id": model.reference_features.index[top_order],
            "similarity": similarities[row_number, top_order],
        })
        similar_users["similarity"] = similar_users["similarity"].round(4)
        recommendations = _recommendations(
            model,
            similar_users,
            merchant_sets.get(user_id, set()),
            category_sets.get(user_id, set()),
            recommendation_limit,
        )
        results.append({
            "user_id": user_id,
            "segment": int(clusters[row_number]),
            "segment_size": model.cluster_sizes[int(clusters[row_number])],
            "similar_users": similar_users.to_dict(orient="records"),
            "recommendations": recommendations,
        })
    return {"status": "scored", "users": results}


# Compatibility aliases for existing callers.
score_user_transactions = analyse_uploaded_transactions
train_user_risk_model = train_spending_profile_model
