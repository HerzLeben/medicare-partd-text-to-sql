"use client";

import { useState } from "react";
import Icon from "./Icon";
import { tokenizeSql } from "@/lib/sql";
import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

const CLASS: Record<string, string> = {
  kw: "text-[var(--accent)] font-medium",
  fn: "text-[var(--series-7)]",
  str: "text-[var(--series-3)]",
  num: "text-[var(--series-2)]",
  com: "text-ink-3 italic",
  txt: "",
};

export default function SqlBlock({
  sql, purpose, error, defaultOpen = false, t,
}: { sql: string; purpose?: string; error?: string; defaultOpen?: boolean; t: T }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-raised">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-2 transition-colors hover:bg-sunken"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 16 16"
          className={`size-3.5 shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="currentColor"
        >
          <path d="M6 4l4 4-4 4z" />
        </svg>
        <Icon name="code" size={13} className="text-[var(--accent)]" />
        <span className="font-medium">{t("turn.sql")}</span>
        {purpose && <span className="truncate text-ink-3">— {purpose}</span>}
        {error && (
          <span className="ml-auto shrink-0 rounded bg-danger-soft px-1.5 py-0.5 text-[11px] text-danger">
            {t("turn.sql.rewritten")}
          </span>
        )}
      </button>

      {open && (
        <div className="relative border-t border-line">
          <button
            onClick={copy}
            className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            <Icon name={copied ? "check" : "copy"} size={11} />
            {copied ? t("turn.copied") : t("turn.copy")}
          </button>
          <pre className="overflow-x-auto p-3 pr-24 font-mono text-[12.5px] leading-relaxed">
            <code>
              {tokenizeSql(sql).map((t, i) => (
                <span key={i} className={CLASS[t.t]}>{t.v}</span>
              ))}
            </code>
          </pre>
          {error && (
            <p className="border-t border-line bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
