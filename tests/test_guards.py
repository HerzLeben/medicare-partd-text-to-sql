"""app/guards.py の単体テスト。BigQuery には接続しない。

CLAUDE.md「ガード（省略禁止）」の各項目を、通すべき SQL と弾くべき SQL の両方で固定する。
hook（PostToolUse）が guards.py / prompts / tools.py の編集後にこれを走らせる。
"""
from __future__ import annotations

import pytest

from app.guards import ALLOWED_TABLES, RateLimit, SqlRejected, check_sql

OK_SIMPLE = "SELECT year, COUNT(*) AS n FROM partd.provider_drug GROUP BY year"


# --- 先頭語 ---------------------------------------------------------------

def test_select_passes():
    assert check_sql(OK_SIMPLE) == OK_SIMPLE


def test_with_cte_passes():
    sql = (
        "WITH t AS (SELECT year, tot_clms FROM partd.geo_drug WHERE prscrbr_geo_lvl = 'State') "
        "SELECT year, SUM(tot_clms) AS clms FROM t GROUP BY year"
    )
    assert check_sql(sql) == sql


def test_trailing_semicolon_is_stripped():
    assert check_sql(OK_SIMPLE + ";") == OK_SIMPLE


@pytest.mark.parametrize("sql", ["", "   ", "\n"])
def test_empty_rejected(sql):
    with pytest.raises(SqlRejected, match="空"):
        check_sql(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM partd.state WHERE state_abrvtn = 'ZZ'",
        "INSERT INTO partd.state (state_abrvtn) VALUES ('ZZ')",
        "UPDATE partd.state SET state_name = 'x'",
        "DROP TABLE partd.state",
        "CREATE TABLE partd.tmp AS SELECT 1 AS a",
        "MERGE partd.state s USING partd.state t ON FALSE WHEN NOT MATCHED THEN INSERT ROW",
        "EXPLAIN SELECT 1",
        "-- comment first\nDELETE FROM partd.state",
    ],
)
def test_non_select_leading_rejected(sql):
    with pytest.raises(SqlRejected, match="SELECT か WITH"):
        check_sql(sql)


# --- 複文 -----------------------------------------------------------------

def test_multiple_statements_rejected():
    with pytest.raises(SqlRejected, match="複数の文"):
        check_sql("SELECT 1 AS a FROM partd.state; SELECT 2 AS b FROM partd.state")


def test_semicolon_inside_string_literal_is_ok():
    sql = "SELECT state_name FROM partd.state WHERE state_name = 'a;b'"
    assert check_sql(sql) == sql


# --- 禁止キーワード ---------------------------------------------------------

@pytest.mark.parametrize(
    "sql, kw",
    [
        ("SELECT 1 AS a FROM partd.state WHERE 1 = (SELECT 1) OR EXISTS (DELETE FROM partd.state)", "DELETE"),
        ("SELECT * EXCEPT(a) FROM partd.state UNION ALL SELECT 1 AS a FROM partd.state WHERE FALSE INSERT", "INSERT"),
        ("SELECT state_name FROM partd.state WHERE TRUE; DROP TABLE partd.state", None),
        ("SELECT state_name FROM partd.state CREATE TEMP TABLE x AS SELECT 1", "CREATE"),
    ],
)
def test_forbidden_keyword_anywhere_rejected(sql, kw):
    with pytest.raises(SqlRejected):
        check_sql(sql)


@pytest.mark.parametrize(
    "sql",
    [
        # 薬剤名の 'Creatine' は CREATE を含む。文字列リテラルは検査対象外
        "SELECT gnrc_name FROM partd.geo_drug WHERE gnrc_name = 'Creatine'",
        # 識別子の created / updated_at は単語境界で CREATE / UPDATE と区別する
        "SELECT created, updated_at FROM partd.provider WHERE year = 2024",
        # コメント内のキーワードも無視する
        "SELECT state_name FROM partd.state -- DROP nothing here",
        "SELECT state_name FROM partd.state /* DELETE me */",
    ],
)
def test_keyword_lookalikes_pass(sql):
    assert check_sql(sql) == sql


# --- SELECT * ---------------------------------------------------------------

@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM partd.state",
        "SELECT DISTINCT * FROM partd.state",
        "SELECT s.* FROM partd.state AS s",
        "SELECT s . * FROM partd.state AS s",
        "WITH t AS (SELECT * FROM partd.state) SELECT state_name FROM t",
    ],
)
def test_select_star_rejected(sql):
    with pytest.raises(SqlRejected, match=r"SELECT \*"):
        check_sql(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT COUNT(*) AS n FROM partd.state",
        "SELECT year, COUNT(*) AS n, SUM(tot_clms) * 2 AS x FROM partd.geo_drug GROUP BY year",
        "SELECT tot_clms * 1.0 AS c FROM partd.geo_drug",
    ],
)
def test_count_star_and_multiplication_pass(sql):
    assert check_sql(sql) == sql


# --- テーブル参照 ------------------------------------------------------------

def test_allowed_tables_are_the_five():
    assert ALLOWED_TABLES == {"provider_drug", "provider", "geo_drug", "drug_class", "state"}


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT state_name FROM other.state",
        "SELECT table_name FROM partd.INFORMATION_SCHEMA.TABLES",
        "SELECT table_name FROM `partd-explorer.partd.INFORMATION_SCHEMA.TABLES`",
        "SELECT name FROM `bigquery-public-data.usa_names.usa_1910_current`",
        "SELECT state_name FROM partd.secret_table",
        "SELECT a.year FROM partd.geo_drug AS a JOIN other.x AS b ON a.year = b.year",
    ],
)
def test_other_dataset_or_unknown_table_rejected(sql):
    with pytest.raises(SqlRejected, match="参照できないテーブル"):
        check_sql(sql)


def test_unqualified_table_rejected():
    with pytest.raises(SqlRejected, match="データセット名"):
        check_sql("SELECT state_name FROM state")


def test_no_table_rejected():
    with pytest.raises(SqlRejected, match="参照するテーブル"):
        check_sql("SELECT 1 AS a")


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT state_name FROM `partd.state`",
        "SELECT state_name FROM `partd-explorer.partd.state`",
        "SELECT state_name FROM partd-explorer.partd.state",
        "SELECT g.year FROM partd.geo_drug g, partd.state s",
        "SELECT g.year FROM partd.geo_drug AS g JOIN partd.drug_class AS d ON d.gnrc_name_norm = g.gnrc_name_norm",
        "SELECT x FROM UNNEST([1, 2]) AS x, partd.state",
        "SELECT year FROM (SELECT year FROM partd.geo_drug) AS sub",
    ],
)
def test_qualified_and_joined_tables_pass(sql):
    assert check_sql(sql) == sql


def test_cte_name_is_not_treated_as_table():
    sql = "WITH a AS (SELECT year FROM partd.geo_drug), b AS (SELECT year FROM a) SELECT year FROM b"
    assert check_sql(sql) == sql


# --- レート制限 -------------------------------------------------------------

def test_rate_limit_stops_at_max():
    rl = RateLimit(max_questions=2)
    rl.consume()
    rl.consume()
    assert rl.remaining == 0
    with pytest.raises(SqlRejected, match="上限"):
        rl.consume()
