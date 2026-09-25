# 設計上の判断と、踏んだ落とし穴

開発中に決めたことと、実際に踏んで直したことの要約。日付は決めた日。
再現するときに「なぜこうなっているか」を知りたい人向け。

## データ

- **CSV の URL は直書きしない**（09-07）。CMS は年次更新のたびにファイル名と配置を変える。`data/download.sh` は DCAT カタログ（`data.cms.gov/data.json`）から毎回解決する
- **薬剤名は原文（Title Case）を保持し、UPPER 正規化列（`*_norm`）を別に持つ**（09-07）。一般名は列幅で切り詰められている（`Empaglifloz/Linaglip/Metformin`）ので、薬効クラスで絞るときは `partd.drug_class` を結合する。名前を IN で並べると取りこぼす
- **投入は CSV 直ではなく Parquet 経由**（09-07）。型を DuckDB で確定させてから入れる。`bq load` のスキーマ自動検出は NPI の先頭 0 を落とすので使わない
- **RUCA は `1.1` のような小数サブコードと `99`（不明）を含む**。地方判定は「7 以上 11 未満」のように上限を付ける
- **ブランド/ジェネリックの判定は近似**（ブランド名と一般名が一致するか）。画面と解釈で明示する

## ガード

- **`maximum_bytes_billed` は dry-run の見積もりに対して効く**（09-07）。クラスタリングの枝刈りは実行時にしか決まらないため、実測 27 MB のクエリでも見積もりは 1.3 GB になる。1 GiB では `provider_drug` のクエリがほぼ全部拒否されたので 2 GiB にした。実課金は従量なので期待コストはほぼ変わらない
- SQL は `SELECT`/`WITH` 始まりの 1 文、`partd` の 5 表のみ、`SELECT *` は拒否してツール側のエラーで書き直させる

## Claude 呼び出し

- **Sonnet 5 以降は `temperature` を送ると 400**（09-07）。`output_config={"effort": "medium"}` に置き換えた
- システムプロンプト（スキーマ＋用語辞書＋few-shot、約 1.2 万トークン）に `cache_control` を付け、2 ターン目以降は 0.1 倍単価で読む
- **順位の言い間違い**：返ってきた並び順と別の指標で順位を語ると取り違える。「順位に言及するのは並べ替えた指標だけ」と system.md に書いた
- **形式だけの指示（「折れ線にして」）では `run_sql` を呼ばず `plot_spec` だけ返す**（09-19）。出力の形は SQL とは独立に決まる、を示すため。few-shot に「形式だけ」と「集計が変わる」の 2 例を並べて見分けさせる。`question_done` ログの `sql_rerun` で確かめられる

## UI

- **Streamlit から Next.js + FastAPI（SSE）へ**（09-07）。SQL → 結果 → グラフ → 解釈が届いた順に描ける。1 コンテナに同居させ、Next.js が `/api/*` をプロキシする。Cloud Run は 1 サービスのまま
- **識別子は数値ではない**。年・NPI・FIPS・ZIP を一律 `toLocaleString` にかけて「2,022」「90,210」が出た。判定を `web/lib/format.ts` の 1 か所に集約し、表・グラフ・ツールチップ・CSV の全経路に通す
- **JS の Number は 2^53 を超える整数で下位桁を失う**。`app/tools.py` の `_jsonable` が超過分を文字列にする
- **絞り込み UI は置かない**（09-18）。州に NY を選んだまま「州別に比較」と聞くと、NY だけの答えになった。条件は質問文に書く
- **出力の形は結果パネル上部で切り替える**（09-19）。SQL は再実行せず、直前の結果に plot_spec を組み直す。州略号の列が無ければ地図、年の列が無ければ折れ線を無効化
- 州の地図は us-atlas の投影済み TopoJSON を d3-geo で描く。コロプレスを描くときだけ動的 import
- 系列色は固定順の検証済み 8 色。循環させず、9 系列目は「その他」に畳む

## デプロイ

- **一般公開しない**。`--no-allow-unauthenticated` で立て、`roles/run.invoker` を付けたアカウントだけが `gcloud run services proxy` で開く
- **デプロイ後は必ず 1 問投げる**（09-08）。`/api/health` が 200 でも、`.gcloudignore` の `*.md` が `system.md` を消していて質問だけが落ちた。`smoke_test.py` は既知の値（セマグルチドの処方医数 174,885）まで確認する
- **トラフィックが古いリビジョンに固定される事故**（09-08）。検証で `update-traffic --to-revisions` を使った後に戻し忘れ、デプロイ成功のログが出ているのに配信は旧版のままだった。`deploy.sh --check-traffic` が最新と配信中を突き合わせて自動復旧する
- **IAP は一番最後に**。有効化した瞬間に自動スモークテストが通らなくなる。招待制なら IAP は不要
- gcloud は `CLOUDSDK_CORE_DISABLE_PROMPTS=1`。未有効 API の「有効化しますか」で無言で止まる
- bash で `"$var（…）"` のように変数の直後に全角括弧を置くと、変数名にバイトが取り込まれる。`${var}` と書く
- 実行用サービスアカウントの権限は `bigquery.jobUser`、`partd` データセットの READER、`ANTHROPIC_API_KEY` の secretAccessor の 3 つだけ

