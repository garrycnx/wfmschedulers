import time
import pandas as pd
import numpy as np
import logging
import warnings

warnings.filterwarnings("ignore")
from statsmodels.tsa.holtwinters import ExponentialSmoothing

from app.models.base_model import BaseForecastModel
from app.utils.metrics import compute_all_metrics, recommendation_score

logger = logging.getLogger(__name__)


class ETSModel(BaseForecastModel):
    def __init__(self):
        super().__init__()
        self.name = "ets"
        self.display_name = "Exponential Smoothing (ETS)"
        self.description = (
            "Holt-Winters triple exponential smoothing with additive trend "
            "and multiplicative weekly seasonality."
        )
        self.model = None
        self.fit_result = None
        self.seasonal_type = "mul"

    def fit(self, train: pd.DataFrame) -> None:
        y = train["total_calls"].values

        # Try multiplicative seasonality first, fall back to additive
        try:
            self.model = ExponentialSmoothing(
                y,
                trend="add",
                seasonal="mul",
                seasonal_periods=7,
                use_boxcox=False,
            )
            self.fit_result = self.model.fit(optimized=True, remove_bias=True)
            self.seasonal_type = "mul"
        except Exception:
            self.model = ExponentialSmoothing(
                y,
                trend="add",
                seasonal="add",
                seasonal_periods=7,
                use_boxcox=False,
            )
            self.fit_result = self.model.fit(optimized=True, remove_bias=True)
            self.seasonal_type = "add"

        self._trained = True
        logger.info(f"ETS model fitted with {self.seasonal_type} seasonality")

    def predict(self, horizon: int, confidence_intervals: list[float]) -> dict:
        if not self._trained:
            raise RuntimeError("Model must be fitted before prediction")

        # Point forecast
        forecast_values = self.fit_result.forecast(horizon)
        forecast_values = np.maximum(0, forecast_values)

        # Confidence intervals via simulation
        simulations = self.fit_result.simulate(
            nsimulations=horizon,
            repetitions=500,
            error="mul" if self.seasonal_type == "mul" else "add",
        )
        simulations = np.maximum(0, simulations)

        ci_80_lower = np.percentile(simulations, 10, axis=1)
        ci_80_upper = np.percentile(simulations, 90, axis=1)
        ci_95_lower = np.percentile(simulations, 2.5, axis=1)
        ci_95_upper = np.percentile(simulations, 97.5, axis=1)

        return {
            "values": forecast_values.tolist(),
            "ci": {
                "0.80": {
                    "lower": np.maximum(0, ci_80_lower).tolist(),
                    "upper": np.maximum(0, ci_80_upper).tolist(),
                },
                "0.95": {
                    "lower": np.maximum(0, ci_95_lower).tolist(),
                    "upper": np.maximum(0, ci_95_upper).tolist(),
                },
            },
        }

    def run_full(
        self,
        train: pd.DataFrame,
        test: pd.DataFrame,
        horizon: int,
        ci_levels: list[float],
    ) -> dict:
        start = time.time()

        self.fit(train)
        test_preds_result = self.predict(len(test), [])
        actual = test["total_calls"].values
        predicted = np.array(test_preds_result["values"])
        metrics = compute_all_metrics(actual, predicted)
        metrics["recommendation_score"] = recommendation_score(metrics["mape"])

        try:
            metrics["aic"] = round(float(self.fit_result.aic), 2)
            metrics["bic"] = round(float(self.fit_result.bic), 2)
        except Exception:
            pass

        all_data = pd.concat([train, test])
        self.fit(all_data)
        forecast = self.predict(horizon, ci_levels)

        elapsed = round(time.time() - start, 2)
        return {
            "metrics": metrics,
            "forecast": forecast,
            "training_time_seconds": elapsed,
            "params_used": {
                "trend": "add",
                "seasonal": self.seasonal_type,
                "seasonal_periods": 7,
            },
        }
