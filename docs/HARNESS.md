# ハーネスの記録

構成：権限（settings.json）、MCP（BigQuery）、skill 7 本、テストと hook 3 本、文書（CLAUDE.md・README）。2026-09-23 時点。

文書（CLAUDE.md・docs/）だけでもエージェントは動くが、約束が守られたかの確認は人に残る。
文書だけのとき人が毎回やる工程を、権限・MCP・skill・hook が肩代わりする。道具ごとに
「ハーネスなし（文書だけ）のとき／ハーネスありのとき／設定／動作確認／詰まった点」を残す。記事で比べる素材。設計判断の要約は `docs/DECISIONS.md`。

## 権限（`.claude/settings.json` の allow / ask / deny）

- **ハーネスなし（文書だけ）のとき**：CLAUDE.md「コスト・安全」節の1行「課金が発生し得るコマンド（`bq load`、`gcloud run deploy`、`gcloud builds submit`）は実行前に内容を提示して確認を取る」に頼っていた。守るかどうかはエージェントの読み方次第で、`.env` を読まない約束は書いてすらいなかった
- **ハーネスありのとき**：課金・外部影響のあるコマンドは Claude Code が実行前に必ず止めて確認を出す（ask）。`.env`・サービスアカウント鍵の読み取り、IAM 変更、`bq rm` はエージェントに選ばせず拒否する（deny）。テストや `--plan` のような読み取り系は確認なしで通す（allow）。文章の約束を、設定による強制に置き換える
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

- **ハーネスなし（文書だけ）のとき**：テーブルの行数・スキーマ・投入結果の確認は、人が BigQuery コンソールか `bq` を叩いて結果を貼っていた。DEPLOY.md の行数表は全部この手作業
- **ハーネスありのとき**：Claude Code が MCP ツール（`list_datasets` / `list_tables` / `get_table_info` / `execute_sql`）で自分で確かめる。読み取り専用・`partd` のみ・1 クエリ 2 GiB 上限・最大 100 行を Toolbox 側で強制し、権限は専用サービスアカウント `partd-mcp-reader`（`bigquery.jobUser` ＋ `partd` の READER のみ）に落とす
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
  - Google のリモート BigQuery MCP をローカルから使えない、の実証：プラグイン経由で入っていた `bigquery.googleapis.com/mcp` が `claude mcp list` で `Failed to connect — Incompatible auth server: does not support dynamic client registration` になっていた。比較表で「OAuth をローカルの MCP クライアントで通す公式手順が無い」と書いた点の裏付け
  - VS Code 拡張のセッションでは `.mcp.json` の承認ダイアログが出ず、ターミナルで `claude` を起動してフォルダの信頼と `bigquery` の承認を一度受け入れる必要があった。承認後も、起動済みのセッションには MCP は読み込まれず再起動が要った（skill は同じセッションで後から出たが、MCP は出なかった）
  - zsh に `#` 付きのコマンド列を貼ると `command not found: #` になり途中で崩れる。人に渡すコマンドはコメント抜きで 1 行ずつ

## skill（`.claude/skills/<name>/SKILL.md`）

