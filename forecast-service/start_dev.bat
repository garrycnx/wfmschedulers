@echo off
echo === WFM Forecast Service - Dev Setup ===

if not exist .env (
    copy .env.example .env
    echo Created .env from .env.example - please review settings
)

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt

if not exist cache mkdir cache

echo.
echo Starting forecast service on http://localhost:8001
echo Press Ctrl+C to stop
echo.

uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
