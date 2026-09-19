#!/usr/bin/env bash
# data/load.sh — Parquet を GCS 経由で BigQuery の partd データセットに投入する
#
#   ./data/load.sh --plan     # 実行するコマンドを表示するだけ（既定。課金なし）
#   ./data/load.sh --run      # 実際に実行する（★課金が発生する）
#   ./data/load.sh --run geo_drug   # テーブルを絞る
#
# 課金するもの: GCS の保存とオペレーション、BigQuery のストレージ。
# ロード自体（bq load）は無料。GCS の一時ファイルは最後に消す。
#
# 冪等性: テーブル単位で --replace（WRITE_TRUNCATE）。同じ年を二重に入れる事故を防ぐため、
# 年ごとの追記ではなく「そのテーブルの全 Parquet をまとめて置き換える」方式にしている。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARQUET="$ROOT/data/parquet"

# .env から設定を読む（無ければ環境変数か既定値）
if [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
fi
PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
DATASET="${BQ_DATASET:-partd}"
LOCATION="${BQ_LOCATION:-US}"
BUCKET="${LOAD_BUCKET:-${PROJECT}-partd-load}"

mode="plan"
tables=""
for arg in "$@"; do
  case "$arg" in
    --plan) mode="plan" ;;
    --run)  mode="run" ;;
    geo_drug|provider|provider_drug) tables="$tables $arg" ;;
    *) echo "不明な引数: $arg" >&2; exit 2 ;;
  esac
done
tables="${tables:-geo_drug provider provider_drug}"

run() {
  if [ "$mode" = "run" ]; then
    echo "+ $*"; "$@"
  else
    echo "  $*"
  fi
}

# SQL は引数展開すると全文が出て読めないので stdin から流す
run_sql_file() {
  local f="$1"
  if [ "$mode" = "run" ]; then
    echo "+ bq query --use_legacy_sql=false < $f"
    bq --project_id="$PROJECT" --location="$LOCATION" query --use_legacy_sql=false --quiet < "$f"
  else
    echo "  bq --project_id=$PROJECT --location=$LOCATION query --use_legacy_sql=false < $f"
  fi
}

echo "project=$PROJECT  dataset=$DATASET  location=$LOCATION  bucket=gs://$BUCKET"
echo "対象テーブル:$tables"
echo
[ -n "$PROJECT" ] || { echo "GCP_PROJECT が未設定です" >&2; exit 1; }

echo "--- 1. データセットと GCS バケット ---"
if ! bq --project_id="$PROJECT" show --dataset "$PROJECT:$DATASET" >/dev/null 2>&1; then
  run bq --project_id="$PROJECT" --location="$LOCATION" mk -d \
     --description "CMS Medicare Part D Prescribers CY2022-2024" "$DATASET"
else
  echo "  （データセット $DATASET は作成済み）"
fi
if ! gcloud storage ls "gs://$BUCKET" >/dev/null 2>&1; then
  run gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT" \
     --location="$LOCATION" --uniform-bucket-level-access
else
  echo "  （バケット gs://$BUCKET は作成済み）"
fi

echo
echo "--- 2. テーブル定義（sql/ddl.sql）---"
run_sql_file "$ROOT/sql/ddl.sql"

echo
echo "--- 3. Parquet を GCS へ ---"
for t in $tables; do
  run gcloud storage cp "$PARQUET/${t}_"20*.parquet "gs://$BUCKET/parquet/$t/" --project="$PROJECT"
done

echo
echo "--- 4. bq load（Parquet -> 既存テーブルを置換）---"
# スキーマは sql/ddl.sql で作った既存テーブルのものを使う。自動検出はしない。
for t in $tables; do
  run bq --project_id="$PROJECT" --location="$LOCATION" load \
     --source_format=PARQUET --replace \
     "$DATASET.$t" "gs://$BUCKET/parquet/$t/*.parquet"
done

echo
echo "--- 5. 補助テーブルの投入 ---"
for f in seed_state seed_drug_class; do
  run_sql_file "$ROOT/sql/$f.sql"
done

echo
echo "--- 6. GCS の一時ファイルを削除（保存料金を残さない）---"
run gcloud storage rm -r "gs://$BUCKET/parquet" --project="$PROJECT"

echo
echo "--- 7. 行数確認 ---"
count_sql="SELECT 'provider_drug' t, year, count(*) n FROM \`$PROJECT.$DATASET.provider_drug\` GROUP BY 1,2
UNION ALL SELECT 'provider', year, count(*) FROM \`$PROJECT.$DATASET.provider\` GROUP BY 1,2
UNION ALL SELECT 'geo_drug', year, count(*) FROM \`$PROJECT.$DATASET.geo_drug\` GROUP BY 1,2
ORDER BY 1,2"
run bq --project_id="$PROJECT" --location="$LOCATION" query --use_legacy_sql=false "$count_sql"

if [ "$mode" = "plan" ]; then
  echo
  echo "※ これは --plan（表示のみ）です。実行するには ./data/load.sh --run"
fi
