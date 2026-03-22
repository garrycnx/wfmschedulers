import time
import pandas as pd
import numpy as np
import logging
import warnings

warnings.filterwarnings("ignore")
import pmdarima as pm

from app.models.base_model import BaseForecastModel
from app.utils.metrics import compute_all_metrics, recommendation_score

logger = logging.getLogger(__name__)


class ArimaModel(BaseForecastModel):
    def __init__(self):
        super().__init__()
        self.name = "arima"
        self.display_name = "ARIMA / SARIMA"
        self.description = (
            "Auto-regressive integrated moving average with seasonal components "
            "(auto-selected p,d,q,P,D,Q)."
        )
        self.model = None
        self.order_ = None
        self.seasonal_order_ = None

    def fit(self, train: pd.DataFrame) -> None:
        y = train["total_calls"].values
        logger.info("Auto-fitting ARIMA/SARIMA model...")
        self.model = pm.auto_arima(
            y,
            seasonal=True,
            m=7,  # weekly seasonality
            start_p=1,
            max_p=3,
            start_q=0,
            max_q=3,
            d=None,  # auto-select d
            D=None,  # auto-select D
            start_P=0,
            max_P=2,
            start_Q=0,
            max_Q=2,
            information_criterion="aic",
            stepwise=True,
            suppress_warnings=True,
            error_action="ignore",
            trace=False,
        )
        self.order_ = self.model.order
        self.seasonal_order_ = self.model.seasonal_order
        self._trained = True
        logger.info(
            f"ARIMA order: {self.order_}, seasonal: {self.seasonal_order_}"
        )

    def predict(self, horizon: int, confidence_intervals: list[float]) -> dict:
        if not self._trained:
            raise RuntimeError("Model must be fitted before prediction")

        # Get forecast with 95% CI
        fc_95, ci_95 = self.model.predict(
            n_periods=horizon, return_conf_int=True, alpha=0.05
        )
        # Get forecast with 80% CI
        _, ci_80 = self.model.predict(
            n_periods=horizon, return_conf_int=True, alpha=0.20
        )

        result = {
            "values": [max(0, v) for v in fc_95.tolist()],
            "ci": {
                "0.80": {
                    "lower": [max(0, v) for v in ci_80[:, 0].tolist()],
                    "upper": [max(0, v) for v in ci_80[:, 1].tolist()],
                },
                "0.95": {
                    "lower": [max(0, v) for v in ci_95[:, 0].tolist()],
                    "upper": [max(0, v) for v in ci_95[:, 1].tolist()],
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
        start = time.time()

        # Evaluate on test set
        self.fit(train)
        test_preds_result = self.predict(len(test), [])
        actual = test["total_calls"].values
        predicted = np.array(test_preds_result["values"])
        metrics = compute_all_metrics(actual, predicted)
        metrics["recommendation_score"] = recommendation_score(metrics["mape"])

        # Add AIC/BIC from model
        try:
            metrics["aic"] = round(float(self.model.aic()), 2)
            metrics["bic"] = round(float(self.model.bic()), 2)
        except Exception:
            pass

        # Retrain on full data
        all_data = pd.concat([train, test])
        self.fit(all_data)
        forecast = self.predict(horizon, ci_levels)

        elapsed = round(time.time() - start, 2)
        return {
            "metrics": metrics,
            "forecast": forecast,
            "training_time_seconds": elapsed,
            "params_used": {
                "order": list(self.order_) if self.order_ else None,
                "seasonal_order": (
                    list(self.seasonal_order_) if self.seasonal_order_ else None
                ),
            },
        }
