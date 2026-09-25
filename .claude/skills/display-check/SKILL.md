---
name: display-check
description: 数値表示の点検。識別子列（年・NPI・FIPS・ZIP・コード）が桁区切り・丸め・型変換されていないか、欠測（NULL）が 0 や空に化けていないか、桁区切りが表・グラフ軸・ツールチップ・地図・CSV の全経路で揃っているかを確かめる。web/ を触ったあと、新しい列やグラフ種を足したとき、「2,022」「90,210」のような表示を見たとき、UI の変更をレビューするときに使う。型チェックもテストも素通りする崩れなので、コードの確認と実画面の確認を両方やる
allowed-tools: Bash(grep *) Bash(rg *) Bash(node -e *) Bash(web/node_modules/.bin/tsc --noEmit *) Bash(lsof *) Bash(git diff *) Bash(git status *)
---

# 表示崩れの点検

判定は **1 か所**（`web/lib/format.ts` の `isIdentifierColumn`）に集約されている。点検はその 1 か所と、
そこを通っていない経路が無いか、の 2 段で行う。最後に下の表で報告する。

## A. 判定が正しいか（`web/lib/format.ts`）

1. `IDENTIFIER_HINT` の正規表現を読む。点検対象の列名（今回足した列、質問例で出る列）が当たるかを実際に試す：

   ```
   node -e 'const r=/^(year|.*_year|.*_fips|.*_zip\d*|.*_npi|npi|.*_cd|.*_code|.*_id|id|.*_abrvtn)$/i; for (const c of ["year","prscrbr_npi","prscrbr_state_fips","prscrbr_zip5","tot_clms","prscrbr_ruca"]) console.log(c, r.test(c))'
   ```
   正規表現は `format.ts` からコピーする（ここに書いたものが古くなっていることがある）。
   識別子なのに当たらない列があれば、**正規表現を直す**（各コンポーネントに個別の分岐を足さない）
2. `formatNumber` の分岐順：`null/undefined/""` → `"—"`、`boolean` → はい/いいえ、**識別子 → `String(v)` そのまま**、その後に率・費用・桁区切り。
   識別子の判定が数値判定より **先**にあること

## B. 全経路が判定を通っているか

| 経路 | ファイル | 見る場所 |
|---|---|---|
| 表 | `web/components/ResultTable.tsx` | セルは `formatNumber(v, column)`。`format.ts` の `isNumericColumn` は値しか見ず識別子を除外しない（右寄せになるだけ）。表示の除外は `formatNumber` の先頭分岐が担保しているので、そこが崩れていないかを見る |
| グラフの軸 | `web/components/Chart.tsx` | `tickX` / `tickY` が `isIdentifierColumn(spec.x/y)` で分岐しているか。`compact()` を識別子に当てていないか |
| グラフのツールチップ | `web/components/Chart.tsx` | `formatter` / `labelFormatter` が `formatNumber(v, spec.y)` を通るか |
| 地図 | `web/components/Choropleth.tsx` | ホバー値が `formatNumber(hovered, spec.y)`。州略号でマッチしているか（FIPS を数値にしていないか） |
| 系列の整形 | `web/lib/reshape.ts` | `isNumericCol`（`format.ts` の `isNumericColumn` とは別物）が識別子列を除外し、`year` を数値系列にも category にも立てないか |
| CSV | `web/lib/csv.ts` | 識別子列を **常にクォート**しているか（Excel で先頭 0 が落ちる対策）。UI に注意書きがあるか |

確認コマンド：判定を通さずに数値整形している箇所を洗う

```
grep -nE 'toLocaleString|compact\(|Number\(|toFixed' web/components/*.tsx web/lib/*.ts
```

出てきた行が「識別子列に到達し得るか」を 1 行ずつ判断する。`total_rows.toLocaleString()` のような **件数**は識別子ではないので対象外。

## C. 境界の型変換（BigQuery → Python → JSON → JS）

