from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
import pandas as pd
import io
import uvicorn

# Shared DB code: reads DATABASE_URL from .env. See src/deez_bugs/db/.
from deez_bugs.db import UPLOAD_COLUMNS, category_shares, save_upload

router = APIRouter(tags=["Data Upload"])


@router.post("/upload-csv/")
async def upload_csv(file: UploadFile = File(...)):
    """
    Accepts a bank-statement CSV with the columns trans_date_trans_time, merchant,
    category, amt. Checks every row, then stores it as a new user in the shared
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


# Create the app AFTER the routes above are defined: include_router copies the
# routes that exist at that moment.
app = FastAPI()
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run("deez_bugs.api.api:app", host="127.0.0.1", port=8000, reload=True)
