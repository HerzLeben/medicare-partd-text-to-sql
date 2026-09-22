# Medicare Part D × Text-to-SQL — CLAUDE.md

Claude × 米国オープン医療データ（CMS Medicare Part D Prescribers）を自然言語で探索するアプリ。
コードは GitHub で公開し、読者が clone して自分の環境（自分の Anthropic API キー・自分の GCP）で動かす。
Cloud Run のホスト版は招待制で、基本的に読者には開放しない。
このファイルはリポジトリの正本。迷ったら `docs/` を読む。

## プロジェクトの目的

- ブログ連載「Claude Code × Medical app series」第1弾の実体。Claude Code に設計書を渡してアプリを作る過程を全部見せ、読者が自分の環境で再現できることが価値
- 主役は Claude（アプリ内の tool use と、この開発過程そのもの）。GCP は舞台装置
- 読者の負担は Anthropic API の従量課金のみになるよう、GCP 側は無料枠に収まる構成にする（Cloud Run min 0、BigQuery 2 GiB 上限）

## 必読ドキュメント（作業前に読む）

| ファイル | 内容 |
|---|---|
| `docs/design.md` | アプリ設計書。アーキテクチャ、DDL、ツール定義、実行ループ、ガード、画面、公開手順 |
| `docs/data_dictionary.md` | CMS 公式データ辞書の日本語対訳。列名・型・抑制ルールの正本 |
| `docs/DECISIONS.md` | 設計上の判断と落とし穴の要約。同じ穴を踏まないために先に読む |

## 技術スタック（固定）

- **フロント**：Next.js 16（App Router）＋ TypeScript ＋ Tailwind v4 ＋ Recharts ＋ d3-geo（州別コロプレス）
- **バックエンド**：Python 3.12、FastAPI（SSE 配信）、`anthropic` SDK（直接。Vertex 経由にしない）、`google-cloud-bigquery`、DuckDB（前処理のみ）
- 1コンテナに同居させる。Next.js が `/api/*` を `127.0.0.1:8000` の FastAPI へプロキシする
- BigQuery データセット `partd`（US）、Cloud Run（us-central1）、Cloud Build、Artifact Registry、Secret Manager
- モデル：`ANTHROPIC_MODEL` 環境変数で指定。既定は最新 Sonnet。ハードコードしない

## リポジトリ構成（この通りに作る）

```
app/            agent.py, tools.py, guards.py, prompts/{system.md, glossary.yaml, fewshot.yaml}
api/            main.py（FastAPI。SSE でエージェントの経過を配信）
web/            Next.js（app/, components/, lib/）
data/           download.sh, preprocess.py, schema/*.json, load.sh
sql/            ddl.sql, seed_drug_class.sql, seed_state.sql
eval/           questions.yaml, run_eval.py
docs/           design.md, data_dictionary.md, DECISIONS.md, EVAL.md
Dockerfile, cloudbuild.yaml, requirements.txt, .env.example, README.md
```

## 作業フェーズ（この順で。各フェーズ末に動作確認してから次へ）

1. **データ**：`data/download.sh`（CY2022–2024 × 3ファイル）→ `preprocess.py`（DuckDB で year 付与・Parquet 化・列名 snake_case）→ `sql/ddl.sql` → `load.sh`。投入後に行数・サイズを README に記録
2. **プロンプト**：`system.md`（スキーマ＋ルール）、`glossary.yaml`（`data_dictionary.md` の対訳表と薬効クラス辞書）、`fewshot.yaml`（5問）
3. **エージェント**：`agent.py` のツールループ（run_sql → 自己修正 ≤3 → plot_spec → 解釈）。CLI で1問通す
4. **UI**：`web/`（Next.js）＋ `api/main.py`。設計書 §5 の画面。質問例6本が全部通る
5. **評価**：`eval/questions.yaml` 30問と `run_eval.py`。結果を `docs/EVAL.md` に
6. **公開**：Dockerfile → Cloud Build → Cloud Run（任意・招待制）。判断は `docs/DECISIONS.md` に追記

## 実装ルール

### 数値の扱い（最優先。0落ちと型違いは例外を出さずに誤った答えを作る）

**識別子は数値ではない。** 年・NPI・FIPS・ZIP・州略号・各種コードは、桁区切りも丸めも
型変換もしない。判定は1箇所（`web/lib/format.ts` の `isIdentifierColumn`）に集約し、
**表・グラフ軸・ツールチップ・CSV 出力の全経路に通す**。1箇所だけ直すと他で漏れる。

踏んだ実例：
- 整数を一律 `toLocaleString` にかけて `year` が「2,022」と表示された
- 同じ経路で `prscrbr_state_fips` の `01` が `1`、`prscrbr_zip5` の `90210` が「90,210」になる

**境界の型変換を疑う。** BigQuery → Python → JSON → JavaScript の各段で型が変わる。
- JS の `Number` は 2^53 を超える整数で下位桁を失う（`9007199254740993` → `...992`）。
  `app/tools.py` の `_jsonable` が超過分を文字列にして守っている
- `bool` は Python では `int` の派生。数値判定より先に分岐する
- CSV を Excel で開くと先頭0が落ちる。識別子列は常にクォートし、UI に注意書きを出す

