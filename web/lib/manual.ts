/**
 * アプリ内マニュアルの本文。日英を同じ構造で持つ。
 * UI の短い文言は i18n.ts、まとまった説明はここ。数値（上限など）は API の設定と
 * 食い違わないよう、変えるときは api/main.py と app/guards.py を確認する。
 */
import type { IconName } from "@/components/Icon";
import type { Lang } from "./i18n";

export type Block =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: { title: string; body: string }[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; rows: [string, string][] }
  | { kind: "links"; items: { label: string; href: string }[] }
  | { kind: "howitworks" };

export interface Section {
  id: string;
  icon: IconName;
  title: string;
  blocks: Block[];
}

const JA: Section[] = [
  {
    id: "about", icon: "info", title: "このアプリは何か",
    blocks: [
      { kind: "p", text: "米国の公的医療保険 Medicare の薬剤給付（Part D）で、どの医師が、どの薬を、何件処方し、いくらかかったかを公開した実績データ（CMS「Medicare Part D Prescribers」）を、日本語の質問だけで探索するアプリです。" },
      { kind: "p", text: "質問を送ると、Claude がスキーマと用語辞書をもとに SQL を書き、BigQuery で集計し、結果を表とグラフにして解釈を添えて返します。SQL の知識も環境構築も要りません。" },
      { kind: "table", rows: [
        ["対象期間", "暦年 2022・2023・2024 の 3 年分"],
        ["粒度", "年 × 処方医（NPI）× 薬剤。医師名・所在地・専門科付き"],
        ["規模", "明細約 8,500 万行（1 年あたり約 2,500 万〜2,800 万行）"],
        ["作った会社", "株式会社ヘルツレーベン。ブログ連載「Claude Code × Medical app series」の第1弾"],
      ] },
    ],
  },
  {
    id: "howto", icon: "chat", title: "使い方",
    blocks: [
      { kind: "steps", items: [
        { title: "最初の画面から始める", body: "画面中央の入力欄に書いて送るか、その下の「例えば、こんな質問」で切り口（時系列・地域・薬剤・処方医・お金）を選んでカードを押します。カードの質問はそのまま送られます。" },
        { title: "自由に入力する", body: "画面下の入力欄に日本語（英語でも可）で書いて送信します。Cmd+Enter（Windows は Ctrl+Enter）でも送れます。年・州・専門科・薬剤名を入れると意図が伝わりやすくなります。" },
        { title: "条件は質問文に書く", body: "年・州・専門科・薬効クラス・年齢層などの条件は、そのまま質問に書きます。「2024 年、ニューヨーク州の精神科医で…」のように続ければ十分です。別枠の絞り込みは置いていません（質問と食い違うため）。" },
        { title: "結果を読む・形を変える", body: "上からグラフ、表、Claude の解釈、次の質問の候補、生成された SQL、指標（スキャン量・所要時間・トークン数）の順に並びます。最初の形は Claude が結果に合わせて選びますが、結果の下の「形を変える」で表だけ・棒・折れ線・州の地図・数字だけに切り替えられます（同じ結果を追質問として送り直します）。" },
        { title: "続けて聞く", body: "「それを州別に分けて」「2023 年も加えて」のように、直前の答えを受けた質問ができます。「次の質問」の候補をクリックしても送れます。" },
        { title: "表を持ち出す", body: "表の下の「CSV でダウンロード」で全行を保存できます。NPI・FIPS・ZIP など先頭が 0 の列は文字列として保存していますが、Excel で直接開くと 0 が落ちるので、取り込み時に列を文字列に指定してください。" },
        { title: "言語・テーマ・モデル", body: "右上で日本語/英語と明暗を切り替えられます。左の「モデル」で Claude のモデルを選べます（既定は Sonnet。30 問の評価では Opus と正解数が同じでした）。" },
      ] },
    ],
  },
  {
    id: "how", icon: "sparkles", title: "仕組み",
    blocks: [{ kind: "howitworks" }],
  },
  {
    id: "tips", icon: "lightbulb", title: "質問のコツ",
    blocks: [
      { kind: "bullets", items: [
        "年を書く：「2024 年の…」。書かないと Claude が判断します（多くは最新年か 3 年比較）。",
        "州は英語名でも日本語でも通ります：「フロリダ州」「FL」「Florida」。",
        "薬は一般名でもブランド名でも探せます：「セマグルチド」「オゼンピック」「Ozempic」。薬効クラス（GLP-1、DOAC、スタチン、オピオイド、抗精神病薬など）も辞書に入っています。",
        "専門科は CMS の分類名で持っています：「内科医」「精神科医」「ナースプラクティショナー」など。",
        "「トップ 10」「上位 20」「年次推移」「州別に比較」「一人当たり」のような集計の指示を添えると、グラフの形が決まりやすくなります。",
        "医師個人を並べる質問（例：フロリダの内科医でオピオイド処方が多い上位 20）は NPI 併記で返ります。",
      ] },
    ],
  },
  {
    id: "data", icon: "database", title: "データの中身",
    blocks: [
      { kind: "table", rows: [
        ["provider_drug", "年 × 医師 × 薬剤。処方件数・30 日換算処方数・日数・薬剤費・受給者数、65 歳以上の内訳"],
        ["provider", "年 × 医師。氏名・所在地・専門科と、その医師の合計、患者集団の年齢・性別・人種・リスクスコア、薬効クラス別の合計"],
        ["geo_drug", "年 × 地域（全国・州）× 薬剤。抑制前の全数集計。州別の比較はこちらが正確"],
        ["drug_class / state", "薬効クラスの辞書（GLP-1、DOAC など）と州の対応表。アプリ側で用意した補助表"],
      ] },
      { kind: "bullets", items: [
        "1〜10 件の値は CMS 側で抑制（空欄）されています。空欄は 0 ではありません。集計では「抑制された行数」を併記することがあります。",
        "ブランド/ジェネリックの区分は、ブランド名と一般名が一致するかによる近似です。",
        "薬剤費はプラン・患者・政府の支払合計で、リベート控除前です。実際の支払額とは異なります。",
        "Part D の外来処方のみが対象です（Medicare 受給者の約 8 割が加入）。入院や Part B の薬は含みません。",
      ] },
      { kind: "links", items: [
        { label: "データの説明ページ（規模・分かること・分からないこと・3テーブル）", href: "/data" },
      ] },
    ],
  },
  {
    id: "limits", icon: "hourglass", title: "制限と注意",
    blocks: [
      { kind: "table", rows: [
        ["質問数", "1 セッション 20 問まで。ページを再読み込みすると新しいセッションになります"],
        ["SQL", "SELECT のみ。書き換え・削除はできません。SELECT * は書き直させます"],
        ["スキャン量", "1 クエリ 2 GiB まで（見積もりで判定）。超えるとエラーになるので、年や州で絞ってください"],
        ["時間・行数", "1 クエリ 60 秒まで。結果は先頭 1,000 行まで表示"],
        ["自己修正", "SQL が通らないと Claude が最大 3 回書き直します。それでも通らなければ質問を具体的にしてください"],
      ] },
      { kind: "p", text: "本アプリは個々の医師の医療の質を評価するものではありません。処方数の多寡は担当患者数・専門・診療形態によって大きく変わります。" },
    ],
  },
  {
    id: "links", icon: "map", title: "出典・リンク",
    blocks: [
      { kind: "links", items: [
        { label: "データの出典：CMS Medicare Part D Prescribers（data.cms.gov）", href: "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers" },
        { label: "開発・運営：株式会社ヘルツレーベン", href: "https://herzleben.co.jp/" },
        { label: "コード：GitHub（HerzLeben/medicare-partd-text-to-sql）", href: "https://github.com/HerzLeben/medicare-partd-text-to-sql" },
      ] },
      { kind: "p", text: "コードは GitHub で公開しています（MIT）。自分の環境・自分の API キーで動かす手順は README にあります。" },
    ],
  },
];

