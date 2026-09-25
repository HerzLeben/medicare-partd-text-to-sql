---
name: cms-csv-to-bigquery
description: data.cms.gov の公開 CSV を BigQuery に投入する一連の手順（辞書と CSV ヘッダの突合 → download → DuckDB で前処理 → schema JSON を明示 → DDL → load.sh --plan → 人の承認 → --run → /verify-data で行数検証）。データを入れ直すとき、新しい年を足すとき、別の CMS データセット（Open Payments など）を同じ流儀で入れるときに使う。--run から先は課金が発生するので必ず人の承認で止まる
argument-hint: "[dataset ...] [year ...]"
allowed-tools: Bash(./data/download.sh --list *) Bash(./data/load.sh --plan *) Bash(.venv/bin/python data/preprocess.py *) Bash(ls *) Bash(head *) Bash(wc *) Bash(git status *) Bash(git diff *) mcp__bigquery__list_tables mcp__bigquery__execute_sql
---

# CMS の CSV を BigQuery に投入する

引数：`$ARGUMENTS`（空なら全データセット × 全年。`geo_drug 2024` のように絞れる）

**年はダウンロードと前処理（2・3）にだけ効く。** 投入（5・6）はテーブル単位で、そのテーブルの全年 Parquet をまとめて置換する（`load.sh` は年を受け取らない）。

工程は 7 つ。**5 の `--plan` を見せたところで必ず止まり、人の承認を待つ。** 6 の `--run` は
課金が発生する（GCS の保存とオペレーション、BigQuery のストレージ）。

このリポジトリ固有の値は最後の「このリポジトリでの値」にまとめてある。別の CMS データセットに
使うときは、その節だけ差し替える。

## 1. 辞書と実 CSV のヘッダを突き合わせる

- 列名の正本は `docs/data_dictionary.md`（CMS 公式辞書の対訳）。実 CSV のヘッダ（`head -1`）と突合し、
  差分があれば **辞書側を更新して報告**する。CMS は年次更新で列を足す・改名する
- 列名は辞書の変数名を snake_case 小文字にしたもの（`Prscrbr_NPI` → `prscrbr_npi`）
- **識別子は STRING**：NPI・FIPS・ZIP・各種コード・年以外の「番号」はすべて STRING。数値にすると先頭 0 が落ちる
- `data/schema/<table>.json` を列ごとに `name / type / mode / description` で書く。**`bq load` のスキーマ自動検出は使わない**。既に存在するなら CSV ヘッダとの差分確認だけで済ませ、作り直さない（初回投入と再投入・年追加で分岐する）
- 抑制（1〜10 件が blank）のある列は NULLABLE。**blank は NULL のまま。0 に置換しない**

## 2. ダウンロード

```
./data/download.sh --list $ARGUMENTS   # 取得予定の URL を見せる（カタログから解決。カタログ 3 MB の通信はするが課金なし）
./data/download.sh $ARGUMENTS          # 取得（数 GB。時間がかかる）
```

`data/raw/<table>_<year>.csv` が既にあれば `download.sh` は完成済みとしてスキップする。再取得したいときは先にそのファイルを消す。

- **URL は直書きしない。** DCAT カタログ（`https://data.cms.gov/data.json`）から毎回解決する。CMS は年次更新のたびにファイル名と配置を変える
- **data.cms.gov はレジュームできない**（`Content-Length` 無し、`Range` に 200 で全 body）。`.part` に落として完了時に rename、完成済みはスキップ、が `download.sh` の作り。途中で切れたらそのファイルだけ最初から

## 3. 前処理（DuckDB → Parquet）

```
.venv/bin/python data/preprocess.py $ARGUMENTS
```

やること：列名を snake_case に、`year` 列を付与（CSV には無い。ファイル名の年）、型は `schema/*.json` を正本に明示、
正規化列（`*_norm` = UPPER）を付与。**出力される行数の表を控える**（7 で期待値になる）。

- CSV 直ではなく **Parquet 経由**で投入する。型を DuckDB で確定させてから入れる
- 名前列は原文（Title Case）を保持し、照合用の UPPER 列を別に持つ。列幅で切り詰められた名前（`Empaglifloz/Linaglip/Metformin`）があるので、名前を IN で並べる設計にしない

## 4. テーブル定義

