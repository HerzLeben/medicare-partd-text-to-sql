---
name: guard-glossary-update
description: 評価で落ちた質問や答えられなかった質問を起点に、直す場所が app/prompts/glossary.yaml（用語辞書）・fewshot.yaml（例）・system.md（規則）・app/guards.py（SQL ガード）・eval/questions.yaml（設問）のどれかを判断し、最小の差分を入れて、テストと /eval の再評価で確かめる手順。「q04 が落ちた」「この言い方だと答えられない」「ガードが正しい SQL を弾いた」「用語を足したい」ときに使う
argument-hint: "[質問 ID か質問文]"
allowed-tools: mcp__bigquery__execute_sql Bash(.venv/bin/python -m pytest *) Bash(.venv/bin/python -c *) Bash(grep *) Bash(git diff *) Bash(git status *) Bash(git log *) Bash(ls docs/EVAL_run*)
---

# ガード・辞書・例の更新

対象：`$ARGUMENTS`（評価の問題 ID か、失敗した質問文）

原則：**差分は 1 か所、最小に。** 規則を 1 つ足すたびに、その規則が想定していなかった質問が壊れる
（評価では 1 回目→2 回目で 5 問直って 5 問壊れ、差し引きゼロだった）。

## 1. 症状を分類する

失敗した質問の生成 SQL を読み、次のどれかに当てる。置き場所：run 5 以降は `docs/EVAL_run<N>.md`、run 1〜4 は `docs/EVAL.md` の「外した問題の生成 SQL」、評価以外なら会話の `run_sql` ログ。`grep -n <ID> docs/EVAL*.md` で探す。

| 分類 | 症状 | 直す場所 |
|---|---|---|
| 辞書不足 | 用語を違う列に読んだ、薬効クラス・専門科の言い換えを引けなかった | `glossary.yaml`（`terms` / `drug_classes` / `specialty_aliases` / `brand_to_generic`） |
| テーブル選択の誤り | 列は存在するが表が違う（州別に `provider_drug` を総なめ、全国値に `geo_drug` の National 行を使わない） | `glossary.yaml` の `table_hints` |
| 集計誤り | 列は合っているが SUM/COUNT DISTINCT/加重平均の選び方が違う、抑制の NULL を分母に入れた | `glossary.yaml` の該当語の注記 → それでも直らなければ `fewshot.yaml` に同型の例を 1 つ |
| ガード拒否 | 正しい SQL を `guards.py` が弾いた（誤検出） | `guards.py` ＋ `tests/test_guards.py` に再現ケースを先に足す |
| 列過多・形式 | 答えは合っているが列が多い・1 つの数字を 50 行に分解した・順位の言い間違い | `system.md` の規則。ただし **例外は狭く**書く |
| 設問の曖昧さ | 正解 SQL と生成 SQL の解釈がどちらも成り立つ | `eval/questions.yaml` の設問文か `expected_sql`（同型の設問を全部見る） |
| ばらつき | 同じ条件で通ったり落ちたりする | 直さない。同条件で複数回まわして判断（`temperature` は指定できない） |

分類が 2 つにまたがるときは、**辞書 → 例 → 規則** の順に軽いほうから試す。

## 2. 実データで確かめる

直す前に、正しい答えを MCP の `execute_sql` で出す（読み取り専用、2 GiB 上限）。辞書に書く値・例に書く SQL は
**実行して結果を見たものだけ**（`glossary.yaml` の冒頭に「推測で書かないこと」とある）。

- 列を絞る。`provider_drug` は 17 GB あり、列を 4 本まとめて集計すると見積もりが 2 GiB を超えて拒否される
- 名前は `*_norm`（UPPER）で照合し、薬効クラスは `partd.drug_class` を結合する。名前の IN 列挙は取りこぼす
- MCP が無いセッション（`/mcp` に `bigquery` が出ない）では **値を書かない**。流すべき SQL を人に渡し、確認待ちとして止まる

## 3. 差分を入れる

- `glossary.yaml`：`terms` は「言い方|言い方: 列（注記）」。数値の根拠（例：セマグルチドの処方医数 174,885 vs SUM 453,256）を注記に残す
- `fewshot.yaml`：5 問の **型**（州別推移／トップ N／医師単位／年次推移／比率と抑制）を崩さない。足すなら既存の型と重ならない 1 問だけ。`plot` も付ける
- `system.md`：規則の追加は「〜のときだけ」と条件を付けて狭く。広い規則は別の質問を壊す（「費用を聞かれたらブランド名も含める」→「合計はいくら」まで 50 行に分解した）
- `guards.py`：先に `tests/test_guards.py` に「弾いてはいけない SQL」「弾くべき SQL」の両方を足し、落ちるのを見てから直す（`tests/` と pytest は `requirements-dev.txt` で入れる。無ければ先に作る）。単語境界（`Creatine` / `created` を `CREATE` と誤検出しない）と文字列リテラルの除去は壊さない
- `questions.yaml`：設問を直したら **同型の設問を全部見る**（q15 を直して q18 を見落とした）

## 4. 確かめる

```
.venv/bin/python -c "import yaml;yaml.safe_load(open('app/prompts/glossary.yaml'));yaml.safe_load(open('app/prompts/fewshot.yaml'));print('yaml ok')"
.venv/bin/python -m pytest tests/ -q
```

`fewshot.yaml` を触ったら、その SQL を `execute_sql` で流して結果が出ることを見る。

## 5. 再評価を人に依頼する

`/eval` は課金が出るので Claude からは起動できない。次の 1 行を添えて人に依頼する：
「`/eval --limit N`（該当問題を含む範囲）か全 30 問で再評価をお願いします。見るのは <ID> が直ったかと、同じ分類の他の問題が壊れていないか」。
`--limit N` は **先頭 N 問**なので、後方の ID は結局全問になる。部分実行は `eval/results/partial_*.md` に書くだけで `docs/EVAL.md` は更新されない。記録に残すなら全 30 問で、そのとき `/eval` が `docs/EVAL_run<N>.md` と `docs/EVAL.md` に書く。

## 6. 記録

`docs/DECISIONS.md` の該当節（データ／ガード／Claude 呼び出し）に 1〜3 行：何が原因で、どこを、なぜそう直したか。

## 踏んだ実例（評価 run 1〜6）

- **辞書が誤りを教えていた**（q04）：「処方医数は `geo_drug.tot_prscrbrs` をそのまま使う」と書いていたが、複数ブランドの行を SUM すると同じ医師が重複し 2.6 倍の過大。「行が 1 つに定まるときだけ。まとめるときは `COUNT(DISTINCT prscrbr_npi)`」に書き換えた
- **例外が広すぎた**（q26）：「費用を聞かれたらブランド名も含める」が「合計はいくら」を 50 行に分解した。「ランキング・内訳を聞かれたとき」に限定
- **直し漏れ**（q18）：q15 と同じ加重平均 vs 単純平均の曖昧さ。同型を全部見る
- **モデルを上げても直らない**：Opus 5 も同じ 3 問を落とした。原因は辞書・規則・設問側にあった
- **順位の言い間違い**：並べ替えた指標と別の指標で順位を語る。「順位に言及するのは並べ替えた指標だけ」を system.md に
- **形式だけの指示**（「折れ線にして」）で SQL を再実行しない。few-shot に「形式だけ」と「集計が変わる」の 2 例を並べて見分けさせた
