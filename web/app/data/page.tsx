"use client";

import Image from "next/image";
import Link from "next/link";
import DataAbout from "@/components/DataAbout";
import Icon from "@/components/Icon";
import { useOverview } from "@/lib/useAsk";
import { useLang } from "@/lib/i18n";

/**
 * /data — データの説明だけの読み物ページ。記事から直接リンクする。
 * ヘッダはトップと同じ紺地だが、操作の部品は持たない（戻るリンクと言語切替だけ）。
 */
export default function DataPage() {
  const { lang, setLang, t } = useLang();
  const overview = useOverview(lang);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="shrink-0 bg-[var(--nav)] text-white">
        <div className="mx-auto flex h-[60px] w-full max-w-4xl items-center gap-3 px-5">
          <Link href="/" className="flex shrink-0 items-center" aria-label={t("app.title")}>
            <Image src="/brand/hl-logo-yoko-white.png" alt="HerzLeben" width={123} height={28} priority className="h-7 w-auto" />
          </Link>
          <span aria-hidden className="hidden h-6 w-px bg-white/20 sm:block" />
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
            {t("app.title")} <span className="font-normal text-white/70">· {t("data.title")}</span>
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="flex overflow-hidden rounded-md border border-white/25 text-[11px]">
              {(["ja", "en"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                  className={`whitespace-nowrap px-2 py-1 transition-colors ${lang === l ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
                  {l === "ja" ? "日本語" : "EN"}
                </button>
              ))}
            </div>
            <Link href="/" className="flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1.5 text-[11px] text-white/85 transition-colors hover:border-white/60 hover:text-white">
              <Icon name="chevronRight" size={12} className="rotate-180" />
              {t("data.back")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <div className="animate-in space-y-8">
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              CMS Medicare Part D Prescribers · {overview?.period ?? "CY2022–2024"}
            </p>
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{t("data.heading")}</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-2">{t("app.lead")}</p>
          </section>
          <DataAbout data={overview} lang={lang} t={t} />
          <p className="text-[11px] leading-relaxed text-ink-3">
            {t("data.source")}{" "}
            <a href="https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers"
               target="_blank" rel="noreferrer" className="text-[var(--accent)] underline-offset-2 hover:underline">
              data.cms.gov ↗
            </a>
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90">
            <Icon name="send" size={14} />
            {t("data.cta")}
          </Link>
        </div>
      </main>

      <footer className="border-t border-line px-5 py-3 text-[10.5px] leading-relaxed text-ink-3">
        <p className="mx-auto w-full max-w-4xl">
          {t("footer.disclaimer")}{" "}
          <a href="https://herzleben.co.jp/" target="_blank" rel="noreferrer" className="whitespace-nowrap text-[var(--accent)] underline-offset-2 hover:underline">
            {t("footer.credit")}
          </a>
        </p>
      </footer>
    </div>
  );
}
