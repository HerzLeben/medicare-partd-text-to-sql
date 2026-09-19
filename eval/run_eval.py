#!/usr/bin/env python
"""eval/run_eval.py — 生成 SQL の精度を測る。

  python eval/run_eval.py --validate            正解 SQL が実行できるかだけ確かめる
  python eval/run_eval.py                       全30問をエージェントに解かせる
  python eval/run_eval.py --model haiku         モデルを変えて比較
  python eval/run_eval.py --level 3 --limit 5   絞って試す
  python eval/run_eval.py --out docs/EVAL.md    結果を Markdown で書き出す

判定は2段階で出す。SQL の文字列は比較しない。

  実質正解（headline）: 期待した行と値が、生成結果の中にすべて含まれているか。
      列名・列の順序・行の順序は無視。数値は相対誤差 1%。
      生成側が補助列（医師数など）を足していても正解とする。
      ── 「答えが出せたか」を測る指標。

  厳密一致: 上に加えて行数と列数まで一致するか。
      ── 「余計なものを付けずに、聞かれたとおりに返せたか」を測る指標。

最初は厳密一致だけで測っていたが、Claude が補助列を足すだけで不正解になり
4/30（13.3%）と出た。SQL は正しいのに列が1つ多い、という失敗が大半だった。
Text-to-SQL の精度としては誤解を招くので2本立てにしている。
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
from dataclasses import dataclass, field

import anthropic
import yaml
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.agent import Agent          # noqa: E402
from app.tools import run_sql        # noqa: E402

QUESTIONS = pathlib.Path(__file__).parent / "questions.yaml"
REL_TOL = 0.01


# ---------------------------------------------------------------------------
# 結果の比較
# ---------------------------------------------------------------------------


def normalize(result: dict) -> list[tuple]:
    """行を比較できる形にする。列名は捨て、各行をタプルにして並べ替える。"""
    rows = []
    for row in result.get("rows", []):
        rows.append(tuple(_cell(v) for v in row))
    return sorted(rows, key=lambda r: [str(v) for v in r])


def _cell(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    try:
        return round(float(v), 6)
    except (TypeError, ValueError):
        return str(v).strip()


def close_enough(a, b) -> bool:
    if a is None or b is None:
        return a is b or a == b
    if isinstance(a, float) and isinstance(b, float):
        if a == b:
            return True
        scale = max(abs(a), abs(b))
        return scale > 0 and abs(a - b) / scale <= REL_TOL
    return a == b


def row_contains(got_row: tuple, want_row: tuple) -> bool:
    """期待した行の値が、生成行の値の中にすべて含まれるか（余分な列は許す）。"""
    pool = list(got_row)
    for wv in want_row:
        for i, gv in enumerate(pool):
            if close_enough(gv, wv):
                pool.pop(i)
                break
        else:
            return False
    return True


def contains_expected(got: list[tuple], want: list[tuple]) -> tuple[bool, str]:
    """実質正解の判定。期待した各行に対応する生成行があるか（1対1）。"""
    if len(got) < len(want):
        return False, f"行が足りない（生成 {len(got)} / 正解 {len(want)}）"
    pool = list(got)
    for i, w in enumerate(want):
        for j, g in enumerate(pool):
            if row_contains(g, w):
                pool.pop(j)
                break
        else:
            return False, f"正解の {i + 1} 行目に対応する行が無い: {w!r}"
    if len(got) > len(want):
        return True, f"余分な行あり（生成 {len(got)} / 正解 {len(want)}）"
    return True, ""


def rows_match(got: list[tuple], want: list[tuple]) -> tuple[bool, str]:
    """厳密一致。行数・列数まで揃っているか。"""
    if len(got) != len(want):
        return False, f"行数が違う（生成 {len(got)} / 正解 {len(want)}）"
    for i, (g, w) in enumerate(zip(got, want)):
        if len(g) != len(w):
            return False, f"{i + 1} 行目の列数が違う（{len(g)} / {len(w)}）"
        for gv, wv in zip(g, w):
            if not close_enough(gv, wv):
                return False, f"{i + 1} 行目が違う: {gv!r} ≠ {wv!r}"
    return True, ""


# ---------------------------------------------------------------------------
# 実行
# ---------------------------------------------------------------------------


@dataclass
class Outcome:
    id: str
    level: int
    question: str
    ok: bool                 # 実質正解（headline）
    ok_strict: bool = False  # 行数・列数まで一致
    reason: str = ""
    tries: int = 0
    sec: float = 0.0
    out_tokens: int = 0
    bytes_billed: int = 0
    generated_sql: str | None = None


@dataclass
class Report:
    model: str
    outcomes: list[Outcome] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(o.ok for o in self.outcomes)

    @property
    def passed_strict(self) -> int:
        return sum(o.ok_strict for o in self.outcomes)

    def by_level(self) -> dict[int, tuple[int, int, int]]:
        out: dict[int, list[int]] = {}
        for o in self.outcomes:
            slot = out.setdefault(o.level, [0, 0, 0])
            slot[0] += int(o.ok)
            slot[1] += int(o.ok_strict)
            slot[2] += 1
        return {k: (v[0], v[1], v[2]) for k, v in sorted(out.items())}


def validate(questions: list[dict]) -> int:
    """正解 SQL が実際に BigQuery で動くか確かめる。"""
    bad = 0
    for q in questions:
        r = run_sql(q["expected_sql"], f"[validate] {q['id']}")
        if "error" in r:
            print(f"  ✗ {q['id']}  {r['error'][:110]}")
            bad += 1
        elif r["returned_rows"] == 0:
            print(f"  ✗ {q['id']}  0 行（正解 SQL が何も返さない）")
            bad += 1
        else:
            print(f"  ✓ {q['id']}  {r['returned_rows']:>3} 行  "
                  f"{r['bytes_billed'] / 1048576:>7.1f} MB  {q['question'][:38]}")
    print(f"\n正解 SQL: {len(questions) - bad}/{len(questions)} 本が実行できました")
    return bad


def evaluate(questions: list[dict], model: str | None,
             json_out: str | None = None) -> Report:
    agent = Agent(model=model)
    report = Report(model=agent.model)

    for i, q in enumerate(questions, 1):
        # 1問ごとに保存する。API のレート制限や残高切れで落ちても、
        # そこまでの結果を失わないため（実際に残高切れで16問ぶん失いかけた）。
        if json_out:
            save(report, json_out)
        expected = run_sql(q["expected_sql"], f"[expected] {q['id']}")
        if "error" in expected:
            report.outcomes.append(Outcome(
                q["id"], q["level"], q["question"], False,
                reason=f"正解 SQL が動かない: {expected['error'][:80]}"))
            print(f"[{i}/{len(questions)}] {q['id']} 正解SQL異常")
            continue

        t0 = time.time()
        try:
            result = agent.ask(q["question"])
        except anthropic.APIStatusError as e:
            msg = getattr(e, "message", str(e))
            print(f"\n[{i}/{len(questions)}] API エラーで中断しました: {msg[:160]}", flush=True)
            if "credit balance" in msg.lower():
                print("  → Anthropic の残高が尽きています。"
                      "Plans & Billing でクレジットを追加してから再実行してください。", flush=True)
            print(f"  ここまでの {len(report.outcomes)} 問ぶんは保存済みです。", flush=True)
            break
        except Exception as e:  # noqa: BLE001
            # ストリーミング中の httpx のタイムアウトは SDK の例外に包まれず
            # そのまま上がってくることがある。ここで受けて途中結果を残す。
            print(f"\n[{i}/{len(questions)}] {type(e).__name__} で中断: {str(e)[:140]}",
                  flush=True)
            print(f"  ここまでの {len(report.outcomes)} 問ぶんは保存済みです。", flush=True)
            break
        step = result.last_ok_step
        elapsed = round(time.time() - t0, 1)

        if step is None:
            outcome = Outcome(q["id"], q["level"], q["question"], False,
                              reason=result.stopped_early or "SQL が1本も通らなかった",
                              tries=len(result.steps), sec=elapsed,
                              out_tokens=result.usage.get("output_tokens", 0))
        else:
            got, want = normalize(step.result), normalize(expected)
            ok, why = contains_expected(got, want)
            strict, strict_why = rows_match(got, want)
            if ok and not strict:
                why = why or f"実質正解（{strict_why}）"
            outcome = Outcome(
                q["id"], q["level"], q["question"], ok, ok_strict=strict, reason=why,
                tries=len(result.steps), sec=elapsed,
                out_tokens=result.usage.get("output_tokens", 0),
                bytes_billed=step.result.get("bytes_billed", 0),
                generated_sql=step.sql)

        report.outcomes.append(outcome)
        if json_out:
            save(report, json_out)
        print(f"[{i}/{len(questions)}] {'✓' if outcome.ok else '✗'} {q['id']} "
              f"(L{q['level']}) {elapsed:>5.1f}s  {q['question'][:34]}"
              + ("" if outcome.ok else f"\n      → {outcome.reason[:100]}"), flush=True)

    return report


def save(report: Report, path: str) -> None:
    json.dump([o.__dict__ for o in report.outcomes],
              open(path, "w"), ensure_ascii=False, indent=2, default=str)


def to_markdown(report: Report, elapsed: float) -> str:
    total = len(report.outcomes)
    lines = [
        "# 精度評価",
        "",
        f"- モデル: `{report.model}`",
        f"- 問題数: {total}",
        f"- **実質正解: {report.passed}/{total}（{report.passed / total * 100:.1f}%）**",
        f"- 厳密一致: {report.passed_strict}/{total}（{report.passed_strict / total * 100:.1f}%）",
        f"- 所要: {elapsed / 60:.1f} 分",
        "",
        "**実質正解**：期待した行と値が生成結果に含まれているか"
        "（列名・列順・行順は無視、数値は相対誤差 1%、補助列の追加は許容）。",
        "**厳密一致**：それに加えて行数と列数まで一致するか。",
        "SQL の文字列は比較しない。",
        "",
        "## レベル別",
        "",
        "| レベル | 内容 | 実質正解 | 厳密一致 |",
        "|---|---|---|---|",
    ]
    names = {1: "単純集計", 2: "結合・条件複数", 3: "用語辞書が必要"}
    for level, (ok, strict, n) in report.by_level().items():
        lines.append(f"| {level} | {names.get(level, '')} | "
                     f"{ok}/{n}（{ok / n * 100:.0f}%） | {strict}/{n}（{strict / n * 100:.0f}%） |")

    lines += ["", "## 問題別", "",
              "| ID | L | 質問 | 実質 | 厳密 | SQL試行 | 秒 | 備考 |",
              "|---|---|---|---|---|---|---|---|"]
    for o in report.outcomes:
        note = o.reason.replace("|", "\\|")[:70]
        lines.append(f"| {o.id} | {o.level} | {o.question[:30]} | "
                     f"{'✓' if o.ok else '✗'} | {'✓' if o.ok_strict else '—'} | "
                     f"{o.tries} | {o.sec:.1f} | {note} |")

    failures = [o for o in report.outcomes if not o.ok and o.generated_sql]  # 実質不正解のみ
    if failures:
        lines += ["", "## 外した問題の生成 SQL", ""]
        for o in failures:
            lines += [f"### {o.id} {o.question}", "", f"{o.reason}", "",
                      "```sql", o.generated_sql.strip(), "```", ""]
    return "\n".join(lines) + "\n"


def rejudge(questions: list[dict], saved: str) -> Report:
    """保存済みの生成 SQL を実行し直して判定だけやり直す（Claude は呼ばない）。"""
    by_id = {q["id"]: q for q in questions}
    report = Report(model="claude-sonnet-5（再判定）")
    for row in json.load(open(saved)):
        q = by_id.get(row["id"])
        if q is None or not row.get("generated_sql"):
            continue
        got_r = run_sql(row["generated_sql"], f"[rejudge] {row['id']}")
        want_r = run_sql(q["expected_sql"], f"[expected] {row['id']}")
        if "error" in got_r or "error" in want_r:
            report.outcomes.append(Outcome(row["id"], row["level"], row["question"], False,
                                           reason="SQL が実行できない"))
            continue
        got, want = normalize(got_r), normalize(want_r)
        ok, why = contains_expected(got, want)
        strict, strict_why = rows_match(got, want)
        if ok and not strict:
            why = why or f"実質正解（{strict_why}）"
        report.outcomes.append(Outcome(
            row["id"], row["level"], row["question"], ok, ok_strict=strict, reason=why,
            tries=row.get("tries", 0), sec=row.get("sec", 0.0),
            out_tokens=row.get("out_tokens", 0),
            bytes_billed=got_r.get("bytes_billed", 0),
            generated_sql=row["generated_sql"]))
        print(f"  {'✓' if ok else '✗'}{'S' if strict else ' '} {row['id']} {why[:70]}", flush=True)
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rejudge", default=None, help="保存済み結果 JSON から判定だけやり直す")
    ap.add_argument("--validate", action="store_true", help="正解 SQL の実行可否だけ見る")
    ap.add_argument("--model", default=None, help="sonnet / haiku / モデルID")
    ap.add_argument("--level", type=int, choices=[1, 2, 3], help="レベルで絞る")
    ap.add_argument("--limit", type=int, help="先頭 N 問だけ")
    ap.add_argument("--out", default=None, help="Markdown の書き出し先")
    ap.add_argument("--json-out", default="/tmp/eval_result.json", help="結果 JSON の書き出し先")
    args = ap.parse_args()

    questions = yaml.safe_load(QUESTIONS.read_text())
    if args.level:
        questions = [q for q in questions if q["level"] == args.level]
    if args.limit:
        questions = questions[: args.limit]

    if args.validate:
        return 1 if validate(questions) else 0

    aliases = {"sonnet": "claude-sonnet-5", "opus": "claude-opus-5",
               "haiku": "claude-haiku-4-5"}
    model = aliases.get(args.model, args.model)

    t0 = time.time()
    report = (rejudge(questions, args.rejudge) if args.rejudge
              else evaluate(questions, model, args.json_out))
    elapsed = time.time() - t0

    total = len(report.outcomes)
    if total == 0:
        print("1問も評価できませんでした。")
        return 1
    if total < len(questions):
        print(f"\n※ {len(questions)} 問中 {total} 問で中断しました。以下は途中までの集計です。")
    print(f"\n=== {report.model} ===")
    print(f"実質正解 {report.passed}/{total}（{report.passed / total * 100:.1f}%）"
          f" / 厳密一致 {report.passed_strict}/{total}"
          f"（{report.passed_strict / total * 100:.1f}%） / {elapsed / 60:.1f} 分")
    for level, (ok, strict, n) in report.by_level().items():
        print(f"  レベル{level}: 実質 {ok}/{n} / 厳密 {strict}/{n}")

    if args.out:
        pathlib.Path(args.out).write_text(to_markdown(report, elapsed))
        print(f"\n{args.out} に書き出しました")

    save(report, args.json_out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