**欠測と 0 を混同しない。** CSV の blank は NULL であって 0 ではない（1〜10件の抑制）。
集計時は `COUNTIF(x IS NULL)` を併記する。

**画面を実際に見る。** 数値の表示崩れは型チェックもテストも素通りする。

### データ
- CSV の blank は NULL のまま。0 に置換しない
- `prscrbr_npi` は STRING（先頭0保持）。`bq load` のスキーマ自動検出は使わず `schema/*.json` を明示
- 列名は `data_dictionary.md` の変数名を snake_case 小文字にしたもの。実CSVのヘッダと突合し、差分があれば辞書側を更新して報告
- `provider` テーブルは辞書の全列（約90列）。設計書の DDL は抜粋なので辞書を優先

### Claude 呼び出し
- システムプロンプト（スキーマ＋辞書＋few-shot）に `cache_control: {"type": "ephemeral"}` を付ける
- `max_tokens` 4000。**温度は指定しない**（Sonnet 5 以降 `temperature` は廃止で 400 になる）。
  代わりに `output_config={"effort": "medium"}`。temperature を受け付ける旧世代のみ 0 を送る
- ツールは `run_sql` と `plot_spec` の2つだけ。増やす場合は設計書を先に更新
- 生成 SQL・課金バイト・所要秒・入出力トークン・キャッシュヒットを必ずログ（構造化 JSON、Cloud Logging で読める形）

### ガード（省略禁止）
- SQL は `SELECT` / `WITH` 始まりのみ。`;` 複文禁止。`partd.` 以外のデータセット参照禁止。大文字小文字無視で `DELETE|UPDATE|INSERT|DROP|CREATE|MERGE` を含めば拒否
- BigQuery は dry-run → `maximum_bytes_billed = 2 GiB` → 実行。タイムアウト 60 秒。結果は先頭 1000 行
  - 上限は **dry-run の見積もり**に対して効く（クラスタ枝刈りは反映されない）。1 GiB だと実測 27 MB のクエリまで拒否される（`docs/DECISIONS.md`）
- セッションあたり 20 質問。超えたら UI で案内
- `SELECT *` を Claude が出したらツール側でエラーを返して書き直させる

### UI
- ヘッダに「データ：CY2022–2024 / 11件未満は抑制 / 出典 data.cms.gov」を常時表示
- フッタに免責「本アプリは個々の医師の医療の質を評価するものではありません」
- 生成 SQL は折りたたみで表示、コピー可
- グラフは `plot_spec` の `kind` に従って描く。cartesian は Recharts、`choropleth_state` は
  us-atlas の Albers 投影済み TopoJSON を d3-geo で SVG 描画（州略号でマッチ）
- **系列色は固定順の検証済み8色**（`web/lib/palette.ts`）。循環禁止。9系列目は「その他」に畳む。
  連続量はティール（ヘルツレーベンのコーポレートカラー #01A09B）の単色ランプ、0 をまたぐ増減のみティール↔赤の二極。UI のアクセントも同じティール系（文字用は暗くした `#007a76`）
- SSE でストリーミングする（SQL → 結果 → グラフ → 解釈 の順に届く）

### コスト・安全
- Cloud Run：min 0 / max 2 / concurrency 10 / 1 GiB / timeout 300s
- サービスアカウントは `roles/bigquery.jobUser` ＋ `partd` データセットの `READER` のみ。プロジェクト全体の Viewer や Editor を付けない
- API キーは Secret Manager のみ。`.env` は `.gitignore`。コードやログにキーを出さない
- 課金が発生し得るコマンド（`bq load`、`gcloud run deploy`、`gcloud builds submit`）は実行前に内容を提示して確認を取る

### 記録
- 設計を変えたときは `docs/DECISIONS.md` に「何を・なぜ」を 1〜3 行で追記する

## やらないこと

- 認証・ユーザー管理、履歴の永続化
- 患者レベルの推定、医師個人の評価につながる機能（ランキング表示は NPI 併記・免責付きで可）
- Agent SDK / MCP 化（第2弾で扱う）
- Vertex AI 経由の呼び出し（README に差し替え方法を1段落書くだけ）

## 動作確認コマンド

```
python -m app.agent --question "GLP-1受容体作動薬の州別処方数を2022→2024で比較して"   # CLI で1問
ALLOW_DEV_CORS=1 PYTHONPATH=. uvicorn api.main:app --port 8000 --reload             # API
cd web && npm run dev                                                              # UI (:3000)
python eval/run_eval.py --model sonnet                                              # 精度評価
```

Claude Code の skill：`/verify-data`（投入結果の確認）、`/eval`（精度評価と記録）、`/deploy`（デプロイ一式）。`.claude/skills/` にある。

## 質問例（UI 固定・全部通ること）

1. GLP-1 受容体作動薬の州別処方数を 2022→2024 で比較
2. 2024 年の総薬剤費トップ10薬剤（ブランド/ジェネリック別）
3. フロリダ州の内科医でオピオイド処方が多い上位20（NPI）
4. 抗凝固薬（DOAC）の処方医数の年次推移
5. 州別の一人当たり薬剤費（費用 ÷ 受給者数）ランキング
6. 精神科医が最も処方する薬剤トップ10
