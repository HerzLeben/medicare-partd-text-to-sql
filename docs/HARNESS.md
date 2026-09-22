# ハーネスの後付け記録

初版は CLAUDE.md と docs/ だけで作った（`.claude/` なし）。人が毎回やっていた工程を
権限・MCP・skill・hook に移した記録。道具ごとに「導入前／導入後／設定／動作確認／詰まった点」を残す。
記事で前後を比べる素材。設計判断の要約は `docs/DECISIONS.md`。

## 権限（`.claude/settings.json` の allow / ask / deny）

- **導入前**：CLAUDE.md「コスト・安全」節の1行「課金が発生し得るコマンド（`bq load`、`gcloud run deploy`、`gcloud builds submit`）は実行前に内容を提示して確認を取る」に頼っていた。守るかどうかはエージェントの読み方次第で、`.env` を読まない約束は書いてすらいなかった
- **導入後**：課金・外部影響のあるコマンドは Claude Code が実行前に必ず止めて確認を出す（ask）。`.env`・サービスアカウント鍵の読み取り、IAM 変更、`bq rm` はエージェントに選ばせず拒否する（deny）。テストや `--plan` のような読み取り系は確認なしで通す（allow）。文章の約束が設定の強制になった
- **設定**：`.claude/settings.json`（コミット対象）。個人の上書きは `.claude/settings.local.json`（`.gitignore` 済み）
  - allow：`git status/diff/log`、`ls`、`pytest`、`ruff`、`npx tsc --noEmit`、`./data/load.sh --plan`、`run_eval.py --validate`
  - ask：`./data/load.sh --run`、`bq`（全部）、`gcloud run deploy`、`gcloud builds submit`、`gsutil`、`gcloud storage`、`git push`
  - deny：`Read(./.env)`、`Read(*.key.json)`、`gcloud iam`、`gcloud projects add-iam-policy-binding`、`bq rm`
  - 優先順位は deny > ask > allow。広い ask を狭い allow で例外にはできない（公式ドキュメント）
- **判断**
  - `bq` は丸ごと ask にした。`bq --project_id=X query` のようにグローバル引数が先に来る形は `Bash(bq query *)` では捕まえられない。読み取り系（`bq show`・`bq ls`）はフェーズ2の MCP に置き換える
  - `load.sh --run` は ask に名指しで入れた。スクリプト内部の `bq load` は権限ルールから見えず、見えるのは `./data/load.sh --run` という文字列だけ
  - `.env` の Bash 経由の読み取りは権限では完全には防げない。`Read(./.env)` が止めるのは Read ツールと `< .env` のリダイレクトで、`cat .env` のような引数指定の Bash パターンは公式ドキュメントが「脆い」と明記している。deny に `Bash(cat .env *)` を足したが抜け道は残るので、鍵の本命は従来どおり `.gitignore` と Secret Manager
- **動作確認（2026-09-23）**
  - allow：`./data/load.sh --plan` → 確認なしで実行され、投入コマンドの一覧が表示された（課金なし）
  - ask：`git push --dry-run origin main` → 確認ダイアログが出て、人が承認してから実行された（エージェント側からはダイアログが見えないので、人の画面で確認した）
  - deny：`bq rm --help` → `Permission to use Bash with command bq rm --help has been denied` で止まった。Read ツールで `.env` を開く → `File is in a directory that is denied by your permission settings` で止まった
- **詰まった点（2026-09-23）**
  - 指示書の対象は公開用リポジトリ `medicare-partd-text-to-sql` だが、作業は元の `partd-explorer` で行っている。`docs/DECISIONS.md` は公開側にしか無かったので作業側にもコピーし、以後は両方を更新する
  - `.claude/settings.local.json` は Claude Code が自分で作ったときだけ git の除外に入る。手で作る読者のために `.gitignore` に明示した
  - deny のエラー文は「ディレクトリが拒否されている」と読めるが、実際に拒否したのはファイル指定の `Read(./.env)`。文言に惑わされないこと
  - フェーズ2で deny `Bash(gcloud iam *)` が、読み取りだけの `gcloud iam service-accounts list` も止めた（複合コマンドの一部に含まれていただけで全体が拒否された）。広い deny の副作用として「既存 SA の一覧すら見られない」。意図どおりだが、SA の確認は人の端末で行う運用になる

