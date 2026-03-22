import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


# Generate synthetic test data
def make_synthetic_data(days=400):
    dates = [datetime(2023, 1, 1) + timedelta(days=i) for i in range(days)]
    np.random.seed(42)
    trend = np.linspace(1000, 1500, days)
    weekly = 100 * np.sin(2 * np.pi * np.arange(days) / 7)
    noise = np.random.normal(0, 50, days)
    values = trend + weekly + noise
    df = pd.DataFrame(
        {"total_calls": np.maximum(0, values)},
        index=pd.DatetimeIndex(dates),
    )
    df.index.name = "date"
    return df


@pytest.fixture
def synthetic_df():
    return make_synthetic_data()


@pytest.fixture
def train_test(synthetic_df):
    test_days = 30
    train = synthetic_df.iloc[:-test_days]
    test = synthetic_df.iloc[-test_days:]
    return train, test


def test_metrics():
    from app.utils.metrics import mape, rmse, mae, recommendation_score

    actual = np.array([100, 200, 300])
    predicted = np.array([110, 190, 310])
    assert 0 < mape(actual, predicted) < 20
    assert rmse(actual, predicted) > 0
    assert mae(actual, predicted) > 0
    assert 0 <= recommendation_score(5.0) <= 100


def test_recommendation_score_bounds():
    from app.utils.metrics import recommendation_score

    # Perfect MAPE of 0 should give 100
    assert recommendation_score(0.0) == 100.0
    # Very high MAPE should give 0
    assert recommendation_score(100.0) == 0.0
    # Mid-range
    score = recommendation_score(10.0)
    assert 0 <= score <= 100


def test_ets_model(train_test):
    from app.models.ets_model import ETSModel

    train, test = train_test
    model = ETSModel()
    model.fit(train)
    result = model.predict(14, [0.80, 0.95])
    assert len(result["values"]) == 14
    assert "0.80" in result["ci"]
    assert "0.95" in result["ci"]
    assert all(v >= 0 for v in result["values"])
    assert len(result["ci"]["0.80"]["lower"]) == 14
    assert len(result["ci"]["0.95"]["upper"]) == 14


def test_ets_run_full(train_test):
    from app.models.ets_model import ETSModel

    train, test = train_test
    model = ETSModel()
    result = model.run_full(train, test, horizon=14, ci_levels=[0.80, 0.95])
    assert "metrics" in result
    assert "forecast" in result
    assert result["metrics"]["mape"] >= 0
    assert result["metrics"]["rmse"] >= 0
    assert len(result["forecast"]["values"]) == 14


def test_ensemble_model(train_test):
    from app.models.ensemble_model import EnsembleModel

    train, test = train_test
    model = EnsembleModel()
    model.fit(train)
    result = model.predict(30, [0.80, 0.95])
    assert len(result["values"]) == 30
    assert all(v >= 0 for v in result["values"])
    assert "0.80" in result["ci"]
    assert "0.95" in result["ci"]


def test_ensemble_run_full(train_test):
    from app.models.ensemble_model import EnsembleModel

    train, test = train_test
    model = EnsembleModel()
    result = model.run_full(train, test, horizon=30, ci_levels=[0.80, 0.95])
    assert "metrics" in result
    assert result["metrics"]["mape"] >= 0
    assert len(result["forecast"]["values"]) == 30


def test_distribution_service():
    from app.services.distribution_service import generate_distribution_table

    dates = [
        (datetime(2024, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(30)
    ]
    values = [1000.0] * 30
    df = make_synthetic_data()
    rows = generate_distribution_table(dates, values, df, 30)
    assert len(rows) > 0
    assert all("date_range" in r for r in rows)
    assert all(r["forecast_total"] >= 0 for r in rows)
    assert all("allocation_pct" in r for r in rows)
    assert all(r["status"] == "Projected" for r in rows)


def test_distribution_service_daily():
    from app.services.distribution_service import generate_distribution_table

    dates = [
        (datetime(2024, 3, 1) + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(7)
    ]
    values = [500.0] * 7
    df = make_synthetic_data()
    rows = generate_distribution_table(dates, values, df, 7)
    assert len(rows) == 7
    assert all(r["interval_type"] == "Daily" for r in rows)


def test_distribution_service_monthly():
    from app.services.distribution_service import generate_distribution_table

    dates = [
        (datetime(2024, 1, 1) + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(90)
    ]
    values = [1000.0] * 90
    df = make_synthetic_data()
    rows = generate_distribution_table(dates, values, df, 90)
    assert len(rows) >= 2  # at least 2 months
    assert all(r["interval_type"] == "Monthly" for r in rows)


@pytest.mark.asyncio
async def test_data_service_validation():
    from app.services.data_service import _validate_and_clean

    raw = [
        {"date": "2023-01-01", "total_calls": 1000},
        {"date": "2023-01-03", "total_calls": 1200},  # gap on Jan 2
        {"date": "2023-01-05", "total_calls": 1100},
    ]
    df = _validate_and_clean(raw)
    # Should fill gap: 2023-01-02 and 2023-01-04 must be present
    assert len(df) == 5
    assert not df["total_calls"].isna().any()


@pytest.mark.asyncio
async def test_data_service_validation_missing_columns():
    from app.services.data_service import _validate_and_clean

    raw = [{"date": "2023-01-01", "wrong_column": 1000}]
    with pytest.raises(ValueError, match="missing required columns"):
        _validate_and_clean(raw)


def test_forecast_request_schema():
    from app.schemas.request import ForecastRequest, ModelName

    req = ForecastRequest(horizon=30, models=[ModelName.PROPHET, ModelName.ETS])
    assert req.horizon == 30
    assert ModelName.PROPHET in req.models
    assert req.confidence_intervals == [0.80, 0.95]


def test_forecast_request_ci_validation():
    from app.schemas.request import ForecastRequest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ForecastRequest(confidence_intervals=[0.3])  # < 0.5 should fail


def test_forecast_request_ci_sorted():
    from app.schemas.request import ForecastRequest

    req = ForecastRequest(confidence_intervals=[0.95, 0.80])
    assert req.confidence_intervals == [0.80, 0.95]  # should be sorted
