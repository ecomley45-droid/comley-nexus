#!/bin/bash
cd "$(dirname "$0")"

echo "Starting CMS dev server..."
npm run dev &

echo "Waiting for server to start..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:5173/; then
    echo "Opening browser..."
    open http://localhost:5173/
    exit 0
  fi
  sleep 1
done

echo "Server didn't respond on http://localhost:5173/ after 30s — check the npm run dev output above."
