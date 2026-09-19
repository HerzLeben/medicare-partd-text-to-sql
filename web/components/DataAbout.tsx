"use client";

import { compact } from "@/lib/format";
import type { Overview as OverviewData } from "@/lib/types";
import type { Key, Lang } from "@/lib/i18n";
import Icon, { type IconName } from "./Icon";
import DataVisual from "./DataVisual";
import HowItWorks from "./HowItWorks";

type T = (key: Key, vars?: Record<string, string | number>) => string;

/**
 * データの説明（規模・分かること／分からないこと・3テーブル）。
 * 2026-09-19 にトップから /data へ移した。トップは「動かす場所」、ここは「読む場所」。
 */
export default function DataAbout({
  data, lang, t,
}: { data: OverviewData | null; lang: Lang; t: T }) {
  const s = data?.stats ?? {};
  return (
    <div className="space-y-10">
      {/* ------------------------------------------------------- 規模 */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-line border-t-[3px] border-t-[var(--brand)] bg-line sm:grid-cols-3 lg:grid-cols-5">
        <Stat icon="doctor" label={t("overview.stat.prescribers")} value={s.prescribers}
              unit={t("overview.unit.people")} note={t("overview.note.2024")} />
        <Stat icon="pill" label={t("overview.stat.generics")} value={s.generics}
              unit={t("overview.unit.kinds")} note={t("overview.note.2024")} />
        <Stat icon="receipt" label={t("overview.stat.claims")} value={s.claims}
              unit={t("overview.unit.claims")} note={t("overview.note.2024national")} />
        <Stat icon="coins" label={t("overview.stat.cost")} value={s.cost}
              unit={t("overview.unit.usd")} note={t("overview.note.2024national")} prefix="$" />
        <Stat icon="database" label={t("overview.stat.rows")} value={data?.rows}
              unit={t("overview.unit.rows")} note={t("overview.note.3years")} />
      </section>

      {/* ------------------------------------------- できること / できないこと */}
      <section className="grid gap-4 sm:grid-cols-2">
        <List title={t("overview.canDo")} items={data?.canDo ?? []} tone="ok" />
        <List title={t("overview.cannotDo")} items={data?.cannotDo ?? []} tone="no" />
      </section>

      {/* ------------------------------------------------------ テーブル（詳細） */}
      <DataVisual lang={lang} t={t} />

      {/* ------------------------------------------------------ 仕組み */}
      <section className="rounded-xl border border-line bg-[var(--side)] p-5 sm:p-6">
        <HowItWorks lang={lang} />
      </section>
    </div>
  );
}

function Stat({
  icon, label, value, unit, note, prefix = "",
}: { icon: IconName; label: string; value?: number; unit: string; note: string; prefix?: string }) {
  return (
    <div className="bg-raised px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
        <Icon name={icon} size={14} className="text-[var(--accent)]" />
        {label}
      </p>
      <p className="tnum pt-0.5 text-[19px] font-semibold leading-tight text-ink">
        {value === undefined ? (
          <span className="inline-block h-5 w-16 animate-pulse rounded bg-sunken align-middle" />
        ) : (
          <>
            {prefix}
            {compact(value)}
            <span className="pl-0.5 text-[11px] font-normal text-ink-3">{unit}</span>
          </>
        )}
      </p>
      <p className="text-[10px] text-ink-3">{note}</p>
    </div>
  );
}

function List({
  title, items, tone,
}: { title: string; items: string[]; tone: "ok" | "no" }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Icon name={tone === "ok" ? "checkCircle" : "xCircle"} size={15}
              className={tone === "ok" ? "text-[var(--series-6)]" : "text-[var(--series-2)]"} />
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
            <Icon
              name={tone === "ok" ? "check" : "x"}
              size={12}
              strokeWidth={2.4}
              className={`mt-[4px] ${tone === "ok" ? "text-[var(--series-6)]" : "text-[var(--series-2)]"}`}
            />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
