---
name: deploy
description: Cloud Run へ招待制でデプロイする。plan を見せて確認 → run → 配信リビジョンの確認 → 1 問投げるスモークテスト → 作業ログに記録、の順。Cloud Build と Cloud Run の課金が発生するので人が /deploy で起動する
disable-model-invocation: true
argument-hint: "[--invite email]"
allowed-tools: Bash(./deploy.sh --plan *) Bash(./deploy.sh --check-traffic *) Bash(./deploy.sh --smoke *) Bash(web/node_modules/.bin/tsc --noEmit *) Bash(git status *) Bash(git log *)
---

# Cloud Run へデプロイする

引数：`$ARGUMENTS`（`--invite you@example.com` で閲覧者を追加）

## 手順

1. **手元の確認**。`git status --short` に未コミットの変更があれば列挙する（そのまま進めてよいが記録に残す）。`web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json` を通す（`npx tsc` はリポジトリ直下に typescript が無いので動かない）。落ちたらデプロイしない
2. **plan**。`./deploy.sh --plan $ARGUMENTS` を実行し、project / region / service / image / runtime SA と、実行される gcloud コマンドを要約して見せる。ここで止まり、人の承認を待つ
3. **run**。`./deploy.sh --run $ARGUMENTS`。settings の ask ルールで確認ダイアログが出る（このスキルの `allowed-tools` に `--run` を入れていないのは意図的。skill の allow は settings の ask より弱い）。出力からリビジョン名（`medicare-partd-text-to-sql-000NN-xxx`）を控える
4. **配信の確認**。`./deploy.sh --check-traffic`。最新リビジョンが配信されていなければスクリプトが `--to-latest` に切り替える（2026-09-08 の事故：`update-traffic --to-revisions` を使った後、デプロイ成功のログが出ているのに旧版が配信され続けた）
5. **スモークテスト**。`./deploy.sh --smoke`。`/api/health` が 200 でも質問が 500 になる壊れ方がある（`.gcloudignore` が `system.md` を消していた件）。4 点（health / config / SSE の 4 イベント / 既知の値 174,885）が揃って初めて成功。失敗したらデプロイをやり直さず、原因を報告して止まる
6. **記録**。`docs/DEPLOY.md` があれば末尾に `## <日付> — デプロイ（リビジョン <名前>）` を追加し、前回のデプロイ以降の変更（`git log --oneline` の要約）、smoke の結果、詰まった点を書く。判断を変えたなら `docs/DECISIONS.md` にも 1〜3 行

## 守ること

- `gcloud run deploy` / `gcloud builds submit` / `gcloud projects add-iam-policy-binding` を直接叩かない。必ず `deploy.sh` 経由（冪等性と最小権限の SA 作成が入っている）。settings の deny はエージェントが直接打つコマンド文字列に効くもので、スクリプトの中身には効かない。だからこそ直接は禁止し、スクリプトは ask で人が見る
- コマンドは 1 つずつ実行する。`;` で繋ぐと allowed-tools に当たらない。手順 6 の記録は Edit なので確認が出ることがある
- IAP は有効化しない。招待制は `roles/run.invoker` で足りる。IAP を入れるとスモークテストが通らなくなる
- 一般公開（`--allow-unauthenticated`）にしない
- 課金の見込みは Cloud Build 数分 ＋ Cloud Run は min 0 なので待機費用なし。人がそれを分かった上で承認する
