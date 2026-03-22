import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, date
from typing import List, Dict

import numpy as np
import pandas as pd

from app.config import get_settings
from app.services.data_service import (
    get_historical_data,
    get_train_test_split,
    detect_seasonality,
)
from app.services.distribution_service import generate_distribution_table
from app.schemas.request import ForecastRequest, ModelName

logger = logging.getLogger(__name__)
settings = get_settings()

EXECUTOR = ThreadPoolExecutor(max_workers=5)

DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

# ─── 15-min banking distribution (48 slots: 08:00–19:45) ─────────────────────
_DIST_15_RAW: List[tuple] = [
    ("08:00", 0.0115), ("08:15", 0.0135), ("08:30", 0.0175), ("08:45", 0.0200),
    ("09:00", 0.0285), ("09:15", 0.0310), ("09:30", 0.0355), ("09:45", 0.0380),
    ("10:00", 0.0395), ("10:15", 0.0405), ("10:30", 0.0385), ("10:45", 0.0375),
    ("11:00", 0.0360), ("11:15", 0.0355), ("11:30", 0.0315), ("11:45", 0.0300),
    ("12:00", 0.0250), ("12:15", 0.0235), ("12:30", 0.0210), ("12:45", 0.0205),
    ("13:00", 0.0225), ("13:15", 0.0240), ("13:30", 0.0290), ("13:45", 0.0315),
    ("14:00", 0.0335), ("14:15", 0.0350), ("14:30", 0.0365), ("14:45", 0.0380),
    ("15:00", 0.0375), ("15:15", 0.0360), ("15:30", 0.0325), ("15:45", 0.0300),
    ("16:00", 0.0265), ("16:15", 0.0240), ("16:30", 0.0195), ("16:45", 0.0180),
    ("17:00", 0.0135), ("17:15", 0.0125), ("17:30", 0.0085), ("17:45", 0.0075),
    ("18:00", 0.0050), ("18:15", 0.0040), ("18:30", 0.0032), ("18:45", 0.0025),
    ("19:00", 0.0020), ("19:15", 0.0016), ("19:30", 0.0012), ("19:45", 0.0008),
]
_total_15 = sum(p for _, p in _DIST_15_RAW)
NORM_DIST_15 = [(t, p / _total_15) for t, p in _DIST_15_RAW]

# Build 30-min version by summing pairs
NORM_DIST_30 = []
for i in range(0, len(NORM_DIST_15), 2):
    t = NORM_DIST_15[i][0]
    p = NORM_DIST_15[i][1] + (NORM_DIST_15[i + 1][1] if i + 1 < len(NORM_DIST_15) else 0)
    NORM_DIST_30.append((t, p))


def _run_prophet(train, test, horizon, ci_levels):
    from app.models.prophet_model import ProphetModel
    return ProphetModel().run_full(train, test, horizon, ci_levels)


def _run_arima(train, test, horizon, ci_levels):
    from app.models.arima_model import ArimaModel
    return ArimaModel().run_full(train, test, horizon, ci_levels)


def _run_ets(train, test, horizon, ci_levels):
    from app.models.ets_model import ETSModel
    return ETSModel().run_full(train, test, horizon, ci_levels)


def _run_lstm(train, test, horizon, ci_levels):
    from app.models.lstm_model import LSTMModel
    from app.config import get_settings
    s = get_settings()
    return LSTMModel(
        window_size=s.LSTM_WINDOW, mc_samples=s.LSTM_MC_SAMPLES
    ).run_full(train, test, horizon, ci_levels)


def _run_ensemble(train, test, horizon, ci_levels):
    from app.models.ensemble_model import EnsembleModel
    return EnsembleModel().run_full(train, test, horizon, ci_levels)


MODEL_RUNNERS = {
    ModelName.PROPHET: _run_prophet,
    ModelName.ARIMA: _run_arima,
    ModelName.ETS: _run_ets,
    ModelName.LSTM: _run_lstm,
    ModelName.ENSEMBLE: _run_ensemble,
}

MODEL_META = {
    "prophet": {
        "display_name": "Facebook Prophet",
        "description": "Trend + seasonality with changepoint detection.",
    },
    "arima": {
        "display_name": "ARIMA / SARIMA",
        "description": "Auto-regressive integrated moving average with seasonal components.",
    },
    "ets": {
        "display_name": "Exponential Smoothing (ETS)",
        "description": "Holt-Winters triple exponential smoothing.",
    },
    "lstm": {
        "display_name": "LSTM Neural Network",
        "description": "Deep learning with MC Dropout uncertainty estimation.",
    },
    "ensemble": {
        "display_name": "Moving Average Ensemble",
        "description": "Weighted ensemble with trend extrapolation.",
    },
}


