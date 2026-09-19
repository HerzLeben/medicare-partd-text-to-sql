# アプリ設計書：Medicare Part D × Text-to-SQL（Claude × BigQuery）

バージョン 0.3 / 2026-09-07 / 作成：Wataru Kinoshita（Herzleben）

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| 目的 | CMS Medicare Part D Prescribers を自然言語で探索できるアプリ。コードは GitHub 公開、読者は自分の環境（自分の API キー）で動かす。ブログ連載の実体 |
| ユーザー | 匿名の一般閲覧者（ログイン不要）。想定同時利用 数人 |
| 主要機能 | 質問 → SQL 生成 → BigQuery 実行 → 表＋グラフ → Claude の解釈と次の質問提案 |
| 非機能 | 月額ほぼ0円（Anthropic API 除く）、0スケール、最小権限、暴走防止 |
| 対象外 | 認証、ユーザーごとの履歴保存、データの定期更新自動化（年1回手動） |

## 2. アーキテクチャ

v0.3（2026-09-07）：UI を Streamlit から Next.js に変更した。理由は `docs/DECISIONS.md`。

```
[ブラウザ]
   │ HTTPS（SSE で逐次受信）
[Cloud Run: 1コンテナ]
   ├ Next.js 16 (:3000)  ← 画面。/api/* を下へプロキシ
   └ FastAPI  (:8000)    ← エージェント。Anthropic SDK ── Secret Manager (ANTHROPIC_API_KEY)
        │ tool: run_sql          │ tool: plot_spec
   [BigQuery: partd dataset]   [Recharts / d3-geo で描画（ブラウザ側）]
   ↑ bq load（年1回）
[GCS: raw CSV]  ← data.cms.gov
```

- リージョン：`us-central1`（データが米国、BigQuery のデータセットも US）
- ログ：Cloud Logging（質問文、生成SQL、課金バイト数、所要秒、トークン数）
- CI/CD：GitHub push → Cloud Build → Artifact Registry → Cloud Run

## 3. データ設計

### 3.1 ソース

data.cms.gov「Medicare Part D Prescribers」3データセット × 直近3年（CY2022–2024。CY2024 は 2026年5月公開済み、2013年以降13年分が利用可）

| データセット | 粒度 | 行数目安/年 | 用途 |
|---|---|---|---|
| by Provider and Drug | NPI × ブランド × 一般名 | 約2,500万 | 主テーブル |
| by Provider | NPI | 約110万 | 専門科・住所・オピオイド等の集計・受給者属性 |
| by Geography and Drug | 国/州 × ブランド × 一般名 | 約9万 | 州別集計の高速化、受給者数 |

取得はサイトの CSV ダウンロード（API は 5,000行/ページのため大量取得に不向き）。

### 3.2 BigQuery テーブル

データセット：`partd`（US マルチリージョン）

**列定義の正本は `data/schema/*.json`**（実 CSV ヘッダと `data_dictionary.md` で突合済み）。
`sql/ddl.sql` はそこから生成する。以下は要点の抜粋。

v0.2 の変更（2026-09-07）：`brnd_name_norm` / `gnrc_name_norm` を追加した。
CMS の薬剤名は Title Case（`Ozempic` / `Semaglutide`）で、表示は原文のまま残したい一方、
`UPPER(gnrc_name)` を WHERE に書くとクラスタ枝刈りが効かない。正規化した値を列として持ち、
照合と `CLUSTER BY` はそちらを使う。

