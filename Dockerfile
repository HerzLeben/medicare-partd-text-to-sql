# Next.js（画面）と FastAPI（エージェント）を1コンテナに同居させる。
# Cloud Run のサービスを1つに保つため。Next.js が /api/* を 127.0.0.1:8000 へ
# プロキシするので、外に開くポートは Next.js の 1つだけ。

# --- 1. フロントをビルド ----------------------------------------------------
FROM node:22-slim AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- 2. 実行イメージ --------------------------------------------------------
FROM python:3.12-slim
WORKDIR /srv

# Node は Next.js の standalone サーバを動かすためだけに入れる
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# バックエンド（エージェント本体）
COPY app/ ./app/
COPY api/ ./api/

# フロント（standalone は依存を同梱している）
COPY --from=web /build/.next/standalone ./web/
COPY --from=web /build/.next/static ./web/.next/static
# public/ は置いていない（create-next-app の既定アセットは使わないので消した）。
# 静的ファイルを足したら COPY --from=web /build/public ./web/public を戻すこと。

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV PYTHONPATH=/srv \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_ORIGIN=http://127.0.0.1:8000 \
    PORT=8080

EXPOSE 8080
CMD ["./docker-entrypoint.sh"]
