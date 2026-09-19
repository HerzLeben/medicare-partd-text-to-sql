# データ辞書：Medicare Part D Prescribers（日本語対訳）

出典：CMS data.cms.gov の公式 Data Dictionary（Provider and Drug：2024-10-30 版 / Provider：2025-04-10 版 / Geography and Drug：2025-10-29 版）。2026-09-07 取得。
アプリの用語辞書（glossary.yaml）と BigQuery DDL の正本として使う。

共通ルール
- 抑制：件数 1〜10 は blank（NULL）。11 未満の医師×薬剤行は主表に存在しない
- 本アプリの BigQuery 版では `brnd_name_norm` / `gnrc_name_norm`（UPPER 正規化列）を追加している。
  照合はこちら、表示は原文の `brnd_name` / `gnrc_name` を使う
- 抑制フラグ：`*` = 一次抑制（その値が 1〜10）、`#` = 従属抑制（他の内訳から逆算できるため隠す）
- 費用（`*_Drug_Cst`）＝ 薬剤費＋調剤料＋税＋ワクチン投与料。プラン・患者・政府補助・第三者の支払合計。リベート控除前
- `Tot_30day_Fills`：各請求の日数÷30。1 未満は 1、12 超は 12 に丸め。処方量比較はこれを使う
- 医師属性は NPPES（医師登録簿）由来、翌年末時点

---

## 1. by Provider and Drug（主表：年 × NPI × 薬剤、約2,500万行/年）

### 医師属性

| 変数名 | 日本語 | 型 | 説明 |
|---|---|---|---|
| Prscrbr_NPI | 処方医 NPI | STRING | 医師の全国一意 ID（10桁）。先頭0保持のため文字列 |
| Prscrbr_Last_Org_Name | 姓 / 組織名 | STRING | 個人なら姓、組織なら組織名 |
| Prscrbr_First_Name | 名 | STRING | 組織は blank |
| Prscrbr_City | 市 | STRING | NPPES 登録住所 |
| Prscrbr_State_Abrvtn | 州（略号） | STRING | 50州＋DC。他に XX=不明, PR=プエルトリコ, GU, VI, AS, MP, AA/AE/AP=軍, ZZ=外国 |
| Prscrbr_State_FIPS | 州 FIPS コード | STRING | 2桁 |
| Prscrbr_Type | 専門科 | STRING | Part B 請求の Medicare 専門科コード（複数なら最多）。無ければ NPPES タxonomy をクロスウォーク。約200種 |
| Prscrbr_Type_Src | 専門科の出典 | STRING | 上記どちらから取ったかのフラグ |

### 薬剤

| 変数名 | 日本語 | 型 | 説明 |
|---|---|---|---|
| Brnd_Name | ブランド名 | STRING | 商標名。NDC を商用薬剤DBに紐付けて付与。**CY2022-2024 は Title Case（`Ozempic`）** |
| Gnrc_Name | 一般名（USAN 短縮形） | STRING | 有効成分名。薬効クラスは無い（自前辞書が必要）。**Title Case（`Semaglutide`）。列幅の都合で切り詰められる**（`Edoxaban Tosylate`、`Empaglifloz/Linaglip/Metformin`） |

### 全受給者の集計

| 変数名 | 日本語 | 型 | 説明 |
|---|---|---|---|
| Tot_Clms | 請求数 | INT64 | 新規＋リフィル。11 未満の行は非掲載 |
| Tot_30day_Fills | 30日換算処方数 | FLOAT64 | 処方量の標準指標 |
| Tot_Day_Suply | 総処方日数 | INT64 | |
| Tot_Drug_Cst | 総薬剤費（USD） | FLOAT64 | |
| Tot_Benes | 受給者数（ユニーク） | INT64 | 1〜10 は NULL |

### 65歳以上の内訳

| 変数名 | 日本語 | 型 | 説明 |
|---|---|---|---|
| GE65_Sprsn_Flag | 65歳以上 抑制理由 | STRING | `*` / `#`。GE65_Tot_Clms 等に適用 |
| GE65_Tot_Clms | 65歳以上 請求数 | INT64 | |
| GE65_Tot_30day_Fills | 65歳以上 30日換算処方数 | FLOAT64 | |
| GE65_Tot_Drug_Cst | 65歳以上 総薬剤費 | FLOAT64 | |
| GE65_Tot_Day_Suply | 65歳以上 総処方日数 | INT64 | |
| GE65_Bene_Sprsn_Flag | 65歳以上 受給者数 抑制理由 | STRING | |
| GE65_Tot_Benes | 65歳以上 受給者数 | INT64 | |

---

## 2. by Provider（医師サマリ：年 × NPI、約110万行/年）

### 医師属性（主表との差分）