```sql
-- 主テーブル
CREATE TABLE partd.provider_drug (
  year INT64 NOT NULL,
  prscrbr_npi STRING NOT NULL,          -- 先頭0保持のため STRING
  prscrbr_last_org_name STRING,
  prscrbr_first_name STRING,
  prscrbr_city STRING,
  prscrbr_state_abrvtn STRING,
  prscrbr_state_fips STRING,
  prscrbr_type STRING,                  -- 専門科（NPPES taxonomy 由来）
  prscrbr_type_src STRING,
  brnd_name STRING,
  brnd_name_norm STRING,                -- UPPER(brnd_name)。照合・クラスタ用
  gnrc_name STRING,
  gnrc_name_norm STRING,                -- UPPER(gnrc_name)
  tot_clms INT64,
  tot_30day_fills FLOAT64,
  tot_day_suply INT64,
  tot_drug_cst FLOAT64,
  tot_benes INT64,                      -- NULL = 抑制（1〜10）
  ge65_sprsn_flag STRING,
  ge65_tot_clms INT64,
  ge65_tot_30day_fills FLOAT64,
  ge65_tot_drug_cst FLOAT64,
  ge65_tot_day_suply INT64,
  ge65_bene_sprsn_flag STRING,
  ge65_tot_benes INT64
)
PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2013, 2030, 1))
CLUSTER BY prscrbr_state_abrvtn, gnrc_name_norm;

-- 医師サマリ（列は CMS 辞書のまま snake_case 化。主要列のみ抜粋）
CREATE TABLE partd.provider (
  year INT64 NOT NULL,
  prscrbr_npi STRING NOT NULL,
  prscrbr_last_org_name STRING, prscrbr_first_name STRING,
  prscrbr_gndr STRING, prscrbr_ent_cd STRING,
  prscrbr_city STRING, prscrbr_state_abrvtn STRING, prscrbr_zip5 STRING,
  prscrbr_ruca STRING, prscrbr_type STRING,
  tot_clms INT64, tot_30day_fills FLOAT64, tot_drug_cst FLOAT64, tot_day_suply INT64, tot_benes INT64,
  brnd_tot_clms INT64, brnd_tot_drug_cst FLOAT64,
  gnrc_tot_clms INT64, gnrc_tot_drug_cst FLOAT64,
  opioid_tot_clms INT64, opioid_tot_drug_cst FLOAT64, opioid_prscrbr_rate FLOAT64,
  opioid_la_tot_clms INT64, antbtc_tot_clms INT64, antpsyct_ge65_tot_clms INT64,
  bene_avg_age FLOAT64, bene_feml_cnt INT64, bene_male_cnt INT64,
  bene_dual_cnt INT64, bene_avg_risk_scre FLOAT64
)
PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2013, 2030, 1))
CLUSTER BY prscrbr_state_abrvtn, prscrbr_type;

-- 地域×薬剤
CREATE TABLE partd.geo_drug (
  year INT64 NOT NULL,
  prscrbr_geo_lvl STRING,               -- 'National' / 'State'
  prscrbr_geo_cd STRING, prscrbr_geo_desc STRING,
  brnd_name STRING, brnd_name_norm STRING,
  gnrc_name STRING, gnrc_name_norm STRING,
  tot_prscrbrs INT64, tot_clms INT64, tot_30day_fills FLOAT64,
  tot_drug_cst FLOAT64, tot_benes INT64,
  ge65_tot_clms INT64, ge65_tot_drug_cst FLOAT64, ge65_tot_benes INT64,
  lis_bene_cst_shr FLOAT64, nonlis_bene_cst_shr FLOAT64,
  opioid_drug_flag STRING, opioid_la_drug_flag STRING,
  antbtc_drug_flag STRING, antpsyct_drug_flag STRING
)
PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2013, 2030, 1))
CLUSTER BY prscrbr_geo_desc, gnrc_name_norm;
```

投入：`bq load --source_format=CSV --skip_leading_rows=1 --null_marker="" --schema=schema/provider_drug.json partd.provider_drug gs://.../MUP_DPR_RY25_P04_V10_DY23_NPIBN.csv`
→ 投入後に `UPDATE ... SET year = 2023` か、ロード前に列を付与（推奨：DuckDB で前処理して Parquet 化してから load）。

**列名は実ファイルの辞書で再確認すること**（年次で微妙に変わる）。

### 3.3 補助テーブル

