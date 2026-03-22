from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import date


class ForecastPoint(BaseModel):
    date: str
    value: float
    ci_lower_80: Optional[float] = None
    ci_upper_80: Optional[float] = None
    ci_lower_95: Optional[float] = None
    ci_upper_95: Optional[float] = None
    is_forecast: bool = True


class ModelMetrics(BaseModel):
    mape: float
    rmse: float
    mae: float
    aic: Optional[float] = None
    bic: Optional[float] = None


class ModelResult(BaseModel):
    model_name: str
    model_display_name: str
    forecast: List[ForecastPoint]
    metrics: ModelMetrics
    recommendation_score: float  # 0-100, higher = better
    training_time_seconds: float
    description: str
    params_used: Dict[str, Any] = {}


class SeasonalityPattern(BaseModel):
    period: str  # "weekly", "monthly", "yearly"
    strength: float  # 0-1
    peak_day_or_month: str
    description: str


class DistributionRow(BaseModel):
    date_range: str
    forecast_total: float
    interval_type: str
    allocation_pct: float
    status: str  # "Projected"


class InsightItem(BaseModel):
    type: str  # "trend", "seasonality", "anomaly", "recommendation"
    title: str
    detail: str
    severity: str  # "info", "warning", "success"


class HistoricalPoint(BaseModel):
    date: str
    value: float
    is_forecast: bool = False


class ForecastResponse(BaseModel):
    job_id: str
    status: str
    horizon: int
    generated_at: str
    model_results: Dict[str, ModelResult]
    historical_data: List[HistoricalPoint]
    seasonality: List[SeasonalityPattern]
    distribution: List[DistributionRow]
    insights: List[InsightItem]
    best_model: str
    error: Optional[str] = None


class ModelsListResponse(BaseModel):
    models: List[Dict[str, str]]
