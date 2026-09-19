-- sql/ddl.sql — partd データセットの DDL
--
-- 生成元：data/schema/*.json（列名・型の正本。data_dictionary.md と実 CSV ヘッダで突合済み）
-- 手で書き換えず、schema JSON を直してから再生成すること。
--
--   bq --location=US mk -d partd
--   bq query --use_legacy_sql=false < sql/ddl.sql
--
-- 設計メモ
--   * prscrbr_npi は STRING（先頭0を保持）
--   * CSV の blank は NULL のまま。0 に置換しない（1〜10 件の抑制と 0 件は別物）
--   * brnd_name / gnrc_name は CMS 原文の Title Case（Ozempic / Semaglutide）。
--     照合と CLUSTER BY は UPPER 正規化列（*_norm）を使う
--   * PARTITION BY RANGE_BUCKET(year, ...) で年フィルタが効くようにする

CREATE TABLE IF NOT EXISTS partd.provider_drug (
  year                  INT64 NOT NULL,
  prscrbr_npi           STRING NOT NULL,
  prscrbr_last_org_name STRING,
  prscrbr_first_name    STRING,
  prscrbr_city          STRING,
  prscrbr_state_abrvtn  STRING,
  prscrbr_state_fips    STRING,
  prscrbr_type          STRING,
  prscrbr_type_src      STRING,
  brnd_name             STRING,
  brnd_name_norm        STRING,
  gnrc_name             STRING,
  gnrc_name_norm        STRING,
  tot_clms              INT64,
  tot_30day_fills       FLOAT64,
  tot_day_suply         INT64,
  tot_drug_cst          FLOAT64,
  tot_benes             INT64,
  ge65_sprsn_flag       STRING,
  ge65_tot_clms         INT64,
  ge65_tot_30day_fills  FLOAT64,
  ge65_tot_drug_cst     FLOAT64,
  ge65_tot_day_suply    INT64,
  ge65_bene_sprsn_flag  STRING,
  ge65_tot_benes        INT64
)PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2013, 2030, 1))CLUSTER BY prscrbr_state_abrvtn, gnrc_name_norm;

CREATE TABLE IF NOT EXISTS partd.provider (
  year                           INT64 NOT NULL,
  prscrbr_npi                    STRING NOT NULL,
  prscrbr_last_org_name          STRING,
  prscrbr_first_name             STRING,
  prscrbr_mi                     STRING,
  prscrbr_crdntls                STRING,
  prscrbr_ent_cd                 STRING,
  prscrbr_st1                    STRING,
  prscrbr_st2                    STRING,
  prscrbr_city                   STRING,
  prscrbr_state_abrvtn           STRING,
  prscrbr_state_fips             STRING,
  prscrbr_zip5                   STRING,
  prscrbr_ruca                   STRING,
  prscrbr_ruca_desc              STRING,
  prscrbr_cntry                  STRING,
  prscrbr_type                   STRING,
  prscrbr_type_src               STRING,
  tot_clms                       INT64,
  tot_30day_fills                FLOAT64,
  tot_drug_cst                   FLOAT64,
  tot_day_suply                  INT64,
  tot_benes                      INT64,
  ge65_sprsn_flag                STRING,
  ge65_tot_clms                  INT64,
  ge65_tot_30day_fills           FLOAT64,
  ge65_tot_drug_cst              FLOAT64,
  ge65_tot_day_suply             INT64,
  ge65_bene_sprsn_flag           STRING,
  ge65_tot_benes                 INT64,
  brnd_sprsn_flag                STRING,
  brnd_tot_clms                  INT64,
  brnd_tot_drug_cst              FLOAT64,
  gnrc_sprsn_flag                STRING,
  gnrc_tot_clms                  INT64,
  gnrc_tot_drug_cst              FLOAT64,
  othr_sprsn_flag                STRING,
  othr_tot_clms                  INT64,
  othr_tot_drug_cst              FLOAT64,
  mapd_sprsn_flag                STRING,
  mapd_tot_clms                  INT64,
  mapd_tot_drug_cst              FLOAT64,
  pdp_sprsn_flag                 STRING,
  pdp_tot_clms                   INT64,
  pdp_tot_drug_cst               FLOAT64,
  lis_sprsn_flag                 STRING,
  lis_tot_clms                   INT64,
  lis_drug_cst                   FLOAT64,
  nonlis_sprsn_flag              STRING,
  nonlis_tot_clms                INT64,
  nonlis_drug_cst                FLOAT64,
  opioid_tot_clms                INT64,
  opioid_tot_drug_cst            FLOAT64,
  opioid_tot_suply               INT64,
  opioid_tot_benes               INT64,
  opioid_prscrbr_rate            FLOAT64,
  opioid_la_tot_clms             INT64,
  opioid_la_tot_drug_cst         FLOAT64,
  opioid_la_tot_suply            INT64,
  opioid_la_tot_benes            INT64,
  opioid_la_prscrbr_rate         FLOAT64,
  antbtc_tot_clms                INT64,
  antbtc_tot_drug_cst            FLOAT64,
  antbtc_tot_benes               INT64,
  antpsyct_ge65_sprsn_flag       STRING,
  antpsyct_ge65_tot_clms         INT64,
  antpsyct_ge65_tot_drug_cst     FLOAT64,
  antpsyct_ge65_bene_suprsn_flag STRING,
  antpsyct_ge65_tot_benes        INT64,
  bene_avg_age                   FLOAT64,
  bene_age_lt_65_cnt             INT64,
  bene_age_65_74_cnt             INT64,
  bene_age_75_84_cnt             INT64,
  bene_age_gt_84_cnt             INT64,
  bene_feml_cnt                  INT64,
  bene_male_cnt                  INT64,
  bene_race_wht_cnt              INT64,
  bene_race_black_cnt            INT64,
  bene_race_api_cnt              INT64,
  bene_race_hspnc_cnt            INT64,
  bene_race_natind_cnt           INT64,
  bene_race_othr_cnt             INT64,
  bene_dual_cnt                  INT64,
  bene_ndual_cnt                 INT64,
  bene_avg_risk_scre             FLOAT64
)PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2013, 2030, 1))CLUSTER BY prscrbr_state_abrvtn, prscrbr_type;

CREATE TABLE IF NOT EXISTS partd.geo_drug (
  year                 INT64 NOT NULL,
  prscrbr_geo_lvl      STRING,
  prscrbr_geo_cd       STRING,
  prscrbr_geo_desc     STRING,
  brnd_name            STRING,
  brnd_name_norm       STRING,
  gnrc_name            STRING,
  gnrc_name_norm       STRING,
  tot_prscrbrs         INT64,
  tot_clms             INT64,
  tot_30day_fills      FLOAT64,
  tot_drug_cst         FLOAT64,
  tot_benes            INT64,
  ge65_sprsn_flag      STRING,
  ge65_tot_clms        INT64,
  ge65_tot_30day_fills FLOAT64,
  ge65_tot_drug_cst    FLOAT64,
  ge65_bene_sprsn_flag STRING,
  ge65_tot_benes       INT64,
  lis_bene_cst_shr     FLOAT64,
  nonlis_bene_cst_shr  FLOAT64,
  opioid_drug_flag     STRING,
  opioid_la_drug_flag  STRING,
  antbtc_drug_flag     STRING,
  antpsyct_drug_flag   STRING
)PARTITION BY RANGE_BUCKET(year, GENERATE_ARRAY(2013, 2030, 1))CLUSTER BY prscrbr_geo_desc, gnrc_name_norm;

-- 補助テーブル ---------------------------------------------------------------

-- 一般名 -> 薬効クラス。seed_drug_class.sql が実データの gnrc_name から作る
CREATE TABLE IF NOT EXISTS partd.drug_class (
  gnrc_name_norm STRING NOT NULL,  -- UPPER 正規化した一般名（provider_drug/geo_drug と結合）
  drug_class     STRING NOT NULL,  -- GLP1 / SGLT2 / DOAC / STATIN ...
  class_ja       STRING            -- 日本語名（UI と用語辞書用）
);

-- 州略号・州名・FIPS。geo_drug（州名フル）と provider（略号）の橋渡し
CREATE TABLE IF NOT EXISTS partd.state (
  state_abrvtn STRING NOT NULL,  -- FL
  state_name   STRING NOT NULL,  -- Florida（geo_drug.prscrbr_geo_desc と一致）
  state_fips   STRING,           -- 12
  region       STRING,           -- Census 地域区分
  is_state     BOOL              -- 50州+DC なら TRUE（準州・軍事郵便は FALSE）
);