- **ハーネスなし（文書だけ）のとき**：投入結果の確認は人が BigQuery コンソールで見て貼る。精度評価は `run_eval.py` を叩いたあと、見出し・変更点・前回との差を人が `docs/EVAL.md` に書き足す（run 5・6 がそう）。デプロイは `deploy.sh` の `--plan` → `--run` → `--check-traffic` → `--smoke` を人が順に叩いて `docs/DEPLOY.md` に書く。公開リポジトリへの同期は人が diff を見て手で移す（手順はエージェントのメモリに「両方に入れて公開側を push」とだけあった）。CSV から BigQuery までの投入は、CLAUDE.md の「作業フェーズ 1」の 1 行と、人が DEPLOY.md の「詰まった点」を読み返して同じ轍を避ける運用だった。表示崩れの点検は「画面を実際に見る」という CLAUDE.md の 1 行と人の目視。評価で落ちた質問の直し方は EVAL.md の反省文に散っていて、次に落ちたときに人が読み返して判断していた
- **ハーネスありのとき**：`/verify-data`・`/eval`・`/deploy`・`/sync-public`。手順と「守ること」を `SKILL.md` に、期待値は `expected.md` に分けた。コードは無い。Markdown 1 枚が工程の正本になり、人の記憶とメモリに散っていた手順がリポジトリに入った。`/cms-csv-to-bigquery`（辞書突合 → download → 前処理 → DDL → `--plan` で止まる → 承認 → `--run` → `/verify-data`。Part D 固有の値を末尾の表に隔離し、第 2 作 Open Payments で工程を変えずに使う）、`/display-check`（判定 1 か所 `isIdentifierColumn` と、表・軸・ツールチップ・地図・CSV の全経路の点検表。実画面の確認を省略しない）、`/guard-glossary-update`（症状 → 直す場所の対応表、差分は 1 か所、実データで確認、`/eval` の再評価は人に依頼）。踏んだ実例は各 SKILL.md の末尾に「踏んだ実例」として入れた
- **設定**

  | skill | 起動 | 判断 |
  |---|---|---|
  | `verify-data` | 人と Claude（`description` で自動選択） | 読み取り専用 MCP だけ・課金は数百 MB なので Claude に任せる。`allowed-tools: mcp__bigquery__*` |
  | `eval` | 人だけ（`disable-model-invocation: true`） | Anthropic API の課金と 8〜9 分。`--limit`/`--level` の部分実行は番号を付けず `eval/results/`（gitignore）へ |
  | `deploy` | 人だけ | `allowed-tools` は `--plan`/`--check-traffic`/`--smoke`/`tsc` だけ。`--run` は入れず settings の ask に任せる（skill の allow は settings の ask より弱い） |
  | `sync-public` | 人だけ、作業リポジトリのみ | 公開側は初回コミットで履歴を作り直したので、ファイル上書きではなくタグ `public-synced` 以降の差分を `git apply --reject`。公開側だけの言い回し（`DEPLOY.md` → `DECISIONS.md`）を潰さない |
  | `cms-csv-to-bigquery` | 人と Claude | `--run` は入れず settings の ask に任せ、工程 5 の `--plan` で必ず止まる。年は download と前処理にだけ効き、投入はテーブル単位（`load.sh` は年を受け取らない） |
  | `display-check` | 人と Claude | 判定を `format.ts` の 1 か所に集約したまま点検する。コンポーネントに個別の例外を足させない。`tsc` は `web/node_modules/.bin/tsc` |
  | `guard-glossary-update` | 人と Claude | 分類表（辞書不足／テーブル選択／集計誤り／ガード拒否／列過多／設問の曖昧さ／ばらつき）→ 場所。`guards.py` は `tests/test_guards.py` に再現ケースを先に足す。再評価 `/eval` は課金なので人に依頼 |

  `deploy` は Part4 の Cloud Run 節、`sync-public` は作業リポジトリ限定の運用 skill。`cms-csv-to-bigquery` / `display-check` / `eval` / `guard-glossary-update` は記事の Part2〜4 に対応する

