---
name: verify-data
description: BigQuery の partd データセットの投入結果を確かめる（5 表が揃っているか、NPI が STRING か、年別行数が投入記録と一致するか、抑制の NULL が保たれているか）。データ投入・再投入の後、行数やスキーマを聞かれたとき、「投入は正しいか」と不安になったときに使う。読み取り専用の MCP だけで動き、bq や load.sh は呼ばない
allowed-tools: mcp__bigquery__list_tables mcp__bigquery__get_table_info mcp__bigquery__execute_sql
---

# 投入結果の確認

期待値は [expected.md](expected.md)。以下の 4 項目を **この順で、この SQL のまま** 確かめ、
最後に 1 つの表（項目 / 期待 / 実測 / 判定）にまとめる。

1. **表が揃っているか** — `list_tables` が `drug_class, geo_drug, provider, provider_drug, state` の 5 表を返す
2. **識別子の型** — `execute_sql` で `INFORMATION_SCHEMA.COLUMNS` を引く（`get_table_info` を `provider` に使うと約 90 列の JSON が 1 万トークン返るので使わない）

   ```sql
   SELECT table_name, column_name, data_type FROM partd.INFORMATION_SCHEMA.COLUMNS
   WHERE table_name IN ('provider', 'provider_drug') AND column_name IN ('year', 'prscrbr_npi', 'prscrbr_state_fips', 'prscrbr_zip5')
   ORDER BY table_name, column_name
   ```
   `prscrbr_npi` / `prscrbr_state_fips` / `prscrbr_zip5` が `STRING`、`year` が `INT64` であること（NPI と ZIP は先頭 0 を持つ。数値型なら投入手順が間違っている）。
   続けて `get_table_info` を **`provider_drug` にだけ** 呼び、`RangePartitioning` が `year`、`Clustering` が `prscrbr_state_abrvtn, gnrc_name_norm`、`NumRows` が期待の合計と一致することを見る
3. **年別行数** — 次の 3 本と seed 表の 1 本を `execute_sql` で流し、expected.md の表と 1 件ずつ突き合わせる

   ```sql
   SELECT year, COUNT(*) AS n FROM partd.provider_drug GROUP BY year ORDER BY year
   ```
   ```sql
   SELECT year, COUNT(*) AS n, COUNT(DISTINCT prscrbr_npi) AS n_npi FROM partd.provider GROUP BY year ORDER BY year
   ```
   ```sql
   SELECT year, COUNT(*) AS n, COUNT(DISTINCT prscrbr_geo_desc) AS n_geo FROM partd.geo_drug GROUP BY year ORDER BY year
   ```
   `provider` は `n = n_npi`（年内で NPI が一意）でなければならない。seed 表は
   `SELECT 'drug_class' AS t, COUNT(*) AS n FROM partd.drug_class UNION ALL SELECT 'state', COUNT(*) FROM partd.state`
4. **抑制が NULL のまま入っているか** — 1〜10 件は CSV で blank になっており、0 に化けていてはいけない

   ```sql
   SELECT year, COUNTIF(tot_benes IS NULL) AS null_tot_benes FROM partd.provider_drug GROUP BY year ORDER BY year
   ```
   期待値と一致し、かつ 0 でないこと。

5. **有効期限が付いていないか** — 表に `expiration_timestamp` が付いていると、その日に黙って消える

   ```sql
   SELECT table_name, option_value FROM partd.INFORMATION_SCHEMA.TABLE_OPTIONS WHERE option_name = 'expiration_timestamp'
   ```
   期待は **0 行**。1 行でも返ったら判定は NG で、表名と日付を報告する（外すのは `bq update --expiration 0 partd.<table>` で、人の操作）

## 守ること

- SQL を広げない。`provider_drug` は 17 GB あり、列を 5 本も触ると dry-run の見積もりが MCP の上限 2 GiB を超えて拒否される（実測：`tot_benes, ge65_tot_clms, prscrbr_state_abrvtn, prscrbr_npi` を一度に集計 → 2.58 GB で拒否）。年別 `COUNT(*)` はパーティション列だけなので安い
- 手順 1〜5 の MCP 呼び出しは互いに独立なので、まとめて投げてよい
- 不一致があっても直さない。投入（`./data/load.sh --run`）は課金が発生する人の操作なので、どの表のどの年がいくつ違うかを報告して止まる
- 期待値を更新するのは、人がデータを再投入して行数が変わったと言ったときだけ。そのときは expected.md と `docs/DEPLOY.md`（あれば）と README の行数表を同時に直す
