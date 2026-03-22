import logging
import io

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from app.schemas.request import ForecastRequest
from app.services.data_service import get_historical_data
from app.services.forecast_service import generate_forecast, MODEL_META

router = APIRouter(prefix="/api/forecast", tags=["Forecast"])
logger = logging.getLogger(__name__)

# In-memory result store (use Redis in production)
_result_cache: dict = {}


@router.get("/models")
async def list_models():
    """List all available forecasting models with descriptions."""
    models = []
    for key, meta in MODEL_META.items():
        models.append(
            {
                "id": key,
                "display_name": meta["display_name"],
                "description": meta["description"],
                "accuracy_metrics": (
                    "AIC, BIC, MAPE, RMSE, MAE"
                    if key == "arima"
                    else "MAPE, RMSE, MAE"
                ),
            }
        )
    return {"models": models}


@router.post("/generate")
async def generate(request: ForecastRequest):
    """
    Generate forecasts using all specified models.
    Runs training + test evaluation + future forecast.
    Returns complete results including metrics, confidence intervals,
    distribution, and insights.
    """
    try:
        result = await generate_forecast(request)
        _result_cache[result["job_id"]] = result
        return result
    except Exception as e:
        logger.exception("Forecast generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/result/{job_id}")
async def get_result(job_id: str):
    """Retrieve a previously generated forecast result by job ID."""
    result = _result_cache.get(job_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Forecast result not found. Results expire after server restart.",
        )
    return result


@router.get("/history")
async def get_history(days: int = Query(default=90, ge=7, le=365)):
    """Get last N days of historical data."""
    try:
        df = await get_historical_data()
        subset = df.tail(days)
        data = [
            {"date": str(idx.date()), "value": round(float(row["total_calls"]), 2)}
            for idx, row in subset.iterrows()
        ]
        return {"data": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/{job_id}")
async def export_forecast(
    job_id: str,
    format: str = Query(default="csv", pattern="^(csv|json|excel)$"),
):
    """Export forecast results as CSV, JSON, or Excel."""
    result = _result_cache.get(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    best_model = result["best_model"]
    forecast_points = result["model_results"][best_model]["forecast"]

    df = pd.DataFrame(forecast_points)

    if format == "csv":
        content = df.to_csv(index=False)
        return StreamingResponse(
            io.StringIO(content),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=forecast_{job_id[:8]}.csv"
            },
        )
    elif format == "json":
        return JSONResponse(content=result)
    elif format == "excel":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Forecast", index=False)
            pd.DataFrame(result["distribution"]).to_excel(
                writer, sheet_name="Distribution", index=False
            )
            # Metrics summary
            metrics_rows = []
            for m_name, m_result in result["model_results"].items():
                row = {"model": m_result["model_display_name"]}
                row.update(m_result["metrics"])
                metrics_rows.append(row)
            pd.DataFrame(metrics_rows).to_excel(
                writer, sheet_name="Model Metrics", index=False
            )
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            headers={
                "Content-Disposition": (
                    f"attachment; filename=forecast_{job_id[:8]}.xlsx"
                )
            },
        )


@router.post("/refresh-cache")
async def refresh_cache():
    """Force refresh of the historical data cache."""
    try:
        df = await get_historical_data(force_refresh=True)
        return {
            "message": "Cache refreshed",
            "records": len(df),
            "date_range": (
                f"{df.index.min().date()} to {df.index.max().date()}"
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