- **動作確認（2026-09-23）**
  - **Skill ツールからの起動は未確認**。このセッションの途中で `.claude/skills/` を作ったため、本体もサブエージェントも `Unknown skill: verify-data`。公式ドキュメントは "Live change detection during session" と書くが、2.1.280 で新規ディレクトリはセッション途中に拾われなかった。**Claude Code を再起動して `/verify-data` が補完に出ること、`/eval` `/deploy` が Claude の一覧に出ないことを人が確認する（未了）**
  - 手順そのものは、会話履歴を持たないサブエージェント 4 本に `SKILL.md` を読ませて検証した
    - `verify-data`：MCP 5 本（bq・load.sh なし）で 15 項目すべて期待値と一致
    - 自然文「投入結果が正しいか確かめて。行数と型を見て」でも同じ手順・同じ表に到達（skill が無くても到達できる程度には CLAUDE.md が効いている、とも言える）
    - `eval --limit 2`：2/2 正解、0.4 分。部分実行なので `EVAL_run7.md` を作らず `docs/EVAL.md` にも触らなかった。キャッシュは 2 問目から効いた（13,934 トークン）
    - `deploy`：`tsc` と `./deploy.sh --plan` まで通り、承認待ちで止まった（`--run` は実行していない）
  - **`cms-csv-to-bigquery` / `display-check` / `guard-glossary-update` の 3 本（2026-09-23）**：この セッションでも作成直後は Skill ツールから `Unknown skill`（2 回目の再現）。ただし、その後 SKILL.md を編集・コミットしたあとには同じセッションの一覧に出た。新しいディレクトリの作成は拾われず、既存ファイルの変更は拾われる、という挙動に見える（公式ドキュメントの『watches for changes to SKILL.md』と整合）。作った直後に呼びたければ再起動が要る。会話履歴を持たないサブエージェント 3 本に SKILL.md を読ませて手順を検証した
    - `cms-csv-to-bigquery geo_drug 2024`：工程 1 のヘッダ突合は辞書・schema JSON と 22 列すべて一致。`--list` はカタログから URL を解決、raw CSV があるので取得はスキップ、前処理は 117,661 行（投入記録と一致）、`--plan geo_drug` の出力を見せて **`--run` の前で止まった**。ただし書いたとおり `--plan geo_drug 2024` と打つと `load.sh` が「不明な引数: 2024」で落ちた（年を受け取らない）。SKILL.md を「年は 2・3 にだけ効く、投入はテーブル単位」に直した
    - `display-check`：A〜D はコードで全経路 OK（正規表現は 8 列の識別子で true・7 列の数量で false、軸・ツールチップ・地図・CSV・`_jsonable` すべて `isIdentifierColumn` を通る）。`tsc` エラー 0。副産物が 2 つ：(1) `Chart.tsx` の系列付き集計 `Number(r[yi] ?? 0)` が **NULL を 0 に畳む**（抑制された受給者数が色系列付きの棒で 0 に見える。系列なしの経路は除外済み）。アプリの挙動はハーネスの範囲外なので直さず、人に判断を渡す。(2) 実画面の確認（E）は **未達**：ポート 8000 に 9/19 起動の古い API プロセス（`--reload` なし）が残っていて質問が「処理中にエラー」で落ちた。人のプロセスなので止めず、E はサーバーを立て直してから行う。SKILL.md に起動コマンドと「古いプロセスを疑う」を足した。また `format.ts` の `isNumericColumn` と `reshape.ts` の `isNumericCol` は別物（前者は識別子を除外しない）で、文面どおりだと表を NG と誤判定するので書き分けた
    - `guard-glossary-update q04`：分類は「集計誤り」（3 ブランドの `SUM(tot_prscrbrs)` = 453,256、実数 174,885）、直す場所は `glossary.yaml` の `terms`。既に入っている修正（12〜17 行）と `fewshot.yaml` 例 4 の note（90〜94 行）を特定し、修正が無ければ生むはずの最小差分を 1 か所と答えた。MCP の無いセッションだったので値は書かず SQL を提示して止まった（この分岐を SKILL.md に足した）。`pytest tests/` は `tests/` も pytest も無くて失敗 → フェーズ 4 で作る
  - 副産物が 2 つ出た。(1) 総行数の合計が足し算を間違えていた：`docs/DEPLOY.md` と `/api/config` の 84,819,407 は 4 行の和 85,167,407 が正しい（`/data` 画面の数字）。(2) **5 表すべてに有効期限 2026-11-06 が付いていた**（投入 2026-09-07 の 60 日後。データセットの既定の表有効期限）。放置するとホスト版が 11 月に黙って壊れる。外すのは `bq update --expiration 0`（ask）で人の操作。`verify-data` に手順 5 として期限チェックを足した
