#!/usr/bin/env python
"""data/preprocess.py — CMS の生 CSV を BigQuery 投入用の Parquet に変換する。

  python data/preprocess.py                      # data/raw にある全 CSV
  python data/preprocess.py geo_drug 2024        # データセット・年を絞る

やること（CLAUDE.md「データ」の実装ルール）:
  1. 列名を snake_case 小文字に（CMS 原文は Prscrbr_NPI のような混在表記）
  2. CSV に無い year 列を付与（ファイル名の年）
  3. 型は data/schema/*.json を正本に明示指定。自動検出は使わない
     - prscrbr_npi は VARCHAR（先頭0を落とさないため）
     - blank は NULL のまま。0 に置換しない（1〜10 件の抑制と 0 件は別物）
  4. gnrc_name_norm / brnd_name_norm（UPPER）を付与
     CMS の薬剤名は Title Case（Ozempic / Semaglutide）。表示は原文のまま、
     照合と BigQuery の CLUSTER BY はこの正規化列で行う。
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

import duckdb

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "parquet"
SCHEMA_DIR = ROOT / "data" / "schema"

DATASETS = ("geo_drug", "provider", "provider_drug")

# BigQuery 型 -> DuckDB 型
DUCK_TYPE = {"STRING": "VARCHAR", "INT64": "BIGINT", "FLOAT64": "DOUBLE"}

# 前処理で付与する列（CSV には無いので CSV 読み込みの型指定からは除く）
DERIVED = {"year", "gnrc_name_norm", "brnd_name_norm"}


def load_schema(table: str) -> list[dict]:
    return json.loads((SCHEMA_DIR / f"{table}.json").read_text())


def convert(con: duckdb.DuckDBPyConnection, table: str, year: int) -> dict:
    src = RAW / f"{table}_{year}.csv"
    dst = OUT / f"{table}_{year}.parquet"
    if not src.exists():
        raise FileNotFoundError(src)

    fields = load_schema(table)
    csv_fields = [f for f in fields if f["name"] not in DERIVED]

    # CMS のヘッダは Prscrbr_NPI 形式。読み込み時に小文字名で型を指定する。
    header = src.open().readline().strip().split(",")
    expected = [f["name"] for f in csv_fields]
    actual = [h.lower() for h in header]
    if actual != expected:
        raise SystemExit(
            f"{src.name}: ヘッダがスキーマと不一致\n"
            f"  CSV にあってスキーマに無い: {[c for c in actual if c not in expected]}\n"
            f"  スキーマにあって CSV に無い: {[c for c in expected if c not in actual]}"
        )

    # names= で原文ヘッダを小文字名に読み替え、types= で明示型。自動検出なし。
    columns = ", ".join(
        f"'{f['name']}': '{DUCK_TYPE[f['type']]}'" for f in csv_fields
    )
    reader = (
        f"read_csv('{src}', header=true, columns={{{columns}}}, "
        f"nullstr='', strict_mode=true)"
    )

    # SELECT の並びはスキーマ順。norm 列は元列の直後に置く。
    select = []
    for f in fields:
        n = f["name"]
        if n == "year":
            select.append(f"CAST({year} AS BIGINT) AS year")
        elif n == "gnrc_name_norm":
            select.append("upper(gnrc_name) AS gnrc_name_norm")
        elif n == "brnd_name_norm":
            select.append("upper(brnd_name) AS brnd_name_norm")
        else:
            select.append(n)

    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    con.execute(
        f"COPY (SELECT {', '.join(select)} FROM {reader}) "
        f"TO '{dst}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )
    rows = con.execute(f"SELECT count(*) FROM read_parquet('{dst}')").fetchone()[0]
    return {
        "table": table,
        "year": year,
        "rows": rows,
        "csv_mb": round(src.stat().st_size / 1e6, 1),
        "parquet_mb": round(dst.stat().st_size / 1e6, 1),
        "sec": round(time.time() - t0, 1),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset", nargs="?", choices=DATASETS)
    ap.add_argument("year", nargs="?", type=int)
    args = ap.parse_args()

    targets = []
    for path in sorted(RAW.glob("*.csv")):
        table, _, year = path.stem.rpartition("_")
        if table not in DATASETS:
            continue
        if args.dataset and table != args.dataset:
            continue
        if args.year and int(year) != args.year:
            continue
        targets.append((table, int(year)))

    if not targets:
        print("対象の CSV がありません（data/download.sh を先に実行）", file=sys.stderr)
        return 1

    con = duckdb.connect()
    con.execute("SET preserve_insertion_order=false")  # 大きい CSV でメモリを抑える
    results = []
    for table, year in targets:
        print(f"[conv] {table} {year} ...", flush=True)
        r = convert(con, table, year)
        print(
            f"[done] {r['table']} {r['year']}  {r['rows']:,} 行  "
            f"CSV {r['csv_mb']} MB -> Parquet {r['parquet_mb']} MB  {r['sec']}s",
            flush=True,
        )
        results.append(r)

    print("\n=== まとめ（README の行数表に転記する） ===")
    print("| テーブル | 年 | 行数 | CSV | Parquet |")
    print("|---|---|---:|---:|---:|")
    for r in results:
        print(
            f"| {r['table']} | {r['year']} | {r['rows']:,} | "
            f"{r['csv_mb']} MB | {r['parquet_mb']} MB |"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