## MCP（開発用 BigQuery、`.mcp.json` ＋ `mcp/bigquery.tools.yaml`）

- **導入前**：テーブルの行数・スキーマ・投入結果の確認は、人が BigQuery コンソールか `bq` を叩いて結果を貼っていた。初版の DEPLOY.md の行数表は全部この手作業
- **導入後**：Claude Code が MCP ツール（`list_datasets` / `list_tables` / `get_table_info` / `execute_sql`）で自分で確かめる。読み取り専用・`partd` のみ・1 クエリ 2 GiB 上限・最大 100 行を Toolbox 側で強制し、権限は専用サービスアカウント `partd-mcp-reader`（`bigquery.jobUser` ＋ `partd` の READER のみ）に落とす
- **候補比較**（2026-09-23）

  | 候補 | 読み取り専用 | 課金上限 | 読者の再現 |
  |---|---|---|---|
  | MCP Toolbox for Databases（Google 公式 OSS） | `readOnly` ＋ `allowedDatasets` | `maximumBytesBilled` | `brew install mcp-toolbox` と `.mcp.json` だけ |
  | Google のリモート BigQuery MCP（`bigquery.googleapis.com/mcp`） | `execute_sql_readonly` はあるが書き込み可の `execute_sql` も同居。外すには IAM deny policy | 無し（3 分・3,000 行のみ） | Google OAuth をローカルの MCP クライアントで通す公式手順が無い |
  | コミュニティ製 npm | 実装次第 | 実装次第 | 非公式。除外 |

  Toolbox を採用。課金上限が設定できたので `execute_sql` は ask にせず allow にした（`mcp__bigquery__*`）
- **設定**
  - `.mcp.json`（プロジェクトスコープ、コミット）：`toolbox --config mcp/bigquery.tools.yaml --stdio`。`GCP_PROJECT` / `BQ_MCP_SA` を環境変数で渡し、既定値はこのリポジトリの値
  - `mcp/bigquery.tools.yaml`：prebuilt（`--prebuilt bigquery`）は使わない。prebuilt は `allowedDatasets` を環境変数で渡せず、予測・対話分析など不要なツールが 9 本入るため。自作で 4 本に絞った
  - 認証は **サービスアカウントの偽装**（`impersonateServiceAccount`）。鍵ファイルを作らず、人の ADC が SA になりすます。自分のアカウントにその SA だけの `roles/iam.serviceAccountTokenCreator` を付ける
- **動作確認（2026-09-23、Toolbox を stdio で直接叩いて確認）**
  - (1) `list_datasets` → `partd-explorer.partd` だけ。`list_tables` → 5 表
  - (2) `get_table_info provider_drug` → `year INTEGER`、`prscrbr_npi STRING` ほか（NPI が STRING で入っていることを確認）
  - (3) 年別行数 → provider_drug 25,869,521 / 26,794,878 / 28,023,892、provider 1,332,309 / 1,380,665 / 1,416,883、geo_drug 115,396 / 115,936 / 117,661。DEPLOY.md の投入記録と 9 件すべて一致、README の 3 年合計とも一致
  - (4) 書き込み拒否：`INSERT` / `DELETE` → `403 Permission bigquery.tables.updateData denied`、`CREATE TABLE` → `403 bigquery.tables.create denied`。いずれも dry-run の段階で SA の権限に拒否された。`SELECT 1; SELECT 2` は Toolbox の `write mode is 'blocked', only SELECT statements are allowed` で拒否
  - (5) 他データセット拒否：`bigquery-public-data.usa_names` → `query accesses dataset 'bigquery-public-data.usa_names', which is not in the allowed list`
  - ジョブ履歴（`bq ls -j`）の実行者が `partd-mcp-reader@...` になっていることを確認。偽装は効いている
  - Claude Code 本体から（`.mcp.json` 経由、`.claude/settings.local.json` の `enabledMcpjsonServers` で承認済み）：`list_tables` → 5 表、年別行数 → 上記 (3) と一致、`DELETE FROM partd.drug_class WHERE 1=0` → dry-run で 403 `bigquery.tables.updateData denied`。`mcp__bigquery__*` は allow なので確認ダイアログは出なかった
