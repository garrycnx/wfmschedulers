from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Data source
    DATA_API_URL: str = "https://bank-api-pnp9.onrender.com/data"
    DATA_API_TIMEOUT: int = 30
    DATA_CACHE_TTL_SECONDS: int = 3600  # 1 hour
    DATA_CACHE_DIR: str = "./cache"

    # Forecast defaults
    DEFAULT_HORIZON: int = 30
    TEST_DAYS: int = 30  # days held out for metrics
    CI_LEVELS: list[float] = [0.80, 0.95]

    # Azure (optional)
    AZURE_STORAGE_CONNECTION_STRING: str = ""
    AZURE_CONTAINER_NAME: str = "forecast-cache"
    APPLICATIONINSIGHTS_CONNECTION_STRING: str = ""

    # LSTM settings
    LSTM_WINDOW: int = 30
    LSTM_EPOCHS: int = 50
    LSTM_BATCH_SIZE: int = 16
    LSTM_MC_SAMPLES: int = 50

    # Server
    PORT: int = 8001
    HOST: str = "0.0.0.0"
    DEBUG: bool = False

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
