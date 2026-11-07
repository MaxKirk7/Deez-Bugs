"""Where a user spends: purchases grouped into areas, for the map.

    from deez_bugs.db.places import user_places
    user_places(cc_num)   # -> home, areas (visits, spend, top shops, km from home), online count

Each purchase with a location (merch_lat / merch_long) is put into an "area": a circle
on the map. Nearby purchases share an area. The area size starts small (300 m) and
doubles until there are at most MAX_AREAS areas, so a city statement gets street-level
circles and a statement spread over a region gets town-level ones.
"""

import numpy as np
import pandas as pd

from deez_bugs.db import connect

MAX_AREAS = 20
EARTH_KM = 6371.0


def km_between(lat1, lon1, lat2, lon2):
    """Straight-line ("as the crow flies") distance in km. Works on numbers or numpy arrays."""
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_KM * np.arcsin(np.sqrt(a))


def group_into_areas(lat: np.ndarray, lon: np.ndarray, radius_km: float) -> np.ndarray:
    """Give each point an area number: a point joins the first area centre within radius_km."""
    centres: list[tuple[float, float]] = []
    labels = np.empty(len(lat), dtype=int)
    for i in range(len(lat)):
        if centres:
            c = np.asarray(centres)
            d = km_between(lat[i], lon[i], c[:, 0], c[:, 1])
            j = int(d.argmin())
            if d[j] <= radius_km:
                labels[i] = j
                continue
        centres.append((lat[i], lon[i]))
        labels[i] = len(centres) - 1
    return labels


def user_places(cc_num: int) -> dict:
    """Home + spending areas for one user. Raises KeyError if the user doesn't exist."""
    with connect() as conn:
        user = conn.execute("SELECT lat, long, city FROM users WHERE cc_num = %s", (cc_num,)).fetchone()
        if user is None:
            raise KeyError(cc_num)
        rows = conn.execute(
            """SELECT merchant, category, amount::float, merch_lat, merch_long
               FROM transactions WHERE cc_num = %s""", (cc_num,)).fetchall()

    home_lat, home_lon, city = user
    home = None if home_lat is None or home_lon is None else {"lat": home_lat, "long": home_lon, "city": city}
    df = pd.DataFrame(rows, columns=["merchant", "category", "amount", "lat", "long"])
    located = df.dropna(subset=["lat", "long"])

    areas, radius = [], 0.0
    if len(located):
        # Busiest shops first, so area centres land where people actually go most.
        located = located.assign(n=located.groupby("merchant").merchant.transform("size"))
        located = located.sort_values("n", ascending=False).reset_index(drop=True)
        lat, lon = located["lat"].to_numpy(), located["long"].to_numpy()
        radius = 0.3
        labels = group_into_areas(lat, lon, radius)
        while labels.max() + 1 > MAX_AREAS:
            radius *= 2
            labels = group_into_areas(lat, lon, radius)
        located["area"] = labels

        for area_id, g in located.groupby("area"):
            shops = g.groupby("merchant").agg(visits=("amount", "size"), spend=("amount", "sum"))
            shops = shops.sort_values("visits", ascending=False)
            centre_lat, centre_lon = float(g["lat"].mean()), float(g["long"].mean())
            areas.append({
                "id": int(area_id),
                "lat": round(centre_lat, 6),
                "long": round(centre_lon, 6),
                "visits": int(len(g)),
                "spend": round(float(g["amount"].sum()), 2),
                "top_category": str(g["category"].mode()[0]),
                "shops": [{"merchant": m, "visits": int(r.visits), "spend": round(float(r.spend), 2)}
                          for m, r in shops.head(3).iterrows()],
                "km_from_home": None if home is None else
                    round(float(km_between(home["lat"], home["long"], centre_lat, centre_lon)), 2),
            })
        areas.sort(key=lambda a: a["visits"], reverse=True)

    return {
        "cc_num": cc_num,
        "home": home,
        "areas": areas,
        "area_radius_km": radius,
        "located_purchases": int(len(located)),
        "online_purchases": int(len(df) - len(located)),   # no location: online shops, apps, ...
    }
