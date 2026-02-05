#!/bin/bash
# MoltBook JP OpenClaw 起動スクリプト
# Secret Managerから自動でGemini APIキーを取得

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GCP_PROJECT="cabocia-intelligence"

echo "=== MoltBook JP OpenClaw ==="
echo "Starting in isolated Docker environment..."
echo ""

# Secret ManagerからGemini APIキーを取得
if [ -z "$GEMINI_API_KEY" ]; then
    echo "Fetching Gemini API key from Secret Manager..."
    export GEMINI_API_KEY=$(gcloud secrets versions access latest \
        --secret=gemini-api-key \
        --project=$GCP_PROJECT 2>/dev/null)

    if [ -z "$GEMINI_API_KEY" ]; then
        echo "Error: Failed to fetch GEMINI_API_KEY from Secret Manager"
        echo "Make sure you have access to cabocia-intelligence project"
        exit 1
    fi
    echo "✓ Gemini API key loaded from Secret Manager"
fi

# Docker Composeで起動
docker-compose up --build -d

echo ""
echo "=== Started successfully ==="
echo "Container: moltbook-openclaw"
echo "Logs: docker-compose logs -f"
echo "Stop: docker-compose down"
