import time
import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta

from app.utils.metrics import compute_all_metrics, recommendation_score

logger = logging.getLogger(__name__)


class EnsembleModel:
    def __init__(self):
        self.name = "ensemble"
        self.display_name = "Moving Average Ensemble"
        self.description = (
            "Weighted ensemble of Simple Moving Average (7d, 14d, 28d) "
            "with linear trend extrapolation."
        )
        self._trained = False
        self._train_values = None

    def _weighted_moving_avg(
        self, values: np.ndarray, windows: list[int], weights: list[float]
    ) -> float:
        """Compute weighted average of multiple moving averages."""
        result = 0
        total_weight = 0
        for window, weight in zip(windows, weights):
            if len(values) >= window:
                result += np.mean(values[-window:]) * weight
                total_weight += weight
        return result / total_weight if total_weight > 0 else np.mean(values[-7:])

    def fit(self, train: pd.DataFrame) -> None:
        self._train_values = train["total_calls"].values.copy()
        self._trained = True

    def _forecast_iterative(self, seed_values: np.ndarray, horizon: int) -> np.ndarray:
        """Iteratively forecast by appending predictions to the window."""
        preds = []
        current = list(seed_values)

        # Compute trend from last 30 days
        last_30 = (
            np.array(current[-30:]) if len(current) >= 30 else np.array(current)
        )
        x = np.arange(len(last_30))
        coeffs = np.polyfit(x, last_30, 1)  # linear trend
        trend_per_day = coeffs[0]

        # Day-of-week seasonality indices from last 8 weeks
        dow_factors = {}
        if len(current) >= 56:
            for dow in range(7):
                dow_vals = [
                    current[-(7 * (w + 1)) + dow]
                    for w in range(8)
                    if (7 * (w + 1) - dow) <= len(current)
                ]
                if dow_vals:
                    dow_factors[dow] = np.mean(dow_vals) / max(
                        1, np.mean(current[-56:])
                    )

        base_len = len(current)

        for i in range(horizon):
            dow_idx = (base_len + i) % 7
            base_pred = self._weighted_moving_avg(
                np.array(current),
                windows=[7, 14, 28],
                weights=[0.6, 0.25, 0.15],
            )
            # Apply trend
            trended = base_pred + trend_per_day * (i + 1)
            # Apply DOW factor
            dow_factor = dow_factors.get(dow_idx, 1.0)
            final_pred = max(
                0, trended * dow_factor if dow_factor > 0 else trended
            )
            preds.append(final_pred)
            current.append(final_pred)

        return np.array(preds)

    def predict(self, horizon: int, confidence_intervals: list[float]) -> dict:
        if not self._trained:
            raise RuntimeError("Ensemble model must be fitted before prediction")

        point_forecast = self._forecast_iterative(self._train_values, horizon)

        # Bootstrap CI: resample training residuals
        n_boot = 200
        boot_forecasts = []
        residuals = self._compute_residuals()
        for _ in range(n_boot):
            noise = np.random.choice(residuals, size=horizon, replace=True)
            boot_forecasts.append(point_forecast + noise)
        boot_forecasts = np.array(boot_forecasts)

        ci_80_lower = np.maximum(0, np.percentile(boot_forecasts, 10, axis=0))
        ci_80_upper = np.maximum(0, np.percentile(boot_forecasts, 90, axis=0))
        ci_95_lower = np.maximum(0, np.percentile(boot_forecasts, 2.5, axis=0))
        ci_95_upper = np.maximum(0, np.percentile(boot_forecasts, 97.5, axis=0))

        return {
            "values": np.maximum(0, point_forecast).tolist(),
            "ci": {
                "0.80": {
                    "lower": ci_80_lower.tolist(),
                    "upper": ci_80_upper.tolist(),
                },
                "0.95": {
                    "lower": ci_95_lower.tolist(),
                    "upper": ci_95_upper.tolist(),
                },
            },
        }

    def _compute_residuals(self) -> np.ndarray:
        """Compute in-sample residuals for bootstrap CI."""
        if len(self._train_values) < 30:
            return np.array([0.0])
        preds = []
        for i in range(28, len(self._train_values)):
            p = self._weighted_moving_avg(
                self._train_values[:i], [7, 14, 28], [0.6, 0.25, 0.15]
            )
            preds.append(p)
        actual = self._train_values[28:]
        return actual[: len(preds)] - np.array(preds)

    def run_full(
        self,
        train: pd.DataFrame,
        test: pd.DataFrame,
        horizon: int,
        ci_levels: list[float],
    ) -> dict:
        start = time.time()

        self.fit(train)
        test_preds = self.predict(len(test), [])
        actual = test["total_calls"].values
        predicted = np.array(test_preds["values"])
        metrics = compute_all_metrics(actual, predicted)
        metrics["recommendation_score"] = recommendation_score(metrics["mape"])

        all_data = pd.concat([train, test])
        self.fit(all_data)
        forecast = self.predict(horizon, ci_levels)

        elapsed = round(time.time() - start, 2)
        return {
            "metrics": metrics,
            "forecast": forecast,
            "training_time_seconds": elapsed,
            "params_used": {
                "windows": [7, 14, 28],
                "weights": [0.6, 0.25, 0.15],
            },
        }
