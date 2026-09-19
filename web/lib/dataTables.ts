/**
 * データの中身（/data とマニュアルで表示）。列の説明は docs/data_dictionary.md、
 * 行数は投入時の実測（README の表と同じ）。データは固定なので静的に持つ。
 */
import type { Lang } from "./i18n";

export interface TableInfo {
  name: string;
  grain: string;
  rowsByYear?: [number, number, number];   // 2022, 2023, 2024
  rows?: number;                            // 年を持たない補助表
  columns: { group: string; items: string }[];
  answers: string[];
  caveats: string[];
}

const JA: TableInfo[] = [
  {
    name: "provider_drug",
    grain: "年 × 処方医（NPI）× 薬剤。いちばん細かい主表",
    rowsByYear: [25_869_521, 26_794_878, 28_023_892],
    columns: [
      { group: "医師", items: "NPI、姓名（組織名）、市、州、専門科（約 200 種）" },
      { group: "薬剤", items: "ブランド名、一般名（有効成分）" },
      { group: "集計", items: "請求数、30 日換算処方数、総処方日数、総薬剤費、受給者数" },
      { group: "65 歳以上の内訳", items: "同じ 5 指標を 65 歳以上に絞ったもの" },
    ],
    answers: [
      "特定の薬を多く処方している医師は誰か（州・専門科で絞って）",
      "ある専門科がよく処方する薬のトップ 10",
      "セマグルチドを処方した医師は何人か（NPI の重複を除いて）",
    ],
    caveats: [
      "請求数 11 件未満の行は CMS 側で掲載されない。受給者数は 1〜10 人が空欄（0 ではない）",
      "読む列の分だけ BigQuery のスキャン量が増える。年や専門科で絞らないと 2 GiB の上限に当たりやすい",
    ],
  },
  {
    name: "provider",
    grain: "年 × 処方医（NPI）。医師ごとのサマリ 84 列",
    rowsByYear: [1_332_309, 1_380_665, 1_416_883],
    columns: [
      { group: "医師", items: "NPI、氏名、資格（MD/DO/NP/PA…）、住所、ZIP、都市/地方区分（RUCA）、専門科" },
      { group: "合計", items: "請求数、30 日換算処方数、総薬剤費、受給者数と、その 65 歳以上の内訳" },
      { group: "内訳", items: "ブランド/ジェネリック/その他、MA-PD/PDP、低所得補助（LIS）の有無" },
      { group: "特定薬剤", items: "オピオイド（処方率、長時間作用型）、抗生物質、65 歳以上への抗精神病薬" },
      { group: "患者集団", items: "平均年齢、年齢階級、性別、人種、Medicare-Medicaid 二重加入、平均リスクスコア" },
    ],
    answers: [
      "専門科別のオピオイド処方率",
      "都市部と地方の医師でジェネリック率を比較",
      "患者の平均リスクスコアが高い専門科",
    ],
    caveats: [
      "ブランド/ジェネリックは FDA の承認区分（NDA/ANDA）による",
      "RUCA には `1.1` のような小数サブコードと `99`（不明）があり、地方判定は上限つきで行う",
    ],
  },
  {
    name: "geo_drug",
    grain: "年 × 地域（全国・州）× 薬剤。抑制前の全数集計",
    rowsByYear: [115_396, 115_936, 117_661],
    columns: [
      { group: "地域", items: "全国 / 州（州名）" },
      { group: "薬剤", items: "ブランド名、一般名、オピオイド・抗生物質・抗精神病薬のフラグ" },
      { group: "集計", items: "処方医数、請求数、30 日換算処方数、総薬剤費、受給者数と 65 歳以上の内訳" },
      { group: "自己負担", items: "LIS あり / なし の受給者自己負担合計（患者負担額はこの表だけ）" },
    ],
    answers: [
      "GLP-1 の州別処方数を 2022→2024 で比較（地図）",
      "州別の一人当たり薬剤費",
      "患者の自己負担額が大きい薬剤",
    ],
    caveats: [
      "抑制前の全数なので、provider_drug を足し上げた値とは一致しない。州や全国の比較はこちらを使う",
      "同じ医師が複数の薬を処方すると、薬剤ごとの処方医数は重複して数えられる",
    ],
  },
  {
    name: "drug_class",
    grain: "薬効クラスの辞書（アプリ側で用意した補助表）",
    rows: 204,
    columns: [
      { group: "内容", items: "一般名 → 薬効クラス（GLP1、DOAC、STATIN、INSULIN、SGLT2、DPP4、ACEI、ARB、BETA_BLOCKER、PPI、ATYPICAL_ANTIPSYCHOTIC など）" },
    ],
    answers: ["「抗凝固薬」「スタチン」のようにクラス名で聞いたとき、該当する一般名に展開する"],
    caveats: ["元データに薬効分類は無い。辞書に無い薬は一般名・ブランド名で指定する"],
  },
  {
    name: "state",
    grain: "州の対応表（アプリ側で用意した補助表）",
    rows: 62,
    columns: [
      { group: "内容", items: "州略号 ↔ 州名 ↔ FIPS。50 州＋DC のほか準州・軍・不明の区分" },
    ],
    answers: ["「フロリダ」「FL」「Florida」のどの書き方でも同じ州に解決する", "geo_drug（州名）と provider_drug（略号）をつなぐ"],
    caveats: [],
  },
];

