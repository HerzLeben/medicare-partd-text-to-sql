"use client";

import Icon, { type IconName } from "./Icon";
import { dataTables } from "@/lib/dataTables";
import type { Key, Lang } from "@/lib/i18n";

type T = (key: Key, vars?: Record<string, string | number>) => string;

/**
 * データの中身を図で見せる。文字で説明しない。
 *  1. 粒度の図：3 つの公開表を、タイルの細かさと行数のバーで並べる
 *  2. つながりの図：5 表が何のキーで結ばれるか（SVG）
 *  3. 早見表：1 表 1 行。列の詳細は折りたたみ
 *  4. 抑制の図：11 件未満が空欄になる様子
 */

const DIM_ICON: Record<string, IconName> = {
  year: "calendar", npi: "doctor", drug: "pill", geo: "map", cls: "pill", state: "mapPin",
};

// 粒度（表ごとに、どの軸を持つか）
const GRAIN: Record<string, string[]> = {
  provider_drug: ["year", "npi", "drug"],
  provider: ["year", "npi"],
  geo_drug: ["year", "geo", "drug"],
  drug_class: ["cls"],
  state: ["state"],
};
const DIM_LABEL: Record<Lang, Record<string, string>> = {
  ja: { year: "年", npi: "医師", drug: "薬剤", geo: "地域", cls: "薬効クラス", state: "州" },
  en: { year: "year", npi: "prescriber", drug: "drug", geo: "geography", cls: "drug class", state: "state" },
};

function Tiles({ nx, ny, dark = false }: { nx: number; ny: number; dark?: boolean }) {
  const cells = Array.from({ length: nx * ny }, (_, i) => ((i * 7 + Math.floor(i / nx) * 3) % 5) / 5);
  return (
    <div className="grid h-14 w-28 gap-px" style={{ gridTemplateColumns: `repeat(${nx}, 1fr)` }} aria-hidden>
      {cells.map((k, i) => (
        <span key={i} className="rounded-[1px]" style={{ background: `color-mix(in oklab, var(--accent) ${dark ? 30 + k * 60 : 25 + k * 55}%, var(--surface))` }} />
      ))}
    </div>
  );
}

