"use client";

import { formatBytes } from "@/lib/format";
import type { Mode } from "@/lib/palette";
import type { Turn } from "@/lib/types";
import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;
import Chart from "./Chart";
import ResultTable from "./ResultTable";
import SqlBlock from "./SqlBlock";
import FormatBar from "./FormatBar";
import Icon, { type IconName } from "./Icon";
import { kindOf, reshape, type FormatKind } from "@/lib/reshape";
import { useState } from "react";
import type { SqlResult } from "@/lib/types";

/**
 * 解釈の末尾にある「次の質問」を切り離して別枠にする。
 * 見出しは「次の質問はいかがでしょうか：」のように続くことがあるので、
 * 行末まで丸ごと食う。行の途中で切ると残骸が候補として表示される。
 */
const NEXT_Q = /\n[^\S\n]*(?:#+[^\S\n]*)?\*{0,2}[^\S\n]*(?:次の質問|次に試せる質問|次のご質問)[^\n]*\n/;

export default function TurnView({
  turn, mode, onAsk, prevResult, prevSql, t,
}: { turn: Turn; mode: Mode; onAsk: (q: string) => void; prevResult?: SqlResult; prevSql?: string; t: T }) {
  const lastOk = [...turn.steps].reverse().find((s) => s.result && !s.result.error);
  // 形式だけを変える追質問では run_sql が走らない。plot_spec だけ返ったら直前の結果に描く
  const reused = !lastOk?.result && !!turn.plot && !!prevResult;
  const result = lastOk?.result ?? (reused ? prevResult : undefined);
  const sql = lastOk?.sql ?? (reused ? prevSql ?? "" : "");
  const [interpretation, next] = splitAnswer(turn.answer);

  // 出力の形。ユーザーが切り替えたら override（セッション内で保持）、なければ Claude が選んだ形
  const storeKey = `partd-fmt:${turn.id}`;
  const [override, setOverride] = useState<FormatKind | null>(() => {
    try { return (sessionStorage.getItem(storeKey) as FormatKind | null) ?? null; } catch { return null; }
  });
  const fmt: FormatKind = override ?? kindOf(turn.plot);
  const choose = (k: FormatKind) => {
    setOverride(k);
    try { sessionStorage.setItem(storeKey, k); } catch {}
  };
  const spec = result ? reshape(fmt, turn.plot, result, turn.question) : null;

  return (
    <article className="animate-in space-y-4">
      <h2 className="text-[15px] font-semibold leading-relaxed text-ink">
        <Icon name="chat" size={16} className="mr-2 inline-block align-[-3px] text-[var(--accent)]" />
        {turn.question}
      </h2>

      {turn.status && (
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <span className="flex gap-1">
            <span className="dot size-1.5 rounded-full bg-[var(--accent)]" />
            <span className="dot size-1.5 rounded-full bg-[var(--accent)]" />
            <span className="dot size-1.5 rounded-full bg-[var(--accent)]" />
          </span>
          {turn.status}
        </p>
      )}

      {result && (
        <div className="space-y-4 rounded-[var(--radius)] border border-line border-t-[3px] border-t-[var(--brand)] bg-raised p-4 shadow-[var(--shadow-card)]">
          {!turn.running && <FormatBar value={fmt} onChange={choose} result={result} sql={sql} t={t} />}
          {reused && (
            <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <Icon name="check" size={11} className="text-[var(--accent)]" />
              {t("fmt.reused")}
            </p>
          )}
          {spec && spec.kind !== "table" && (
            <div className="space-y-1">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Icon name="barChart" size={15} className="text-[var(--accent)]" />
                {spec.title}
              </h3>
              <Chart spec={spec} result={result} mode={mode} />
              {spec.note && (
                <p className="pt-1 text-[11px] leading-relaxed text-ink-3">{t("turn.note")}: {spec.note}</p>
              )}
            </div>
          )}
          <ResultTable result={result} t={t} />
        </div>
      )}

      {interpretation && (
        <div className="space-y-2 border-l-2 border-[var(--accent)] pl-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            <Icon name="sparkles" size={14} className="text-[var(--accent)]" />
            {t("turn.interpretation")}
          </h3>
          <Prose text={interpretation} />
        </div>
      )}

      {next && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            <Icon name="lightbulb" size={14} className="text-[var(--accent)]" />
            {t("turn.nextQuestions")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {parseQuestions(next).map((q) => (
              <button
                key={q}
                onClick={() => onAsk(q)}
                className="flex items-center gap-1.5 rounded-full border border-line bg-raised py-1.5 pl-2.5 pr-3 text-left text-xs text-ink-2 transition-colors hover:border-[var(--accent)] hover:text-ink"
              >
                <Icon name="send" size={11} className="text-ink-3" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {turn.steps.length > 0 && (
        <div className="space-y-1.5">
          {turn.steps.map((step) => (
            <SqlBlock
              key={step.index}
              sql={step.sql}
              purpose={step.purpose}
              error={step.result?.error}
              t={t}
            />
          ))}
        </div>
      )}

      {(turn.error || turn.stoppedEarly) && (
        <p className="rounded-[var(--radius)] border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {turn.error ?? turn.stoppedEarly}
        </p>
      )}

      {turn.elapsedSec !== undefined && result && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-3">
          <Metric icon="gauge" label={t("turn.metric.scan")} value={formatBytes(result.bytes_billed)} />
          <Metric icon="clock" label={t("turn.metric.elapsed")} value={`${turn.elapsedSec}${t("turn.seconds")}`} />
          {turn.usage && (
            <>
              <Metric icon="logIn" label={t("turn.metric.in")} value={`${turn.usage.input_tokens.toLocaleString()} tok`} />
              <Metric icon="logOut" label={t("turn.metric.out")} value={`${turn.usage.output_tokens.toLocaleString()} tok`} />
              <Metric
                icon="zap"
                label={t("turn.metric.cache")}
                value={`${turn.usage.cache_read_input_tokens.toLocaleString()} tok`}
              />
            </>
          )}
        </dl>
      )}
    </article>
  );
}

function Metric({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="flex items-center gap-1"><Icon name={icon} size={12} />{label}</dt>
      <dd className="tnum text-ink-2">{value}</dd>
    </div>
  );
}

function splitAnswer(answer: string): [string, string | null] {
  if (!answer) return ["", null];
  const m = answer.match(NEXT_Q);
  if (!m || m.index === undefined) return [answer, null];
  return [answer.slice(0, m.index).trim(), answer.slice(m.index + m[0].length).trim()];
}

function parseQuestions(block: string): string[] {
  return block
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*(?:[-*・]|\d+[.)）]|[（(]\d+[）)])\s*/, "")
        .replace(/\*\*/g, "")
        .replace(/^[「『]|[」』]$/g, "")
        .trim(),
    )
    // 短すぎる断片や見出しの残骸を落とす
    .filter((l) => l.length >= 8 && !/^[:：]/.test(l))
    .slice(0, 3);
}

/** Markdown の太字・箇条書き・見出しだけ拾う軽い整形。 */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-ink-2">
      {text.split(/\n{2,}/).map((para, i) => {
        const lines = para.split("\n");
        const isList = lines.every((l) => /^\s*(?:[-*・]|\d+[.)])\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1 marker:text-ink-3">
              {lines.map((l, j) => (
                <li key={j}>{bold(l.replace(/^\s*(?:[-*・]|\d+[.)])\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{bold(para.replace(/^#+\s*/, ""))}</p>;
      })}
    </div>
  );
}

function bold(s: string) {
  return s.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-ink">{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
