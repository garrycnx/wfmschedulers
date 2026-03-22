from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from enum import Enum
from datetime import date, timedelta


class ModelName(str, Enum):
    PROPHET = "prophet"
    ARIMA = "arima"
    ETS = "ets"
    LSTM = "lstm"
    ENSEMBLE = "ensemble"


class ForecastRequest(BaseModel):
    startDate: str = Field(..., description="Forecast start date (YYYY-MM-DD)")
    endDate: str = Field(..., description="Forecast end date (YYYY-MM-DD)")
    models: List[ModelName] = Field(default=list(ModelName), description="Models to run")
    confidence_intervals: List[float] = Field(default=[0.80, 0.95])
    intervalMinutes: Literal[15, 30] = Field(default=15, description="Interval granularity in minutes")

    @field_validator("confidence_intervals")
    @classmethod
    def validate_ci(cls, v):
        for ci in v:
            if not 0.5 < ci < 1.0:
                raise ValueError("Confidence interval must be between 0.5 and 1.0")
        return sorted(v)

    @field_validator("startDate", "endDate")
    @classmethod
    def validate_date_format(cls, v):
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD.")
        return v

    @property
    def horizon(self) -> int:
        """Inclusive day count from startDate to endDate."""
        start = date.fromisoformat(self.startDate)
        end = date.fromisoformat(self.endDate)
        return max(1, (end - start).days + 1)


class ModelParametersRequest(BaseModel):
    model: ModelName
    params: dict = Field(default_factory=dict)