## ハーネス（09-23〜）

- **文書（CLAUDE.md・docs/）だけでもエージェントは動くが、約束が守られたかの確認は人に残る**（09-23）。文書だけのとき人が毎回やる工程を、`.claude/`（権限・MCP・skill・hook）が肩代わりする。ハーネスなし／ありの比較は `docs/HARNESS.md`
- **権限は `.claude/settings.json` にコミット**（09-23）。課金・外部影響のあるコマンドは ask、`.env`・鍵・IAM 変更・`bq rm` は deny。`bq` はグローバル引数が先に来る形を前方一致で捕まえられないので丸ごと ask。確認した公式ドキュメント：`https://code.claude.com/docs/en/permissions`（ルールの書式、deny > ask > allow、Read/Edit の gitignore 書式）、`https://code.claude.com/docs/en/settings`（settings.local.json の扱い）
- **開発用の BigQuery MCP は MCP Toolbox for Databases（Google 公式 OSS）**（09-23）。読み取り専用・`partd` のみ・2 GiB 上限を Toolbox 側で強制でき、読者は `brew install mcp-toolbox` で再現できる。Google のリモート版は課金上限が無く、書き込み可のツールを外すのに IAM deny policy が要るので見送り。認証は鍵ファイルを作らず、専用 SA（`bigquery.jobUser` ＋ `partd` の READER）への偽装。確認した公式ドキュメント：`https://code.claude.com/docs/en/mcp`（`.mcp.json` の書式と `${VAR:-default}` 展開）、`https://mcp-toolbox.dev/integrations/bigquery/source/`（source のフィールド）、`https://mcp-toolbox.dev/integrations/bigquery/tools/bigquery-execute-sql/`（readOnly と allowedDatasets の強制方法）、`https://docs.cloud.google.com/bigquery/docs/pre-built-tools-with-mcp-toolbox`（導入手順）、`https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp`（リモート版の仕様）。1.12.0 の起動フラグは `--config`（ドキュメントの `--tools-file` は旧名）
- **繰り返す工程は skill（`.claude/skills/<name>/SKILL.md`）に**（09-23）。`/verify-data`（投入結果の確認、MCP だけで動く）は Claude が自分で選べる。課金が出る `/eval`（精度評価と記録）と `/deploy`（plan → run → 配信確認 → スモーク → 記録）は `disable-model-invocation: true` で人だけが起動する。skill の `allowed-tools` はその turn の allow を足すだけで、settings の ask/deny より弱い（deny > ask > allow）ので、`deploy.sh --run` の確認は skill 経由でも出る。`/sync-public`（公開リポジトリへの同期）は作業リポジトリだけに置く。確認した公式ドキュメント：`https://code.claude.com/docs/en/skills`（frontmatter の項目、`$ARGUMENTS`、`` !`cmd` `` の前処理、`.claude/commands` との統合）
- **skill は 7 本**（09-23）。記事の Part2〜4 に対応する `cms-csv-to-bigquery`（第 2 作でも使う汎用版。Part D 固有の値は末尾の表に隔離）、`display-check`、`guard-glossary-update`、`eval` と、運用の `verify-data`、`deploy`、`sync-public`。新しい skill ディレクトリはセッション途中では拾われない（2 セッションで再現）ので、検証は履歴を持たないサブエージェントに SKILL.md を読ませて行い、実行して初めて分かった不一致（`load.sh` が年を受け取らない等）を直した
- **hook は 3 本、スクリプトは 2 つ**（09-23）。編集後の `pytest` と `ruff`/`tsc` は 1 スクリプト（`post_edit_checks.py`、exit 2 ＋ stderr で返す）、課金ゲートは `billing_gate.py`（PreToolUse で `load.sh --run` を検査し、30 分以内の同対象 `--plan` が無ければ JSON の `deny`）。`gcloud run deploy` 等は settings の ask に任せて hook では重ねない。前提の `tests/test_guards.py` を書いた時点で複数 CTE の誤検出が見つかった。確認した公式ドキュメント：`https://code.claude.com/docs/en/hooks`（settings の `hooks` の書式、stdin の JSON、exit 2 の意味、`permissionDecision`、`CLAUDE_PROJECT_DIR`、hook 変更の即時反映）
- **CMS の元データで既に % の列は 100 倍しない**（09-23）。`opioid_prscrbr_rate` が「927.4%」と出ていた。`format.ts` の `PERCENT_ALREADY` に列名を列挙。Claude が `SAFE_DIVIDE` で作る率は分数なので従来どおり 100 倍
- **グラフの NULL は 0 に畳まず点を欠けさせる**（09-23）。抑制（1〜10 件）が 0 の棒に見えていた
- **ハーネスと文書の位置づけ**（09-23）。`CLAUDE.md` は「やらないこと」の MCP の行を改め、`.claude/` の使い方（権限・MCP・hook・skill 7 本の使う場面）を持つ。README にはハーネスの節と読者が有効にする手順。前後比較・止まった実例・詰まった点は `docs/HARNESS.md`、判断はこのファイル。文書だけのとき人が毎回やる工程のうち、投入結果の確認・課金コマンドの確認・テストと lint の実行・繰り返す手順の記憶を、ハーネスが肩代わりする
