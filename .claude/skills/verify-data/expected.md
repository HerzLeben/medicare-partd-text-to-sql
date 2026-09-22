# 期待値（2026-09-07 投入、2026-09-23 に MCP で再確認）

## 年別行数

| 表 | 2022 | 2023 | 2024 | 合計 |
|---|---:|---:|---:|---:|
| provider_drug | 25,869,521 | 26,794,878 | 28,023,892 | 80,688,291 |
| provider | 1,332,309 | 1,380,665 | 1,416,883 | 4,129,857 |
| geo_drug | 115,396 | 115,936 | 117,661 | 348,993 |

- `provider` は各年 `n = n_npi`
- `geo_drug` の `n_geo`（地域の数）は 62 / 62 / 61

## seed 表

| 表 | 行数 |
|---|---:|
| drug_class | 204 |
| state | 62 |

## 抑制（provider_drug の `tot_benes IS NULL`）

| 2022 | 2023 | 2024 |
|---:|---:|---:|
| 14,506,902 | 14,757,509 | 15,265,060 |

約 56% の行で受給者数が抑制されている。0 ではなく NULL。

## 型

- `prscrbr_npi` STRING、`prscrbr_state_fips` STRING、`prscrbr_zip5` STRING（provider）、`year` INT64（`get_table_info` では `INTEGER` と出る）
- `provider_drug` は `year` でレンジパーティション、`prscrbr_state_abrvtn, gnrc_name_norm` でクラスタ

## 有効期限

- 期待：`TABLE_OPTIONS` に `expiration_timestamp` が **無い**
- 2026-09-23 の実測：5 表すべてに `2026-11-06T10:34Z`（投入 2026-09-07 の 60 日後）が付いていた。投入時にデータセットの既定の表有効期限が効いたもの。人が `bq update --expiration 0` で外すまで、この項目は NG のまま
