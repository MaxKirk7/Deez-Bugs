"""Training and inference for spending segments and merchant recommendations."""

from __future__ import annotations

from dataclasses import dataclass, field
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
    merchant_profiles: dict[str, dict[str, object]] = field(default_factory=dict)


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


def _merchant_profiles(frame: pd.DataFrame) -> dict[str, dict[str, object]]:
    profiles: dict[str, dict[str, object]] = {}
    for merchant, merchant_frame in frame.groupby("merchant"):
        profile: dict[str, object] = {
            "categories": set(merchant_frame["category"].astype(str)),
            "average_amount": float(pd.to_numeric(merchant_frame["amt"]).mean()),
        }
        if {"merch_lat", "merch_long"} <= set(merchant_frame.columns):
            profile["latitude"] = float(pd.to_numeric(merchant_frame["merch_lat"]).mean())
            profile["longitude"] = float(pd.to_numeric(merchant_frame["merch_long"]).mean())
        profiles[str(merchant)] = profile
    return profiles


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
        merchant_profiles=_merchant_profiles(frame),
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
    if not hasattr(model, "merchant_profiles"):
        model.merchant_profiles = {}
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
    user_latitude: float | None,
    user_longitude: float | None,
    category_average: dict[str, float],
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
            profile = model.merchant_profiles.get(merchant, {})
            candidate_categories = set(profile.get("categories", merchant_categories))
            matching_categories = candidate_categories.intersection(uploaded_categories)
            category = sorted(matching_categories or candidate_categories)
            category_name = category[0] if category else None
            average_amount = float(profile.get("average_amount", 0))
            cheaper_than_user = (
                category_name in category_average
                and average_amount < category_average[category_name]
            )
            estimated_savings = (
                max(category_average[category_name] - average_amount, 0)
                if category_name in category_average
                else 0
            )
            distance_km = None
            if (
                user_latitude is not None
                and user_longitude is not None
                and profile.get("latitude") is not None
                and profile.get("longitude") is not None
            ):
                distance_km = _geo_distance(
                    user_latitude,
                    user_longitude,
                    float(profile["latitude"]),
                    float(profile["longitude"]),
                )
            entry = candidates.setdefault(
                merchant,
                {
                    "score": 0.0,
                    "similar_users": 0,
                    "categories": set(),
                    "average_amount": average_amount,
                    "distance_km": distance_km,
                    "cheaper_than_user": cheaper_than_user,
                    "estimated_savings": estimated_savings,
                },
            )
            entry["score"] += float(row.similarity)
            entry["similar_users"] += 1
            entry["categories"].update(merchant_categories)

    ranked = sorted(
        candidates.items(),
        key=lambda item: (
            bool(item[1]["cheaper_than_user"]),
            int(item[1]["similar_users"]),
            float(item[1]["score"]),
            -(float(item[1]["distance_km"]) if item[1]["distance_km"] is not None else 0),
        ),
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
            "average_amount": round(float(values["average_amount"]), 2),
            "distance_km": (
                round(float(values["distance_km"]), 1)
                if values["distance_km"] is not None
                else None
            ),
            "cheaper_than_user": bool(values["cheaper_than_user"]),
            "estimated_savings": round(float(values["estimated_savings"]), 2),
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
    latitude = (
        pd.to_numeric(transactions["merch_lat"], errors="coerce")
        if "merch_lat" in transactions
        else pd.Series(np.nan, index=transactions.index)
    )
    longitude = (
        pd.to_numeric(transactions["merch_long"], errors="coerce")
        if "merch_long" in transactions
        else pd.Series(np.nan, index=transactions.index)
    )
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
            float(latitude[transactions["cc_num"] == user_id].mean())
            if latitude[transactions["cc_num"] == user_id].notna().any()
            else None,
            float(longitude[transactions["cc_num"] == user_id].mean())
            if longitude[transactions["cc_num"] == user_id].notna().any()
            else None,
            transactions[transactions["cc_num"] == user_id]
            .groupby("category")["amt"]
            .mean()
            .astype(float)
            .to_dict(),
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


def _geo_distance(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    """Return great-circle distance in kilometres."""
    lat_a, lat_b = np.radians([latitude_a, latitude_b])
    delta_longitude = np.radians(longitude_b - longitude_a)
    cosine = (
        np.sin(lat_a) * np.sin(lat_b)
        + np.cos(lat_a) * np.cos(lat_b) * np.cos(delta_longitude)
    )
    return float(np.degrees(np.arccos(np.clip(cosine, -1, 1))) * 111.195)


# Compatibility aliases for existing callers.
score_user_transactions = analyse_uploaded_transactions
train_user_risk_model = train_spending_profile_model
