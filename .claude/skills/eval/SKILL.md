---
name: eval
description: 評価セット 30 問で生成 SQL の精度を測り、前回の run と比べて「直った／壊れた」を docs/EVAL_run<N>.md と docs/EVAL.md に記録する。Anthropic API の課金（30 問で数十円〜）と 8〜9 分がかかるので、人が /eval で起動する
disable-model-invocation: true
argument-hint: "[--model sonnet|opus|haiku] [--level 1|2|3] [--limit N]"
allowed-tools: Bash(.venv/bin/python eval/run_eval.py *) Bash(git status *) Bash(git log *) Bash(git diff *) Bash(ls docs/EVAL_run*)
---

# 精度評価を回して記録する

引数：`$ARGUMENTS`（空なら Sonnet で全 30 問）

## 手順

1. **何を測るのかを先に書く**。`git log --oneline -5 -- app/prompts eval/questions.yaml` と `git status --short` で、前回の run 以降に変わったプロンプト・辞書・few-shot・設問を挙げる。変更が無いなら「ばらつきの測定」と明記する
2. **run 番号を決める**。`ls docs/EVAL_run*.md` の最大 N に 1 を足す。`--limit` か `--level` が付いている場合は部分実行なので番号を付けず、`--out eval/results/partial_<YYYYMMDD_HHMM>.md --json-out eval/results/partial_<YYYYMMDD_HHMM>.json` に書き、手順 4・5 は行わない（結果の表を見せて終わる）
3. **実行**（時間と課金がかかることを一言添えてから）

   ```
   .venv/bin/python eval/run_eval.py $ARGUMENTS --out docs/EVAL_run<N>.md --json-out eval/results/run<N>.json
   ```
   リポジトリ直下で、コマンドは 1 つずつ実行する（`;` や `&&` で繋ぐと allowed-tools のパターンに当たらず確認が出る）。
   途中で `ReadTimeout` などが出ても 1 問ごとに保存されているので、`--rejudge eval/results/run<N>.json` で判定だけやり直せる
4. **前回と比べる**。`docs/EVAL_run<N-1>.md` の問題別表と突き合わせ、直った ID・壊れた ID・落ちたままの ID を列挙する。壊れた問題は生成 SQL を読み、原因を「辞書」「規則」「設問の曖昧さ」「ばらつき」のどれかに分類する
5. **記録**。`docs/EVAL_run<N>.md` の見出しを `# 精度評価（run <N>、<日付>）` にし、冒頭の箇条書きに「変更点」と「前回との差」を足す（run 6 の書式）。`docs/EVAL.md` の末尾に `## <N>回目：<何をした>` を追加し、実行ごとの表（回 / 条件 / 実質正解）に 1 行足す

## 守ること

- このスキルの中でプロンプトや辞書を直さない。直すのは結果を読んだ人が決める
- 1 問だけ落ちた／直ったは、`temperature` を指定できない以上ばらつきの可能性がある。同条件で複数回まわしていないなら断定しない
- 正解率は 2 本立て（実質正解／厳密一致）。厳密一致だけで語らない
- `eval/results/` は git に入れない。公開リポジトリへ持っていくのは `docs/EVAL.md` だけ（`EVAL_run*` は作業リポジトリに残す）
