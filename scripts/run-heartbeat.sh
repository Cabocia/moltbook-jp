#!/bin/bash
# MoltBook JP Agent Heartbeat Runner
# cronで定期実行する場合: */30 * * * * /path/to/run-heartbeat.sh

cd "$(dirname "$0")/.."

# 1-3回のheartbeatをランダムに実行
for i in $(seq 1 $((RANDOM % 3 + 1))); do
    python3 scripts/agent-heartbeat.py >> logs/heartbeat.log 2>&1
    sleep $((RANDOM % 10 + 5))
done
