"""FastAPI endpoints for in-memory financial analysis."""

import json

import uvicorn
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile

from deez_bugs.data_processing import process_csv

router = APIRouter(tags=["Data Analysis"])
app = FastAPI()
app.include_router(router)


@router.post("/upload-csv/")
async def upload_csv(file: UploadFile = File(...)) -> dict:
    """Analyse a CSV in memory and return dashboard/model input data."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400, detail="Invalid file type. Must be a CSV file."
        )

    try:
        result = process_csv(await file.read())
        with open("result.json", mode="w+") as f:
            f.writelines(json.dumps(result))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="CSV processing failed") from error

    return {"filename": file.filename, "analysis": result}


if __name__ == "__main__":
    uvicorn.run("deez_bugs.api.api:app", host="127.0.0.1", port=8000, reload=True)
