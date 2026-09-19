/**
 * 仕組みの説明（/data とマニュアルで表示）。数値は app/tools.py・app/agent.py・
 * api/main.py の実装値。変えるときは両方直す。
 */
import type { Lang } from "./i18n";

export interface HowItWorksText {
  title: string;
  lead: string;
  archTitle: string;
  nodes: { name: string; sub: string }[];   // 5 つ。矢印は固定（CSV→BQ←Run↔Claude→Browser）
  stepsTitle: string;
  steps: { title: string; body: string }[];
  transparencyTitle: string;
  transparency: string[];
  costTitle: string;
  cost: string;
}

const JA: HowItWorksText = {
  title: "仕組み：どうやって結果を出しているか",
  lead: "答えは Claude が「考えて」出しているのではなく、Claude が書いた SQL を BigQuery が実行した結果です。SQL は毎回そのまま画面に出るので、集計の中身は誰でも確かめられます。",
  archTitle: "構成",
  nodes: [
    { name: "data.cms.gov", sub: "CSV を 3 年分ダウンロード" },
    { name: "BigQuery", sub: "partd データセット（5 表）" },
    { name: "Cloud Run", sub: "FastAPI + Next.js。1 コンテナ" },
    { name: "Claude API", sub: "SQL を書き、結果を読む" },
    { name: "ブラウザ", sub: "表・グラフ・解釈を表示" },
  ],
  stepsTitle: "1 問がたどる道",
  steps: [
    { title: "質問を受け取る", body: "会話の続きなら、前の質問と答えも一緒に Claude へ渡します（「それを州別に」が通る理由）。" },
    { title: "Claude が SQL を書く", body: "5 表のスキーマ、用語辞書（薬効クラス、州、専門科の言い換え）、手本 5 問を毎回システムプロンプトとして与えています。" },
    { title: "ガードで検査する", body: "SELECT / WITH で始まる 1 文だけ。partd 以外のデータセットや SELECT * は拒否。実行前に dry-run で見積もり、2 GiB を超える SQL は通しません。" },
    { title: "BigQuery で実行する", body: "60 秒でタイムアウト、結果は先頭 1,000 行。エラーや 0 行なら Claude がエラー文を読んで書き直します（最大 3 回）。" },
    { title: "図の形を決める", body: "結果を見て Claude が表・棒・折れ線・州の地図・散布から選びます。結果の下の「形を変える」で後から変えられます。" },
    { title: "解釈を書く", body: "3〜5 文で数字を引用しながら読み、データの限界（抑制、リベート未反映）に触れ、次の質問を 2 つ提案します。医師個人の評価は書かないよう指示しています。" },
  ],
  transparencyTitle: "確かめられること",
  transparency: [
    "生成された SQL（折りたたみ。コピーできる）",
    "スキャンしたバイト数、所要秒数、入出力トークン数、キャッシュの読み込み量",
    "書き直しがあった場合はその回数と、失敗した SQL とエラー文",
  ],
  costTitle: "費用",
  cost: "BigQuery と Cloud Run は無料枠の範囲で動かしています（スキャン上限 2 GiB、最小インスタンス 0）。課金が発生するのは Claude API だけで、1 問あたり数円です。1 セッション 20 問の上限はそのためです。",
};

const EN: HowItWorksText = {
  title: "How it works: where the answers come from",
  lead: "Claude does not \"think up\" the numbers. Claude writes SQL, BigQuery runs it, and the SQL is shown on screen every time, so anyone can check what was aggregated.",
  archTitle: "Architecture",
  nodes: [
    { name: "data.cms.gov", sub: "three years of CSV" },
    { name: "BigQuery", sub: "the partd dataset (5 tables)" },
    { name: "Cloud Run", sub: "FastAPI + Next.js, one container" },
    { name: "Claude API", sub: "writes SQL, reads the result" },
    { name: "Browser", sub: "table, chart, reading" },
  ],
  stepsTitle: "The path of one question",
  steps: [
    { title: "Receive the question", body: "In a follow-up, the previous question and answer are sent along (why \"now by state\" works)." },
    { title: "Claude writes SQL", body: "Every call carries the schema of the 5 tables, a glossary (drug classes, states, specialty synonyms) and 5 worked examples as the system prompt." },
    { title: "Guards check it", body: "One statement starting with SELECT or WITH. Other datasets and SELECT * are rejected. A dry run estimates the scan; anything over 2 GiB is refused." },
    { title: "BigQuery runs it", body: "60-second timeout, first 1,000 rows. On an error or zero rows Claude reads the message and rewrites (up to 3 times)." },
    { title: "Pick the chart", body: "Looking at the result, Claude chooses table, bar, line, state map or scatter. \"Change the form\" under the result overrides it." },
    { title: "Write the reading", body: "Three to five sentences quoting the numbers, noting limits (suppression, pre-rebate costs) and suggesting two follow-ups. It is instructed never to judge individual prescribers." },
  ],
  transparencyTitle: "What you can verify",
  transparency: [
    "The generated SQL (collapsible, copyable)",
    "Bytes scanned, seconds taken, input/output tokens, cache reads",
    "When a rewrite happened: how many, plus the failed SQL and its error",
  ],
  costTitle: "Cost",
  cost: "BigQuery and Cloud Run stay inside their free tiers (2 GiB scan cap, zero minimum instances). The only bill is the Claude API, a few yen per question — hence the 20-question session cap.",
};

export function howItWorks(lang: Lang): HowItWorksText {
  return lang === "en" ? EN : JA;
}
