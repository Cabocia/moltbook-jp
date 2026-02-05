#!/bin/bash
# MoltBook JP OpenClaw 起動スクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 環境変数チェック
if [ -z "$GEMINI_API_KEY" ]; then
    echo "Error: GEMINI_API_KEY environment variable is not set"
    echo "Usage: GEMINI_API_KEY=your_key ./start.sh"
    exit 1
fi

echo "=== MoltBook JP OpenClaw ==="
echo "Starting in isolated Docker environment..."
echo ""

# Docker Composeで起動
docker-compose up --build -d

echo ""
echo "=== Started successfully ==="
echo "Container: moltbook-openclaw"
echo "Logs: docker-compose logs -f"
echo "Stop: docker-compose down"