| 変数名 | 日本語 | 型 | 説明 |
|---|---|---|---|
| Prscrbr_MI | ミドルイニシャル | STRING | |
| Prscrbr_Crdntls | 資格（MD, DO, NP, PA…） | STRING | |
| Prscrbr_Ent_Cd | 個人/組織区分 | STRING | I=個人, O=組織 |
| Prscrbr_St1 / Prscrbr_St2 | 住所1 / 住所2 | STRING | |
| Prscrbr_Zip5 | ZIP（5桁） | STRING | |
| Prscrbr_RUCA | 都市-地方区分コード | STRING | USDA 2010 RUCA。1=大都市圏中心 … 10=孤立地方。**`1.1` `10.2` のような小数サブコードと `99`=Unknown が実在する。数値比較で地方判定するときは上限を付けて 99 を落とすこと** |
| Prscrbr_RUCA_Desc | RUCA 説明 | STRING | |
| Prscrbr_Cntry | 国 | STRING | US 以外は ZZ 州のとき |
| Prscrbr_NPI, Last_Org_Name, First_Name, City, State_Abrvtn, State_FIPS, Type, Type_Src | 主表と同じ | | |

### 全体集計（主表と同じ定義）

Tot_Clms, Tot_30day_Fills, Tot_Drug_Cst, Tot_Day_Suply, Tot_Benes, GE65_*（7列）

### ブランド / ジェネリック / その他（合計 = Tot_Clms）

| 変数名 | 日本語 | 説明 |
|---|---|---|
| Brnd_Sprsn_Flag / Brnd_Tot_Clms / Brnd_Tot_Drug_Cst | ブランド薬 抑制理由 / 請求数 / 費用 | FDA 承認区分 NDA・NDA authorized generic・BLA |
| Gnrc_Sprsn_Flag / Gnrc_Tot_Clms / Gnrc_Tot_Drug_Cst | ジェネリック 〃 | ANDA |
| Othr_Sprsn_Flag / Othr_Tot_Clms / Othr_Tot_Drug_Cst | その他 〃 | 上記以外（未承認薬、OTC 等） |

### プラン種別（合計 = Tot_Clms）

| 変数名 | 日本語 | 説明 |
|---|---|---|
| MAPD_Sprsn_Flag / MAPD_Tot_Clms / MAPD_Tot_Drug_Cst | MA-PD 加入者分 | Medicare Advantage（民間包括プラン）付帯の薬剤給付 |
| PDP_Sprsn_Flag / PDP_Tot_Clms / PDP_Tot_Drug_Cst | 単独 PDP 加入者分 | 薬剤単独プラン |

### 低所得補助（LIS）有無（合計 = Tot_Clms）

| 変数名 | 日本語 |
|---|---|
| LIS_Sprsn_Flag / LIS_Tot_Clms / LIS_Drug_Cst | LIS あり 抑制理由 / 請求数 / 費用 |
| NonLIS_Sprsn_Flag / NonLIS_Tot_Clms / NonLIS_Drug_Cst | LIS なし 〃 |

### 特定薬剤カテゴリ

| 変数名 | 日本語 | 説明 |
|---|---|---|
| Opioid_Tot_Clms / Opioid_Tot_Drug_Cst / Opioid_Tot_Suply / Opioid_Tot_Benes | オピオイド 請求数 / 費用 / 日数 / 受給者数 | Part D OMS（過剰使用監視）リスト準拠。年で変わる |
| Opioid_Prscrbr_Rate | オピオイド処方率（%） | Opioid_Tot_Clms ÷ Tot_Clms × 100 |
| Opioid_LA_Tot_Clms / _Drug_Cst / _Suply / _Benes | 長時間作用型オピオイド 〃 | |
| Opioid_LA_Prscrbr_Rate | 長時間作用型比率（%） | Opioid_LA ÷ Opioid × 100 |
| Antbtc_Tot_Clms / Antbtc_Tot_Drug_Cst / Antbtc_Tot_Benes | 抗生物質 〃 | 経口全身薬。結核薬・抗マラリア・外用は除外 |
| Antpsyct_GE65_Sprsn_Flag / Antpsyct_GE65_Tot_Clms / Antpsyct_GE65_Tot_Drug_Cst | 65歳以上 抗精神病薬 | 第一・第二世代＋配合剤 |
| Antpsyct_GE65_Bene_Suprsn_Flag / Antpsyct_GE65_Tot_Benes | 65歳以上 抗精神病薬 受給者数 | |

### 受給者属性（その医師の患者集団）

| 変数名 | 日本語 | 説明 |
|---|---|---|
| Bene_Avg_Age | 平均年齢 | 年末または死亡時 |
| Bene_Age_LT_65_Cnt / 65_74_Cnt / 75_84_Cnt / GT_84_Cnt | 年齢階級別人数 | <65（障害等）/ 65–74 / 75–84 / 85+ |
| Bene_Feml_Cnt / Bene_Male_Cnt | 女性 / 男性 | |
| Bene_Race_Wht_Cnt / Black_Cnt / Api_Cnt / Hspnc_Cnt / Natind_Cnt / Othr_Cnt | 人種別人数 | 非ヒスパニック白人 / 黒人 / アジア太平洋 / ヒスパニック / 先住民 / その他 |
| Bene_Dual_Cnt / Bene_Ndual_Cnt | Medicare-Medicaid 二重加入 / Medicare のみ | 年内1か月でも Medicaid 受給なら Dual |
| Bene_Avg_Risk_Scre | 平均 HCC リスクスコア | 1.0 = 平均。高いほど重症・高コスト集団 |

