"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import { formatNumber, isIdentifierColumn, isNumericColumn } from "@/lib/format";
import type { SqlResult } from "@/lib/types";
import type { Key } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

const PAGE = 50;

export default function ResultTable({ result, t }: { result: SqlResult; t: T }) {
  const [shown, setShown] = useState(PAGE);
  const numeric = useMemo(
    () => result.columns.map((_, i) => isNumericColumn(result.rows, i)),
    [result],
  );

  const visible = result.rows.slice(0, shown);
  // 先頭0を持つ識別子列があるか（CSV を Excel で開くと落ちる）
  const hasLeadingZero = result.columns.some(
    (c, i) =>
      isIdentifierColumn(c) &&
      result.rows.some((r) => typeof r[i] === "string" && /^0\d/.test(r[i] as string)),
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-sunken">
            <tr>
              {result.columns.map((c, i) => (
                <th
                  key={c}
                  className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium text-ink-2 ${
                    numeric[i] ? "text-right" : "text-left"
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={ri} className="transition-colors hover:bg-sunken/60">
                {row.map((v, i) => (
                  <td
                    key={i}
                    className={`whitespace-nowrap border-b border-line/60 px-3 py-1.5 ${
                      numeric[i] ? "tnum text-right" : "text-left"
                    } ${v === null ? "text-ink-3" : "text-ink"}`}
                    title={v === null ? t("turn.note") : undefined}
                  >
                    {numeric[i] ? formatNumber(v, result.columns[i]) : (v ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3">
        <span className="tnum">
          {t("table.rowsTotal", { n: result.total_rows.toLocaleString() })}
          {result.rows.length < result.total_rows &&
            t("table.rowsFetched", { n: result.rows.length.toLocaleString() })}
        </span>
        {shown < result.rows.length && (
          <button
            onClick={() => setShown((n) => n + PAGE)}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 transition-colors hover:border-line-strong hover:text-ink"
          >
            <Icon name="chevronDown" size={12} />
            {t("table.showMore", { n: Math.min(PAGE, result.rows.length - shown) })}
          </button>
        )}
      </div>

      {hasLeadingZero && (
        <p className="text-[11px] leading-relaxed text-ink-3">{t("table.leadingZero")}</p>
      )}
    </div>
  );
}
