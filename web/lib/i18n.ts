"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Lang = "ja" | "en";

/**
 * UI 文言。data 由来のもの（質問例・選択肢・切り口）は API が言語別に返すので
 * ここには入れない。二重管理を避けるため。
 */
const DICT = {
  ja: {
    "app.title": "Medicare Part D × Text-to-SQL",
    "app.tagline": "米国の医師が、どの薬を、どれだけ処方したか",
    "app.lead":
      "米国の公的医療保険 Medicare の薬剤給付（Part D）の実績データです。医師ひとり単位まで公開されていて、誰が、どの薬を、何件処方し、いくらかかったかが分かります。日本語で質問すると Claude が SQL を書いて BigQuery で集計し、表とグラフにして解説します。",
    "header.source": "出典",
    "header.theme.toDark": "ダークモードに切り替え",
    "header.theme.toLight": "ライトモードに切り替え",
    "header.nav": "サイドバーを開閉",
    "header.company": "ヘルツレーベン",
    "footer.credit": "開発・運営：株式会社ヘルツレーベン",
    "sidebar.credit": "このアプリを作った会社",


    "session.title": "このセッション",
    "session.remaining": "残り {n} / {max} 問",
    "session.reason": "公開デモのため 1 セッション {max} 問まで（Claude の API 費用の上限）。ページを再読み込みすると新しいセッションになります。",
    "settings.title": "モデル",
    "settings.model": "モデル",
    "settings.model.note":
      "既定は Sonnet 5。30問の評価では Opus 5 と正解数が同じで、所要 1.5 倍・単価 2.5 倍でした。",
    "about.title": "このアプリについて",
    "help.title": "使い方（マニュアル）",
    "help.open": "使い方",
    "help.close": "閉じる",
    "help.hint": "使い方を見る",

    "overview.scale": "データの規模",
    "overview.stat.prescribers": "処方した医師",
    "overview.stat.generics": "薬剤（一般名）",
    "overview.stat.claims": "処方件数",
    "overview.stat.cost": "薬剤費",
    "overview.stat.rows": "明細の行数",
    "overview.unit.people": "人",
    "overview.unit.kinds": "種",
    "overview.unit.claims": "件",
    "overview.unit.usd": "ドル",
    "overview.unit.rows": "行",
    "overview.note.2024": "2024年",
    "overview.note.2024national": "2024年・全国",
    "overview.note.3years": "3年ぶん",
    "overview.topics": "何が聞けるか",
    "overview.try": "この質問を試す",
    "overview.canDo": "分かること",
    "overview.cannotDo": "分からないこと",
    "overview.tables": "データの中身（3テーブル）",
    "overview.tables.note":
      "州・全国の集計（geo_drug）は抑制前の全数なので、医師単位（provider_drug）を足し上げた値とは一致しません。",
    "overview.hint":
      "上のボタンを押すか、下の入力欄に質問してください。年・州・専門科などの条件は質問文に書きます。答えたあとは「それを州別に」のように会話を続けられ、結果の下のボタンで表やグラフの形も変えられます。",
    "overview.rowsUnit": "行",

    "turn.interpretation": "Claude の解釈",
    "turn.nextQuestions": "次の質問",
    "fmt.label": "出力の形",
    "fmt.table": "表",
    "fmt.bar": "棒",
    "fmt.line": "折れ線",
    "fmt.map": "州の地図",
    "fmt.noState": "州の列がありません",
    "fmt.noYear": "年の列がありません",
    "fmt.noNumeric": "数値の列がありません",
    "fmt.csv": "CSV をダウンロード",
    "fmt.copySql": "SQL をコピー",
    "fmt.reused": "直前の結果を使っています（SQL は再実行していません）",
    "turn.sql": "生成された SQL",
    "turn.sql.rewritten": "書き直しました",
    "turn.copy": "コピー",
    "turn.copied": "コピーしました",
    "turn.note": "注",
    "turn.metric.scan": "スキャン",
    "turn.metric.elapsed": "所要",
    "turn.metric.in": "入力",
    "turn.metric.out": "出力",
    "turn.metric.cache": "キャッシュ読み",
    "turn.seconds": "秒",

    "table.rowsTotal": "全 {n} 行",
    "table.rowsFetched": "（取得は先頭 {n} 行）",
    "table.showMore": "さらに {n} 行を表示",
    "table.csv": "CSV でダウンロード",
    "table.leadingZero":
      "⚠ NPI・FIPS・ZIP など先頭が 0 の列があります。CSV を Excel で直接開くと先頭の 0 が消えます（01 → 1）。「データ」→「テキストまたは CSV から」で列を「文字列」に指定して読み込んでください。",

    "input.placeholder": "続けて質問（例: それを州別に／表だけで／2023年も加えて）",
    "input.followup": "続けて聞けます。「それを州別に」「表だけで」「2023年も加えて」のように、前の答えを受けた質問が通ります。",
    "data.title": "データについて",
    "dv.grain.title": "3 つの公開表と、その細かさ",
    "dv.grain.lead": "タイルが細かいほど粒度が細かい。バーは行数（3 年分）。",
    "dv.join.title": "表のつながり",
    "dv.matrix.title": "早見表",
    "dv.col.table": "表",
    "dv.col.grain": "粒度",
    "dv.col.use": "得意な質問",
    "dv.col.columns": "主な列",
    "dv.col.caveat": "注意",
    "dv.more": "列の詳細",
    "dv.suppress.title": "11 件未満は空欄",
    "dv.suppress.body": "CMS は個人の特定を防ぐため、請求 11 件未満の行を載せず、受給者数 1〜10 人を空欄にしています。空欄は 0 ではないので、足し算すると小さい値が抜けます。州・全国の集計（geo_drug）は抑制前の全数です。",
    "tables.title": "データの中身（5 テーブル）",
    "tables.lead": "CMS の 3 つの公開表を BigQuery に入れ、薬効クラスと州の対応表をアプリ側で足しています。行数は投入時の実測です。",
    "tables.rows": "行数",
    "tables.answers": "この表で答えられる質問",
    "tables.caveats": "注意",
    "data.heading": "どんなデータか",
    "data.link": "このデータについて：規模・分かること・分からないこと",
    "data.back": "アプリに戻る",
    "data.cta": "質問してみる",
    "data.source": "出典：CMS（米国メディケア・メディケイドサービスセンター）の公開データ",
    "guide.caution": "患者単位のデータではありません。11 件未満は空欄（0 ではない）、費用はリベート控除前です。",
    "guide.title": "まずはここから",
    "guide.step1.title": "質問を書く",
    "guide.step1.body": "下の欄に日本語で。迷ったら例を押すだけでも動きます",
    "guide.step2.title": "Claude が SQL を書いて集計",
    "guide.step2.body": "BigQuery で 8,500 万行を集計。20 秒ほど待ちます",
    "guide.step3.title": "答えを読んで、続けて聞く",
    "guide.step3.body": "表・グラフ・解説が返ります。形を変えたり、掘り下げたりできます",
    "guide.placeholder": "何を知りたいですか？（例: 2024年の処方回数トップ5の薬剤）",
    "guide.examples": "例えば、こんな質問",
    "guide.shortcut": "Cmd+Enter でも送れます",
    "input.send": "送信",
    "input.running": "実行中…",
    "footer.disclaimer":
      "本アプリは個々の医師の医療の質を評価するものではありません。処方数の多寡は担当患者数・専門・診療形態によって大きく変わります。費用はリベート控除前で、実際の支払額とは異なります。",
    "error.limit": "このセッションの質問数の上限（{max}問）に達しました。ページを再読み込みすると新しいセッションが始まります。",
    "chart.noData": "データなし",
  },
  en: {
    "app.title": "Medicare Part D × Text-to-SQL",
    "app.tagline": "Which drugs US prescribers wrote, and how much",
    "app.lead":
      "Actual claims data from Medicare Part D, the US public drug benefit. It goes down to the individual prescriber: who prescribed what, how many claims, and what it cost. Ask in plain English and Claude writes the SQL, runs it on BigQuery, and explains the result with a table and a chart.",
    "header.source": "Source",
    "header.theme.toDark": "Switch to dark mode",
    "header.theme.toLight": "Switch to light mode",
    "header.nav": "Toggle sidebar",
    "header.company": "HerzLeben",
    "footer.credit": "Built and operated by HerzLeben Inc.",
    "sidebar.credit": "Built by",


    "session.title": "This session",
    "session.remaining": "{n} of {max} questions left",
    "session.reason": "Public demo: {max} questions per session (a cap on Claude API cost). Reload the page to start a new session.",
    "settings.title": "Model",
    "settings.model": "Model",
    "settings.model.note":
      "Sonnet 5 by default. On a 30-question evaluation Opus 5 scored the same, while taking 1.5x the time and 2.5x the price.",
    "about.title": "About this app",
    "help.title": "How to use (manual)",
    "help.open": "Help",
    "help.close": "Close",
    "help.hint": "Read the manual",

    "overview.scale": "Scale of the data",
    "overview.stat.prescribers": "Prescribers",
    "overview.stat.generics": "Drugs (generic names)",
    "overview.stat.claims": "Claims",
    "overview.stat.cost": "Drug spending",
    "overview.stat.rows": "Detail rows",
    "overview.unit.people": "",
    "overview.unit.kinds": "",
    "overview.unit.claims": "",
    "overview.unit.usd": "",
    "overview.unit.rows": "",
    "overview.note.2024": "2024",
    "overview.note.2024national": "2024, national",
    "overview.note.3years": "3 years",
    "overview.topics": "What you can ask",
    "overview.try": "Try this question",
    "overview.canDo": "What you can learn",
    "overview.cannotDo": "What you cannot",
    "overview.tables": "What is inside (3 tables)",
    "overview.tables.note":
      "State and national totals (geo_drug) are pre-suppression, so they do not match the sum of the prescriber-level table (provider_drug).",
    "overview.hint":
      "Press a question above, or type your own below. Put conditions such as year, state or specialty in the question itself. After an answer you can keep going, e.g. \"now break that down by state\", and switch the table or chart form with the buttons under each result.",
    "overview.rowsUnit": "rows",

    "turn.interpretation": "Claude's reading",
    "turn.nextQuestions": "Follow-up questions",
    "fmt.label": "Output form",
    "fmt.table": "Table",
    "fmt.bar": "Bar",
    "fmt.line": "Line",
    "fmt.map": "State map",
    "fmt.noState": "No state column in this result",
    "fmt.noYear": "No year column in this result",
    "fmt.noNumeric": "No numeric column in this result",
    "fmt.csv": "Download CSV",
    "fmt.copySql": "Copy SQL",
    "fmt.reused": "Reusing the previous result (the SQL was not re-run)",
    "turn.sql": "Generated SQL",
    "turn.sql.rewritten": "rewritten",
    "turn.copy": "Copy",
    "turn.copied": "Copied",
    "turn.note": "Note",
    "turn.metric.scan": "Scanned",
    "turn.metric.elapsed": "Took",
    "turn.metric.in": "in",
    "turn.metric.out": "out",
    "turn.metric.cache": "cache read",
    "turn.seconds": "s",

    "table.rowsTotal": "{n} rows total",
    "table.rowsFetched": " (first {n} fetched)",
    "table.showMore": "Show {n} more rows",
    "table.csv": "Download CSV",
    "table.leadingZero":
      "⚠ Some columns (NPI, FIPS, ZIP) start with a zero. Opening the CSV directly in Excel drops the leading zero (01 becomes 1). Import it via Data → From Text/CSV and set those columns to Text.",

    "input.placeholder": "Ask a follow-up (e.g. by state / table only / add 2023)",
    "input.followup": "Keep going: \"now by state\", \"table only\", \"add 2023\" — follow-ups build on the previous answer.",
    "data.title": "About the data",
    "dv.grain.title": "The three public tables, and how fine they go",
    "dv.grain.lead": "Finer tiles mean a finer grain. Bars show rows (three years).",
    "dv.join.title": "How the tables connect",
    "dv.matrix.title": "At a glance",
    "dv.col.table": "Table",
    "dv.col.grain": "Grain",
    "dv.col.use": "Best for",
    "dv.col.columns": "Main columns",
    "dv.col.caveat": "Caveat",
    "dv.more": "Column details",
    "dv.suppress.title": "Under 11 is blank",
    "dv.suppress.body": "To protect privacy, CMS drops rows with fewer than 11 claims and blanks beneficiary counts of 1–10. Blank is not zero, so sums miss the small values. State and national totals (geo_drug) are unsuppressed.",
    "tables.title": "What is inside (5 tables)",
    "tables.lead": "The three public CMS tables are loaded into BigQuery, plus a drug-class glossary and a state lookup maintained by the app. Row counts are as loaded.",
    "tables.rows": "rows",
    "tables.answers": "Questions this table answers",
    "tables.caveats": "Caveats",
    "data.heading": "What the data is",
    "data.link": "About the data: size, what you can and cannot learn",
    "data.back": "Back to the app",
    "data.cta": "Ask a question",
    "data.source": "Source: public data from CMS (Centers for Medicare & Medicaid Services)",
    "guide.caution": "Not patient-level data. Counts under 11 are blank (not zero); costs are before rebates.",
    "guide.title": "Start here",
    "guide.step1.title": "Write a question",
    "guide.step1.body": "In the box below, in plain language. Or just press an example",
    "guide.step2.title": "Claude writes and runs SQL",
    "guide.step2.body": "BigQuery aggregates 85 million rows. About 20 seconds",
    "guide.step3.title": "Read, then keep asking",
    "guide.step3.body": "A table, a chart and a reading come back. Change the form or dig deeper",
    "guide.placeholder": "What do you want to know? (e.g. top 5 drugs by claims in 2024)",
    "guide.examples": "For example",
    "guide.shortcut": "Cmd+Enter also sends",
    "input.send": "Send",
    "input.running": "Running…",
    "footer.disclaimer":
      "This app does not evaluate the quality of care of any individual prescriber. Prescription volume varies widely with panel size, specialty and practice setting. Spending is before rebates and differs from what is actually paid.",
    "error.limit": "You have reached this session's limit of {max} questions. Reload the page to start a new session.",
    "chart.noData": "No data",
  },
} as const;

export type Key = keyof (typeof DICT)["ja"];

const LANG_EVENT = "partd-lang";

function subscribe(cb: () => void) {
  window.addEventListener(LANG_EVENT, cb);
  return () => window.removeEventListener(LANG_EVENT, cb);
}

function read(): Lang {
  return document.documentElement.lang === "en" ? "en" : "ja";
}

/** 言語の実体は <html lang>。React はそれを購読するだけにする。 */
export function useLang() {
  const lang = useSyncExternalStore(subscribe, read, () => "ja" as const);

  const setLang = useCallback((next: Lang) => {
    document.documentElement.lang = next;
    try {
      localStorage.setItem("partd-lang", next);
    } catch {
      // 書けなくても表示は続ける
    }
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);

  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) => {
      let s: string = DICT[lang][key] ?? DICT.ja[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      }
      return s;
    },
    [lang],
  );

  return { lang, setLang, t };
}
