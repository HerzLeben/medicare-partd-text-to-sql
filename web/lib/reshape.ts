/**
 * 出力形式の切替（SQL を再実行しない）。直前の結果（列と行）に対して plot_spec を
 * 組み立て直す。「出力の形は SQL とは独立に決まる」を UI で示すための部品。
 */
import { isIdentifierColumn } from "./format";
import type { PlotKind, PlotSpec, SqlResult } from "./types";

export type FormatKind = "table" | "bar" | "line" | "choropleth_state";

const YEAR_RE = /(^|_)(year|yr)($|_)/i;
const STATE_RE = /(state_abrvtn|state_abbr|abbr|abrvtn)/i;

function isNumericCol(result: SqlResult, i: number) {
  if (isIdentifierColumn(result.columns[i])) return false;
  const vals = result.rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined);
  return vals.length > 0 && vals.every((v) => typeof v === "number");
}
function isYearCol(result: SqlResult, i: number) {
  if (YEAR_RE.test(result.columns[i])) return true;
  const vals = result.rows.map((r) => Number(r[i])).filter((v) => Number.isFinite(v));
  return vals.length > 0 && vals.every((v) => Number.isInteger(v) && v >= 2013 && v <= 2030);
}
function isStateAbbrCol(result: SqlResult, i: number) {
  const vals = result.rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined);
  const twoLetter = vals.length > 0 && vals.every((v) => typeof v === "string" && /^[A-Z]{2}$/.test(v));
  return twoLetter || (STATE_RE.test(result.columns[i]) && vals.every((v) => typeof v === "string"));
}

export interface Capabilities {
  yearCol: string | null;
  stateCol: string | null;
  numericCols: string[];
  categoricalCols: string[];
}

export function capabilities(result: SqlResult): Capabilities {
  const idx = result.columns.map((_, i) => i);
  const yearIdx = idx.find((i) => isYearCol(result, i));
  const stateIdx = idx.find((i) => isStateAbbrCol(result, i));
  const numeric = idx.filter((i) => isNumericCol(result, i) && i !== yearIdx).map((i) => result.columns[i]);
  const categorical = idx
    .filter((i) => !isNumericCol(result, i) && i !== yearIdx)
    .map((i) => result.columns[i]);
  return {
    yearCol: yearIdx === undefined ? null : result.columns[yearIdx],
    stateCol: stateIdx === undefined ? null : result.columns[stateIdx],
    numericCols: numeric,
    categoricalCols: categorical,
  };
}

/** 形式を変えた plot_spec。作れない形式（州や年の列が無い）は null。 */
export function reshape(kind: FormatKind, base: PlotSpec | undefined, result: SqlResult, title: string): PlotSpec | null {
  const cap = capabilities(result);
  const t = base?.title ?? title;
  const yOf = (prefer?: string) =>
    prefer && cap.numericCols.includes(prefer) ? prefer : cap.numericCols[0];
  if (kind === "table") return { kind: "table", title: t, note: base?.note };
  const y = yOf(base?.y);
  if (!y) return null;
  if (kind === "bar") {
    const x = base?.x && cap.categoricalCols.includes(base.x) ? base.x
            : cap.categoricalCols[0] ?? cap.yearCol;
    if (!x) return null;
    const color = base?.color && cap.categoricalCols.includes(base.color) && base.color !== x ? base.color : undefined;
    return { kind: "bar", x, y, color, title: t, note: base?.note };
  }
  if (kind === "line") {
    if (!cap.yearCol) return null;
    // 年以外の分類列があれば系列にする（薬剤別の推移など）
    const color = base?.color && cap.categoricalCols.includes(base.color) ? base.color
                : base?.x && base.x !== cap.yearCol && cap.categoricalCols.includes(base.x) ? base.x
                : cap.categoricalCols.find((c) => c !== cap.stateCol) ?? undefined;
    return { kind: "line", x: cap.yearCol, y, color, title: t, note: base?.note };
  }
  if (kind === "choropleth_state") {
    if (!cap.stateCol) return null;
    return { kind: "choropleth_state", x: cap.stateCol, y, title: t, note: base?.note };
  }
  return null;
}

export function kindOf(spec: PlotSpec | undefined): FormatKind {
  const k: PlotKind | undefined = spec?.kind;
  if (k === "bar" || k === "line" || k === "choropleth_state") return k;
  return "table";
}