- **詰まった点（2026-09-23）**
  - 「新しいセッションで試す」を入れ子の `claude -p` でやろうとしたら、auto モードの分類器に拒否された（`CLAUDECODE` 環境変数を外す形が迂回に見える）。サブエージェントで代替したが、これは「Skill ツールが引けるか」ではなく「手順が正しいか」の検証にしかならない
  - `npx tsc --noEmit` はリポジトリ直下に typescript が無いので動かない（`This is not the tsc command you are looking for`）。`web/node_modules/.bin/tsc -p web/tsconfig.json` に変え、allow にも足した
  - `;` で繋いだ複合コマンドは `allowed-tools` の単発パターンに当たらず確認が出る。「コマンドは 1 つずつ」を skill に書いた
  - `get_table_info provider` は約 90 列の JSON で 1 万トークン返る。型の確認は `INFORMATION_SCHEMA.COLUMNS` に変えた（MCP は `partd.INFORMATION_SCHEMA` を通す。`SCHEMATA_OPTIONS` は SA の権限で 403 なので、データセットの既定期限は人が `bq show` で見る）
  - `provider_drug` の列を 4 本まとめて集計したら dry-run 2.58 GB で MCP の 2 GiB 上限に当たった。verify-data の SQL は 1〜2 列に絞ってある
  - 公開側と作業側は同じファイルでも言い回しが違う（`api/main.py` のコメントは `DEPLOY.md` 参照 → `README の表`）。上書き同期にすると公開側の直しが毎回消えるので、差分適用にした
  - この 3 本の検証で SKILL.md の不一致が 5 つ出た：`load.sh` は年を受け取らない／`EVAL_run<N>.md` は run 5 以降しか無く run 1〜4 の生成 SQL は `EVAL.md` にある／`glossary.yaml` にはテーブル選択の `table_hints` 節がある／`/eval --limit` は `eval/results/partial_*` に書くだけで EVAL.md を更新しない／`tests/` が無い。**手順を書いた人（エージェント）はコードを読んで書いたはずでも、実行しないと引数の仕様まで合わせられない**。skill は 1 回実行してから信用する
  - その差分適用で `git apply --3way` は使えなかった。公開側は履歴を作り直しているので元の blob が無く（`repository lacks the necessary blob`）、1 hunk でも当たらないと全ファイルが戻る（atomic）。`--reject` に変え、当たらない hunk は `*.rej` から手で移す。最初の同期で当たらなかったのは `api/main.py` の総行数の行（コメントが両側で違う）

## hook（`.claude/hooks/*.py` ＋ `settings.json` の `hooks`）

- **ハーネスなし（文書だけ）のとき**：ガードや型の確認は、人が「テスト回して」「tsc 通して」と毎回指示していた（そもそもガードのテストが無く、`smoke_test.py` 1 本だった）。課金コマンドの確認は CLAUDE.md の文章の約束。`load.sh --run` の前に `--plan` を見せる、は人が覚えている運用だった
- **ハーネスありのとき**：
  - `app/guards.py`・`app/prompts/*`・`app/tools.py`・`tests/*` を編集すると `pytest tests/` が自動で走り、落ちれば結果の末尾がエージェントに返る
  - `.py` を編集すると `ruff check`、`web/` の `.ts/.tsx` を編集すると `tsc --noEmit` が走る
  - `./data/load.sh --run` は、30 分以内に同じ対象の `--plan` を実行していなければ止まる（settings の ask より前に hook が止めるので、確認ダイアログすら出ない）
