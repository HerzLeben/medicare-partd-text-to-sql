"use client";

import Icon, { type IconName } from "./Icon";
import { howItWorks } from "@/lib/howItWorks";
import type { Lang } from "@/lib/i18n";

const NODE_ICONS: IconName[] = ["download", "database", "sliders", "sparkles", "barChart"];
const ARROWS = ["→", "←", "↔", "→"];   // CSV→BQ、BQ←Run、Run↔Claude、Claude→Browser

/** 仕組み：構成図 → 1 問の道筋 → 確かめられること → 費用。/data とマニュアルの両方で使う。 */
export default function HowItWorks({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const h = howItWorks(lang);
  return (
    <div className="space-y-6">
      {!compact && (
        <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Icon name="sparkles" size={17} className="text-[var(--accent)]" />
          {h.title}
        </h3>
      )}
      <p className="text-[13.5px] leading-relaxed text-ink-2">{h.lead}</p>

      {/* 構成図 */}
      <section className="space-y-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">{h.archTitle}</h4>
        <div className="overflow-x-auto">
          <div className="flex min-w-[720px] items-stretch gap-1">
            {h.nodes.map((n, i) => (
              <div key={n.name} className="contents">
                <div className="flex flex-1 flex-col items-center gap-1 rounded-[var(--radius)] border border-line bg-raised px-2 py-3 text-center">
                  <Icon name={NODE_ICONS[i]} size={18} className="text-[var(--accent)]" />
                  <span className="text-[13px] font-semibold text-ink">{n.name}</span>
                  <span className="text-[11px] leading-snug text-ink-3">{n.sub}</span>
                </div>
                {i < ARROWS.length && (
                  <span aria-hidden className="flex w-6 shrink-0 items-center justify-center text-[18px] font-semibold text-[var(--accent)]">
                    {ARROWS[i]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 1 問の道筋 */}
      <section className="space-y-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">{h.stepsTitle}</h4>
        <ol className="grid gap-2 sm:grid-cols-2">
          {h.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-[var(--radius)] border border-line border-l-[3px] border-l-[var(--brand)] bg-raised p-3">
              <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-[var(--accent)]">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{s.title}</p>
                <p className="pt-0.5 text-[12.5px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">
            <Icon name="code" size={13} className="text-[var(--accent)]" />
            {h.transparencyTitle}
          </h4>
          <ul className="space-y-1.5">
            {h.transparency.map((s) => (
              <li key={s} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <Icon name="check" size={12} strokeWidth={2.4} className="mt-[4px] text-[var(--accent)]" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">
            <Icon name="coins" size={13} className="text-[var(--accent)]" />
            {h.costTitle}
          </h4>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{h.cost}</p>
        </div>
      </section>
    </div>
  );
}