- **詰まった点（2026-09-23）**
  - Toolbox の公式ドキュメントは `--tools-file` と書いているが、1.12.0 では `--config`。`--tools-file` だと起動せず JSON でない出力が返る
  - `partd.INFORMATION_SCHEMA.TABLES` は通る。`allowedDatasets` は「partd の中」と見なすため。アプリ側のガード（`app/guards.py`）はこれも弾くので、MCP のほうが少し緩い。メタデータの読み取りだけなので許容し、ここに記録
  - IAM の反映遅れ：`serviceAccountTokenCreator` を付けた直後は `iam.serviceAccounts.getAccessToken` が拒否された。1〜2 分後に通った
  - 最初の書き込みテストで「エラーなし・出力なし」と出て慌てたが、拒否は JSON-RPC の `error` で返っており、テストスクリプトが `result` しか見ていなかった。MCP の拒否は tool result の `isError` と JSON-RPC error の 2 系統がある
  - 公式ドキュメントの URL が 2 回移転していた（`googleapis.github.io/genai-toolbox` → `mcp-toolbox.dev` → 一部は `docs.cloud.google.com`）。リポジトリ名も `genai-toolbox` から `mcp-toolbox` に変わっている
  - zsh に `#` 付きのコマンド列を貼ると `command not found: #` になり途中で崩れる。人に渡すコマンドはコメント抜きで 1 行ずつ

## skill（`.claude/skills/<name>/SKILL.md`）

- **導入前**：投入結果の確認は人が BigQuery コンソールで見て貼る。精度評価は `run_eval.py` を叩いたあと、見出し・変更点・前回との差を人が `docs/EVAL.md` に書き足す（run 5・6 がそう）。デプロイは `deploy.sh` の `--plan` → `--run` → `--check-traffic` → `--smoke` を人が順に叩いて `docs/DEPLOY.md` に書く。公開リポジトリへの同期は人が diff を見て手で移す（手順はエージェントのメモリに「両方に入れて公開側を push」とだけあった）
- **導入後**：`/verify-data`・`/eval`・`/deploy`・`/sync-public`。手順と「守ること」を `SKILL.md` に、期待値は `expected.md` に分けた。コードは無い。Markdown 1 枚が工程の正本になり、人の記憶とメモリに散っていた手順がリポジトリに入った
- **設定**

  | skill | 起動 | 判断 |
  |---|---|---|
  | `verify-data` | 人と Claude（`description` で自動選択） | 読み取り専用 MCP だけ・課金は数百 MB なので Claude に任せる。`allowed-tools: mcp__bigquery__*` |
  | `eval` | 人だけ（`disable-model-invocation: true`） | Anthropic API の課金と 8〜9 分。`--limit`/`--level` の部分実行は番号を付けず `eval/results/`（gitignore）へ |
  | `deploy` | 人だけ | `allowed-tools` は `--plan`/`--check-traffic`/`--smoke`/`tsc` だけ。`--run` は入れず settings の ask に任せる（skill の allow は settings の ask より弱い） |
  | `sync-public` | 人だけ、作業リポジトリのみ | 公開側は初回コミットで履歴を作り直したので、ファイル上書きではなくタグ `public-synced` 以降の差分を `git apply --reject`。公開側だけの言い回し（`DEPLOY.md` → `DECISIONS.md`）を潰さない |