| テーブル | 内容 | 出典 |
|---|---|---|
| `partd.drug_class` | 一般名 → 薬効クラス（GLP-1、SGLT2、DOAC、スタチン…） | 実データの gnrc_name 2,109 種から語幹一致で生成。204行/17クラス。RxNorm/ATC は次回 |
| `partd.state` | 州略号・州名・FIPS・地域区分・is_state | 62行。geo_drug の州名フルと provider の略号の橋渡し |
| `partd.query_log` | 質問・SQL・課金バイト・秒・トークン・成功可否 | アプリが書く（任意） |

### 3.4 抑制値の扱い

- CSV の blank は NULL として保持
- 集計 SQL では `SUM(x)` と `COUNTIF(x IS NULL) AS suppressed_rows` を併記するようプロンプトで指示
- UI に「11件未満は抑制されています」を常時表示

## 4. LLM 設計

### 4.1 モデル・設定

- 既定：Claude Sonnet（最新）。比較用に Haiku をトグル
- `max_tokens` 4,000、温度 0
- Prompt caching：システムプロンプト（スキーマ＋辞書＋few-shot ≈ 8k tokens）に `cache_control`

### 4.2 システムプロンプト構成

1. 役割：「BigQuery 標準SQL を書く医療データアナリスト」
2. スキーマ：3テーブル＋補助テーブル、各列の1行説明、結合キー
3. 用語辞書：薬効クラス→一般名リスト、州名↔略号、専門科の表記ゆれ（Internal Medicine / Family Practice…）、"処方数"＝`tot_clms`、"費用"＝`tot_drug_cst`
4. ルール
   - 必ず `year` で絞る（指定なければ最新年）
   - `LIMIT 1000` 以内、`SELECT *` 禁止
   - 州別集計は `geo_drug` を優先（軽い）。NPI 単位が必要なときだけ `provider_drug`
   - 抑制値の注意（`suppressed_rows` 併記）
   - 個人名の表示は求められた場合のみ、NPI を必ず併記
   - 出力は `run_sql` → 結果確認 → `plot_spec` → 3〜5文の解釈 → 次の質問を2つ提案
5. Few-shot：5問（州別推移、トップN、専門科別、年次比較、結合あり）

### 4.3 ツール定義

```json
[
  {
    "name": "run_sql",
    "description": "BigQuery 標準SQLを実行し、先頭1000行を返す。dry-run で課金バイトを確認し、2GiBを超える場合はエラーを返す。",
    "input_schema": {
      "type": "object",
      "properties": {
        "sql": {"type": "string"},
        "purpose": {"type": "string", "description": "このSQLが何を求めるかの1文"}
      },
      "required": ["sql", "purpose"]
    }
  },
  {
    "name": "plot_spec",
    "description": "直前の結果を可視化する仕様を返す。描画はアプリ側で行う。",
    "input_schema": {
      "type": "object",
      "properties": {
        "kind": {"type": "string", "enum": ["bar", "line", "choropleth_state", "table", "scatter"]},
        "x": {"type": "string"},
        "y": {"type": "string"},
        "color": {"type": "string"},
        "title": {"type": "string"},
        "note": {"type": "string", "description": "抑制値などの注記"}
      },
      "required": ["kind", "title"]
    }
  }
]
```

### 4.4 実行ループ

```
user_question
  → messages.create(tools=[run_sql, plot_spec])
  → tool_use(run_sql):
       dry_run → bytes > 2GiB ? error : execute(maximum_bytes_billed=2GiB, timeout=60s)
       返却: {columns, rows[:1000], total_rows, bytes_billed} or {error}
  → (エラー/0行なら Claude が修正、最大3ループ)
  → tool_use(plot_spec) → アプリが Recharts / d3-geo で描画
  → final text（解釈＋次の質問提案）
```

### 4.5 ガード

