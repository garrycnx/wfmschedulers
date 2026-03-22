from abc import ABC, abstractmethod
import pandas as pd
import numpy as np
from typing import Tuple
from app.utils.metrics import compute_all_metrics, recommendation_score


class BaseForecastModel(ABC):
    def __init__(self):
        self.name: str = ""
        self.display_name: str = ""
        self.description: str = ""
        self._trained = False

    @abstractmethod
    def fit(self, train: pd.DataFrame) -> None:
        """Train model on training data."""
        pass

    @abstractmethod
    def predict(self, horizon: int, confidence_intervals: list[float]) -> dict:
        """
        Generate forecast.
        Returns dict with keys:
        - 'dates': list of date strings
        - 'values': list of floats
        - 'ci': dict of {level: {'lower': [...], 'upper': [...]}}
        """
        pass

    def evaluate(self, train: pd.DataFrame, test: pd.DataFrame) -> dict:
        """Train on train, predict on test horizon, compute metrics."""
        self.fit(train)
        test_horizon = len(test)
        preds = self.predict(test_horizon, [])
        actual = test["total_calls"].values
        predicted = np.array(preds["values"])
        metrics = compute_all_metrics(actual, predicted)
        metrics["recommendation_score"] = recommendation_score(metrics["mape"])
        return metrics
