"""Feature engineering shared by Kaggle training and uploaded CSV scoring."""

from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "transaction_count",
    "total_spend",
    "average_spend",
    "median_spend",
    "spend_std",
    "max_spend",
    "active_days",
    "weekend_share",
    "night_share",
    "mean_hour",
    "hour_range",
    "mean_distance_km",
    "max_distance_km",
    "user_age",
    "city_population",
    *[f"category_share_{category}" for category in (
        "food_dining", "gas_transport", "shopping_net", "shopping_pos",
        "grocery_net", "grocery_pos", "misc_net", "misc_pos", "travel",
        "personal_care", "entertainment", "kids_pets", "home",
        "health_fitness",
    )],
]


def _distance_km(frame: pd.DataFrame) -> pd.Series:
    lat1 = np.radians(pd.to_numeric(frame["lat"], errors="coerce"))
    lon1 = np.radians(pd.to_numeric(frame["long"], errors="coerce"))
    lat2 = np.radians(pd.to_numeric(frame["merch_lat"], errors="coerce"))
    lon2 = np.radians(pd.to_numeric(frame["merch_long"], errors="coerce"))
    cosine = (
        np.sin(lat1) * np.sin(lat2)
        + np.cos(lat1) * np.cos(lat2) * np.cos(lon2 - lon1)
    )
    return np.degrees(np.arccos(cosine.clip(-1, 1))) * 111.195


def build_user_features(transactions: pd.DataFrame) -> pd.DataFrame:
    """Create one feature row per ``cc_num`` using Kaggle-compatible columns."""
    frame = transactions.copy()
    frame["date"] = pd.to_datetime(frame["trans_date_trans_time"], errors="raise")
    frame["amount"] = pd.to_numeric(frame["amt"], errors="raise").abs()
    frame["hour"] = frame["date"].dt.hour
    frame["is_weekend"] = frame["date"].dt.day_of_week >= 5
    frame["is_night"] = (frame["hour"] < 6) | (frame["hour"] >= 22)
    frame["distance_km"] = (
        _distance_km(frame)
        if {"lat", "long", "merch_lat", "merch_long"} <= set(frame.columns)
        else np.nan
    )
    if "dob" in frame:
        dob = pd.to_datetime(frame["dob"], errors="coerce")
        frame["age"] = (frame["date"] - dob).dt.days / 365.25
    else:
        frame["age"] = np.nan

    grouped = frame.groupby("cc_num", sort=False)
    result = grouped["amount"].agg(
        transaction_count="count",
        total_spend="sum",
        average_spend="mean",
        median_spend="median",
        spend_std="std",
        max_spend="max",
    )
    result["active_days"] = grouped["date"].apply(lambda values: values.dt.date.nunique())
    result["weekend_share"] = grouped["is_weekend"].mean()
    result["night_share"] = grouped["is_night"].mean()
    result["mean_hour"] = grouped["hour"].mean()
    result["hour_range"] = grouped["hour"].max() - grouped["hour"].min()
    result["mean_distance_km"] = grouped["distance_km"].mean()
    result["max_distance_km"] = grouped["distance_km"].max()
    result["user_age"] = grouped["age"].median()
    result["city_population"] = (
        grouped["city_pop"].first() if "city_pop" in frame else np.nan
    )

    categories = frame["category"].astype(str)
    for category in FEATURE_COLUMNS:
        if not category.startswith("category_share_"):
            continue
        name = category.removeprefix("category_share_")
        result[category] = (categories == name).groupby(frame["cc_num"]).mean()

    return result.reindex(columns=FEATURE_COLUMNS).replace([np.inf, -np.inf], np.nan)