def _generate_forecast_dates(start_date: str, end_date: str) -> List[str]:
    """Generate inclusive list of dates from startDate to endDate."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    result = []
    current = start
    while current <= end:
        result.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)
    return result


def _build_model_result(
    model_name: str, runner_result: dict, future_dates: List[str]
) -> dict:
    forecast_data = runner_result["forecast"]
    values = forecast_data["values"]
    ci = forecast_data.get("ci", {})

    forecast_points = []
    for i, (d, v) in enumerate(zip(future_dates, values)):
        point = {
            "date": d,
            "value": round(v, 2),
            "is_forecast": True,
        }
        if "0.80" in ci:
            point["ci_lower_80"] = round(ci["0.80"]["lower"][i], 2)
            point["ci_upper_80"] = round(ci["0.80"]["upper"][i], 2)
        if "0.95" in ci:
            point["ci_lower_95"] = round(ci["0.95"]["lower"][i], 2)
            point["ci_upper_95"] = round(ci["0.95"]["upper"][i], 2)
        forecast_points.append(point)

    meta = MODEL_META.get(model_name, {})
    metrics = runner_result["metrics"]

    return {
        "model_name": model_name,
        "model_display_name": meta.get("display_name", model_name),
        "description": meta.get("description", ""),
        "forecast": forecast_points,
        "metrics": {
            "mape": metrics.get("mape", 0),
            "rmse": metrics.get("rmse", 0),
            "mae": metrics.get("mae", 0),
            "aic": metrics.get("aic"),
            "bic": metrics.get("bic"),
        },
        "recommendation_score": metrics.get("recommendation_score", 0),
        "training_time_seconds": runner_result.get("training_time_seconds", 0),
        "params_used": runner_result.get("params_used", {}),
    }


def _distribute_to_intervals(
    forecast_dates: List[str],
    forecast_values: List[float],
    interval_minutes: int,
) -> tuple[List[dict], List[str]]:
    """Distribute daily forecast totals into intraday intervals."""
    dist = NORM_DIST_15 if interval_minutes == 15 else NORM_DIST_30
    time_slots = [t for t, _ in dist]
    result = []

    for d_str, daily_total in zip(forecast_dates, forecast_values):
        dt = date.fromisoformat(d_str)
        dow_idx = dt.weekday()  # 0=Mon, 6=Sun
        # Python weekday: Mon=0 → JS getDay() Sun=0, so map accordingly
        is_weekend = dow_idx >= 5  # Sat=5, Sun=6
        daily_calls = daily_total * 0.65 if is_weekend else daily_total
        dow_name = dt.strftime("%A")  # "Monday" etc.

        for time_label, pct in dist:
            result.append({
                "date": d_str,
                "time": time_label,
                "dayOfWeek": dow_name,
                "calls": round(daily_calls * pct),
                "isWeekend": is_weekend,
            })

    return result, time_slots


def _build_dow_pattern(
    interval_data: List[dict], time_slots: List[str]
) -> Dict[str, List[float]]:
    """Average interval calls by day-of-week."""
    pattern: Dict[str, List[float]] = {}
    counts: Dict[str, int] = {}

    for item in interval_data:
        key = item["dayOfWeek"].lower()
        if key not in pattern:
            pattern[key] = [0.0] * len(time_slots)
            counts[key] = 0
        slot_idx = time_slots.index(item["time"]) if item["time"] in time_slots else -1
        if slot_idx >= 0:
            pattern[key][slot_idx] += item["calls"]

    # Average by number of occurrences (count how many of each DOW in the data)
    dow_occurrence: Dict[str, int] = {}
    for item in interval_data:
        key = item["dayOfWeek"].lower()
        if item["time"] == time_slots[0]:  # count once per day
            dow_occurrence[key] = dow_occurrence.get(key, 0) + 1

    for key in pattern:
        n = dow_occurrence.get(key, 1)
        if n > 0:
            pattern[key] = [round(v / n) for v in pattern[key]]

    return pattern


def _generate_insights(
    model_results: dict, historical: pd.DataFrame, horizon: int
) -> List[dict]:
    insights = []

    # Trend insight
    if len(historical) >= 60:
        last_30_avg = historical["total_calls"].tail(30).mean()
        prior_30_avg = historical["total_calls"].iloc[-60:-30].mean()
        pct_change = (last_30_avg - prior_30_avg) / prior_30_avg * 100
        direction = "increase" if pct_change > 0 else "decrease"
        insights.append({
            "type": "trend",
            "title": f"Recent Trend: {abs(pct_change):.1f}% {direction}",
            "detail": (
                f"Call volumes have {direction}d by {abs(pct_change):.1f}% "
                f"over the last 30 days compared to the prior 30-day period."
            ),
            "severity": "warning" if abs(pct_change) > 10 else "info",
        })

    # Best model insight
    best = min(model_results.values(), key=lambda r: r["metrics"]["mape"])
    insights.append({
        "type": "recommendation",
        "title": f"Best Model: {best['model_display_name']}",
        "detail": (
            f"Lowest MAPE of {best['metrics']['mape']:.2f}%. "
            f"Recommended for production forecasting."
        ),
        "severity": "success",
    })

    # Forecast direction
    if model_results:
        best_key = min(model_results, key=lambda k: model_results[k]["metrics"]["mape"])
        best_forecast = model_results[best_key]["forecast"]
        if best_forecast:
            forecast_avg = np.mean([p["value"] for p in best_forecast])
            hist_avg = historical["total_calls"].tail(30).mean()
            delta = (forecast_avg - hist_avg) / hist_avg * 100
            insights.append({
                "type": "trend",
                "title": (
                    f"Forecast: {abs(delta):.1f}% "
                    f"{'increase' if delta > 0 else 'decrease'} expected"
                ),
                "detail": (
                    f"The {horizon}-day forecast average ({forecast_avg:,.0f} calls/day) "
                    f"is {abs(delta):.1f}% "
                    f"{'above' if delta > 0 else 'below'} the last 30-day average "
                    f"({hist_avg:,.0f} calls/day)."
                ),
                "severity": "info",
            })

    return insights


async def generate_forecast(request: ForecastRequest) -> dict:
    """
    Main forecast orchestration function.
    1. Fetch/cache historical data
    2. Train/test split
    3. Run all requested models in parallel
    4. Distribute to 15-min or 30-min intervals
    5. Build full response
    """
    job_id = str(uuid.uuid4())
    horizon = request.horizon
    logger.info(
        f"[{job_id}] Starting forecast: {request.startDate}→{request.endDate} "
        f"({horizon}d), models={request.models}, interval={request.intervalMinutes}min"
    )

    # Get data
    historical = await get_historical_data()
    train, test = get_train_test_split(historical, settings.TEST_DAYS)
    future_dates = _generate_forecast_dates(request.startDate, request.endDate)

    # Build historical points for chart (last 90 days)
    hist_points = [
        {
            "date": str(idx.date()),
            "value": round(float(row["total_calls"]), 2),
            "is_forecast": False,
        }
        for idx, row in historical.tail(90).iterrows()
    ]

    # Run models in parallel
    loop = asyncio.get_event_loop()
    tasks = {}
    for model_name in request.models:
        runner = MODEL_RUNNERS.get(model_name)
        if runner:
            tasks[model_name] = loop.run_in_executor(
                EXECUTOR,
                runner,
                train.copy(),
                test.copy(),
                horizon,
                request.confidence_intervals,
            )

    results_raw = await asyncio.gather(*tasks.values(), return_exceptions=True)

    model_results = {}
    for model_name, result in zip(tasks.keys(), results_raw):
        if isinstance(result, Exception):
            logger.error(f"[{job_id}] Model {model_name} failed: {result}")
        else:
            model_results[model_name.value] = _build_model_result(
                model_name.value, result, future_dates
            )

    if not model_results:
        raise RuntimeError("All forecasting models failed to produce results")

    # Best model
    best_model = min(
        model_results, key=lambda k: model_results[k]["metrics"]["mape"]
    )

    # Interval distribution (use best model forecast values)
    best_forecast_values = [p["value"] for p in model_results[best_model]["forecast"]]
    interval_data, time_slots = _distribute_to_intervals(
        future_dates, best_forecast_values, request.intervalMinutes
    )
    dow_pattern = _build_dow_pattern(interval_data, time_slots)

    # Distribution table
    distribution = generate_distribution_table(
        future_dates, best_forecast_values, historical, horizon
    )

    # Seasonality
    seasonality_raw = detect_seasonality(historical)
    seasonality = [
        {
            "period": s["period"],
            "strength": s["strength"],
            "peak_day_or_month": s["peak_day_or_month"],
            "description": s["description"],
        }
        for s in seasonality_raw
    ]

    # Insights
    insights = _generate_insights(model_results, historical, horizon)

    return {
        "job_id": job_id,
        "status": "completed",
        "startDate": request.startDate,
        "endDate": request.endDate,
        "horizon": horizon,
        "intervalMinutes": request.intervalMinutes,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "model_results": model_results,
        "historical_data": hist_points,
        "seasonality": seasonality,
        "distribution": distribution,
        "insights": insights,
        "best_model": best_model,
        "interval_data": interval_data,
        "dow_pattern": dow_pattern,
        "interval_time_slots": time_slots,
    }
