import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.forecast import router as forecast_router
from app.routes.health import router as health_router

settings = get_settings()

# Logging setup
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# Azure Application Insights (optional)
if settings.APPLICATIONINSIGHTS_CONNECTION_STRING:
    try:
        from opencensus.ext.azure.log_exporter import AzureLogHandler

        azure_handler = AzureLogHandler(
            connection_string=settings.APPLICATIONINSIGHTS_CONNECTION_STRING
        )
        logging.getLogger().addHandler(azure_handler)
        logger.info("Azure Application Insights logging enabled")
    except ImportError:
        logger.warning(
            "opencensus-ext-azure not installed; Application Insights disabled"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up: pre-load and cache historical data on startup."""
    logger.info("Forecast service starting up...")
    try:
        from app.services.data_service import get_historical_data

        df = await get_historical_data()
        logger.info(f"Historical data pre-loaded: {len(df)} days")
    except Exception as e:
        logger.error(f"Failed to pre-load data: {e}")
    yield
    logger.info("Forecast service shutting down")


app = FastAPI(
    title="WFM Forecast Service",
    description=(
        "Production-ready forecasting microservice for workforce management scheduling"
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — restrict to your Azure domains in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(forecast_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
