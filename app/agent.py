"""app/agent.py — Claude のツールループ。

  質問 → run_sql（エラーなら自己修正 最大3回）→ plot_spec → 解釈

CLI:
  python -m app.agent --question "GLP-1受容体作動薬の州別処方数を2022→2024で比較して"
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Iterator

import anthropic
import yaml
from dotenv import load_dotenv

load_dotenv()

from app import tools as T  # noqa: E402  （.env を読んでから設定を確定させる）

PROMPTS = pathlib.Path(__file__).parent / "prompts"

DEFAULT_MODEL = "claude-sonnet-5"
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4000"))
MAX_SQL_RETRIES = 3          # run_sql が失敗したときに書き直させる回数
MAX_TOOL_TURNS = 10          # ループ全体の保険

# temperature を受け付けないモデル（送ると 400 になる）。
# CLAUDE.md は「温度 0」と書いているが、Sonnet 5 以降は sampling パラメータが
# 廃止されているため送れない。代わりに output_config.effort で振れ幅を抑える。
NO_TEMPERATURE = ("claude-sonnet-5", "claude-opus-5", "claude-opus-4-8",
                  "claude-opus-4-7", "claude-fable-5")


def _supports_temperature(model: str) -> bool:
    return not model.startswith(NO_TEMPERATURE)


# ---------------------------------------------------------------------------
# システムプロンプト（スキーマ＋辞書＋few-shot）。ここをキャッシュする
# ---------------------------------------------------------------------------


def build_system_prompt() -> str:
    system = (PROMPTS / "system.md").read_text()
    glossary = (PROMPTS / "glossary.yaml").read_text()
    fewshot = yaml.safe_load((PROMPTS / "fewshot.yaml").read_text())

    examples = []
    for i, ex in enumerate(fewshot, 1):
        plot = json.dumps(ex["plot"], ensure_ascii=False)
        head = f"## 例{i}: {ex['question']}\n\n"
        if ex.get("context"):
            head += f"（直前のやり取り：{ex['context'].strip()}）\n\n"
        body = (f"```sql\n{ex['sql'].strip()}\n```\n\n" if ex.get("sql")
                else "run_sql: 呼ばない（直前の結果をそのまま使う）\n\n")
        examples.append(head + body + f"plot_spec: `{plot}`\n\n{ex.get('note', '').strip()}\n")

    return (
        f"{system}\n\n"
        f"# 用語辞書\n\n```yaml\n{glossary}\n```\n\n"
        f"# 例\n\n" + "\n".join(examples)
    )


# ---------------------------------------------------------------------------
# 実行結果
# ---------------------------------------------------------------------------


@dataclass
class Step:
    """1回の run_sql とその結果。UI が SQL と表を出すために使う。"""

    purpose: str
    sql: str
    result: dict[str, Any]

    @property
    def ok(self) -> bool:
        return "error" not in self.result


@dataclass
class AgentResult:
    question: str
    steps: list[Step] = field(default_factory=list)
    plot: dict[str, Any] | None = None
    answer: str = ""
    elapsed_sec: float = 0.0
    usage: dict[str, int] = field(default_factory=dict)
    stopped_early: str | None = None

    @property
    def last_ok_step(self) -> Step | None:
        for step in reversed(self.steps):
            if step.ok:
                return step
        return None


# ---------------------------------------------------------------------------
# エージェント
# ---------------------------------------------------------------------------


class Agent:
    def __init__(self, model: str | None = None, system_prompt: str | None = None):
        self.model = model or os.getenv("ANTHROPIC_MODEL") or DEFAULT_MODEL
        self.system_prompt = system_prompt or build_system_prompt()
        self.client = anthropic.Anthropic()

    def _stream(self, messages: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
        """1ターン分を streaming で回す。

        テキストのデルタをその場で yield し、最終 Message を return する
        （呼び出し側は `response = yield from self._stream(messages)` で受け取る）。
        バッファしてから流すと解釈が一括表示になってストリーミングの意味がなくなる。
        """
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            # tools -> system の順で描画されるので、system の末尾に置けば両方キャッシュされる
            "system": [
                {
                    "type": "text",
                    "text": self.system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "tools": T.TOOLS,
            "messages": messages,
        }
        if _supports_temperature(self.model):
            kwargs["temperature"] = 0
        else:
            kwargs["output_config"] = {"effort": "medium"}

        with self.client.messages.stream(**kwargs) as stream:
            for event in stream:
                if (
                    event.type == "content_block_delta"
                    and getattr(event.delta, "type", None) == "text_delta"
                ):
                    yield {"type": "answer", "text": event.delta.text}
            return stream.get_final_message()

    def ask(self, question: str, history: list[dict[str, Any]] | None = None,
            lang: str = "ja") -> AgentResult:
        """同期版。CLI と eval が使う。"""
        result: AgentResult | None = None
        for event in self.ask_stream(question, history=history, lang=lang):
            if event["type"] == "done":
                result = event["result"]
        assert result is not None
        return result

    @staticmethod
    def _seed_messages(history: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        """直前までのやり取りを会話として復元する。

        ツール呼び出しの往復をそのまま持ち回すとトークンが膨らむので、
        「何を聞かれ、どんな SQL を書き、どう答えたか」だけを圧縮して入れる。
        これで「それを専門科別に」「同じ条件で2023年は？」のような
        文脈に依存した質問に答えられる。
        """
        messages: list[dict[str, Any]] = []
        for turn in (history or [])[-3:]:
            q = (turn.get("question") or "").strip()
            if not q:
                continue
            messages.append({"role": "user", "content": q})
            parts = []
            if turn.get("sql"):
                parts.append(f"実行した SQL:\n```sql\n{turn['sql'].strip()}\n```")
            if turn.get("answer"):
                parts.append(turn["answer"].strip()[:800])
            messages.append({
                "role": "assistant",
                "content": "\n\n".join(parts) or "（前回の回答）",
            })
        return messages

    # UI にそのまま出る文言。英語表示のときに日本語が混ざらないよう言語別に持つ。
    MESSAGES = {
        "ja": {
            "reading": "質問を読んでいます",
            "running": "BigQuery で実行しています",
            "rewriting": "SQL を書き直しています",
            "refused": "Claude が応答を拒否しました。質問を変えてみてください。",
            "sql_failed": ("SQL の書き直しを {n} 回試しましたが通りませんでした。"
                           "質問を具体的にして、もう一度お試しください。"),
            "too_many_tools": "ツールの呼び出しが多すぎたため打ち切りました。",
        },
        "en": {
            "reading": "Reading the question",
            "running": "Running it on BigQuery",
            "rewriting": "Rewriting the SQL",
            "refused": "Claude declined to answer. Try rephrasing the question.",
            "sql_failed": ("Rewrote the SQL {n} times and it still did not run. "
                           "Try asking something more specific."),
            "too_many_tools": "Stopped: too many tool calls.",
        },
    }

    def ask_stream(self, question: str,
                   history: list[dict[str, Any]] | None = None,
                   lang: str = "ja") -> Iterator[dict[str, Any]]:
        """ツールループを回しながら経過を yield する。SSE 配信はこれを流す。

        yield するイベント:
          {"type": "status",  "text": ...}
          {"type": "sql",     "index": n, "purpose": ..., "sql": ...}
          {"type": "result",  "index": n, ...run_sql の戻り...}
          {"type": "plot",    "spec": {...}}
          {"type": "answer",  "text": ...}          解釈の逐次デルタ
          {"type": "done",    "result": AgentResult, ...}
        """
        started = time.time()
        out = AgentResult(question=question)
        msg = self.MESSAGES.get(lang, self.MESSAGES["ja"])
        # 回答言語はユーザーのターンに添える。システムプロンプトを触ると
        # キャッシュが無効になるので、そちらは固定したままにする。
        ask_text = question
        if lang == "en":
            ask_text += ("\n\n(Answer in English. Chart titles and notes in English too, "
                         "and write the run_sql `purpose` in English. "
                         "SQL, column names and data values stay as they are.)")
        messages: list[dict[str, Any]] = [
            *self._seed_messages(history),
            {"role": "user", "content": ask_text},
        ]
        usage = {
            "input_tokens": 0, "output_tokens": 0,
            "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
        }
        sql_failures = 0

        yield {"type": "status", "text": msg["reading"]}

        for turn in range(MAX_TOOL_TURNS):
            response = yield from self._stream(messages)

            for key in usage:
                usage[key] += getattr(response.usage, key, 0) or 0

            T.log_event(
                "claude_turn",
                model=self.model,
                turn=turn,
                stop_reason=response.stop_reason,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                cache_creation_input_tokens=getattr(
                    response.usage, "cache_creation_input_tokens", 0),
                cache_read_input_tokens=getattr(
                    response.usage, "cache_read_input_tokens", 0),
            )

            if response.stop_reason == "refusal":
                out.stopped_early = msg["refused"]
                break

            messages.append({"role": "assistant", "content": response.content})

            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if not tool_uses:
                out.answer = "\n".join(b.text for b in response.content if b.type == "text")
                break

            tool_results = []
            for block in tool_uses:
                if block.name == "run_sql":
                    yield {"type": "status", "text": msg["running"]}
                    yield {
                        "type": "sql",
                        "index": len(out.steps) + 1,
                        "purpose": block.input.get("purpose", ""),
                        "sql": block.input.get("sql", ""),
                    }

                payload = self._dispatch(block, out)

                if block.name == "run_sql":
                    yield {"type": "result", "index": len(out.steps), **payload}
                elif block.name == "plot_spec" and "error" not in payload:
                    yield {"type": "plot", "spec": payload["spec"]}

                tool_results.append(
                    {"type": "tool_result", "tool_use_id": block.id,
                     "content": json.dumps(payload, ensure_ascii=False, default=str),
                     **({"is_error": True} if "error" in payload else {})}
                )
                if block.name == "run_sql" and "error" in payload:
                    sql_failures += 1
                    if sql_failures > MAX_SQL_RETRIES:
                        out.stopped_early = msg["sql_failed"].format(n=MAX_SQL_RETRIES)
                        break
                    yield {"type": "status", "text": msg["rewriting"]}

            if out.stopped_early:
                break
            messages.append({"role": "user", "content": tool_results})
        else:
            out.stopped_early = msg["too_many_tools"]

        out.elapsed_sec = round(time.time() - started, 2)
        out.usage = usage
        T.log_event(
            "question_done",
            question=question,
            model=self.model,
            sql_count=len(out.steps),
            sql_rerun=len(out.steps) > 0,       # False なら「形式だけの指示」で run_sql を呼んでいない
            plotted=out.plot is not None,
            stopped_early=out.stopped_early,
            elapsed_sec=out.elapsed_sec,
            **usage,
        )
        yield {
            "type": "done",
            "result": out,
            "elapsed_sec": out.elapsed_sec,
            "usage": usage,
            "stopped_early": out.stopped_early,
        }

    def _dispatch(self, block: Any, out: AgentResult) -> dict[str, Any]:
        """ツール1回分を実行して、Claude に返す payload を作る。"""
        if block.name == "run_sql":
            sql = block.input.get("sql", "")
            purpose = block.input.get("purpose", "")
            result = T.run_sql(sql, purpose)
            out.steps.append(Step(purpose=purpose, sql=sql, result=result))
            return result

        if block.name == "plot_spec":
            last = out.last_ok_step
            columns = last.result.get("columns") if last else None
            result = T.plot_spec(columns=columns, **block.input)
            if "error" not in result:
                out.plot = result["spec"]
            return result

        return {"error": f"不明なツール: {block.name}"}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="Medicare Part D × Text-to-SQL のエージェントを CLI で1問流す")
    ap.add_argument("--question", "-q", required=True)
    ap.add_argument("--model", default=None, help="既定は環境変数 ANTHROPIC_MODEL")
    ap.add_argument("--json", action="store_true", help="結果を JSON で出す")
    args = ap.parse_args()

    agent = Agent(model=args.model)
    result = agent.ask(args.question)

    if args.json:
        print(json.dumps({
            "question": result.question,
            "steps": [{"purpose": s.purpose, "sql": s.sql, "ok": s.ok,
                       "error": s.result.get("error"),
                       "returned_rows": s.result.get("returned_rows")} for s in result.steps],
            "plot": result.plot, "answer": result.answer,
            "elapsed_sec": result.elapsed_sec, "usage": result.usage,
            "stopped_early": result.stopped_early,
        }, ensure_ascii=False, indent=2, default=str))
        return 0 if not result.stopped_early else 1

    print(f"\n質問: {result.question}\n")
    for i, step in enumerate(result.steps, 1):
        mark = "OK" if step.ok else "NG"
        print(f"--- SQL {i} [{mark}] {step.purpose} ---")
        print(step.sql)
        if step.ok:
            r = step.result
            print(f"  -> {r['returned_rows']}行 / 全{r['total_rows']}行  "
                  f"{r['bytes_billed'] / 1024**2:.1f} MB  {r['elapsed_sec']}s")
            for row in r["rows"][:5]:
                print("     ", dict(zip(r["columns"], row)))
        else:
            print(f"  -> {step.result['error']}")
        print()

    if result.plot:
        print(f"--- plot_spec ---\n{json.dumps(result.plot, ensure_ascii=False)}\n")
    if result.stopped_early:
        print(f"--- 打ち切り ---\n{result.stopped_early}\n")
    if result.answer:
        print(f"--- 解釈 ---\n{result.answer}\n")

    u = result.usage
    print(f"--- {result.elapsed_sec}s / in {u['input_tokens']} out {u['output_tokens']} "
          f"/ cache write {u['cache_creation_input_tokens']} read {u['cache_read_input_tokens']} ---")
    return 0 if not result.stopped_early else 1


if __name__ == "__main__":
    sys.exit(main())
