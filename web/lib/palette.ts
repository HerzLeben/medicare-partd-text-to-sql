/**
 * 検証済みの系列色。dataviz の validate_palette.js を通した固定順の8色。
 * 先頭はヘルツレーベンのコーポレートカラー（ティール #01a09b）。文字と細い線には
 * 暗くした #007a76（--accent）を使い、系列1には面で読める #008f8a を当てる。
 * 循環禁止（9系列目は「その他」に畳む）。明暗それぞれの surface 向けに
 * 別ステップを選んである。自動反転ではない。
 * 2026-09-18 検証：dark は全チェック PASS。light は 6↔7（緑↔赤）が CVD ΔE 7.2 で
 * 6–8 の許容帯。凡例・直接ラベル・棒の隙間があるので合法。
 */
export const SERIES_LIGHT = [
  "#008f8a", "#eb6834", "#4a3aa7", "#eda100",
  "#e87ba4", "#008300", "#e34948", "#2a78d6",
] as const;

export const SERIES_DARK = [
  "#01a09b", "#d95926", "#9085e9", "#c98500",
  "#d55181", "#008300", "#e66767", "#3987e5",
] as const;

/** 連続量（ティールの単色ランプ、明→暗）。コロプレスや強度表現に使う。
 *  明度が単調で隣接 ΔL >= 0.06、色相幅 4°（validate_palette.js --ordinal で確認）。 */
export const SEQUENTIAL = [
  "#d0efed", "#a3dedb", "#6fc9c4", "#3bb5b0", "#0f9791", "#007a76", "#00544f",
] as const;

/** 二極（ティール↔赤、中間はグレー）。増減など 0 をまたぐ量だけに使う。 */
export const DIVERGING = {
  negative: ["#6fc9c4", "#0f9791", "#00544f"],
  mid: { light: "#f0efec", dark: "#383835" },
  positive: ["#f0a3a2", "#e34948", "#a02120"],
} as const;

export const MAX_SERIES = 8;
export const OTHER_LABEL = "その他";

export type Mode = "light" | "dark";

export function seriesColors(mode: Mode): readonly string[] {
  return mode === "dark" ? SERIES_DARK : SERIES_LIGHT;
}

export function chartInk(mode: Mode) {
  return mode === "dark"
    ? { surface: "#1a1a19", ink: "#ffffff", ink2: "#c3c2b7", ink3: "#8d8c83", grid: "#2e2e2a" }
    : { surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", ink3: "#8a8983", grid: "#e8e7e3" };
}

/** 0..1 に正規化した値から連続ランプの色を返す。 */
export function sequentialColor(t: number): string {
  if (!Number.isFinite(t)) return SEQUENTIAL[0];
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.round(t * (SEQUENTIAL.length - 1))));
  return SEQUENTIAL[i];
}

/** -1..1 に正規化した値から二極ランプの色を返す。0 付近は中立グレー。 */
export function divergingColor(t: number, mode: Mode): string {
  if (!Number.isFinite(t)) return DIVERGING.mid[mode];
  const a = Math.abs(t);
  if (a < 0.08) return DIVERGING.mid[mode];
  const arm = t < 0 ? DIVERGING.negative : DIVERGING.positive;
  const i = Math.min(arm.length - 1, Math.floor(a * arm.length));
  return arm[i];
}
