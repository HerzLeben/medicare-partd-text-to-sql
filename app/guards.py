"""app/guards.py — 生成された SQL の検査とレート制限。

CLAUDE.md「ガード（省略禁止）」の実装。ここを通らない SQL は BigQuery に投げない。
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# 参照を許すテーブル。データセット名だけの検査だと partd.INFORMATION_SCHEMA なども
# 通ってしまうので、テーブル名まで固定する。
ALLOWED_TABLES = frozenset(
    {"provider_drug", "provider", "geo_drug", "drug_class", "state"}
)
DATASET = "partd"

# 書き込み・DDL 系。単語境界で見る（'Creatine' や 'created' を巻き込まないため）
FORBIDDEN_KEYWORDS = re.compile(
    r"\b(DELETE|UPDATE|INSERT|DROP|CREATE|MERGE|ALTER|TRUNCATE|GRANT|REVOKE|"
    r"EXPORT|LOAD|CALL|EXECUTE)\b",
    re.IGNORECASE,
)

# 先頭語。CTE も許す
LEADING_OK = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)

# FROM 句は「FROM a, b」のカンマ結合があるので句ごと切り出して分解する。
# JOIN は直後の1つだけを見ればよい。
_FROM_KW = re.compile(r"\bFROM\b", re.IGNORECASE)
_CLAUSE_END = re.compile(
    r"\b(?:WHERE|GROUP|ORDER|LIMIT|HAVING|WINDOW|QUALIFY|UNION|INTERSECT|EXCEPT"
    r"|JOIN|ON|CROSS|INNER|LEFT|RIGHT|FULL|SELECT)\b",
    re.IGNORECASE,
)
_JOIN_REF = re.compile(r"\bJOIN\s+(`[^`]+`|[A-Za-z_][\w\.\-]*)", re.IGNORECASE)
_REF_HEAD = re.compile(r"^\s*(`[^`]+`|[A-Za-z_][\w\.\-]*)")

# SELECT * / SELECT t.* （COUNT(*) は別物なので巻き込まない）
SELECT_STAR = re.compile(r"\bSELECT\s+(?:DISTINCT\s+)?(?:[A-Za-z_]\w*\s*\.\s*)?\*", re.IGNORECASE)

_LINE_COMMENT = re.compile(r"--[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_STRING_LITERAL = re.compile(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"")


class SqlRejected(Exception):
    """SQL がガードに引っかかった。メッセージはそのまま Claude に返して直させる。"""


def _strip_noise(sql: str) -> str:
    """コメントと文字列リテラルを空白に置き換える。

    キーワード検査を文字列リテラルの中身に反応させないため
    （薬剤名に 'Creatine' のような語が入る）。位置がずれないよう長さは保つ。
    """
    def blank(m: re.Match) -> str:
        return " " * len(m.group(0))

    s = _BLOCK_COMMENT.sub(blank, sql)
    s = _LINE_COMMENT.sub(blank, s)
    s = _STRING_LITERAL.sub(blank, s)
    return s


def check_sql(sql: str) -> str:
    """SQL を検査して、問題なければ正規化した SQL を返す。

    問題があれば SqlRejected を投げる。例外メッセージは Claude への指示文になる。
    """
    if not sql or not sql.strip():
        raise SqlRejected("SQL が空です。")

    stripped = sql.strip().rstrip(";").strip()
    scan = _strip_noise(stripped)

    if not LEADING_OK.match(scan):
        raise SqlRejected(
            "SQL は SELECT か WITH で始めてください。それ以外の文は実行できません。"
        )

    # 複文の禁止。末尾のセミコロンは上で落としているので、残っていれば文の区切り
    if ";" in scan:
        raise SqlRejected(
            "セミコロンで区切った複数の文は実行できません。1文にまとめてください。"
        )

    hit = FORBIDDEN_KEYWORDS.search(scan)
    if hit:
        raise SqlRejected(
            f"'{hit.group(0)}' は使えません。このアプリは読み取り専用で、"
            "データを変更する文と DDL は実行できません。SELECT だけで書いてください。"
        )

    if SELECT_STAR.search(scan):
        raise SqlRejected(
            "SELECT * は使えません。必要な列だけを明示的に並べてください。"
        )

    tables = _referenced_tables(scan)
    if not tables:
        raise SqlRejected(
            "参照するテーブルが読み取れません。FROM partd.<テーブル名> の形で書いてください。"
        )
    bad = sorted(t for t in tables if t not in ALLOWED_TABLES)
    if bad:
        raise SqlRejected(
            f"参照できないテーブルです: {', '.join(bad)}。"
            f"使えるのは {', '.join(sorted(ALLOWED_TABLES))} だけです"
            f"（いずれも {DATASET}. を前に付けます）。"
        )

    return stripped


def _referenced_tables(scan: str) -> set[str]:
    """FROM / JOIN が参照しているテーブル名（partd. を外したもの）を集める。

    CTE 名（WITH x AS ...）、サブクエリ、UNNEST は対象外。partd 以外のデータセットや
    プロジェクト直参照は ALLOWED_TABLES に無い名前として弾かれる。
    """
    cte_names = {
        m.group(1).lower()
        # \b を先頭に置くと "), b AS (" のカンマ側で境界が取れず、2 つ目以降の CTE を拾えない
        for m in re.finditer(r"(?:\bWITH|,)\s+([A-Za-z_]\w*)\s+AS\s*\(", scan, re.IGNORECASE)
    }

    # FROM は1つずつ独立に見る。finditer で句ごと食わせるとサブクエリ内の
    # FROM が外側の句に飲み込まれて見落とす。
    refs: list[str] = []
    for kw in _FROM_KW.finditer(scan):
        rest = scan[kw.end():]
        end = _CLAUSE_END.search(rest)
        clause = rest[: end.start()] if end else rest
        for part in _split_top_level_commas(clause):
            head = _REF_HEAD.match(part)
            if head:
                refs.append(head.group(1))
    refs += [m.group(1) for m in _JOIN_REF.finditer(scan)]

    found: set[str] = set()
    unqualified: set[str] = set()
    for ref in refs:
        ref = ref.strip("`")
        if ref.upper().startswith("UNNEST") or ref.startswith("("):
            continue
        parts = [p for p in ref.split(".") if p]
        if len(parts) == 1:
            if parts[0].lower() in cte_names:
                continue  # CTE の参照
            unqualified.add(ref)    # 修飾なし。既定データセット任せは許さない
        elif parts[-2] == DATASET:
            found.add(parts[-1])    # partd.x / project.partd.x
        else:
            found.add(ref)          # 別データセット -> 弾かれる

    if unqualified:
        raise SqlRejected(
            f"データセット名が付いていないテーブル参照があります: {', '.join(sorted(unqualified))}。"
            f"必ず {DATASET}.<テーブル名> の形で書いてください。"
        )
    return found


def _split_top_level_commas(clause: str) -> list[str]:
    """括弧の外側のカンマで分割する（サブクエリや関数の引数を割らない）。"""
    parts, depth, buf = [], 0, []
    for ch in clause:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))
    return [p for p in parts if p.strip()]


@dataclass
class RateLimit:
    """1セッションあたりの質問数を数える（Streamlit の session_state に持たせる）。"""

    max_questions: int = 20
    used: int = 0

    @property
    def remaining(self) -> int:
        return max(0, self.max_questions - self.used)

    def check(self) -> None:
        if self.used >= self.max_questions:
            raise SqlRejected(
                f"このセッションの質問数の上限（{self.max_questions}問）に達しました。"
                "ページを再読み込みすると新しいセッションが始まります。"
            )

    def consume(self) -> None:
        self.check()
        self.used += 1
