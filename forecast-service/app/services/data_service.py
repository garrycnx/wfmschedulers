import asyncio
import logging
from datetime import datetime, timedelta, date
from typing import Optional
import httpx
import pandas as pd
import numpy as np
import diskcache
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Initialize disk cache
cache = diskcache.Cache(settings.DATA_CACHE_DIR, size_limit=100 * 1024 * 1024)  # 100MB
CACHE_KEY = "historical_call_data"


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
)
async def _fetch_from_api() -> list[dict]:
    """Fetch raw data from external API with retry logic."""
    async with httpx.AsyncClient(timeout=settings.DATA_API_TIMEOUT) as client:
        logger.info(f"Fetching data from {settings.DATA_API_URL}")
        response = await client.get(settings.DATA_API_URL)
        response.raise_for_status()
        data = response.json()
        logger.info(f"Fetched {len(data)} records from API")
        return data


def _validate_and_clean(raw: list[dict]) -> pd.DataFrame:
    """
    Validate and clean raw API data.
    - Parse dates
    - Fill missing dates (forward fill / linear interpolation)
    - Remove obvious outliers (>4 std from rolling mean)
    - Ensure monotonic date index
    """
    df = pd.DataFrame(raw)

    # Validate expected columns
    if "date" not in df.columns or "total_calls" not in df.columns:
        raise ValueError(f"API response missing required columns. Got: {df.columns.tolist()}")

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").drop_duplicates(subset=["date"])
    df = df.set_index("date")

    # Ensure numeric
    df["total_calls"] = pd.to_numeric(df["total_calls"], errors="coerce")

    # Fill missing dates in the time series
    full_range = pd.date_range(start=df.index.min(), end=df.index.max(), freq="D")
    df = df.reindex(full_range)

    # Interpolate missing values
    df["total_calls"] = (
        df["total_calls"]
        .interpolate(method="linear")
        .fillna(method="bfill")
        .fillna(method="ffill")
    )

    # Remove extreme outliers (>4 std dev from 30-day rolling mean)
    rolling_mean = df["total_calls"].rolling(30, center=True, min_periods=7).mean()
    rolling_std = df["total_calls"].rolling(30, center=True, min_periods=7).std()
    lower = rolling_mean - 4 * rolling_std
    upper = rolling_mean + 4 * rolling_std
    mask = (df["total_calls"] < lower) | (df["total_calls"] > upper)
    if mask.sum() > 0:
        logger.warning(f"Removing {mask.sum()} outlier data points")
        df.loc[mask, "total_calls"] = np.nan
        df["total_calls"] = df["total_calls"].interpolate(method="linear")

    df.index.name = "date"
    logger.info(
        f"Data cleaned: {len(df)} days from {df.index.min().date()} to {df.index.max().date()}"
    )
    return df


async def get_historical_data(force_refresh: bool = False) -> pd.DataFrame:
    """
    Get historical data with caching.
    Cache TTL = settings.DATA_CACHE_TTL_SECONDS (default 1 hour).
    """
    if not force_refresh and CACHE_KEY in cache:
        logger.info("Returning cached historical data")
        df = cache[CACHE_KEY]
        return df

    raw = await _fetch_from_api()
    df = _validate_and_clean(raw)

    # Cache with TTL
    cache.set(CACHE_KEY, df, expire=settings.DATA_CACHE_TTL_SECONDS)
    return df


def get_train_test_split(
    df: pd.DataFrame, test_days: int
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split dataframe into train / test (last N days = test)."""
    test_start = df.index[-test_days]
    train = df[df.index < test_start].copy()
    test = df[df.index >= test_start].copy()
    return train, test


def detect_seasonality(df: pd.DataFrame) -> list[dict]:
    """Detect weekly and yearly seasonality patterns from data."""
    patterns = []

    # Weekly pattern: avg by day of week
    df_copy = df.copy()
    df_copy["dow"] = df_copy.index.dayofweek
    dow_avg = df_copy.groupby("dow")["total_calls"].mean()
    dow_names = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ]
    peak_dow = dow_avg.idxmax()
    low_dow = dow_avg.idxmin()
    weekly_strength = (dow_avg.max() - dow_avg.min()) / dow_avg.mean()

    patterns.append(
        {
            "period": "weekly",
            "strength": round(float(min(1.0, weekly_strength)), 3),
            "peak_day_or_month": dow_names[peak_dow],
            "description": (
                f"Peak on {dow_names[peak_dow]}, lowest on {dow_names[low_dow]}. "
                f"Weekly variation: ±{weekly_strength * 50:.1f}% from average."
            ),
        }
    )

    # Monthly pattern
    df_copy["month"] = df_copy.index.month
    month_avg = df_copy.groupby("month")["total_calls"].mean()
    month_names = [
        "",
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]
    peak_month = month_avg.idxmax()
    monthly_strength = (month_avg.max() - month_avg.min()) / month_avg.mean()

    patterns.append(
        {
            "period": "monthly",
            "strength": round(float(min(1.0, monthly_strength)), 3),
            "peak_day_or_month": month_names[peak_month],
            "description": f"Peak month: {month_names[peak_month]}. Seasonal variation: ±{monthly_strength * 50:.1f}%.",
        }
    )

    return patterns