- SQL 文字列検査：`SELECT`/`WITH` 以外の先頭語を拒否、`;` 複文禁止、`partd.` 以外のデータセット参照を拒否
- BigQuery サービスアカウントは `partd` に対する Data Viewer + Job User のみ（書込不可）
- **`maximum_bytes_billed` は dry-run の見積もりに対して効く**。クラスタリングの枝刈りは
  実行時にしか決まらないため見積もりには反映されない。上限を 1 GiB にすると、実際は 27 MB で
  済む provider_drug のクエリまで拒否される（`docs/DECISIONS.md`）。2 GiB にした。
  実課金は従量なので上限を上げても期待コストはほぼ変わらない
- 1セッション 20 質問（FastAPI 側の Cookie セッションで数える。Cloud Armor は任意）
- 所要 60 秒でタイムアウト表示

## 5. 画面設計（Next.js）

v0.3 で Streamlit から Next.js（App Router）＋ FastAPI（SSE）に変えた。経緯は `docs/DECISIONS.md`。

```
┌──────────────────────────────────────────────────────────────┐
│ [HerzLeben ロゴ] Medicare Part D × Text-to-SQL  [CY2022–2024|抑制|出典] [日本語/EN][使い方] │
├───────────────┬──────────────────────────────────────────────┤
│ サイドバー      │ 最初の画面（会話の前）                            │
│ ・モデル切替    │  導入 → 「このデータについて」→ まずはここから        │
│ ・残り質問数    │   3 ステップ／中央の入力欄／質問例（切り口 × 3）      │
│ ・使い方       │ 会話が始まったら                                  │
│ ・作った会社    │  Q. 質問                                        │
│               │  ▸ 出力の形 [表|棒|折れ線|州の地図] [CSV] [SQL をコピー] │
│               │  ▸ グラフ（Recharts / d3-geo）と結果テーブル（先頭1000行）│
│               │  ▸ Claude の解釈（SSE で逐次）／次の質問              │
│               │  ▸ 生成 SQL（折りたたみ）／スキャン量・秒・tokens      │
│               │ [続けて質問________________] [送信]                │
├───────────────┴──────────────────────────────────────────────┤
│ フッター：免責／開発・運営                                       │
└──────────────────────────────────────────────────────────────┘
```

- 絞り込み UI は置かない（質問文と対立するため。`docs/DECISIONS.md`）。条件は質問文に書く
- **出力の形は SQL とは独立に決まる**：形式切替は SQL を再実行せず、直前の結果に対して
  plot_spec を差し替えて描き直す。州の列が無ければ地図、年の列が無ければ折れ線を無効化。
  会話で「折れ線にして」と言われたときも Claude は `run_sql` を呼ばず `plot_spec` だけ返す
- `/data`：データの説明（粒度の図・表のつながり・早見表・抑制の図・仕組み）。記事から直接リンク
- マニュアル（ダイアログ）：概要・使い方・仕組み・コツ・データ・制限・出典

質問例（`api/main.py` が切り口ごとに言語別で返す）
1. GLP-1 受容体作動薬の州別処方数を 2022→2024 で比較
2. 2024 年の総薬剤費トップ10薬剤（ブランド/ジェネリック別）
3. フロリダ州の内科医でオピオイド処方が多い上位20（NPI）
4. 抗凝固薬（DOAC）の処方医数の年次推移
5. 州別の一人当たり薬剤費（費用 ÷ 受給者数）ランキング
6. 精神科医が最も処方する薬剤トップ10

## 6. リポジトリ構成

```
medicare-partd-text-to-sql/
├── README.md                # 再現手順（記事の「公開手順」と同内容）
├── app/
│   ├── agent.py             # Anthropic 呼び出し・ツールループ
│   ├── tools.py             # run_sql / plot_spec の実装
│   ├── guards.py            # SQL 検査・レート制限
│   ├── prompts/
│   │   ├── system.md
│   │   ├── glossary.yaml    # 用語辞書
│   │   └── fewshot.yaml
├── api/
│   └── main.py              # FastAPI（SSE 配信、/api/config、/api/overview）
├── web/                     # Next.js 16（app/, components/, lib/）
├── data/
│   ├── download.sh          # data.cms.gov から CSV 取得
│   ├── preprocess.py        # DuckDB で year 付与・Parquet 化
│   ├── schema/*.json        # bq load 用スキーマ
│   └── load.sh              # bq load
├── sql/
│   ├── ddl.sql
│   └── seed_drug_class.sql
├── eval/
│   ├── questions.yaml       # 30問＋正解SQL
│   └── run_eval.py          # 一致率を測る
├── Dockerfile
├── cloudbuild.yaml
├── requirements.txt
└── .env.example
```