const EN: Section[] = [
  {
    id: "about", icon: "info", title: "What this app is",
    blocks: [
      { kind: "p", text: "Medicare Part D is the US public drug benefit. CMS publishes who prescribed what, how many claims, and what it cost — down to the individual prescriber (the \"Medicare Part D Prescribers\" dataset). This app lets you explore it by asking questions in plain language." },
      { kind: "p", text: "When you send a question, Claude writes SQL from the schema and a glossary, BigQuery runs it, and the answer comes back as a table, a chart and a short reading. No SQL, no setup." },
      { kind: "table", rows: [
        ["Period", "Calendar years 2022, 2023 and 2024"],
        ["Grain", "year × prescriber (NPI) × drug, with prescriber name, location and specialty"],
        ["Size", "About 85 million detail rows (25–28 million per year)"],
        ["Built by", "HerzLeben Inc. First entry in the blog series \"Claude Code × Medical app series\""],
      ] },
    ],
  },
  {
    id: "howto", icon: "chat", title: "How to use it",
    blocks: [
      { kind: "steps", items: [
        { title: "Start on the home screen", body: "Type into the big box in the middle and send, or pick an angle under \"For example\" (trends, states, drugs, prescribers, money) and press a card. The card question is sent as is." },
        { title: "Type your own", body: "Write in the box at the bottom, in English or Japanese, and press Send (or Cmd+Enter / Ctrl+Enter). Naming a year, a state, a specialty or a drug makes the intent clear." },
        { title: "Put conditions in the question", body: "Year, state, specialty, drug class, age group and so on go straight into the question: \"In 2024, psychiatrists in New York …\". There is no separate filter panel — it would fight with the question." },
        { title: "Read the answer, change its form", body: "From the top: chart, table, Claude's reading, suggested next questions, the generated SQL, and metrics (bytes scanned, time, tokens). Claude picks the first form to fit the result; \"Change the form\" under each result switches to table only, bar, line, state map or a single number (it re-sends the same result as a follow-up)." },
        { title: "Keep going", body: "Follow-ups work: \"now break that down by state\", \"add 2023\". Clicking a suggested question sends it too." },
        { title: "Take the table with you", body: "\"Download CSV\" under a table saves every row. Columns with leading zeros (NPI, FIPS, ZIP) are stored as text, but Excel drops the zeros when opening a CSV directly — import them as text." },
        { title: "Language, theme, model", body: "Switch Japanese/English and light/dark at the top right. \"Model\" on the left selects the Claude model (Sonnet by default; on a 30-question evaluation it matched Opus)." },
      ] },
    ],
  },
  {
    id: "how", icon: "sparkles", title: "How it works",
    blocks: [{ kind: "howitworks" }],
  },
  {
    id: "tips", icon: "lightbulb", title: "Tips for asking",
    blocks: [
      { kind: "bullets", items: [
        "Say the year: \"in 2024\". Otherwise Claude decides (usually the latest year, or a three-year comparison).",
        "States work by name or abbreviation: \"Florida\", \"FL\".",
        "Drugs work by generic or brand name: \"semaglutide\", \"Ozempic\". Drug classes (GLP-1, DOAC, statins, opioids, antipsychotics, …) are in the glossary.",
        "Specialties use the CMS names: \"Internal Medicine\", \"Psychiatry\", \"Nurse Practitioner\".",
        "Aggregation words help the chart: \"top 10\", \"top 20\", \"year by year\", \"compare by state\", \"per beneficiary\".",
        "Questions that rank individual prescribers (e.g. top 20 opioid prescribers among internists in Florida) come back with the NPI alongside.",
      ] },
    ],
  },
  {
    id: "data", icon: "database", title: "What is inside",
    blocks: [
      { kind: "table", rows: [
        ["provider_drug", "year × prescriber × drug: claims, 30-day fills, day supply, drug cost, beneficiaries, and the 65+ subset"],
        ["provider", "year × prescriber: name, location, specialty, totals, patient mix (age, sex, race, risk score), and per-class totals"],
        ["geo_drug", "year × geography (national, state) × drug, unsuppressed totals. Use this for state comparisons"],
        ["drug_class / state", "A drug-class glossary (GLP-1, DOAC, …) and a state lookup, maintained by the app"],
      ] },
      { kind: "bullets", items: [
        "Counts from 1 to 10 are suppressed by CMS (blank). Blank is not zero. Aggregations may report how many rows were suppressed.",
        "Brand vs generic is an approximation based on whether the brand name matches the generic name.",
        "Drug cost is the total paid by plan, patient and government, before rebates. It is not what was actually paid.",
        "Only Part D outpatient prescriptions are covered (about 80% of Medicare beneficiaries enroll). Inpatient and Part B drugs are not included.",
      ] },
      { kind: "links", items: [
        { label: "The data page (size, what you can and cannot learn, the 3 tables)", href: "/data" },
      ] },
    ],
  },
  {
    id: "limits", icon: "hourglass", title: "Limits and caveats",
    blocks: [
      { kind: "table", rows: [
        ["Questions", "20 per session. Reload the page to start a new session"],
        ["SQL", "SELECT only. Nothing is written or deleted. SELECT * is rejected and rewritten"],
        ["Scan size", "2 GiB per query, judged on the dry-run estimate. Narrow by year or state if a query is rejected"],
        ["Time and rows", "60 seconds per query; the first 1,000 rows are shown"],
        ["Self-correction", "If the SQL fails, Claude rewrites it up to 3 times. After that, make the question more specific"],
      ] },
      { kind: "p", text: "This app does not evaluate the quality of care of any individual prescriber. Prescription volume varies widely with panel size, specialty and practice setting." },
    ],
  },
  {
    id: "links", icon: "map", title: "Sources and links",
    blocks: [
      { kind: "links", items: [
        { label: "Data source: CMS Medicare Part D Prescribers (data.cms.gov)", href: "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers" },
        { label: "Built and operated by HerzLeben Inc.", href: "https://herzleben.co.jp/" },
        { label: "Code: GitHub (HerzLeben/medicare-partd-text-to-sql)", href: "https://github.com/HerzLeben/medicare-partd-text-to-sql" },
      ] },
      { kind: "p", text: "The code is on GitHub (MIT). The README explains how to run it with your own environment and API key." },
    ],
  },
];

export function manual(lang: Lang): Section[] {
  return lang === "en" ? EN : JA;
}
