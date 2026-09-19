"use client";

import Image from "next/image";
import Icon from "./Icon";
import type { AppConfig } from "@/lib/types";
import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

interface Props {
  config: AppConfig | null;
  model: string;
  setModel: (m: string) => void;
  remaining: number | null;
  t: T;
  onHelp: () => void;
}

/**
 * サイドバー。モデル・セッション残数・マニュアル・クレジットだけを置く。
 *
 * ★ 絞り込み（年・州・専門科…）は 2026-09-18 に廃止した。質問文の末尾にヒントとして
 *   足す実装だったため、「州別に比較」と書いても州の絞り込みが優先されて NY だけの
 *   答えになる、という対立が実測で起きた。条件は質問文に書く（docs/DECISIONS.md）。
 */
export default function Sidebar({
  config, model, setModel, remaining, t, onHelp,
}: Props) {
  const max = config?.maxQuestions ?? 20;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      {/* モデル */}
      <section className="rounded-lg border border-line bg-raised">
        <h2 className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-2">
          <Icon name="sliders" size={14} className="text-[var(--accent)]" />
          {t("settings.title")}
        </h2>
        <div className="space-y-1 border-t border-line px-3 py-3">
          {Object.entries(config?.models ?? {}).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setModel(key)}
              aria-pressed={model === key}
              className={`flex w-full items-baseline gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                model === key
                  ? "border-[var(--accent)] bg-accent-soft text-[var(--accent)]"
                  : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2"
              }`}
            >
              <span>{m.label.replace("Claude ", "")}</span>
              <span className="opacity-70">{m.note}</span>
            </button>
          ))}
          <p className="pt-1 text-[10px] leading-relaxed text-ink-3">
            {t("settings.model.note")}
          </p>
        </div>
      </section>

      {/* セッション */}
      {remaining !== null && (
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-3">
            <Icon name="hourglass" size={13} className="text-[var(--accent)]" />
            {t("session.title")}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${(remaining / max) * 100}%` }}
            />
          </div>
          <p className="tnum pt-1.5 text-[11px] text-ink-3">
            {t("session.remaining", { n: remaining, max })}
          </p>
          <p className="pt-1 text-[10px] leading-relaxed text-ink-3">
            {t("session.reason", { max })}
          </p>
        </section>
      )}

      <button
        onClick={onHelp}
        className="mt-auto flex w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-left text-xs font-medium text-ink-2 transition-colors hover:border-[var(--accent)] hover:text-ink"
      >
        <Icon name="book" size={14} className="text-[var(--accent)]" />
        {t("help.title")}
        <Icon name="chevronRight" size={12} className="ml-auto text-ink-3" />
      </button>

      {/* 作った会社。ロゴはテーマで明暗版を出し分ける（globals.css の .only-light / .only-dark） */}
      <a
        href="https://herzleben.co.jp/"
        target="_blank"
        rel="noreferrer"
        className="group flex items-center gap-3 rounded-lg border border-[var(--side-line)] px-3 py-2.5 transition-colors hover:border-[var(--accent)]"
      >
        <Image src="/brand/herzleben-logo.png" alt="" width={44} height={36} className="only-light h-9 w-auto" />
        <Image src="/brand/herzleben-logo-white.png" alt="" width={44} height={36} className="only-dark h-9 w-auto" />
        <span className="flex flex-col">
          <span className="text-[10px] text-ink-3">{t("sidebar.credit")}</span>
          <span className="text-[12px] font-semibold text-ink group-hover:text-[var(--accent)]">HerzLeben</span>
          <span className="text-[10px] text-ink-3">herzleben.co.jp ↗</span>
        </span>
      </a>
    </div>
  );
}
