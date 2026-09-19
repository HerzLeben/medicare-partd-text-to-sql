"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Icon from "./Icon";
import Clawd, { SERIES_NAME } from "./Clawd";
import HowItWorks from "./HowItWorks";
import { manual, type Block } from "@/lib/manual";
import type { Key, Lang } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

/**
 * アプリ内マニュアル。概要・使い方・コツ・データ・制限・出典を1枚のダイアログに。
 * 本文は lib/manual.ts。左に目次、右に本文（狭い画面では目次を上に畳む）。
 */
export default function Manual({
  open, onClose, lang, t,
}: { open: boolean; onClose: () => void; lang: Lang; t: T }) {
  const sections = manual(lang);
  const [active, setActive] = useState(sections[0].id);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 本文のスクロールに合わせて目次の現在地を更新する
  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const root = bodyRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive((top.target as HTMLElement).dataset.id ?? sections[0].id);
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    root.querySelectorAll("section[data-id]").forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [open, lang, sections]);

  if (!open) return null;

  const jump = (id: string) => {
    const el = bodyRef.current?.querySelector(`section[data-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
        className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        {/* ヘッダ */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-[var(--nav)] px-4 py-3 text-white">
          <Image src="/brand/hl-logo-yoko-white.png" alt="HerzLeben" width={105} height={24} className="h-6 w-auto" />
          <div className="min-w-0">
            <h2 id="manual-title" className="truncate text-[15px] font-semibold">{t("help.title")}</h2>
            <p className="truncate text-[11px] text-white/70">{t("app.title")} · {SERIES_NAME}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1.5 text-[12px] text-white/85 transition-colors hover:border-white/60 hover:text-white"
          >
            <Icon name="x" size={12} />
            {t("help.close")}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* 目次 */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-[var(--side)] px-3 py-2 sm:w-[220px] sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-3 sm:py-4">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => jump(s.id)}
                aria-current={active === s.id ? "true" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                  active === s.id
                    ? "bg-accent-soft font-medium text-[var(--accent)]"
                    : "text-ink-2 hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon name={s.icon} size={14} />
                <span className="whitespace-nowrap">{s.title}</span>
              </button>
            ))}
            <div className="mt-auto hidden items-center gap-1.5 px-2.5 pt-4 text-[10.5px] text-ink-3 sm:flex">
              <Clawd size={13} />
              Built with Claude Code
            </div>
          </nav>

          {/* 本文 */}
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
            <div className="space-y-10">
              {sections.map((s) => (
                <section key={s.id} data-id={s.id} className="scroll-mt-4 space-y-3">
                  <h3 className="flex items-center gap-2 border-b border-line pb-2 text-[16px] font-semibold text-ink">
                    <Icon name={s.icon} size={17} className="text-[var(--accent)]" />
                    {s.title}
                  </h3>
                  {s.blocks.map((b, i) => <BlockView key={i} block={b} lang={lang} />)}
                </section>
              ))}
              <p className="border-t border-line pt-4 text-[11px] leading-relaxed text-ink-3">
                {t("footer.disclaimer")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockView({ block, lang }: { block: Block; lang: Lang }) {
  switch (block.kind) {
    case "howitworks":
      return <HowItWorks lang={lang} compact />;
    case "p":
      return <p className="text-[13.5px] leading-relaxed text-ink-2">{block.text}</p>;
    case "steps":
      return (
        <ol className="space-y-2.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3 rounded-[var(--radius)] border border-line border-l-[3px] border-l-[var(--brand)] bg-raised p-3">
              <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-[var(--accent)]">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{it.title}</p>
                <p className="pt-0.5 text-[13px] leading-relaxed text-ink-2">{it.body}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    case "bullets":
      return (
        <ul className="space-y-1.5">
          {block.items.map((s, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink-2">
              <Icon name="check" size={12} strokeWidth={2.4} className="mt-[5px] text-[var(--accent)]" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
          <table className="w-full text-[13px]">
            <tbody>
              {block.rows.map(([k, v], i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  <th scope="row" className="w-[34%] bg-sunken px-3 py-2 text-left align-top font-medium text-ink">{k}</th>
                  <td className="px-3 py-2 align-top leading-relaxed text-ink-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "links":
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i}>
              <a href={it.href} {...(it.href.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
                 className="inline-flex items-center gap-1.5 text-[13px] text-[var(--accent)] underline-offset-2 hover:underline">
                <Icon name="map" size={13} />
                {it.label} ↗
              </a>
            </li>
          ))}
        </ul>
      );
  }
}
