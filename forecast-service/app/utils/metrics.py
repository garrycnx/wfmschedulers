import numpy as np
from typing import Tuple


def mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Mean Absolute Percentage Error. Returns value as percentage (e.g. 5.3 = 5.3%)."""
    actual, predicted = np.array(actual), np.array(predicted)
    mask = actual != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def rmse(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Root Mean Squared Error."""
    actual, predicted = np.array(actual), np.array(predicted)
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))


def mae(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Mean Absolute Error."""
    actual, predicted = np.array(actual), np.array(predicted)
    return float(np.mean(np.abs(actual - predicted)))


def compute_all_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    return {
        "mape": round(mape(actual, predicted), 4),
        "rmse": round(rmse(actual, predicted), 2),
        "mae": round(mae(actual, predicted), 2),
    }


def recommendation_score(mape_val: float) -> float:
    """Convert MAPE to 0-100 score where 100 = perfect."""
    score = max(0.0, 100.0 - mape_val * 5)
    return round(min(100.0, score), 1)
