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
  - ask：`git push --dry-run origin main` → 実行され dry-run の出力が返った。確認ダイアログが出たかはエージェント側からは見えないため、人が画面で確認する（後述の追記参照）
  - deny：`bq rm --help` → `Permission to use Bash with command bq rm --help has been denied` で止まった。Read ツールで `.env` を開く → `File is in a directory that is denied by your permission settings` で止まった
- **詰まった点（2026-09-23）**
  - 指示書の対象は公開用リポジトリ `medicare-partd-text-to-sql` だが、作業は元の `partd-explorer` で行っている。`docs/DECISIONS.md` は公開側にしか無かったので作業側にもコピーし、以後は両方を更新する
  - `.claude/settings.local.json` は Claude Code が自分で作ったときだけ git の除外に入る。手で作る読者のために `.gitignore` に明示した
  - deny のエラー文は「ディレクトリが拒否されている」と読めるが、実際に拒否したのはファイル指定の `Read(./.env)`。文言に惑わされないこと
