/** 表示用の数値整形。桁を揃えるため tabular-nums と組みで使う。 */

const COST_HINT = /(cst|cost|spend|費用|薬剤費)/i;
const RATE_HINT = /(rate|share|ratio|growth|pct|percent|率|割合|増減)/i;

/**
 * 桁区切りしてはいけない列。年やコードは数量ではないので
 * 2022 を「2,022」、FIPS の "01" を「1」、ZIP の "90210" を「90,210」にしてはならない。
 */
const IDENTIFIER_HINT =
  /^(year|.*_year|.*_fips|.*_zip\d*|.*_npi|npi|.*_cd|.*_code|.*_id|id|.*_abrvtn)$/i;

export function isIdentifierColumn(column?: string): boolean {
  return !!column && IDENTIFIER_HINT.test(column);
}

export function formatNumber(v: unknown, column?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  // 年・NPI・FIPS・ZIP などは加工しない（先頭0も桁区切りも壊さない）
  if (isIdentifierColumn(column)) return String(v);
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);

  if (column && RATE_HINT.test(column)) {
    return `${(n * 100).toFixed(1)}%`;
  }
  if (column && COST_HINT.test(column)) {
    return `$${compact(n)}`;
  }
  return Number.isInteger(n) ? n.toLocaleString("ja-JP") : compact(n);
}

/** 桁の大きい数は 12.3M のように詰める。軸ラベルにも使う。 */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  if (a >= 1) return n.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 3 });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** その列が数値として扱えるか（表の右寄せとグラフの軸判定に使う）。 */
export function isNumericColumn(rows: unknown[][], i: number): boolean {
  let seen = 0;
  for (const row of rows) {
    const v = row[i];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "boolean" || !Number.isFinite(Number(v))) return false;
    seen++;
    if (seen >= 12) break;
  }
  return seen > 0;
}
