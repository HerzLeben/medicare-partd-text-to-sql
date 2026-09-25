#!/usr/bin/env python3
"""課金コマンドのゲート（PreToolUse / PostToolUse の Bash 用）。

役割は 1 つだけ：`./data/load.sh --run` を、直前に同じ対象の `--plan` を実行していなければ止める。
`gcloud run deploy` などの確認は settings.json の ask に任せ、ここでは重ねない。

- PostToolUse で `load.sh --plan <tables>` を見たら、対象と時刻を .claude/hooks/.state/load_plan.json に記録する
- PreToolUse で `load.sh --run <tables>` を見たら、30 分以内の記録があり、対象が一致するときだけ通す
- 止めるときは permissionDecision: deny を JSON で返す（理由はそのまま Claude に届く）

入出力の形式は公式ドキュメント（https://code.claude.com/docs/en/hooks）で確認したもの。
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

PLAN_TTL_SEC = 30 * 60
ALL_TABLES = {"geo_drug", "provider", "provider_drug"}
STATE = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / ".claude" / "hooks" / ".state" / "load_plan.json"

_LOAD = re.compile(r"(?:^|[\s;&|])(?:\./)?data/load\.sh\s+([^;&|\n]*)")


def _parse_load(cmd: str) -> tuple[str, frozenset[str]] | None:
    """コマンド文字列から load.sh の呼び出し（mode, tables）を取り出す。無ければ None。"""
    m = _LOAD.search(cmd)
    if not m:
        return None
    args = m.group(1).split()
    mode = "plan"
    tables: set[str] = set()
    for a in args:
        if a == "--run":
            mode = "run"
        elif a == "--plan":
            mode = "plan"
        elif a in ALL_TABLES:
            tables.add(a)
    return mode, frozenset(tables or ALL_TABLES)


def _deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, ensure_ascii=False))


def main() -> int:
    data = json.load(sys.stdin)
    if data.get("tool_name") != "Bash":
        return 0
    parsed = _parse_load(data.get("tool_input", {}).get("command", ""))
    if parsed is None:
        return 0
    mode, tables = parsed
    event = data.get("hook_event_name")

    if event == "PostToolUse" and mode == "plan":
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps({"tables": sorted(tables), "at": time.time()}))
        return 0

    if event == "PreToolUse" and mode == "run":
        try:
            rec = json.loads(STATE.read_text())
        except (OSError, ValueError):
            _deny("load.sh --run の前に、同じ対象で ./data/load.sh --plan を実行して計画を人に見せてください"
                  "（直前の --plan の記録がありません）。")
            return 0
        age = time.time() - rec.get("at", 0)
        planned = set(rec.get("tables", []))
        if age > PLAN_TTL_SEC:
            _deny(f"直前の --plan から {age / 60:.0f} 分経っています（上限 {PLAN_TTL_SEC // 60} 分）。"
                  "もう一度 ./data/load.sh --plan を実行して計画を見せ直してください。")
            return 0
        if not tables <= planned:
            _deny(f"--plan の対象（{', '.join(sorted(planned))}）と --run の対象（{', '.join(sorted(tables))}）が違います。"
                  "同じ対象で --plan を実行し直してください。")
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
