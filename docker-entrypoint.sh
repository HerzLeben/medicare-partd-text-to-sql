#!/bin/bash
# FastAPI を内側（8000）で、Next.js を外向き（${PORT}）で動かす。
# どちらかが落ちたらコンテナごと終了させて Cloud Run に作り直させる。
set -e

uvicorn api.main:app --host 127.0.0.1 --port 8000 --log-level warning &
API_PID=$!

# API が受け付けるまで待つ（Next.js の起動直後にプロキシが 502 を返さないように）
i=0
while [ $i -lt 60 ]; do
  if python -c "import socket,sys; s=socket.socket(); sys.exit(s.connect_ex(('127.0.0.1',8000)))" 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.5
done

HOSTNAME=0.0.0.0 PORT="${PORT:-8080}" node web/server.js &
WEB_PID=$!

# どちらかの終了を待って、もう片方も止める
wait -n "$API_PID" "$WEB_PID"
kill "$API_PID" "$WEB_PID" 2>/dev/null || true
exit 1
