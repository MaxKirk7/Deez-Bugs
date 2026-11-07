"""Stable response models for the analysis API."""

from typing import Any

from pydantic import BaseModel


class AnalysisResponse(BaseModel):
    """Top-level upload response."""

    filename: str
    analysis: dict[str, Any]