export default function DataVisual({ lang, t }: { lang: Lang; t: T }) {
  const tables = dataTables(lang);
  const cms = tables.filter((x) => x.rowsByYear);
  const maxRows = Math.max(...cms.map((x) => x.rowsByYear!.reduce((a, b) => a + b, 0)));
  const dim = DIM_LABEL[lang];

  return (
    <div className="space-y-10">
      {/* ------------------------------------------------ 1. 粒度の図 */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Icon name="table" size={17} className="text-[var(--accent)]" />
          {t("dv.grain.title")}
        </h3>
        <p className="text-[12.5px] text-ink-3">{t("dv.grain.lead")}</p>
        <div className="grid gap-2">
          {cms.map((tb, i) => {
            const total = tb.rowsByYear!.reduce((a, b) => a + b, 0);
            const pct = Math.max(1.5, (total / maxRows) * 100);
            const tiles = [[16, 8], [8, 4], [4, 2]][i] as [number, number];
            return (
              <div key={tb.name} className="grid items-center gap-3 rounded-[var(--radius)] border border-line bg-raised p-3 sm:grid-cols-[7rem_1fr_1.3fr]">
                <Tiles nx={tiles[0]} ny={tiles[1]} />
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-semibold text-ink">{tb.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[12px] text-ink-2">
                    {GRAIN[tb.name].map((d, j) => (
                      <span key={d} className="flex items-center gap-1">
                        {j > 0 && <span className="text-ink-3">×</span>}
                        <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[var(--accent)]">
                          <Icon name={DIM_ICON[d]} size={11} />{dim[d]}
                        </span>
                      </span>
                    ))}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tnum w-16 text-right text-[12.5px] font-semibold text-ink">{fmt(total)}</span>
                  </div>
                  <p className="tnum mt-1 text-[10.5px] text-ink-3">
                    2022 {fmt(tb.rowsByYear![0])} · 2023 {fmt(tb.rowsByYear![1])} · 2024 {fmt(tb.rowsByYear![2])}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------ 2. つながりの図 */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Icon name="map" size={17} className="text-[var(--accent)]" />
          {t("dv.join.title")}
        </h3>
        <JoinDiagram lang={lang} t={t} />
      </section>

      {/* ------------------------------------------------ 3. 早見表 */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <Icon name="database" size={17} className="text-[var(--accent)]" />
          {t("dv.matrix.title")}
        </h3>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead className="bg-sunken text-[11px] text-ink-3">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("dv.col.table")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("dv.col.grain")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("dv.col.use")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("dv.col.columns")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("dv.col.caveat")}</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((tb) => (
                <tr key={tb.name} className="border-t border-line align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[12.5px] font-semibold text-ink">{tb.name}</span>
                    <span className="tnum block text-[10.5px] text-ink-3">
                      {tb.rowsByYear ? fmt(tb.rowsByYear.reduce((a, b) => a + b, 0)) : tb.rows?.toLocaleString()} {t("overview.rowsUnit")}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {GRAIN[tb.name].map((d) => (
                        <span key={d} className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-[var(--accent)]">
                          <Icon name={DIM_ICON[d]} size={11} />{dim[d]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 leading-relaxed text-ink-2">{tb.answers[0]}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {tb.columns.map((c) => (
                        <span key={c.group} className="rounded border border-line bg-raised px-1.5 py-0.5 text-[11px] text-ink-2">{c.group}</span>
                      ))}
                    </span>
                    <details className="mt-1.5 text-[11.5px]">
                      <summary className="cursor-pointer list-none text-[var(--accent)] underline-offset-2 hover:underline">{t("dv.more")}</summary>
                      <dl className="mt-1.5 space-y-1">
                        {tb.columns.map((c) => (
                          <div key={c.group} className="flex gap-2">
                            <dt className="w-[6.5em] shrink-0 text-ink-3">{c.group}</dt>
                            <dd className="leading-relaxed text-ink-2">{c.items}</dd>
                          </div>
                        ))}
                        {tb.answers.length > 1 && (
                          <div className="flex gap-2 pt-1">
                            <dt className="w-[6.5em] shrink-0 text-ink-3">{t("dv.col.use")}</dt>
                            <dd className="leading-relaxed text-ink-2">{tb.answers.slice(1).join(" ／ ")}</dd>
                          </div>
                        )}
                      </dl>
                    </details>
                  </td>
                  <td className="px-3 py-2.5 leading-relaxed text-ink-2">
                    {tb.caveats[0] ? (
                      <span className="flex gap-1.5">
                        <Icon name="xCircle" size={12} className="mt-[3px] shrink-0 text-[var(--series-2)]" />
                        <span>{tb.caveats[0]}</span>
                      </span>
                    ) : <span className="text-ink-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------ 4. 抑制の図 */}
      <section className="grid gap-4 rounded-[var(--radius)] border border-line bg-raised p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <SuppressionFigure lang={lang} />
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Icon name="xCircle" size={15} className="text-[var(--series-2)]" />
            {t("dv.suppress.title")}
          </h3>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{t("dv.suppress.body")}</p>
        </div>
      </section>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** 5 表のつながり。中央に主表、左右に医師サマリと地域集計、下に補助表 2 つ。 */
function JoinDiagram({ lang, t }: { lang: Lang; t: T }) {
  const L = lang === "ja"
    ? { pd: "年 × 医師 × 薬剤", pv: "年 × 医師", geo: "年 × 地域 × 薬剤", dc: "薬効クラス", st: "州の対応表",
        k1: "年・NPI", k2: "年・州・薬剤", k3: "一般名", k4: "州名 ↔ 略号" }
    : { pd: "year × prescriber × drug", pv: "year × prescriber", geo: "year × geography × drug", dc: "drug class", st: "state lookup",
        k1: "year, NPI", k2: "year, state, drug", k3: "generic name", k4: "state name ↔ code" };
  const box = (x: number, y: number, w: number, name: string, sub: string, main = false) => (
    <g>
      <rect x={x} y={y} width={w} height={54} rx={8} fill={main ? "var(--accent-soft)" : "var(--surface-raised)"} stroke={main ? "var(--accent)" : "var(--border-strong)"} strokeWidth={main ? 2 : 1.2} />
      <text x={x + w / 2} y={y + 22} textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="13" fontWeight="600" fill="var(--ink)">{name}</text>
      <text x={x + w / 2} y={y + 41} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">{sub}</text>
    </g>
  );
  const edge = (x1: number, y1: number, x2: number, y2: number, label: string) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="0" />
      <rect x={(x1 + x2) / 2 - 46} y={(y1 + y2) / 2 - 10} width={92} height={20} rx={10} fill="var(--surface)" stroke="var(--border)" />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize="10.5" fill="var(--accent)">{label}</text>
    </g>
  );
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-raised p-3">
      <svg viewBox="0 0 760 230" className="h-auto w-full min-w-[620px]" role="img" aria-label={t("dv.join.title")}>
        {edge(190, 47, 290, 87, L.k1)}
        {edge(470, 87, 570, 47, L.k2)}
        {edge(190, 183, 290, 143, L.k3)}
        {edge(470, 143, 570, 183, L.k4)}
        {box(20, 20, 170, "provider", L.pv)}
        {box(290, 88, 180, "provider_drug", L.pd, true)}
        {box(570, 20, 170, "geo_drug", L.geo)}
        {box(20, 156, 170, "drug_class", L.dc)}
        {box(570, 156, 170, "state", L.st)}
      </svg>
    </div>
  );
}

/** 11 件未満が空欄になる様子。3 行の小さな表。 */
function SuppressionFigure({ lang }: { lang: Lang }) {
  const rows = lang === "ja"
    ? [["Ozempic", "312", "58"], ["Trulicity", "24", "11"], ["Rybelsus", "", ""]]
    : [["Ozempic", "312", "58"], ["Trulicity", "24", "11"], ["Rybelsus", "", ""]];
  const head = lang === "ja" ? ["薬剤", "請求数", "受給者数"] : ["drug", "claims", "benes"];
  return (
    <div className="w-[240px] shrink-0 overflow-hidden rounded-[var(--radius)] border border-line text-[11.5px]" aria-hidden>
      <div className="grid grid-cols-[1.3fr_1fr_1fr] bg-sunken px-2 py-1 text-[10.5px] text-ink-3">
        {head.map((h) => <span key={h} className="last:text-right [&:nth-child(2)]:text-right">{h}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-line px-2 py-1">
          <span className="text-ink">{r[0]}</span>
          {[r[1], r[2]].map((v, j) => (
            <span key={j} className="tnum text-right">
              {v ? <span className="text-ink-2">{v}</span>
                 : <span className="inline-block h-3 w-8 rounded bg-[var(--danger-soft)] align-middle ring-1 ring-[var(--danger)]/40" />}
            </span>
          ))}
        </div>
      ))}
      <div className="border-t border-line bg-[var(--danger-soft)] px-2 py-1 text-[10px] text-[var(--danger)]">
        {lang === "ja" ? "← 1〜10 件は空欄（0 ではない）" : "← 1–10 shown blank (not zero)"}
      </div>
    </div>
  );
}
