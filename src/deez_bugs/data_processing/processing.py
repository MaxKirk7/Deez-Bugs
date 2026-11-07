"""Parsing, categorisation, and summary calculations for uploaded statements."""

from __future__ import annotations

from io import BytesIO

import pandas as pd

KAGGLE_TO_APP_CATEGORY = {
    "grocery_pos": "groceries",
    "grocery_net": "groceries",
    "food_dining": "eating_out",
    "gas_transport": "transport",
    "shopping_pos": "shopping",
    "shopping_net": "shopping",
    "misc_net": "other",
    "misc_pos": "other",
    "travel": "travel",
    "entertainment": "entertainment",
    "personal_care": "personal_care",
    "health_fitness": "health",
    "kids_pets": "other",
    "home": "other",
}

REQUIRED_COLUMNS = {
    "merchant",
    "category",
    "amt",
    "trans_date_trans_time",
    "cc_num",
}

_COLUMN_ALIASES = {
    "date": "trans_date_trans_time",
    "transaction_date": "trans_date_trans_time",
    "timestamp": "trans_date_trans_time",
    "description": "merchant",
    "transaction_description": "merchant",
    "merchant_name": "merchant",
    "amount": "amt",
    "value": "amt",
    "debit": "amt",
    "user_id": "cc_num",
}


def normalize_transactions(frame: pd.DataFrame) -> pd.DataFrame:
    """Map common bank-statement columns to the canonical input schema."""
    normalized = frame.copy()
    normalized.columns = [
        str(column).strip().lower().replace(" ", "_")
        for column in normalized.columns
    ]
    normalized = normalized.rename(
        columns={
            column: target
            for column, target in _COLUMN_ALIASES.items()
            if column in normalized.columns and target not in normalized.columns
        }
    )
    if "cc_num" not in normalized:
        normalized["cc_num"] = "uploaded_user"
    if "category" not in normalized:
        normalized["category"] = "other"
    return normalized


def _json_records(frame: pd.DataFrame) -> list[dict]:
    """Convert a frame to JSON-safe records while retaining all columns."""
    records = frame.copy()
    for column in records.select_dtypes(include=["datetime", "datetimetz"]).columns:
        records[column] = records[column].dt.strftime("%Y-%m-%dT%H:%M:%S%z")
    return records.where(records.notna(), None).to_dict(orient="records")


def process_csv(contents: bytes) -> dict:
    """Process an uploaded CSV without persisting it anywhere.

    The original columns are retained in ``transactions``. Derived columns are
    added alongside them so the dashboard and model pipeline can use the same
    processed data without committing to a final feature list yet.
    """
    frame = normalize_transactions(pd.read_csv(BytesIO(contents)))
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
    if frame.empty:
        raise ValueError("The uploaded CSV is empty.")

    frame["date"] = pd.to_datetime(frame["trans_date_trans_time"], errors="raise")
    frame["amount"] = pd.to_numeric(frame["amt"], errors="raise").abs()
    frame["app_category"] = (
        frame["category"].map(KAGGLE_TO_APP_CATEGORY).fillna("other")
    )
    frame["month"] = frame["date"].dt.to_period("M").astype(str)
    frame["day_of_week"] = frame["date"].dt.day_name()
    frame["day_of_week_number"] = frame["date"].dt.day_of_week
    frame["hour"] = frame["date"].dt.hour
    frame["is_weekend"] = frame["date"].dt.day_of_week >= 5

    if {"merch_lat", "merch_long"} <= set(frame.columns):
        frame["merchant_latitude"] = pd.to_numeric(frame["merch_lat"], errors="coerce")
        frame["merchant_longitude"] = pd.to_numeric(frame["merch_long"], errors="coerce")
    if {"lat", "long", "merch_lat", "merch_long"} <= set(frame.columns):
        frame["distance_from_home_km"] = _distance_in_km(
            frame["lat"],
            frame["long"],
            frame["merch_lat"],
            frame["merch_long"],
        )

    by_category = (
        frame.groupby("app_category", as_index=False)["amount"]
        .agg(total="sum", transaction_count="count")
        .sort_values("total", ascending=False)
    )
    by_month = (
        frame.groupby("month", as_index=False)["amount"]
        .agg(total="sum", transaction_count="count")
        .sort_values("month")
    )
    by_hour = (
        frame.groupby("hour", as_index=False)["amount"]
        .agg(total="sum", transaction_count="count")
        .sort_values("hour")
    )
    location_columns = [
        column
        for column in ("merchant_latitude", "merchant_longitude")
        if column in frame
    ]
    if {"merchant_latitude", "merchant_longitude"} <= set(frame.columns):
        spend_locations = (
            frame.dropna(subset=["merchant_latitude", "merchant_longitude"])
            .groupby(
                ["merchant_latitude", "merchant_longitude", "merchant"],
                as_index=False,
            )
            .agg(total=("amount", "sum"), transaction_count=("amount", "count"))
            .sort_values("total", ascending=False)
        )
    else:
        spend_locations = pd.DataFrame(
            columns=[
                "merchant_latitude",
                "merchant_longitude",
                "merchant",
                "total",
                "transaction_count",
            ]
        )
    candidate_feature_columns = [
        column
        for column in (
            "amount",
            "app_category",
            "hour",
            "day_of_week_number",
            "is_weekend",
            "merchant_latitude",
            "merchant_longitude",
            "distance_from_home_km",
        )
        if column in frame
    ]

    return {
        "transaction_count": len(frame),
        "user_count": int(frame["cc_num"].nunique()),
        "total_spend": round(float(frame["amount"].sum()), 2),
        "average_transaction": round(float(frame["amount"].mean()), 2),
        "largest_transaction": _json_records(
            frame.nlargest(1, "amount")
        )[0],
        "by_category": by_category.to_dict(orient="records"),
        "by_month": by_month.to_dict(orient="records"),
        "by_hour": by_hour.to_dict(orient="records"),
        "location": {
            "transaction_locations": _json_records(frame[location_columns].drop_duplicates())
            if location_columns
            else [],
            "spend_locations": _json_records(spend_locations),
            "unique_location_count": int(frame[location_columns].drop_duplicates().shape[0])
            if location_columns
            else 0,
        },
        "transactions": _json_records(frame),
        "model_input": {
            "status": "candidate_features",
            "feature_columns": candidate_feature_columns,
            "rows": _json_records(frame[candidate_feature_columns]),
        },
        "model": {
            "status": "not_implemented",
            "financial_score": None,
            "recommendations": [],
        },
    }


def _distance_in_km(
    latitude_a: pd.Series,
    longitude_a: pd.Series,
    latitude_b: pd.Series,
    longitude_b: pd.Series,
) -> pd.Series:
    """Calculate great-circle distance between two latitude/longitude pairs."""
    from math import radians

    from numpy import arccos, cos, sin

    lat_a = latitude_a.map(radians)
    lat_b = latitude_b.map(radians)
    delta_longitude = longitude_b.map(radians) - longitude_a.map(radians)
    cosine = (sin(lat_a) * sin(lat_b)) + (
        cos(lat_a) * cos(lat_b) * delta_longitude.map(cos)
    )
    return arccos(cosine.clip(-1, 1)) * 6371