## 7. 公開手順（記事の第7節と同じ。README に転載）

1. `gcloud projects create <your-project-id>` → 課金アカウント紐付け → 予算アラート 1,000円/月
2. API 有効化：`run, cloudbuild, bigquery, secretmanager, artifactregistry`
3. BigQuery：`bq mk --location=US partd` → `sql/ddl.sql` → `data/load.sh`
4. サービスアカウント `partd-app@` に `roles/bigquery.jobUser` + `partd` データセットの Data Viewer
5. `gcloud secrets create ANTHROPIC_API_KEY --data-file=-`、`partd-app@` に Secret Accessor
6. Artifact Registry リポジトリ作成 → `cloudbuild.yaml`（build → push → `gcloud run deploy`）
7. Cloud Run 設定：`--min-instances=0 --max-instances=2 --concurrency=10 --memory=1Gi --timeout=300 --service-account=partd-app@ --set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest --allow-unauthenticated`
8. Cloud Build トリガー：GitHub `main` push で自動デプロイ
9. 動作確認：質問例6本、課金バイトがログに出ること、1GB 超クエリが拒否されること
10. 公開後：Looker Studio で `query_log` の日次コスト、初週は毎日確認

公開チェックリスト
- [ ] サービスアカウントに書込権限がない
- [ ] `maximum_bytes_billed` が効いている
- [ ] API キーがコードに含まれない（Secret Manager のみ）
- [ ] 最大インスタンス・同時実行が設定済み
- [ ] 予算アラートが届く
- [ ] フッターの免責が表示される
- [ ] 出典と抑制ルールが画面に明記される
- [ ] README だけで第三者が再現できる

## 8. コスト見積（月）

| 項目 | 前提 | 金額 |
|---|---|---|
| BigQuery ストレージ | 3年分 **論理 19.93 GB**（実測。provider_drug 17.62 / provider 2.24 / geo_drug 0.07） | 約30円（無料枠 10GiB 超過分 $0.02/GB）|
| BigQuery クエリ | 1,000質問 × 平均 200MB = 200GB | 0円（1TB 無料枠内） |
| Cloud Run | 1,000質問 × 30秒 × 1vCPU | 0円（18万 vCPU秒 無料枠内） |
| Anthropic API | 1,000質問 × 入力 10k（9割キャッシュ）＋出力 1k | 数千円 |
| 合計 | | 実質 Anthropic API のみ（GCP は約30円） |

ストレージは既定の LOGICAL 課金（非圧縮の論理バイト）で見る。物理は約 2.2 GB だが
`storage_billing_model = 'PHYSICAL'` は 14 日間戻せない拘束があるため、この規模では採らない。

## 9. 未決事項

- ~~何年分を載せるか（3年＝無料枠内で余裕）~~ → **決定：3年（CY2022-2024）。実測 19.93 GB で
  無料枠 10 GiB は超えるが約30円/月。13年全部なら約86GB で数百円/月**
- 医師氏名の表示ポリシー（公開情報だが、既定は NPI のみ・氏名はオプション）
- 薬効クラス辞書を手作りにするか RxNorm から自動生成するか（後者は「本気版」）
- `query_log` を公開するか（透明性 vs 悪用質問の露出）

## 10. スケジュール目安

| 週 | 作業 |
|---|---|
| 1 | データ取得・前処理・BigQuery 投入、辞書作成 |
| 2 | エージェント＋UI 実装、ガード、ローカル動作 |
| 3 | 精度評価 30問、Cloud Run 公開、監視 |
| 4 | 動画撮影、記事執筆、レビュー、公開 |
