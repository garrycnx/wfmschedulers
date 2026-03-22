import time
import pandas as pd
import numpy as np
import logging
from prophet import Prophet

from app.models.base_model import BaseForecastModel
from app.utils.metrics import compute_all_metrics, recommendation_score

logger = logging.getLogger(__name__)


class ProphetModel(BaseForecastModel):
    def __init__(self):
        super().__init__()
        self.name = "prophet"
        self.display_name = "Facebook Prophet"
        self.description = (
            "Time series model with trend changepoint detection, "
            "weekly/yearly seasonality, and holiday effects."
        )
        self.model: Prophet = None

    def _build_prophet_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """Convert our dataframe to Prophet format: ds, y columns."""
        prophet_df = df.reset_index().rename(
            columns={"date": "ds", "total_calls": "y"}
        )
        prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
        return prophet_df[["ds", "y"]]

    def fit(self, train: pd.DataFrame) -> None:
        self.model = Prophet(
            changepoint_prior_scale=0.05,
            seasonality_mode="multiplicative",
            weekly_seasonality=True,
            yearly_seasonality=True,
            daily_seasonality=False,
            interval_width=0.95,
        )
        train_df = self._build_prophet_df(train)
        self.model.fit(train_df)
        self._trained = True

    def predict(self, horizon: int, confidence_intervals: list[float]) -> dict:
        if not self._trained:
            raise RuntimeError("Model must be fitted before prediction")

        future = self.model.make_future_dataframe(periods=horizon, freq="D")
        # Only get forecast rows, not historical
        future_only = future.tail(horizon)

        # Run for 95% CI (Prophet default)
        self.model.interval_width = 0.95
        forecast_95 = self.model.predict(future_only)

        # Run for 80% CI
        self.model.interval_width = 0.80
        forecast_80 = self.model.predict(future_only)

        dates = [str(d.date()) for d in forecast_95["ds"]]
        values = [max(0, v) for v in forecast_95["yhat"].tolist()]

        result = {
            "dates": dates,
            "values": values,
            "ci": {
                "0.80": {
                    "lower": [max(0, v) for v in forecast_80["yhat_lower"].tolist()],
                    "upper": [max(0, v) for v in forecast_80["yhat_upper"].tolist()],
                },
                "0.95": {
                    "lower": [max(0, v) for v in forecast_95["yhat_lower"].tolist()],
                    "upper": [max(0, v) for v in forecast_95["yhat_upper"].tolist()],
                },
            },
        }
        return result

    def run_full(
        self,
        train: pd.DataFrame,
        test: pd.DataFrame,
        horizon: int,
        ci_levels: list[float],
    ) -> dict:
        """Full pipeline: evaluate on test, then retrain on all data, forecast horizon days."""
        start = time.time()

        # Evaluate on test set
        metrics = self.evaluate(train, test)

        # Retrain on all data
        all_data = pd.concat([train, test])
        self.fit(all_data)
        forecast = self.predict(horizon, ci_levels)

        elapsed = round(time.time() - start, 2)
        return {
            "metrics": metrics,
            "forecast": forecast,
            "training_time_seconds": elapsed,
            "params_used": {
                "changepoint_prior_scale": 0.05,
                "seasonality_mode": "multiplicative",
            },
        }
