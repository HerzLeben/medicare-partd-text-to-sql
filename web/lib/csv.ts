import { isIdentifierColumn } from "./format";
import type { SqlResult } from "./types";

/** 結果を CSV にしてダウンロードする。識別子列は常にクォート（先頭 0 を守る）。 */
export function downloadCsv(result: SqlResult, filename = "partd_result.csv") {
  const esc = (v: unknown, col: string) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (isIdentifierColumn(col)) return `"${s.replace(/"/g, '""')}"`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    result.columns.join(","),
    ...result.rows.map((r) => r.map((v, i) => esc(v, result.columns[i])).join(",")),
  ].join("\n");
  // Excel が UTF-8 と判定できるよう BOM を付ける
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
