from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field
import pandas as pd
import io
import os
from pathlib import Path
import uvicorn
from dotenv import load_dotenv

# Shared DB code: reads DATABASE_URL from .env. See src/deez_bugs/db/.
from deez_bugs.db import UPLOAD_COLUMNS, category_shares, delete_upload, save_upload

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


@router.post("/assistant/answer")
def assistant_answer(request: AssistantRequest):
    """Generate a speech answer and a separate display-ready bullet summary."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured on the backend.")

    client = OpenAI(api_key=api_key)
    answer_instructions = (
        "You are Penny, a careful personal finance assistant. Answer using only the supplied "
        "aggregated spending profile. Do not invent transactions, merchants, income, or facts. "
        "Use the user's currency. Give a concise, friendly answer in plain text, with specific "
        "figures where supported. Do not provide regulated financial advice. If the profile does "
        "not contain enough information, say so clearly."
    )
    prompt = f"User question: {request.question}\nAggregated profile:\n{request.profile.model_dump_json()}"
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
            raise HTTPException(status_code=502, detail="Assistant provider returned an empty answer.")

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
                        "Do not add facts, headings, markdown fences, or commentary."
                    ),
                },
                {"role": "user", "content": answer},
            ],
        )
        summary = summary_response.choices[0].message.content
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail=f"Assistant provider request failed: {exc}") from exc

    if not summary:
        raise HTTPException(status_code=502, detail="Assistant provider returned an empty summary.")
    return {"answer": answer.strip(), "summary": summary.strip()}


@router.post("/upload-csv/")
async def upload_csv(file: UploadFile = File(...)):
    """
    Accepts a bank-statement CSV with the columns trans_date_trans_time, merchant,
    category, amt (optional: merch_lat, merch_long for where each purchase happened).
    Checks every row, then stores it as a new user in the shared
    `transactions` table (next to the 908 reference users).
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be a CSV file.")

    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")

    try:
        result = save_upload(df)          # checks columns + categories, then stores
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {ve}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database insertion failed: {e}")

    return {
        "filename": file.filename,
        "cc_num": result["cc_num"],       # this user's ID: use it for /users/{cc_num}/categories
        "rows_inserted": result["rows"],
        "required_columns": UPLOAD_COLUMNS,
    }


@router.get("/users/{cc_num}/categories")
def user_categories(cc_num: int):
    """This user's % of spending per category, next to the reference users' average."""
    shares = category_shares(cc_num)
    if not any(s["your_share"] for s in shares):
        raise HTTPException(status_code=404, detail=f"No transactions for cc_num {cc_num}")
    return {"cc_num": cc_num, "categories": shares}


@router.delete("/users/{cc_num}")
def delete_user(cc_num: int):
    """Delete my data: removes an uploaded user and all their transactions (not reference users)."""
    if not delete_upload(cc_num):
        raise HTTPException(status_code=404, detail=f"No uploaded user with cc_num {cc_num}")
    return {"cc_num": cc_num, "deleted": True}


@router.get("/users/{cc_num}/insights")
def user_insights(cc_num: int):
    """Group (k-means), 20 most similar users (KNN), recommendations and score for one user."""
    from deez_bugs.ml.model import get_model     # trains on first call (~10 s), then cached
    try:
        return get_model().insights(cc_num)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No transactions for cc_num {cc_num}")


# Create the app AFTER the routes above are defined: include_router copies the
# routes that exist at that moment.
app = FastAPI()
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("deez_bugs.api.api:app", host="127.0.0.1", port=8000, reload=True)
