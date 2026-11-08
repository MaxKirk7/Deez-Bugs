import io
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from functools import lru_cache

import pandas as pd
import uvicorn
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, Query, Response, UploadFile
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

# Shared DB code: reads DATABASE_URL from .env. See src/deez_bugs/db/.
from deez_bugs.db import UPLOAD_COLUMNS, category_shares, delete_upload, save_upload
from deez_bugs.db.places import user_places

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

router = APIRouter(tags=["Data Upload"])


class AssistantProfile(BaseModel):
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    total_spend: float = Field(ge=0)
    monthly_spend: dict[str, float] = Field(default_factory=dict)
    category_spend: dict[str, float] = Field(default_factory=dict)
    recommendations: list[dict[str, object]] = Field(default_factory=list, max_length=3)


class AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=200)
    profile: AssistantProfile


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


def _distance_km(lat1: float, long1: float, lat2: float, long2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    lat_delta = radians(lat2 - lat1)
    long_delta = radians(long2 - long1)
    haversine = sin(lat_delta / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(long_delta / 2) ** 2
    return 2 * 6371 * asin(sqrt(haversine))


@lru_cache(maxsize=128)
def _nearby_places_cached(lat: float, long: float, radius_km: float) -> list[dict[str, object]]:
    from math import cos, radians

    lat_delta = radius_km / 111
    long_delta = radius_km / (111 * max(0.1, abs(cos(radians(lat)))))
    south, north = lat - lat_delta, lat + lat_delta
    west, east = long - long_delta, long + long_delta
    query = (
        '[out:json][timeout:15];'
        f'(nwr["amenity"~"restaurant|bar|pub|nightclub"]({south},{west},{north},{east});'
        f'nwr["shop"~"supermarket|grocery|convenience"]({south},{west},{north},{east}););'
        'out center tags qt;'
    )
    last_error: Exception | None = None
    for endpoint in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        request = Request(f"{endpoint}?data={quote(query)}", headers={"User-Agent": "Deez-Bugs/1.0"})
        try:
            with urlopen(request, timeout=18) as response:
                body = json.loads(response.read())
            break
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
    else:
        raise HTTPException(status_code=502, detail="Nearby places provider is unavailable.") from last_error

    results = []
    for element in body.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")
        element_lat = element.get("lat", element.get("center", {}).get("lat"))
        element_long = element.get("lon", element.get("center", {}).get("lon"))
        if not name or element_lat is None or element_long is None:
            continue
        distance = _distance_km(lat, long, element_lat, element_long)
        if distance > radius_km:
            continue
        raw_category = tags.get("amenity") or tags.get("shop") or "place"
        category = "Grocery" if raw_category in {"supermarket", "grocery", "convenience"} else raw_category.replace("_", " ").title()
        results.append({"id": f"{element.get('type')}-{element.get('id')}", "name": name, "category": category, "lat": element_lat, "long": element_long, "distance": distance})
    results.sort(key=lambda place: place["distance"])
    return results


@router.get("/nearby-places")
def nearby_places(
    lat: float = Query(ge=-90, le=90),
    long: float = Query(ge=-180, le=180),
    radius_km: float = Query(default=2.5, gt=0, le=10),
    limit: int = Query(default=20, gt=0, le=20),
):
    """Find named restaurants, bars, clubs and grocery stores near a pin."""
    return _nearby_places_cached(round(lat, 4), round(long, 4), radius_km)[:limit]


@router.post("/assistant/speech")
def assistant_speech(request: SpeechRequest):
    """Convert the saved assistant answer to audio without exposing the ElevenLabs key."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ELEVENLABS_API_KEY is not configured on the backend.",
        )

    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    payload = json.dumps(
        {
            "text": request.text,
            "model_id": os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "speed": 0.9,
                "style": 0.2,
            },
        }
    ).encode()
    eleven_request = Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        data=payload,
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    try:
        with urlopen(eleven_request, timeout=30) as eleven_response:
            audio = eleven_response.read()
    except HTTPError as exc:
        provider_detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs request failed ({exc.code}): {provider_detail}",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=502, detail=f"ElevenLabs connection failed: {exc.reason}"
        ) from exc
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/assistant/answer")
def assistant_answer(request: AssistantRequest):
    """Generate a speech answer and a separate display-ready bullet summary."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503, detail="OPENAI_API_KEY is not configured on the backend."
        )

    client = OpenAI(api_key=api_key)
    answer_instructions = (
        "You are Penny, a careful personal finance assistant. Answer using only the supplied "
        "aggregated spending profile. Do not invent transactions, merchants, income, or facts. "
        "Use the user's currency. Always say the amount first and the currency word immediately "
        "after it (for example, '42 dollars' or '42 pounds') rather than reading a bare number. "
        "Give a concise, friendly answer in plain text, with specific "
        "figures where supported. Do not provide regulated financial advice. If the profile does "
        "not contain enough information, say so clearly."
    )
    prompt = (
        f"User currency: {request.profile.currency}. Say monetary amounts as "
        f"'number {'pounds' if request.profile.currency == 'GBP' else 'dollars'}'.\n"
        f"User question: {request.question}\n"
        f"Aggregated profile:\n{request.profile.model_dump_json()}"
    )
    try:
        answer_response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.3,
            max_tokens=300,
            messages=[
                {"role": "system", "content": answer_instructions},
                {"role": "user", "content": prompt},
            ],
        )
        answer = answer_response.choices[0].message.content
        if not answer:
            raise HTTPException(
                status_code=502, detail="Assistant provider returned an empty answer."
            )

        summary_response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0,
            max_tokens=300,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Convert the supplied assistant answer into a concise bullet-point summary. "
                        "Return only bullet points, one per line, each beginning with '- '. "
                        "Use 2 to 5 bullets. Preserve every important figure and claim exactly. "
                        f"For display, write monetary amounts with the {'£' if request.profile.currency == 'GBP' else '$'} "
                        "symbol before the number, not the currency word after it. "
                        "Do not use bold, asterisks, headings, markdown fences, or commentary."
                    ),
                },
                {"role": "user", "content": answer},
            ],
        )
        summary = summary_response.choices[0].message.content
    except OpenAIError as exc:
        raise HTTPException(
            status_code=502, detail=f"Assistant provider request failed: {exc}"
        ) from exc

    if not summary:
        raise HTTPException(
            status_code=502, detail="Assistant provider returned an empty summary."
        )
    return {"answer": answer.strip(), "summary": summary.strip()}


