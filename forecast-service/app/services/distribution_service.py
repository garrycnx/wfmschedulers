import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict


def compute_dow_weights(historical: pd.DataFrame) -> Dict[int, float]:
    """Compute day-of-week allocation weights from last 8 weeks."""
    if len(historical) < 56:
        df = historical.copy()
    else:
        df = historical.tail(56).copy()
    df.index = pd.DatetimeIndex(df.index)
    dow_avg = df.groupby(df.index.dayofweek)["total_calls"].mean()
    total = dow_avg.sum()
    return {int(k): float(v / total) for k, v in dow_avg.items()}


def generate_distribution_table(
    forecast_dates: List[str],
    forecast_values: List[float],
    historical: pd.DataFrame,
    horizon: int,
) -> List[dict]:
    """
    Generate interval distribution table showing weekly/monthly allocations.
    """
    dow_weights = compute_dow_weights(historical)
    rows = []

    if horizon <= 14:
        interval_type = "Daily"
        for d, v in zip(forecast_dates, forecast_values):
            dt = datetime.strptime(d, "%Y-%m-%d")
            dow = dt.weekday()
            alloc_pct = round(dow_weights.get(dow, 1 / 7) * 100, 2)
            rows.append(
                {
                    "date_range": d,
                    "forecast_total": round(v, 0),
                    "interval_type": interval_type,
                    "allocation_pct": alloc_pct,
                    "status": "Projected",
                }
            )
    elif horizon <= 60:
        # Weekly grouping
        dates = [datetime.strptime(d, "%Y-%m-%d") for d in forecast_dates]
        vals = np.array(forecast_values)

        # Group by ISO week
        seen_weeks = set()
        for i, (dt, v) in enumerate(zip(dates, vals)):
            week_key = (dt.isocalendar()[0], dt.isocalendar()[1])
            if week_key not in seen_weeks:
                seen_weeks.add(week_key)
                week_start = dt - timedelta(days=dt.weekday())
                week_end = week_start + timedelta(days=6)
                week_vals = [
                    vals[j]
                    for j, d2 in enumerate(dates)
                    if week_start <= d2 <= week_end
                ]
                total = sum(week_vals)
                overall_total = sum(forecast_values)
                rows.append(
                    {
                        "date_range": (
                            f"{week_start.strftime('%b %d')} – "
                            f"{week_end.strftime('%b %d, %Y')}"
                        ),
                        "forecast_total": round(total, 0),
                        "interval_type": "Weekly",
                        "allocation_pct": (
                            round(total / overall_total * 100, 2)
                            if overall_total > 0
                            else 0
                        ),
                        "status": "Projected",
                    }
                )
    else:
        # Monthly grouping
        dates = [datetime.strptime(d, "%Y-%m-%d") for d in forecast_dates]
        vals = np.array(forecast_values)
        monthly = {}
        for dt, v in zip(dates, vals):
            key = dt.strftime("%B %Y")
            monthly.setdefault(key, 0)
            monthly[key] += v

        overall_total = sum(forecast_values)
        for month_label, total in monthly.items():
            rows.append(
                {
                    "date_range": month_label,
                    "forecast_total": round(total, 0),
                    "interval_type": "Monthly",
                    "allocation_pct": (
                        round(total / overall_total * 100, 2)
                        if overall_total > 0
                        else 0
                    ),
                    "status": "Projected",
                }
            )

    return rows
