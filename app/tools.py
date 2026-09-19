"""app/tools.py — Claude に渡す2つのツール（run_sql / plot_spec）の定義と実装。

ツールはこの2つだけ。増やすときは docs/design.md §4.3 を先に更新すること。
"""
from __future__ import annotations

import datetime
import decimal
import json
import os
import sys
import time
from typing import Any

from google.api_core import exceptions as gexc
from google.cloud import bigquery

from app.guards import SqlRejected, check_sql

GiB = 1024 ** 3

PROJECT = os.getenv("GCP_PROJECT")
DATASET = os.getenv("BQ_DATASET", "partd")
LOCATION = os.getenv("BQ_LOCATION", "US")
MAX_BYTES_BILLED = int(os.getenv("MAX_BYTES_BILLED", str(2 * GiB)))
QUERY_TIMEOUT_SEC = 60
MAX_ROWS = 1000

# ---------------------------------------------------------------------------
# ツール定義（Claude に渡す JSON スキーマ）
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "name": "run_sql",
        "description": (
            "BigQuery 標準SQLを実行し、先頭1000行を返す。dry-run で課金バイトを確認し、"
            f"{MAX_BYTES_BILLED // GiB}GiB を超える場合はエラーを返す。"
            "参照できるのは partd データセットの provider_drug / provider / geo_drug / "
            "drug_class / state のみ。SELECT か WITH で始まる1文だけ。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "実行する BigQuery 標準SQL"},
                "purpose": {
                    "type": "string",
                    "description": "この SQL が何を求めるかの1文（日本語）",
                },
            },
            "required": ["sql", "purpose"],
        },
    },
    {
        "name": "plot_spec",
        "description": (
            "直前の run_sql の結果をどう可視化するかを指定する。描画はアプリ側が Plotly で行う。"
            "x / y には run_sql が返した列名をそのまま使うこと。"
            "choropleth_state の x は州略号（FL など）の列を指定する。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["bar", "line", "choropleth_state", "table", "scatter"],
                },
                "x": {"type": "string", "description": "横軸に使う列名（table では不要）"},
                "y": {"type": "string", "description": "縦軸に使う列名（table では不要）"},
                "color": {"type": "string", "description": "系列を分ける列名（任意）"},
                "title": {"type": "string", "description": "グラフのタイトル（日本語）"},
                "note": {"type": "string", "description": "抑制値やデータの限界の注記"},
            },
            "required": ["kind", "title"],
        },
    },
]

# ---------------------------------------------------------------------------
# 構造化ログ（Cloud Logging が読める1行 JSON）
# ---------------------------------------------------------------------------


def log_event(event: str, severity: str = "INFO", **fields: Any) -> None:
    record = {"severity": severity, "event": event, **fields}
    print(json.dumps(record, ensure_ascii=False, default=str), file=sys.stdout, flush=True)


# ---------------------------------------------------------------------------
# run_sql
# ---------------------------------------------------------------------------

_client: bigquery.Client | None = None


def client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=PROJECT, location=LOCATION)
    return _client


# JavaScript の Number が誤差なく表せる整数の上限。これを超える整数を
# そのまま JSON に載せるとブラウザ側で下位桁が壊れる（例外は出ず、静かに値が変わる）。
JS_SAFE_INT = 2 ** 53 - 1


def _jsonable(v: Any) -> Any:
    """BigQuery の戻り値を JSON に載る形にする。

    数値の欠落・型の取り違えは例外を出さずに間違った答えを作るので、
    ここで境界を明示的に扱う。
    """
    if isinstance(v, bool):
        return v                      # bool は int の派生。下の分岐より先に返す
    if isinstance(v, int) and abs(v) > JS_SAFE_INT:
        # 文字列にして桁を守る。表示側は識別子列と同じく加工せずに出す
        return str(v)
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (datetime.date, datetime.datetime, datetime.time)):
        return v.isoformat()
    if isinstance(v, bytes):
        return v.decode("utf-8", "replace")
    return v