`sql/ddl.sql` に `year` のレンジパーティションと、よく絞る列のクラスタを書く。seed 表（対応表・分類表）は `sql/seed_*.sql`。
`load.sh` は既存テーブルに `--replace` で入れるので、DDL が先。既に存在するなら schema JSON との列の突合だけで済ませる（`load.sh` が毎回 DDL を流すので、作り直しは不要）。

## 5. 投入計画を見せて止まる

```
ls -la data/parquet/                 # 対象テーブルの全年分の Parquet が揃っているか（古い年が残っていればそれが入る）
./data/load.sh --plan <table ...>    # 年は渡さない（渡すと「不明な引数」で落ちる）
```

出力（作成されるバケット・GCS へのコピー・`bq load` の行）をそのまま人に見せ、次を添えて **承認を待つ**：
対象テーブルと年、Parquet の合計サイズ、課金が発生するもの（GCS の一時保存、BigQuery ストレージ。`bq load` 自体は無料）。

## 6. 投入（人の承認後）

`./data/load.sh --run <table ...>` は権限ルールで確認が出る。承認されたら実行し、`load.sh` が GCS の一時ファイルを消したことを確認する。
最後の `gcloud storage rm -r .../parquet` はテーブルを絞っても `parquet/` 全体を消すので、別テーブルの投入と並行させない。

投入で踏んだこと（2026-09-07）：
- **GCS のワイルドカードが別テーブルを巻き込む**：`parquet/provider_*.parquet` は `provider_drug_2022.parquet` にも当たる。テーブル別のプレフィックス（`parquet/provider/`）に分ける
- **課金アカウント未紐付けでバケット作成が 403**：BigQuery のデータセット作成は課金なしで通るので GCS で初めて気づく。先に `gcloud billing projects link`
- **`bq ls -d` は存在しても非ゼロで返ることがある**：存在チェックは `bq show --dataset`
- **データセットの既定の表有効期限**：新しいデータセットに既定期限（60 日）が付いていると、表が黙って消える。`/verify-data` の項目 5 で検出する。外すのは `bq update --expiration 0`（人の操作）

## 7. 検証と記録

- `/verify-data` を実行する。期待値（`.claude/skills/verify-data/expected.md`）は **3 の行数表で先に更新**してから照合する。年別行数・識別子の型・抑制の NULL 件数・有効期限を見る
- 行数とサイズを `docs/DEPLOY.md`（作業ログ。あれば）と README の行数表に書く。3 年合計は年別の和を計算して入れる（足し算を間違えた実例がある）

## 守ること

- 5 で止まる。承認なしに `--run` を打たない
- 辞書と CSV の差分を黙って辞書に合わせない。差分は報告してから直す
- `SELECT *` 相当の巨大クエリで検証しない。行数は `COUNT(*)`、型は `INFORMATION_SCHEMA.COLUMNS`
- BigQuery の `maximum_bytes_billed` は **dry-run の見積もり**に対して効く（クラスタの枝刈りは反映されない）。検証 SQL は列を絞る

## このリポジトリでの値（Medicare Part D Prescribers）

| 項目 | 値 |
|---|---|
| データセット | `geo_drug`（by Geography and Drug）、`provider`（by Provider）、`provider_drug`（by Provider and Drug） |
| 年 | CY2022–2024 |
| 辞書 | `docs/data_dictionary.md` |
| 識別子列 | `prscrbr_npi`、`prscrbr_state_fips`、`prscrbr_zip5`、`prscrbr_ruca`、各種 `*_cd` |
| 抑制列 | `tot_benes` ほか受給者数系（1〜10 件は blank） |
| 正規化列 | `gnrc_name_norm`、`brnd_name_norm` |
| seed 表 | `sql/seed_state.sql`（州略号・州名・FIPS）、`sql/seed_drug_class.sql`（一般名 → 薬効クラス） |
| パーティション／クラスタ | `year` ／ `prscrbr_state_abrvtn, gnrc_name_norm`（provider_drug） |

別データセット（例：Open Payments）に使うときに変えるもの：`download.sh` の `DATASETS_DEFAULT` とカタログの検索語、
`preprocess.py` の `DATASETS` と正規化列、`data/schema/*.json`、`sql/ddl.sql`、seed 表、上の表の識別子列と抑制列。
工程 1〜7 と「守ること」は変えない。
