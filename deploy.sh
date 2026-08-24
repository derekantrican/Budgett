#!/bin/bash
set -e

cd /home/derek/Budgett

MODE="${1:-tmux}"

if [ "$MODE" = "docker" ]; then
  echo "Stopping existing Docker container (if running)..."
  docker compose down

  echo "Pulling latest from GitHub..."
  git pull

  echo "Building image and starting container..."
  docker compose up --build -d

  echo "Done! Container is running."
  echo "  View logs with: docker compose logs -f"
  exit 0
fi

echo "Pulling latest from GitHub..."
git pull

echo "Installing dependencies..."
npm run install:all

echo "Building client..."
cd client && npm run build && cd ..

echo "Stopping existing server..."
tmux kill-session -t budgett 2>/dev/null || true

echo "Starting server in tmux..."
tmux new-session -d -s budgett "cd /home/derek/Budgett/server && NODE_ENV=production node index.js"

echo "Done! Server is running in tmux session 'budgett'"
echo "  Attach with: tmux attach -t budgett"
