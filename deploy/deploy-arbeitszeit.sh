#!/bin/bash

# Arbeitszeit-Tracker Auto-Deploy Script
# Polls GitHub for changes and restarts if needed

REPO_DIR="/home/oe8yml/arbeitszeit"
DEPLOY_DIR="/var/www/arbeitszeit"
LOG_FILE="/home/oe8yml/arbeitszeit-deploy.log"
LOCK_FILE="/tmp/arbeitszeit-deploy.lock"
PM2_NAME="arbeitszeit"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if already running
if [ -f "$LOCK_FILE" ]; then
    log "Deploy already running, skipping..."
    exit 0
fi

# Create lock file
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

cd "$REPO_DIR" || {
    log "ERROR: Cannot access $REPO_DIR"
    exit 1
}

# Fetch latest changes from remote
log "Fetching changes from GitHub..."
git fetch origin main 2>&1 | tee -a "$LOG_FILE"

# Check if there are new commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "No changes detected. Already up to date."
    exit 0
fi

log "Changes detected! Deploying..."
log "Local:  $LOCAL"
log "Remote: $REMOTE"

# Pull changes
log "Pulling changes..."
git pull origin main 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
    log "ERROR: Git pull failed!"
    exit 1
fi

# Install dependencies
log "Installing dependencies..."
npm install 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
    log "ERROR: npm install failed!"
    exit 1
fi

# Sync to deploy directory (exclude .git and node_modules)
log "Syncing to $DEPLOY_DIR..."
rsync -av --exclude='.git' --exclude='node_modules' --exclude='*.db' "$REPO_DIR/" "$DEPLOY_DIR/" 2>&1 | tee -a "$LOG_FILE"

# Install dependencies in deploy dir
log "Installing dependencies in deploy directory..."
cd "$DEPLOY_DIR" && npm install --production 2>&1 | tee -a "$LOG_FILE"

# Restart PM2 process
log "Restarting PM2 process..."
pm2 restart "$PM2_NAME" 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
    log "ERROR: PM2 restart failed!"
    exit 1
fi

log "Deploy completed successfully!"
log "============================================"
