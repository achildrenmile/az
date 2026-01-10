#!/bin/bash

# Arbeitszeit Docker Deploy Script
# Builds and deploys the application locally using Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="arbeitszeit"
IMAGE_NAME="arbeitszeit:latest"
PORT=3000

cd "$SCRIPT_DIR"

echo "=========================================="
echo "Arbeitszeit Docker Deployment"
echo "=========================================="
echo ""

# Ensure data directory exists and has correct permissions
DATA_DIR="/var/www/arbeitszeit"
if [ ! -d "$DATA_DIR" ]; then
    echo "Creating data directory at $DATA_DIR..."
    sudo mkdir -p "$DATA_DIR"
    sudo chown -R $USER:$USER "$DATA_DIR"
fi

# Stop and remove existing container if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# Build the Docker image
echo ""
echo "Building Docker image..."
docker compose build --no-cache

# Start the container
echo ""
echo "Starting container..."
docker compose up -d

# Wait for health check
echo ""
echo "Waiting for container to become healthy..."
for i in {1..30}; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "starting")
    if [ "$STATUS" = "healthy" ]; then
        echo "Container is healthy!"
        break
    elif [ "$STATUS" = "unhealthy" ]; then
        echo "Container is unhealthy. Checking logs..."
        docker logs "$CONTAINER_NAME" --tail 20
        exit 1
    fi
    echo "  Status: $STATUS (attempt $i/30)"
    sleep 2
done

# Show final status
echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Application running at: http://localhost:${PORT}"
echo ""
