# WFM Forecast Service

A production-ready FastAPI microservice that forecasts daily call volumes for workforce management scheduling. It runs five forecasting models in parallel (Prophet, ARIMA/SARIMA, ETS/Holt-Winters, LSTM, Moving Average Ensemble), evaluates each on a held-out test set, and returns ranked predictions with confidence intervals, seasonality analysis, and a distribution table.

---

## Setup

### 1. Clone and install

```bash
cd forecast-service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed — defaults work out of the box
```

Key settings:

| Variable | Default | Description |
|---|---|---|
| `DATA_API_URL` | `https://bank-api-pnp9.onrender.com/data` | Source of historical call volume data |
| `DATA_CACHE_TTL_SECONDS` | `3600` | How long to cache fetched data (seconds) |
| `TEST_DAYS` | `30` | Days held out for model evaluation |
| `LSTM_EPOCHS` | `50` | LSTM training epochs (reduce for faster dev) |
| `PORT` | `8001` | Server port |

---

## Running locally

```bash
uvicorn app.main:app --reload --port 8001
```

The service will:
1. Fetch and cache 3 years of historical data on startup
2. Be available at `http://localhost:8001`
3. Serve interactive API docs at `http://localhost:8001/docs`

---

## Docker

```bash
# Build
docker build -t forecast-service .

# Run
docker run -p 8001:8001 --env-file .env forecast-service
```

---

## Running tests

```bash
pytest tests/ -v
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/forecast/models` | List all available models |
| `POST` | `/api/forecast/generate` | Run forecast (all or selected models) |
| `GET` | `/api/forecast/result/{job_id}` | Retrieve a previous forecast result |
| `GET` | `/api/forecast/history?days=90` | Get historical data |
| `GET` | `/api/forecast/export/{job_id}?format=csv` | Export results (csv / json / excel) |
| `POST` | `/api/forecast/refresh-cache` | Force refresh data cache |

### Example: Generate a forecast

```bash
curl -X POST http://localhost:8001/api/forecast/generate \
  -H "Content-Type: application/json" \
  -d '{
    "horizon": 30,
    "models": ["prophet", "ets", "ensemble"],
    "confidence_intervals": [0.80, 0.95]
  }'
```

Response includes:
- `model_results` — per-model forecast points with confidence intervals and MAPE/RMSE/MAE metrics
- `best_model` — model with lowest MAPE
- `historical_data` — last 90 days of actuals
- `seasonality` — detected weekly and monthly patterns
- `distribution` — weekly/monthly allocation table
- `insights` — trend and recommendation summaries

---

## Azure Deployment

### App Service (recommended)

1. Push the Docker image to Azure Container Registry:
   ```bash
   az acr build --registry <your-acr> --image forecast-service:latest .
   ```

2. Create an App Service (Linux, container) pointing to your image.

3. Set environment variables in App Service Configuration matching `.env.example`.

4. Health check path: `/health`

5. Exposed port: `8001`

### Optional integrations

- **Azure Blob Storage** — set `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_CONTAINER_NAME` for cloud-backed cache (pluggable; default uses local diskcache)
- **Application Insights** — set `APPLICATIONINSIGHTS_CONNECTION_STRING` to enable structured log shipping