- **動作確認（2026-09-23）**
  - **Skill ツールからの起動は未確認**。このセッションの途中で `.claude/skills/` を作ったため、本体もサブエージェントも `Unknown skill: verify-data`。公式ドキュメントは "Live change detection during session" と書くが、2.1.280 で新規ディレクトリはセッション途中に拾われなかった。**Claude Code を再起動して `/verify-data` が補完に出ること、`/eval` `/deploy` が Claude の一覧に出ないことを人が確認する（未了）**
  - 手順そのものは、会話履歴を持たないサブエージェント 4 本に `SKILL.md` を読ませて検証した
    - `verify-data`：MCP 5 本（bq・load.sh なし）で 15 項目すべて期待値と一致
    - 自然文「投入結果が正しいか確かめて。行数と型を見て」でも同じ手順・同じ表に到達（skill が無くても到達できる程度には CLAUDE.md が効いている、とも言える）
    - `eval --limit 2`：2/2 正解、0.4 分。部分実行なので `EVAL_run7.md` を作らず `docs/EVAL.md` にも触らなかった。キャッシュは 2 問目から効いた（13,934 トークン）
    - `deploy`：`tsc` と `./deploy.sh --plan` まで通り、承認待ちで止まった（`--run` は実行していない）
  - 副産物が 2 つ出た。(1) 総行数の合計が足し算を間違えていた：`docs/DEPLOY.md` と `/api/config` の 84,819,407 は 4 行の和 85,167,407 が正しい（`/data` 画面の数字）。(2) **5 表すべてに有効期限 2026-11-06 が付いていた**（投入 2026-09-07 の 60 日後。データセットの既定の表有効期限）。放置するとホスト版が 11 月に黙って壊れる。外すのは `bq update --expiration 0`（ask）で人の操作。`verify-data` に手順 5 として期限チェックを足した
- **詰まった点（2026-09-23）**
  - 「新しいセッションで試す」を入れ子の `claude -p` でやろうとしたら、auto モードの分類器に拒否された（`CLAUDECODE` 環境変数を外す形が迂回に見える）。サブエージェントで代替したが、これは「Skill ツールが引けるか」ではなく「手順が正しいか」の検証にしかならない
  - `npx tsc --noEmit` はリポジトリ直下に typescript が無いので動かない（`This is not the tsc command you are looking for`）。`web/node_modules/.bin/tsc -p web/tsconfig.json` に変え、allow にも足した
  - `;` で繋いだ複合コマンドは `allowed-tools` の単発パターンに当たらず確認が出る。「コマンドは 1 つずつ」を skill に書いた
  - `get_table_info provider` は約 90 列の JSON で 1 万トークン返る。型の確認は `INFORMATION_SCHEMA.COLUMNS` に変えた（MCP は `partd.INFORMATION_SCHEMA` を通す。`SCHEMATA_OPTIONS` は SA の権限で 403 なので、データセットの既定期限は人が `bq show` で見る）
  - `provider_drug` の列を 4 本まとめて集計したら dry-run 2.58 GB で MCP の 2 GiB 上限に当たった。verify-data の SQL は 1〜2 列に絞ってある
  - 公開側と作業側は同じファイルでも言い回しが違う（`api/main.py` のコメントは `DEPLOY.md` 参照 → `README の表`）。上書き同期にすると公開側の直しが毎回消えるので、差分適用にした
  - その差分適用で `git apply --3way` は使えなかった。公開側は履歴を作り直しているので元の blob が無く（`repository lacks the necessary blob`）、1 hunk でも当たらないと全ファイルが戻る（atomic）。`--reject` に変え、当たらない hunk は `*.rej` から手で移す。最初の同期で当たらなかったのは `api/main.py` の総行数の行（コメントが両側で違う）
