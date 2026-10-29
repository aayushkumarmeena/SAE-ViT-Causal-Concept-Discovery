"""
api/schemas.py: Pydantic request and response schemas for FastAPI.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InterventionRequest(BaseModel):
    feature_ids: List[int] = Field(..., description="List of SAE feature IDs to intervene on")
    alphas: List[float] = Field(..., description="Alpha multipliers or steering strengths")
    mode: str = Field(default="scale", description="'scale' (ablation/suppression/amplification) or 'steer'")
    scope: str = Field(default="global", description="'global' (all patches) or 'local' (quantile masked patches)")
    local_percentile: Optional[int] = Field(default=90, description="Percentile threshold for local intervention")
    image_pos: Optional[int] = Field(default=None, description="Index in activation store")
    image_base64: Optional[str] = Field(default=None, description="Uploaded image encoded as base64 string")


class MultiSteerVectorItem(BaseModel):
    feature_id: int = Field(..., description="Target SAE feature ID")
    alpha: float = Field(..., description="Steering coefficient (+ for amplification, - for suppression/reversal)")


class MultiSteerRequest(BaseModel):
    vectors: List[MultiSteerVectorItem] = Field(..., description="List of feature IDs and their steering strengths")
    scope: str = Field(default="global", description="'global' or 'local'")
    local_percentile: Optional[int] = Field(default=90, description="Percentile threshold for local patch scope")
    image_pos: Optional[int] = Field(default=None, description="Index in activation store")
    image_base64: Optional[str] = Field(default=None, description="Uploaded image base64")


class PatchInspectRequest(BaseModel):
    patch_index: int = Field(..., ge=0, le=195, description="Patch index (0 to 195 for 14x14 grid)")
    image_pos: Optional[int] = Field(default=None, description="Index in activation store")
    image_base64: Optional[str] = Field(default=None, description="Uploaded image base64")


class CustomImageAnalysisRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded image string")
    top_n: int = Field(default=8, description="Number of top active concepts to return")


class PipelineRunRequest(BaseModel):
    mode: str = Field(default="demo", description="selftest | smoke | demo | full")
    sweep: bool = Field(default=False, description="Run architectural sweeps")
    stages: Optional[str] = Field(default="extract,train,discover,evaluate,report", description="Comma-separated stages")


class FeatureInteractionRequest(BaseModel):
    feature_a: int
    feature_b: int