const EN: TableInfo[] = [
  {
    name: "provider_drug",
    grain: "year × prescriber (NPI) × drug — the finest-grained main table",
    rowsByYear: [25_869_521, 26_794_878, 28_023_892],
    columns: [
      { group: "Prescriber", items: "NPI, name (or organization), city, state, specialty (about 200)" },
      { group: "Drug", items: "brand name, generic name (active ingredient)" },
      { group: "Totals", items: "claims, 30-day fills, day supply, drug cost, beneficiaries" },
      { group: "Age 65+", items: "the same five measures restricted to beneficiaries 65 and over" },
    ],
    answers: [
      "Which prescribers write the most of a given drug (by state, by specialty)",
      "Top 10 drugs prescribed by a specialty",
      "How many prescribers wrote semaglutide (distinct NPIs)",
    ],
    caveats: [
      "Rows with fewer than 11 claims are not published; beneficiary counts of 1–10 are blank (not zero)",
      "BigQuery bills per column read. Narrow by year or specialty or the 2 GiB cap is easy to hit",
    ],
  },
  {
    name: "provider",
    grain: "year × prescriber (NPI) — an 84-column summary per prescriber",
    rowsByYear: [1_332_309, 1_380_665, 1_416_883],
    columns: [
      { group: "Prescriber", items: "NPI, name, credentials (MD/DO/NP/PA…), address, ZIP, urban/rural code (RUCA), specialty" },
      { group: "Totals", items: "claims, 30-day fills, drug cost, beneficiaries, with the 65+ subset" },
      { group: "Breakdowns", items: "brand / generic / other, MA-PD / PDP, low-income subsidy (LIS) yes/no" },
      { group: "Drug categories", items: "opioids (rate, long-acting), antibiotics, antipsychotics for 65+" },
      { group: "Patient mix", items: "mean age, age bands, sex, race, Medicare-Medicaid dual eligibility, mean risk score" },
    ],
    answers: [
      "Opioid prescribing rate by specialty",
      "Generic share, urban vs rural prescribers",
      "Specialties whose patients have the highest risk scores",
    ],
    caveats: [
      "Brand vs generic follows the FDA approval type (NDA / ANDA)",
      "RUCA has decimal sub-codes such as 1.1 and 99 = unknown; rural tests need an upper bound",
    ],
  },
  {
    name: "geo_drug",
    grain: "year × geography (national, state) × drug — unsuppressed totals",
    rowsByYear: [115_396, 115_936, 117_661],
    columns: [
      { group: "Geography", items: "national / state (state name)" },
      { group: "Drug", items: "brand name, generic name, flags for opioid, antibiotic, antipsychotic" },
      { group: "Totals", items: "prescribers, claims, 30-day fills, drug cost, beneficiaries, with the 65+ subset" },
      { group: "Cost share", items: "beneficiary out-of-pocket totals, LIS and non-LIS (the only place patient cost appears)" },
    ],
    answers: [
      "GLP-1 prescriptions by state, 2022 → 2024 (map)",
      "Drug cost per beneficiary by state",
      "Drugs with the largest patient out-of-pocket cost",
    ],
    caveats: [
      "Unsuppressed, so totals do not match a sum over provider_drug. Use this table for state and national comparisons",
      "A prescriber who writes several drugs is counted once per drug",
    ],
  },
  {
    name: "drug_class",
    grain: "Drug-class glossary (a helper table maintained by the app)",
    rows: 204,
    columns: [
      { group: "Contents", items: "generic name → class (GLP1, DOAC, STATIN, INSULIN, SGLT2, DPP4, ACEI, ARB, BETA_BLOCKER, PPI, ATYPICAL_ANTIPSYCHOTIC, …)" },
    ],
    answers: ["Expands a class name in a question (\"anticoagulants\", \"statins\") into its generic names"],
    caveats: ["The source data has no drug classification. Drugs missing from the glossary must be named by generic or brand"],
  },
  {
    name: "state",
    grain: "State lookup (a helper table maintained by the app)",
    rows: 62,
    columns: [
      { group: "Contents", items: "abbreviation ↔ name ↔ FIPS; 50 states + DC plus territories, military and unknown" },
    ],
    answers: ["Resolves \"Florida\" and \"FL\" to the same state", "Joins geo_drug (state names) with provider_drug (abbreviations)"],
    caveats: [],
  },
];

export function dataTables(lang: Lang): TableInfo[] {
  return lang === "en" ? EN : JA;
}