---

## 3. by Geography and Drug（年 × 地域 × 薬剤、約9万行/年）

| 変数名 | 日本語 | 型 | 説明 |
|---|---|---|---|
| Prscrbr_Geo_Lvl | 地域レベル | STRING | 'National' / 'State' |
| Prscrbr_Geo_Cd | 州 FIPS | STRING | National は blank |
| Prscrbr_Geo_Desc | 州名 | STRING | 州名フル。'National' も含む |
| Brnd_Name / Gnrc_Name | ブランド名 / 一般名 | STRING | |
| Tot_Prscrbrs | 処方医数（ユニーク） | INT64 | |
| Tot_Clms / Tot_30day_Fills / Tot_Drug_Cst / Tot_Benes | 請求数 / 30日換算 / 費用 / 受給者数 | | 抑制前の全数集計（主表の合計と一致しない） |
| GE65_Sprsn_Flag / GE65_Tot_Clms / GE65_Tot_30day_Fills / GE65_Tot_Drug_Cst / GE65_Bene_Sprsn_Flag / GE65_Tot_Benes | 65歳以上 内訳 | | Day_Suply 列は無い |
| LIS_Bene_Cst_Shr | LIS 受給者の自己負担合計 | FLOAT64 | |
| NonLIS_Bene_Cst_Shr | 非 LIS 受給者の自己負担合計 | FLOAT64 | 患者負担額はこの表にしか無い |
| Opioid_Drug_Flag | オピオイドフラグ | STRING | Y/N |
| Opioid_LA_Drug_Flag | 長時間作用型オピオイドフラグ | STRING | |
| Antbtc_Drug_Flag | 抗生物質フラグ | STRING | |
| Antpsyct_Drug_Flag | 抗精神病薬フラグ | STRING | |

注：フラグは「ブランド名×一般名」単位で付くため、同名で剤形が異なる NDC（軟膏と錠剤など）が混在する場合、カテゴリ集計と一致しない。

---

## 結合キー

| 結合 | キー | 関係 |
|---|---|---|
| Provider and Drug ⇔ Provider | year, Prscrbr_NPI | N:1 |
| Provider and Drug ⇔ Geography and Drug | year, 州（State_Abrvtn ⇔ Geo_Desc は略号↔州名の変換が必要）, Brnd_Name, Gnrc_Name | 集計値は一致しない（抑制の有無） |
| Provider ⇔ NPPES（外部） | NPI | 1:1 |
| Provider ⇔ Open Payments（外部） | 氏名＋住所（NPI 無し） | ファジー |

## Text-to-SQL 用語辞書に入れる対訳（抜粋）

| ユーザーの言い方 | 列 |
|---|---|
| 処方数、処方回数、請求数 | Tot_Clms（回数）／ Tot_30day_Fills（量） |
| 薬剤費、費用、コスト、支出 | Tot_Drug_Cst |
| 患者数、受給者数 | Tot_Benes |
| 処方医数 | Tot_Prscrbrs（Geography 表）または COUNT(DISTINCT Prscrbr_NPI) |
| 専門科、診療科 | Prscrbr_Type |
| ジェネリック率 | Gnrc_Tot_Clms / Tot_Clms（Provider 表） |
| オピオイド処方率 | Opioid_Prscrbr_Rate |
| 自己負担 | LIS_Bene_Cst_Shr + NonLIS_Bene_Cst_Shr（Geography 表のみ） |
| 高齢者、65歳以上 | GE65_* |
| 都市部 / 地方 | Prscrbr_RUCA（1–3 都市、4–6 小都市、7–10 地方） |
| 低所得者 | LIS_* |

## 設計書への反映

- `02_アプリ設計書` の `partd.provider` DDL は主要列のみ抜粋。実装時は本辞書の全列で作る
  （**実 CSV の列数は 84。CY2022/2023/2024 で同一**。2026-09-07 に実データで突合済み）
- `partd.geo_drug` に `Tot_Day_Suply` は存在しない（DDL 通り）
- 列名は snake_case 小文字に統一（`Prscrbr_NPI` → `prscrbr_npi`）

Sources: [Provider and Drug Data Dictionary](https://data.cms.gov/resources/medicare-part-d-prescribers-by-provider-and-drug-data-dictionary), [Provider Data Dictionary](https://data.cms.gov/resources/medicare-part-d-prescribers-by-provider-data-dictionary), [Geography and Drug Data Dictionary](https://data.cms.gov/resources/medicare-part-d-prescribers-by-geography-and-drug-data-dictionary)
