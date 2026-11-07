from fastapi import APIRouter, File, UploadFile, HTTPException
import pandas as pd
import io
import os
from sqlalchemy import create_engine
from dotenv import load_dotenv
import uvicorn

# Load environment variables from .env
load_dotenv()

router = APIRouter(tags=["Data Upload"])

# 1. Connect to the shared Timescale Cloud DB using the environment variable
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is missing! Make sure your .env file is set up correctly.")

# Create the SQLAlchemy engine for Postgres/Timescale
engine = create_engine(DATABASE_URL)


# 2. Database Insertion Logic
def insert_transactions_to_db(df: pd.DataFrame) -> dict:
    """
    Takes the filtered DataFrame and appends it to the shared 
    'transactions' table in the Timescale cloud database.
    """
    try:
        # if_exists='append' ensures we add to the existing 10,000 rows 
        # without overwriting or deleting current data.
        # index=False prevents writing dataframe row indices to the DB.
        df.to_sql('transactions', con=engine, if_exists='append', index=False)
        
        user_count = int(df['cc_num'].nunique()) if 'cc_num' in df.columns else 0
        
        return {
            "status": "success",
            "message": "Data successfully inserted into the shared Timescale DB.",
            "users_found": user_count,
            "rows_inserted": len(df)
        }
    except Exception as e:
        return {"error": str(e)}


# 3. FastAPI Endpoint
@router.post("/upload-csv/")
async def upload_csv(file: UploadFile = File(...)):
    """
    Accepts the CSV file, filters down to the 7 required columns, 
    and inserts the transaction data into the shared cloud database.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be a CSV file.")
    
    try:
        contents = await file.read()

        # The exact 7 columns required for the database
        columns_to_keep = [
            'merchant', 'category', 'amt', 
            'trans_date_trans_time', 'merch_lat', 'merch_long', 'cc_num'
        ]
        
        # Read the file bytes directly into a Pandas DataFrame, keeping only the specified columns
        df = pd.read_csv(io.BytesIO(contents), usecols=columns_to_keep)
        
        # Insert into the shared cloud database
        result = insert_transactions_to_db(df)
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=f"Database insertion failed: {result['error']}")
        
        return {
            "filename": file.filename,
            "database_result": result
        }
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Invalid CSV structure (missing required columns): {str(ve)}")
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("src.deez_bugs.api.api:router", host="127.0.0.1", port=8000,reload=True)