"use client";

import { useState } from "react";
import Link from "next/link";
import type { Overview as OverviewData } from "@/lib/types";
import type { Key } from "@/lib/i18n";
import Clawd, { SERIES_NAME } from "./Clawd";
import Icon, { TOPIC_ICON } from "./Icon";
import AskBox from "./AskBox";

type T = (key: Key, vars?: Record<string, string | number>) => string;

/**
 * 最初に出すデータ紹介。Part D を知らない人でも
 * 「どんなデータで、何が聞けて、何が聞けないか」が分かるようにする。
 */
export default function Overview({
  data, busy, onAsk, onHelp, input, setInput, t,
}: {
  data: OverviewData | null; busy: boolean; onAsk: (q: string) => void; onHelp: () => void;
  input: string; setInput: (v: string) => void;
  t: T;
}) {
  const [topic, setTopic] = useState(0);

  return (
    <div className="animate-in space-y-10 pt-8">
      {/* ---------------------------------------------------------- 導入 */}
      <section className="space-y-3">
        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
          <Clawd size={16} />
          <span className="font-medium text-ink">{SERIES_NAME}</span>
          <span className="text-ink-3">· Medicare Part D</span>
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          CMS Medicare Part D Prescribers · {data?.period ?? "CY2022–2024"}
        </p>
        <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
          {t("app.tagline")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          {t("app.lead")}
        </p>
        <Link href="/data" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--accent)] underline-offset-2 hover:underline">
          <Icon name="database" size={13} />
          {t("data.link")} →
        </Link>
      </section>

      {/* ---------------------------------------------- まずはここから */}
      <section className="space-y-4 rounded-xl border border-line border-t-[3px] border-t-[var(--brand)] bg-[var(--side)] p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Icon name="send" size={16} className="text-[var(--accent)]" />
          {t("guide.title")}
        </h3>
        <ol className="grid gap-2 sm:grid-cols-3">
          {([["step1", "chat"], ["step2", "sparkles"], ["step3", "barChart"]] as const).map(([k, icon], i) => (
            <li key={k} className="flex gap-2.5 rounded-[var(--radius)] border border-line bg-raised p-3">
              <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[12px] font-semibold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Icon name={icon} size={13} className="text-[var(--accent)]" />
                  {t(`guide.${k}.title`)}
                </p>
                <p className="pt-0.5 text-[11.5px] leading-relaxed text-ink-3">{t(`guide.${k}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="space-y-1.5">
          <AskBox value={input} onChange={setInput} onSend={onAsk} busy={busy} t={t} size="hero" autoFocus />
          <p className="flex flex-wrap gap-x-3 text-[10.5px] text-ink-3">
            <span>{t("guide.shortcut")}</span>
            <span className="flex items-center gap-1"><Icon name="xCircle" size={11} className="text-[var(--series-2)]" />{t("guide.caution")}</span>
          </p>
        </div>
      {/* --------------------------------------------------- 何が聞けるか */}
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
            <Icon name="lightbulb" size={14} className="text-[var(--accent)]" />
            {t("guide.examples")}
          </p>
        <div className="flex flex-wrap gap-1.5">
          {(data?.topics ?? []).map((t, i) => (
            <button
              key={t.key}
              onClick={() => setTopic(i)}
              aria-pressed={topic === i}
              className={`flex items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-3 text-xs transition-colors ${
                topic === i
                  ? "border-[var(--accent)] bg-accent-soft text-[var(--accent)]"
                  : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              <Icon name={TOPIC_ICON[t.key] ?? "chat"} size={14} />
              {t.title}
            </button>
          ))}
        </div>

        {data?.topics?.[topic] && (
          <div className="space-y-2">
            <p className="text-xs text-ink-3">{data.topics[topic].lead}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {data.topics[topic].questions.map((q) => (
                <button
                  key={q}
                  disabled={busy}
                  onClick={() => onAsk(q)}
                  className="group flex flex-col justify-between gap-2 rounded-[var(--radius)] border border-line border-l-[3px] border-l-[var(--brand)] bg-raised p-3 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-px hover:border-[var(--accent)] hover:border-l-[var(--brand)] disabled:opacity-40"
                >
                  <span className="text-[13px] leading-snug text-ink-2 group-hover:text-ink">
                    {q}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-ink-3 group-hover:text-[var(--accent)]">
                    <Icon name="send" size={11} />
                    {t("overview.try")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-ink-3">
        {t("overview.hint")}{" "}
        <button onClick={onHelp} className="inline-flex items-center gap-1 text-[var(--accent)] underline-offset-2 hover:underline">
          <Icon name="book" size={11} />
          {t("help.hint")}
        </button>
      </p>
    </div>
  );
}

