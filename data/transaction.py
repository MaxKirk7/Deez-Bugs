"""Download the Kaggle dataset and store the raw CSVs in data/raw/.

    uv run python data/transaction.py

data/raw/ is gitignored (the files are ~480 MB). Never edit these files:
the conversion script reads them and writes its own output.
Safe to re-run: files already in data/raw/ are left alone.
"""

import shutil
from pathlib import Path

import kagglehub

RAW_DIR = Path(__file__).resolve().parent / "raw"
# Kaggle file name -> our name (the dataset was originally published for fraud detection; we don't use that).
FILES = {"fraudTrain.csv": "transactions_part1.csv", "fraudTest.csv": "transactions_part2.csv"}

# Download latest version (cached in ~/.cache/kagglehub after the first time)
path = Path(kagglehub.dataset_download("kartik2112/fraud-detection"))
print("Path to dataset files:", path)

RAW_DIR.mkdir(exist_ok=True)
for source, name in FILES.items():
    target = RAW_DIR / name
    if target.exists():
        print(f"  {name}: already in data/raw/")
    else:
        shutil.copy2(path / source, target)
        print(f"  {name}: copied to data/raw/")

print("Raw data ready in", RAW_DIR)
