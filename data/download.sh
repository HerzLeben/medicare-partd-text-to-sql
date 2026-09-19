#!/usr/bin/env bash
# data/download.sh — data.cms.gov から Part D Prescribers の CSV を取得する
#
#   ./data/download.sh                 # 既定：3データセット × CY2022-2024（全9ファイル、約8GB）
#   ./data/download.sh geo_drug 2024   # データセットと年を絞る
#   ./data/download.sh --list          # 取得予定の URL を表示するだけ
#
# URL は固定せず、CMS の DCAT カタログ（data.cms.gov/data.json）から毎回解決する。
# CMS は年次更新のたびにファイル名と配置パスを変えるため、直書きするとすぐ腐る。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW="$ROOT/data/raw"
CATALOG="$RAW/_catalog.json"
CATALOG_URL="https://data.cms.gov/data.json"
CATALOG_MAX_AGE_HOURS=24

DATASETS_DEFAULT="geo_drug provider provider_drug"
YEARS_DEFAULT="2022 2023 2024"

list_only=0
datasets=""
years=""
for arg in "$@"; do
  case "$arg" in
    --list) list_only=1 ;;
    geo_drug|provider|provider_drug) datasets="$datasets $arg" ;;
    20[0-9][0-9]) years="$years $arg" ;;
    *) echo "不明な引数: $arg" >&2; exit 2 ;;
  esac
done
datasets="${datasets:-$DATASETS_DEFAULT}"
years="${years:-$YEARS_DEFAULT}"

mkdir -p "$RAW"

# --- カタログ取得（24時間キャッシュ） ---------------------------------------
if [ ! -f "$CATALOG" ] || [ -n "$(find "$CATALOG" -mmin +$((CATALOG_MAX_AGE_HOURS*60)) 2>/dev/null)" ]; then
  echo "[catalog] $CATALOG_URL を取得中..."
  curl -fsSL --retry 3 --retry-delay 5 -m 300 -o "$CATALOG.part" "$CATALOG_URL"
  mv "$CATALOG.part" "$CATALOG"
fi

# --- URL 解決 ---------------------------------------------------------------
# 出力: dataset<TAB>year<TAB>url
resolve() {
  python3 - "$CATALOG" "$datasets" "$years" <<'PY'
import json, sys
catalog, datasets, years = sys.argv[1], sys.argv[2].split(), sys.argv[3].split()
TITLES = {
    "Medicare Part D Prescribers - by Provider and Drug": "provider_drug",
    "Medicare Part D Prescribers - by Provider":          "provider",
    "Medicare Part D Prescribers - by Geography and Drug":"geo_drug",
}
want_years = {int(y) for y in years}
out = []
for ds in json.load(open(catalog))["dataset"]:
    name = TITLES.get(ds.get("title", ""))
    if name is None or name not in datasets:
        continue
    for dist in ds.get("distribution", []):
        if dist.get("format") != "CSV":
            continue
        # distribution の title 末尾が対象年月日（例 "... : 2024-12-01"）
        year = int(dist["title"].rsplit(":", 1)[-1].strip()[:4])
        if year in want_years:
            out.append((name, year, dist["downloadURL"]))
for row in sorted(out):
    print("%s\t%d\t%s" % row)
PY
}

if [ "$list_only" = 1 ]; then
  resolve | while IFS=$'\t' read -r name year url; do printf "%-14s %s  %s\n" "$name" "$year" "$url"; done
  exit 0
fi

# --- ダウンロード -----------------------------------------------------------
# 注意: data.cms.gov は Content-Length を返さず Range も無視する（206 ではなく 200）。
# つまり curl -C - によるレジュームができない。中断したら最初からやり直しになるので
# .part に落として完了時に rename し、既存の完成ファイルはスキップする。
resolve | while IFS=$'\t' read -r name year url; do
  dest="$RAW/${name}_${year}.csv"
  if [ -s "$dest" ]; then
    echo "[skip] $(basename "$dest") ($(du -h "$dest" | cut -f1)) — 既にあります"
    continue
  fi
  echo "[get ] $name $year <- $(basename "$url")"
  curl -fL --retry 3 --retry-delay 10 -m 7200 --progress-bar -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
  echo "[done] $(basename "$dest") $(du -h "$dest" | cut -f1)"
done

echo
echo "=== data/raw ==="
ls -lh "$RAW"/*.csv 2>/dev/null || echo "(なし)"
