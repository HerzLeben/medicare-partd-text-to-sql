#!/usr/bin/env bash
# run.sh — ローカルで API とフロントを同時に起動する
#
#   ./run.sh          開発モード（Next.js の HMR あり）
#   ./run.sh prod     本番相当（next build 済みを起動）
#
# 止めるときは Ctrl-C。両方まとめて終了する。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="${1:-dev}"
API_PORT=8000
WEB_PORT=3000

# --- 事前チェック -----------------------------------------------------------
[ -d .venv ] || { echo "エラー: .venv がありません。python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2; exit 1; }
[ -f .env ] || { echo "エラー: .env がありません。.env.example をコピーして ANTHROPIC_API_KEY を入れてください" >&2; exit 1; }
grep -q '^ANTHROPIC_API_KEY=sk-ant-\.\.\.' .env && { echo "エラー: .env の ANTHROPIC_API_KEY がプレースホルダのままです" >&2; exit 1; }
[ -d web/node_modules ] || { echo "エラー: web/node_modules がありません。cd web && npm install" >&2; exit 1; }

command -v gcloud >/dev/null || echo "警告: gcloud が見つかりません。BigQuery の認証に application-default credentials が要ります" >&2

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# --- API --------------------------------------------------------------------
echo "[api] http://localhost:$API_PORT で起動します"
ALLOW_DEV_CORS=1 PYTHONPATH="$ROOT" .venv/bin/uvicorn api.main:app \
  --port "$API_PORT" --log-level warning &

# 受け付けるまで待つ
for _ in $(seq 60); do
  curl -sf "http://localhost:$API_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done

# --- フロント ---------------------------------------------------------------
cd web
if [ "$MODE" = "prod" ]; then
  echo "[web] ビルドしています"
  npm run build
  echo "[web] http://localhost:$WEB_PORT （本番相当）"
  npm run start -- --port "$WEB_PORT" &
else
  echo "[web] http://localhost:$WEB_PORT （開発モード）"
  npm run dev -- --port "$WEB_PORT" &
fi

echo
echo "  →  http://localhost:$WEB_PORT  を開いてください（Ctrl-C で両方終了）"
echo
wait
