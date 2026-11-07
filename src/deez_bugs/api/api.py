"""FastAPI endpoints for in-memory financial analysis."""

from io import BytesIO
from pathlib import Path

import pandas as pd
import uvicorn
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile

from deez_bugs.data_processing import (
    analyse_uploaded_transactions,
    load_spending_profile_model,
    normalize_transactions,
    process_csv,
)
from .schemas import AnalysisResponse

router = APIRouter(tags=["Data Analysis"])
app = FastAPI()
MODEL_PATH = Path(__file__).resolve().parents[3] / "data" / "spending_profile_model.pkl"
spending_model = (
    load_spending_profile_model(MODEL_PATH)
    if MODEL_PATH.exists()
    else None
)


@router.post("/upload-csv/", response_model=AnalysisResponse)
async def upload_csv(file: UploadFile = File(...)) -> dict:
    """Analyse a CSV in memory and return dashboard/model input data."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Must be a CSV file."
        )

    try:
        contents = await file.read()
        result = process_csv(contents)
        if spending_model is not None:
            transactions = normalize_transactions(pd.read_csv(BytesIO(contents)))
            result["model"] = analyse_uploaded_transactions(
                spending_model, transactions
            )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="CSV processing failed") from error

    return {"filename": file.filename, "analysis": result}


app.include_router(router)


if __name__ == "__main__":
    uvicorn.run("deez_bugs.api.api:app", host="127.0.0.1", port=8000, reload=True)
