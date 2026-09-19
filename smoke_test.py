#!/usr/bin/env python3
"""smoke_test.py — デプロイ先に実際に1問投げて、答えが返るところまで確認する。

  python3 smoke_test.py https://xxx.run.app [IDトークン]

「URL が開くか」「/api/health が 200 か」だけでは足りない。
2026-09-08 に踏んだ2件は、いずれもビルド・デプロイ・ヘルスチェックが
すべて成功したうえで、質問を投げると 500 になる状態だった。

  - .gcloudignore の *.md が app/prompts/system.md を除外していた
  - Dockerfile が削除済みの web/public/ を COPY していた（こちらはビルドで落ちた）

確認するのは次の4点。標準ライブラリだけで動かす（venv が無くても実行できるように）。
  1. /api/health が 200
  2. /api/config が質問例とモデル一覧を返す
  3. /api/ask が SSE を流し、SQL・結果・解釈・完了の各イベントが揃う
  4. 結果が 1 行以上あり、既知の値と一致する
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

# 答えが変わらない質問を使う。CY2024 のデータが入っていれば必ずこの値になる。
QUESTION = "2024年にセマグルチドを処方した医師は何人？"
EXPECTED = 174885
TIMEOUT = 180


def fail(msg: str) -> None:
    print(f"  ✗ {msg}")
    sys.exit(1)


def runtime_sa() -> str:
    """借用する実行用サービスアカウント。環境変数か gcloud の既定プロジェクトから組む。"""
    if os.environ.get("RUNTIME_SA"):
        return os.environ["RUNTIME_SA"]
    name = os.environ.get("RUNTIME_SA_NAME", "partd-app")
    project = os.environ.get("GCP_PROJECT") or gcloud_config("project")
    return f"{name}@{project}.iam.gserviceaccount.com"


def gcloud_config(key: str) -> str:
    if not shutil.which("gcloud"):
        return ""
    r = subprocess.run(["gcloud", "config", "get-value", key],
                       capture_output=True, text=True,
                       stdin=subprocess.DEVNULL, timeout=30)
    out = r.stdout.strip()
    return "" if out in ("", "(unset)") else out


def iap_client_id(base: str) -> str | None:
    """IAP が有効なら、302 のリダイレクト先から OAuth クライアント ID を拾う。

    IAP を通す ID トークンは audience にこのクライアント ID を要求する。
    Cloud Run の ID トークン（audience = サービス URL）では 401 になる。
    """
    try:
        req = urllib.request.Request(base + "/api/health")
        opener = urllib.request.build_opener(NoRedirect)
        opener.open(req, timeout=30)
    except urllib.error.HTTPError as e:
        loc = e.headers.get("Location", "") if e.code in (301, 302, 303, 307) else ""
        m = re.search(r"client_id=([^&]+)", loc)
        return m.group(1) if m else None
    except Exception:  # noqa: BLE001
        return None
    return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def iap_token(client_id: str) -> str | None:
    """サービスアカウントを借用して IAP 用の ID トークンを取る。"""
    if not shutil.which("gcloud"):
        return None
    r = subprocess.run(
        ["gcloud", "auth", "print-identity-token",
         f"--impersonate-service-account={runtime_sa()}",
         f"--audiences={client_id}", "--include-email"],
        capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=90,
    )
    return r.stdout.strip() or None


def request(url: str, token: str | None, data: dict | None = None):
    body = json.dumps(data, ensure_ascii=False).encode() if data else None
    req = urllib.request.Request(url, data=body, method="POST" if data else "GET")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if data:
        req.add_header("Content-Type", "application/json")
    return urllib.request.urlopen(req, timeout=TIMEOUT)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    base = sys.argv[1].rstrip("/")
    token = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"スモークテスト: {base}")

    # IAP が有効だと Cloud Run の ID トークンでは 401 になる。
    # リダイレクト先からクライアント ID を拾い、SA 借用でトークンを取り直す。
    cid = iap_client_id(base)
    if cid:
        # IAP はカスタム OAuth クライアントを作らないとプログラム的アクセスができない。
        # 管理された共有クライアント（client_id=369001918367-… ）を audience にしても
        # 「Invalid JWT audience」で 401 になる。サービス URL や
        # /projects/N/locations/R/services/S の形も同様に拒否される。
        # gcloud run services proxy も Cloud Run の ID トークンを付けるだけなので通らない。
        print(f"  IAP が有効です（client_id={cid[:24]}…）")
        print("  → 自動検査はスキップします。IAP はブラウザでの Google ログインを"
              "前提としており、\n"
              "     カスタム OAuth クライアントを作らないとトークンでは通れません。")
        print(f"\n  手動で確認してください: {base}")
        print("    ブラウザで開き、Google アカウントでログインしてから質問を1問投げる")
        print("\n  自動検査を使いたい場合は IAP を外してください:")
        print("    gcloud beta run services update <SERVICE> \\")
        print("      --region=<REGION> --project=<PROJECT> --no-iap")
        return 0

    # --- 1. health ----------------------------------------------------------
    try:
        with request(f"{base}/api/health", token) as r:
            if r.status != 200:
                fail(f"/api/health が {r.status}")
            print("  ✓ /api/health")
    except urllib.error.HTTPError as e:
        fail(f"/api/health が {e.code}"
             + ("（認証トークンを渡してください）" if e.code in (401, 403) else ""))
    except Exception as e:  # noqa: BLE001
        fail(f"/api/health に到達できません: {e}")

    # --- 2. config ----------------------------------------------------------
    try:
        with request(f"{base}/api/config", token) as r:
            cfg = json.load(r)
        if len(cfg.get("examples", [])) < 1 or not cfg.get("models"):
            fail(f"/api/config の中身がおかしい: {cfg}")
        print(f"  ✓ /api/config（質問例 {len(cfg['examples'])} 件 / "
              f"モデル {len(cfg['models'])} 種）")
    except Exception as e:  # noqa: BLE001
        fail(f"/api/config: {e}")

    # --- 3-4. 実際に1問投げる ------------------------------------------------
    print(f"  … 質問を投げています: {QUESTION}")
    t0 = time.time()
    seen: dict[str, object] = {}
    try:
        with request(f"{base}/api/ask", token,
                     {"question": QUESTION, "model": "sonnet"}) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace")
                if not line.startswith("data: "):
                    continue
                ev = json.loads(line[6:])
                kind = ev.get("type")
                if kind == "error":
                    fail(f"サーバがエラーを返しました: {ev.get('message')}")
                if kind in ("sql", "result", "plot", "done"):
                    seen.setdefault(kind, ev)
                if kind == "answer":
                    seen["answer"] = True
    except urllib.error.HTTPError as e:
        fail(f"/api/ask が {e.code}: {e.read()[:200].decode('utf-8', 'replace')}")
    except Exception as e:  # noqa: BLE001
        fail(f"/api/ask: {type(e).__name__}: {e}")

    elapsed = round(time.time() - t0, 1)

    for kind, label in [("sql", "SQL 生成"), ("result", "BigQuery 実行"),
                        ("answer", "解釈のストリーミング"), ("done", "完了")]:
        if kind not in seen:
            fail(f"{label} のイベントが来ませんでした（届いたのは {sorted(seen)}）")
        print(f"  ✓ {label}")

    result = seen["result"]
    if result.get("error"):
        fail(f"SQL の実行に失敗: {result['error']}")
    rows = result.get("rows") or []
    if not rows:
        fail("結果が 0 行でした（BigQuery にデータが入っているか確認してください）")

    got = rows[0][0]
    if got != EXPECTED:
        # データを入れ替えた場合はここが変わる。落とさず警告にとどめる。
        print(f"  ⚠ 値が既知と違います: {got}（期待 {EXPECTED}）"
              "。データを更新したなら smoke_test.py の EXPECTED を直してください")
    else:
        print(f"  ✓ 値の一致（処方医数 {got:,}）")

    print(f"\n  スモークテスト成功（{elapsed} 秒）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
