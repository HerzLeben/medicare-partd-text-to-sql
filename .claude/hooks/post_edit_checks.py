#!/usr/bin/env python3
"""ファイル編集後の検査（PostToolUse の Edit / Write / MultiEdit 用）。2 つの役割を 1 つのスクリプトで担う。

1. ガードの自動テスト：app/guards.py・app/prompts/*・app/tools.py・tests/* が変わったら `pytest tests/` を回す
2. 型・lint：.py は `ruff check <そのファイル>`、web/ の .ts / .tsx は `tsc --noEmit`（web/ 全体。遅ければ対象を絞る）

落ちたら exit 2 で、結果の末尾を stderr に出す（Claude に届き、直す判断材料になる）。
通れば何も出さない。入出力の形式は公式ドキュメント（https://code.claude.com/docs/en/hooks）で確認したもの。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
PY = ROOT / ".venv" / "bin" / "python"
if not PY.exists():
    PY = Path(sys.executable)
TSC = ROOT / "web" / "node_modules" / ".bin" / "tsc"

GUARD_TRIGGERS = ("app/guards.py", "app/tools.py", "app/prompts/", "tests/")


def _run(label: str, cmd: list[str], cwd: Path = ROOT, tail: int = 25) -> str | None:
    """コマンドを実行し、失敗なら末尾を返す。成功なら None。"""
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if p.returncode == 0:
        return None
    out = (p.stdout + p.stderr).strip().splitlines()
    return f"[{label}] 失敗（exit {p.returncode}）:\n" + "\n".join(out[-tail:])


def main() -> int:
    data = json.load(sys.stdin)
    fp = data.get("tool_input", {}).get("file_path")
    if not fp:
        return 0
    path = Path(fp).resolve()
    try:
        rel = path.relative_to(ROOT).as_posix()
    except ValueError:
        return 0  # リポジトリ外のファイルは見ない

    failures: list[str] = []

    if rel.startswith(GUARD_TRIGGERS) and (ROOT / "tests").is_dir():
        r = _run("pytest tests/", [str(PY), "-m", "pytest", "tests/", "-q", "--no-header"])
        if r:
            failures.append(r)

    if rel.endswith(".py"):
        r = _run("ruff check", [str(PY), "-m", "ruff", "check", rel])
        if r:
            failures.append(r)
    elif rel.startswith("web/") and rel.endswith((".ts", ".tsx")) and TSC.exists():
        r = _run("tsc --noEmit", [str(TSC), "--noEmit", "-p", "web/tsconfig.json"])
        if r:
            failures.append(r)

    if failures:
        sys.stderr.write(f"{rel} を編集した後の検査で落ちました。直してから進めてください。\n\n" + "\n\n".join(failures) + "\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
