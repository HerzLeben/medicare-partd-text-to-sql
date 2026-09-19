"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Clawd, { SERIES_NAME } from "@/components/Clawd";
import Icon from "@/components/Icon";
import AskBox from "@/components/AskBox";
import Manual from "@/components/Manual";
import Overview from "@/components/Overview";
import Sidebar from "@/components/Sidebar";
import TurnView from "@/components/TurnView";
import { useAsk, useConfig, useOverview, useTheme } from "@/lib/useAsk";
import { useLang } from "@/lib/i18n";

const HERZLEBEN_URL = "https://herzleben.co.jp/";

export default function Page() {
  const { lang, setLang, t } = useLang();
  const config = useConfig(lang);
  const overview = useOverview(lang);
  const { mode, toggle } = useTheme();
  const { turns, ask, busy, remaining } = useAsk();

  const [input, setInput] = useState("");
  const [model, setModel] = useState("sonnet");
  const [navOpen, setNavOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 会話が始まる前は動かさない（最初の画面が導入を飛ばして下から始まっていた）
    if (turns.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setNavOpen(false);
    void ask(q, { model, lang });
  }

  const note = config?.dataNote;

  return (
    <div className="flex h-dvh flex-col bg-surface">
      {/* ------------------------------------------------ ヘッダ（コーポレートサイトと同じ紺地＋白ロゴ） */}
      <header className="z-20 shrink-0 bg-[var(--nav)] text-white">
        <div className="flex h-[60px] items-center gap-2 pl-3 pr-3 sm:gap-3 sm:pl-4 sm:pr-0">
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="rounded-md border border-white/25 p-1.5 text-white/80 lg:hidden"
            aria-label={t("header.nav")}
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
              <path d="M1 3h14v1.6H1zM1 7.2h14v1.6H1zM1 11.4h14V13H1z" />
            </svg>
          </button>

          <a
            href={HERZLEBEN_URL}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center"
            aria-label="HerzLeben"
          >
            <Image
              src="/brand/hl-logo-yoko-white.png"
              alt="HerzLeben"
              width={123}
              height={28}
              priority
              className="h-7 w-auto"
            />
          </a>
          <span aria-hidden className="hidden h-6 w-px bg-white/20 sm:block" />

          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-white">
            {t("app.title")}
          </h1>

          {/* 連載名。Clawd を添える */}
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/10 py-0.5 pl-1.5 pr-2.5 text-[11px] text-white/85 lg:flex">
            <Clawd size={14} />
            {SERIES_NAME}
          </span>

          {note && (
            <div className="hidden items-center gap-1.5 text-[11px] text-white/70 md:flex">
              <Badge>{note.period}</Badge>
              <Badge>{note.suppression}</Badge>
              <a
                href={note.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/25 px-2 py-0.5 transition-colors hover:border-white/60 hover:text-white"
              >
                {t("header.source")} {note.source} ↗
              </a>
            </div>
          )}

          <div className="ml-auto flex h-full shrink-0 items-center gap-1.5">
            <div className="flex shrink-0 overflow-hidden rounded-md border border-white/25 text-[11px]">
              {(["ja", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`whitespace-nowrap px-2 py-1 transition-colors ${
                    lang === l
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {l === "ja" ? "日本語" : "EN"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-white/25 px-2 py-1.5 text-[11px] text-white/85 transition-colors hover:border-white/60 hover:text-white"
              aria-label={t("help.title")}
            >
              <Icon name="help" size={14} />
              <span className="hidden md:inline">{t("help.open")}</span>
            </button>
            <button
              onClick={toggle}
              className="rounded-md border border-white/25 p-1.5 text-white/80 transition-colors hover:border-white/60 hover:text-white"
              aria-label={mode === "dark" ? t("header.theme.toLight") : t("header.theme.toDark")}
            >
              {mode === "dark" ? (
                <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
                  <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM8 0h.01v2.5H8zM8 13.5h.01V16H8zM16 8v.01h-2.5V8zM2.5 8v.01H0V8zM13.66 2.34l.01.01-1.77 1.77-.01-.01zM4.1 11.9l.01.01-1.77 1.77-.01-.01zM13.66 13.66l-.01.01-1.77-1.77.01-.01zM4.1 4.1l-.01.01L2.32 2.34l.01-.01z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
                  <path d="M6.2 1.4A6.6 6.6 0 108.9 14.6 5.6 5.6 0 016.2 1.4z" />
                </svg>
              )}
            </button>
            {/* サイトの CONTACT ボタンと同じ、右端のティールの帯 */}
            <a
              href={HERZLEBEN_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-2 hidden h-full flex-col items-center justify-center bg-[var(--brand)] px-5 text-white transition-colors hover:bg-[var(--brand-hover)] sm:flex"
            >
              <span className="text-[12px] font-semibold leading-tight">{t("header.company")}</span>
              <span className="text-[9.5px] uppercase leading-tight tracking-[0.18em] text-white/85">herzleben.co.jp ↗</span>
            </a>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------------------------------------------- サイドバー */}
        <aside
          className={`w-[264px] shrink-0 border-r border-[var(--side-line)] bg-[var(--side)] ${
            navOpen
              ? "absolute inset-y-0 left-0 top-[60px] z-30 shadow-xl"
              : "hidden"
          } lg:static lg:block`}
        >
          <Sidebar
            config={config}
            model={model} setModel={setModel}
            remaining={remaining} t={t}
            onHelp={() => { setNavOpen(false); setHelpOpen(true); }}
          />
        </aside>

        {/* ---------------------------------------------- 本文 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl px-5 py-8">
              {turns.length === 0 ? (
                <Overview
                  data={overview} busy={busy} onAsk={send} onHelp={() => setHelpOpen(true)}
                  input={input} setInput={setInput} t={t}
                />
              ) : (
                <div className="space-y-12">
                  {turns.map((turn, i) => {
                    // 形式だけの追質問用に、これより前で最後に成功した結果を渡す
                    const prev = turns.slice(0, i).reverse()
                      .flatMap((tt) => [...tt.steps].reverse())
                      .find((s) => s.result && !s.result.error);
                    return (
                      <TurnView key={turn.id} turn={turn} mode={mode} onAsk={send}
                                prevResult={prev?.result} prevSql={prev?.sql} t={t} />
                    );
                  })}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* -------------------------------------------- 入力（会話が始まってから） */}
          {turns.length > 0 && (
            <div className="shrink-0 border-t border-line bg-surface/85 px-5 py-3 backdrop-blur">
              <div className="mx-auto w-full max-w-4xl">
                <AskBox value={input} onChange={setInput} onSend={send} busy={busy} t={t} />
                <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-relaxed text-ink-3">
                  <Icon name="lightbulb" size={11} className="mt-[3px] text-[var(--accent)]" />
                  {t("input.followup")}
                </p>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-3">
                  {t("footer.disclaimer")}
                  {" "}
                  <a href={HERZLEBEN_URL} target="_blank" rel="noreferrer"
                     className="whitespace-nowrap text-[var(--accent)] underline-offset-2 hover:underline">
                    {t("footer.credit")}
                  </a>
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
      <Manual open={helpOpen} onClose={() => setHelpOpen(false)} lang={lang} t={t} />
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/25 px-2 py-0.5">{children}</span>
  );
}