- **前提として作ったもの**：`tests/test_guards.py`（50 ケース、BigQuery に接続しない）、`requirements-dev.txt`（pytest・ruff。本番の `requirements.txt` には入れない）、`ruff.toml`（E/F/I/B の最小構成。E501 は日本語コメントで超えるので除外、B905 は既存 4 か所が長さを事前確認しているので除外。初回は I001 が 2 件で `--fix` で解消）
- **設定**：`.claude/settings.json` の `hooks`。イベントは `PreToolUse`（matcher `Bash`）と `PostToolUse`（matcher `Bash` と `Edit|Write|MultiEdit`）。スクリプトは `.claude/hooks/billing_gate.py`（PreToolUse で `--run` を検査、PostToolUse で `--plan` を記録。状態は `.claude/hooks/.state/`、gitignore）と `post_edit_checks.py`（テストと lint を 1 本で）。止め方は、PreToolUse は JSON の `permissionDecision: deny`、PostToolUse は exit 2 ＋ stderr（公式ドキュメントで確認）。`settings.json` の hook 追記はセッション途中でもファイル監視で即反映された（skill と違う）
- **動作確認（2026-09-23、わざと引っかかる操作）**
  - **ガードの自動テスト**：`guards.py` の `SELECT_STAR` を `SELECT\s+\*\*` に壊して保存 → hook が `pytest` を回し、`test_select_star_rejected` 5 件の `DID NOT RAISE SqlRejected` がそのまま返ってきた → 元に戻すと無言で通過。これが記事の見せ場
  - **lint**：`smoke_test.py` に未使用の `import os` を足す → `ruff check` が F811（既存の `import os` と重複）で止めた。`web/lib/csv.ts` に `const s: number = ...` を入れる → `tsc` が TS2322 ほか 4 件で止めた。どちらも戻すと通過
  - **課金ゲート**：`./data/load.sh --run geo_drug` を `--plan` なしで実行 → hook が「直前の --plan の記録がありません」で止め、ask の確認は出なかった。スクリプト単体では 7 分岐（記録なし／記録あり同対象／別対象／30 分超過／無関係なコマンド／全表の plan 後に単表の run）を確認
- **テストが見つけた本物のバグ**：`tests/test_guards.py` を書いた時点で 1 本落ちた。複数 CTE（`WITH a AS (...), b AS (...)`）の 2 つ目以降を `guards.py` が CTE と認識せず、「データセット名が付いていない: b」と正しい SQL を弾いていた。正規表現 `\b(?:WITH|,)` の `\b` が `), b` のカンマ側で境界を取れないため。`(?:\bWITH|,)` に直した。評価 30 問では複数 CTE の SQL が出なかったので見つかっていなかった
- **詰まった点（2026-09-23）**
  - 課金ゲートの単体テストを Bash の 1 行に書いたら、そのコマンド文字列の中に `./data/load.sh --run` が含まれていたため **hook 自身に止められた**。hook はコマンド全文を見るので、引用符の中でも反応する。安全側の誤反応として受け入れ、テストはファイルに逃がして `python3 script.py` で実行した
  - `tsc` は `web/` 全体を検査するので 1 回 10 秒前後。`.tsx` を続けて編集すると毎回走る。今回は許容し、遅くなったら `--incremental` か対象ファイルの絞り込みを検討する
  - PostToolUse で `--plan` を記録しているので、`--plan` が失敗しても記録される。exit code は `tool_response` から確実には取れないので、30 分の期限と対象一致で実害を抑えている

## 副産物（skill と hook が見つけたアプリの不具合）

ハーネスの対象外だが、動かした結果アプリ側の不具合が 3 つ見つかり、人の判断で直した。

1. `web/components/Chart.tsx`：系列付き集計と系列なしの両方で `Number(null)` が 0 になり、抑制された値が 0 の棒として描かれていた（`/display-check` の D 項目）。`numOrNull` を通して NULL は点を欠けさせる
2. `web/lib/format.ts`：`opioid_prscrbr_rate` は CMS の元データで既に % なのに、率の整形で 100 倍して「927.4%」と表示していた（`/display-check` の実画面 E で発見。スクリーンショット `docs/screenshots/harness/p3_display_check_q3_before.png` → `_after.png`）。既に % の列を `PERCENT_ALREADY` で除外
3. `app/guards.py`：上記の複数 CTE の誤検出（テストで発見）
