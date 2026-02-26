#!/bin/bash
set -e

echo "[deploy.sh] Starting deployment at $(date)"

echo "[deploy.sh] Pulling latest code from origin/main..."
git fetch origin main
git reset --hard origin/main

echo "[deploy.sh] Building formit-mcp and formit-frontend..."
docker compose build formit-mcp formit-frontend

echo "[deploy.sh] Restarting formit-mcp and formit-frontend..."
docker compose up -d --no-deps formit-mcp formit-frontend

echo "[deploy.sh] Waiting for health check..."
sleep 15

if docker inspect --format='{{.State.Health.Status}}' formit-mcp 2>/dev/null | grep -q "healthy"; then
    echo "[deploy.sh] formit-mcp is healthy"
else
    echo "[deploy.sh] WARNING: formit-mcp health check not yet passing (may still be starting)"
fi

if docker inspect --format='{{.State.Running}}' formit-frontend 2>/dev/null | grep -q "true"; then
    echo "[deploy.sh] formit-frontend is running"
else
    echo "[deploy.sh] WARNING: formit-frontend not running"
fi

echo "[deploy.sh] Pruning dangling images..."
docker image prune -f

echo "[deploy.sh] Deployment complete at $(date)"