@router.post("/upload-csv/")
async def upload_csv(file: UploadFile = File(...)):
    """
    Accepts a bank-statement CSV with the columns trans_date_trans_time, merchant,
    category, amt (optional: merch_lat, merch_long for where each purchase happened).
    Checks every row, then stores it as a new user in the shared
    `transactions` table (next to the 908 reference users).
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Must be a CSV file."
        )

    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")

    try:
        result = save_upload(df)  # checks columns + categories, then stores
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {ve}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insertion failed: {e}")

    return {
        "filename": file.filename,
        "cc_num": result[
            "cc_num"
        ],  # this user's ID: use it for /users/{cc_num}/categories
        "rows_inserted": result["rows"],
        "required_columns": UPLOAD_COLUMNS,
    }


@router.get("/users/{cc_num}/categories")
def user_categories(cc_num: int):
    """This user's % of spending per category, next to the reference users' average."""
    shares = category_shares(cc_num)
    if not any(s["your_share"] for s in shares):
        raise HTTPException(
            status_code=404, detail=f"No transactions for cc_num {cc_num}"
        )
    return {"cc_num": cc_num, "categories": shares}


@router.get("/users/{cc_num}/places")
def user_places_map(cc_num: int):
    """Return home and grouped spending locations for the map."""
    try:
        return user_places(cc_num)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No user with cc_num {cc_num}")


@router.delete("/users/{cc_num}")
def delete_user(cc_num: int):
    """Delete my data: removes an uploaded user and all their transactions (not reference users)."""
    if not delete_upload(cc_num):
        raise HTTPException(
            status_code=404, detail=f"No uploaded user with cc_num {cc_num}"
        )
    return {"cc_num": cc_num, "deleted": True}


@router.get("/users/{cc_num}/insights")
def user_insights(cc_num: int):
    """Group (k-means), 20 most similar users (KNN), recommendations and score for one user."""
    from deez_bugs.ml.model import (
        get_model,  # trains on first call (~10 s), then cached
    )

    try:
        return get_model().insights(cc_num)
    except KeyError:
        raise HTTPException(
            status_code=404, detail=f"No transactions for cc_num {cc_num}"
        )


# Create the app AFTER the routes above are defined: include_router copies the
# routes that exist at that moment.
app = FastAPI()
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("deez_bugs.api.api:app", host="127.0.0.1", port=8000, reload=True)
