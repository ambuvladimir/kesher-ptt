#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && npm install && npx prisma generate && npx prisma db push && npm run dev) &
API_PID=$!
(cd web && npm install && npm run dev) &
WEB_PID=$!
trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM
wait
