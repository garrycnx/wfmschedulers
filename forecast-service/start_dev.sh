#!/bin/bash
echo "=== WFM Forecast Service - Dev Setup ==="

[ ! -f .env ] && cp .env.example .env && echo "Created .env from .env.example"
[ ! -d venv ] && python3 -m venv venv

source venv/bin/activate
pip install -r requirements.txt
mkdir -p cache

echo ""
echo "Starting forecast service on http://localhost:8001"
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
