"use client";

import { useEffect, useRef } from "react";
import Icon from "./Icon";
import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

/**
 * 質問の入力欄。最初の画面では中央に大きく、会話が始まったら下に小さく置く。
 * 同じ部品にして、送信の作法（Cmd/Ctrl+Enter）を揃える。
 */
export default function AskBox({
  value, onChange, onSend, busy, t, size = "compact", autoFocus = false,
}: {
  value: string; onChange: (v: string) => void; onSend: (q: string) => void;
  busy: boolean; t: T; size?: "hero" | "compact"; autoFocus?: boolean;
}) {
  const hero = size === "hero";
  const ref = useRef<HTMLTextAreaElement>(null);
  // 自動フォーカスは広い画面だけ。スマホでは入力欄までスクロールしてしまい、導入が飛ぶ。
  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 1024px)").matches) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [autoFocus]);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSend(value); }}
      className={`flex w-full items-end gap-2 ${hero ? "rounded-xl border-2 border-[var(--accent)] bg-raised p-2 shadow-[var(--shadow-card)]" : ""}`}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(value); }
        }}
        ref={ref}
        rows={hero ? 2 : 1}
        placeholder={t(hero ? "guide.placeholder" : "input.placeholder")}
        className={`flex-1 resize-none bg-transparent text-ink outline-none placeholder:text-ink-3 ${
          hero
            ? "min-h-[64px] px-3 py-2.5 text-[15px] leading-relaxed"
            : "max-h-32 min-h-[42px] rounded-lg border border-line bg-raised px-3 py-2.5 text-[13.5px] transition-colors focus:border-[var(--accent)]"
        }`}
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] font-medium text-white transition-opacity disabled:opacity-35 ${
          hero ? "h-[46px] px-5 text-[14px]" : "h-[42px] px-4 text-[13px]"
        }`}
      >
        <Icon name="send" size={14} />
        {busy ? t("input.running") : t("input.send")}
      </button>
    </form>
  );
}
