"use client";

import { useState } from "react";
import Icon, { type IconName } from "./Icon";
import { capabilities, type FormatKind } from "@/lib/reshape";
import { downloadCsv } from "@/lib/csv";
import type { SqlResult } from "@/lib/types";
import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

const KINDS: { kind: FormatKind; icon: IconName; label: Key }[] = [
  { kind: "table", icon: "table", label: "fmt.table" },
  { kind: "bar", icon: "barChart", label: "fmt.bar" },
  { kind: "line", icon: "trendingUp", label: "fmt.line" },
  { kind: "choropleth_state", icon: "map", label: "fmt.map" },
];

/**
 * 結果パネル上部の形式切替。SQL は再実行せず、同じ結果を描き直す。
 * 州の列が無ければ地図を、年の列が無ければ折れ線を無効化する。
 */
export default function FormatBar({
  value, onChange, result, sql, t,
}: { value: FormatKind; onChange: (k: FormatKind) => void; result: SqlResult; sql: string; t: T }) {
  const cap = capabilities(result);
  const [copied, setCopied] = useState(false);
  const disabledReason = (k: FormatKind): string | null => {
    if (k === "choropleth_state" && !cap.stateCol) return t("fmt.noState");
    if (k === "line" && !cap.yearCol) return t("fmt.noYear");
    if (k !== "table" && cap.numericCols.length === 0) return t("fmt.noNumeric");
    return null;
  };
  async function copySql() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("fmt.label")} className="flex overflow-hidden rounded-md border border-line text-[11.5px]">
        {KINDS.map(({ kind, icon, label }) => {
          const reason = disabledReason(kind);
          const on = value === kind;
          return (
            <button
              key={kind}
              onClick={() => !reason && onChange(kind)}
              disabled={!!reason}
              aria-pressed={on}
              title={reason ?? undefined}
              className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                on ? "bg-accent-soft font-medium text-[var(--accent)]"
                   : reason ? "cursor-not-allowed text-ink-3/50" : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon name={icon} size={12} />
              {t(label)}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1.5 text-[11.5px]">
        <button
          onClick={() => downloadCsv(result)}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          <Icon name="download" size={12} />
          {t("fmt.csv")}
        </button>
        <button
          onClick={copySql}
          disabled={!sql}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40"
        >
          <Icon name={copied ? "check" : "code"} size={12} />
          {copied ? t("turn.copied") : t("fmt.copySql")}
        </button>
      </div>
    </div>
  );
}