- `app/tools.py` の `_jsonable`：`bool` を `int` より先に分岐しているか（Python では `bool` は `int` の派生）。2^53 を超える整数を文字列にしているか
- BigQuery の `INT64` は JSON で number。`year` が number で届いても `isIdentifierColumn` で文字列化される、が前提

## D. 欠測と 0

- NULL が `"—"` で出ること。`0` と表示されていたら、SQL の `COALESCE(x, 0)` か整形の `Number(null) → 0` を疑う
- グラフの系列付き集計（`Chart.tsx` の `Number(r[yi] ?? 0)`）は NULL を 0 に畳む。抑制された値が色系列付きの棒・折れ線で 0 として描かれていないか。系列なしの経路は非有限値を除外しているので、系列ありだけが対象
- 集計に `COUNTIF(x IS NULL)` を併記する規則（CLAUDE.md）が生成 SQL に守られているかは、このスキルの範囲外（`/eval` の観点）

## E. 実画面で見る（省略しない）

API と UI を起動し、質問例のうち識別子が出るものを流して **画面を実際に見る**（1 質問ごとに Anthropic API の課金がある。サーバーの起動は `allowed-tools` に入れていないので、人の許可を取ってから）：

```
lsof -nP -iTCP:8000 -sTCP:LISTEN ; lsof -nP -iTCP:3000 -sTCP:LISTEN   # 既に動いていたら、いつ起動したものかを見る
ALLOW_DEV_CORS=1 PYTHONPATH=. .venv/bin/uvicorn api.main:app --port 8000 --reload
cd web && npm run dev
```

古いプロセスが残っていると（`--reload` なしで数日前に起動したもの等）コードの変更が反映されず、質問が「処理中にエラーが発生しました」で落ちることがある。エラーの本文はそのサーバーの stdout にしか出ないので、疑わしければ再起動してから見る。
Playwright（`web/node_modules/playwright`）があれば自動化できる：textbox に質問を fill → Send → `table th` を待つ → `td` の innerText で NPI が 10 桁・year が 4 桁であることを確かめる → スクリーンショット。

- 質問例 3「フロリダ州の内科医でオピオイド処方が多い上位 20（NPI）」→ NPI が 10 桁そのまま、桁区切り無し
- 質問例 1「GLP-1 の州別処方数 2022→2024」→ 年が「2022」、地図のホバーが州略号
- 質問例 5「州別の一人当たり薬剤費」→ 率・費用の整形、NULL の受給者数が分母から外れて「—」
- CSV をダウンロードして、識別子列がクォートされているか（`"01"`）をテキストで見る

## 報告の形

| 経路 | 対象列 | 結果 | 備考 |
|---|---|---|---|
| 表 | year / prscrbr_npi / prscrbr_state_fips / prscrbr_zip5 | OK / NG | |
| 軸 | … | | |
| ツールチップ | … | | |
| 地図 | … | | |
| CSV | … | | |
| 境界（_jsonable） | | | |
| 欠測 | | | |

NG は「どの経路の、どの列が、どう見えたか」を書く。直すときは **`isIdentifierColumn` かその呼び出し側**を直し、コンポーネントに個別の例外を足さない。

## 踏んだ実例

- 整数を一律 `toLocaleString` にかけて `year` が「2,022」。同じ経路で `prscrbr_state_fips` の `01` が `1`、`prscrbr_zip5` の `90210` が「90,210」
- 1 か所直して他で漏れた。表を直したあと、グラフ軸とツールチップと CSV で再発。判定を `format.ts` に集約して全経路に通したのはその後
- JS の `Number` は 2^53 を超える整数で下位桁を失う（`9007199254740993` → `...992`）。`_jsonable` が守っている
- 型チェック（`tsc`）もテストも通っていた。**画面を見るまで分からない**
- このスキルの初回実行（2026-09-23）で、コードの点検は全経路 OK だったのに、系列付きグラフの `?? 0` と、散布図の number 軸に年を載せると 2022.5 のような中間 tick が出得る点が見つかった。年を x にする散布図は避ける