def run_sql(sql: str, purpose: str = "") -> dict[str, Any]:
    """SQL を検査 → dry-run → 実行して結果を返す。

    戻り値は必ず JSON にできる dict。失敗しても例外を投げず {"error": ...} を返し、
    Claude に読ませて自己修正させる。
    """
    started = time.time()

    try:
        sql = check_sql(sql)
    except SqlRejected as e:
        log_event("sql_rejected", severity="WARNING", purpose=purpose, sql=sql, reason=str(e))
        return {"error": f"SQL が拒否されました: {e}"}

    # --- dry-run で課金バイトを見る -----------------------------------------
    try:
        dry = client().query(
            sql,
            job_config=bigquery.QueryJobConfig(dry_run=True, use_query_cache=False),
        )
        estimated = int(dry.total_bytes_processed or 0)
    except gexc.GoogleAPICallError as e:
        log_event("sql_dry_run_failed", severity="WARNING", purpose=purpose, sql=sql,
                  reason=e.message)
        return {"error": f"SQL の検証に失敗しました: {e.message}"}

    if estimated > MAX_BYTES_BILLED:
        log_event("sql_too_large", severity="WARNING", purpose=purpose, sql=sql,
                  estimated_bytes=estimated, limit_bytes=MAX_BYTES_BILLED)
        return {
            "error": (
                f"このクエリはスキャン見積もりが {estimated / GiB:.2f} GiB で、"
                f"上限 {MAX_BYTES_BILLED / GiB:.0f} GiB を超えます。"
                "year で年を絞る、州や薬剤で絞る、選ぶ列を減らす、"
                "provider_drug ではなく geo_drug や provider を使う、"
                "のいずれかで軽くしてください。"
            )
        }

    # --- 実行 ---------------------------------------------------------------
    try:
        job = client().query(
            sql,
            job_config=bigquery.QueryJobConfig(
                maximum_bytes_billed=MAX_BYTES_BILLED,
                use_query_cache=True,
            ),
        )
        iterator = job.result(timeout=QUERY_TIMEOUT_SEC, max_results=MAX_ROWS)
    except gexc.GoogleAPICallError as e:
        log_event("sql_failed", severity="ERROR", purpose=purpose, sql=sql, reason=e.message)
        return {"error": f"BigQuery エラー: {e.message}"}
    except TimeoutError:
        log_event("sql_timeout", severity="ERROR", purpose=purpose, sql=sql)
        return {
            "error": f"{QUERY_TIMEOUT_SEC} 秒で終わりませんでした。集計する行を減らしてください。"
        }

    columns = [f.name for f in iterator.schema]
    rows = [[_jsonable(v) for v in row.values()] for row in iterator]
    total_rows = int(iterator.total_rows or len(rows))
    elapsed = round(time.time() - started, 2)

    log_event(
        "sql_ok",
        purpose=purpose,
        sql=sql,
        estimated_bytes=estimated,
        bytes_billed=int(job.total_bytes_billed or 0),
        cache_hit=bool(job.cache_hit),
        rows_returned=len(rows),
        total_rows=total_rows,
        elapsed_sec=elapsed,
    )

    result: dict[str, Any] = {
        "columns": columns,
        "rows": rows,
        "total_rows": total_rows,
        "returned_rows": len(rows),
        "bytes_billed": int(job.total_bytes_billed or 0),
        "elapsed_sec": elapsed,
    }
    if total_rows > len(rows):
        result["truncated"] = f"先頭 {len(rows)} 行だけを返しています（全 {total_rows} 行）。"
    if not rows:
        result["hint"] = (
            "0 行でした。薬剤名は Title Case（Ozempic / Semaglutide）で、照合は "
            "gnrc_name_norm / brnd_name_norm（UPPER）を使います。薬効クラスは "
            "partd.drug_class を結合してください。年の指定や州名の表記も確認してください。"
        )
    return result


# ---------------------------------------------------------------------------
# plot_spec
# ---------------------------------------------------------------------------

VALID_KINDS = frozenset({"bar", "line", "choropleth_state", "table", "scatter"})


def plot_spec(columns: list[str] | None = None, **spec: Any) -> dict[str, Any]:
    """可視化の指定を検証して返す。描画はフロント側が行う。

    columns に直前の run_sql の列名を渡すと、存在しない列を指定していないか確かめる。
    columns が None（＝まだ run_sql が成功していない）ならエラーを返す。
    """
    if columns is None:
        # run_sql より先に呼ばれた場合。そのまま通すと SQL を1本も実行しないまま
        # 終わってしまう（評価5回目の q26 で実際に起きた）。
        return {
            "error": "先に run_sql を呼んで結果を得てください。"
                     "plot_spec は直前の run_sql の結果を可視化するためのものです。"
        }

    kind = spec.get("kind")
    if kind not in VALID_KINDS:
        return {"error": f"kind は {sorted(VALID_KINDS)} のいずれかにしてください。"}

    if columns and kind != "table":
        missing = [
            f"{axis}={spec[axis]}"
            for axis in ("x", "y", "color")
            if spec.get(axis) and spec[axis] not in columns
        ]
        if missing:
            return {
                "error": (
                    f"直前の結果に無い列を指定しています: {', '.join(missing)}。"
                    f"使える列は {', '.join(columns)} です。"
                )
            }
        if kind in {"bar", "line", "scatter", "choropleth_state"} and not (
            spec.get("x") and spec.get("y")
        ):
            return {"error": f"{kind} には x と y の両方が必要です。"}

    accepted = {k: v for k, v in spec.items() if k in {"kind", "x", "y", "color", "title", "note"}}
    log_event("plot_spec", **accepted)
    return {"ok": True, "spec": accepted}
