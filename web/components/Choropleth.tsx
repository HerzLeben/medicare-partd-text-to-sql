"use client";

import { useEffect, useMemo, useState } from "react";
import { geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import { chartInk, divergingColor, sequentialColor, type Mode } from "@/lib/palette";
import { formatNumber } from "@/lib/format";
import type { PlotSpec, SqlResult } from "@/lib/types";
import { useLang } from "@/lib/i18n";

/**
 * 州別コロプレス。us-atlas の Albers 投影済み TopoJSON をそのまま描く
 * （投影計算が要らないので geoPath(null) でパスが出る）。
 * データが 0 をまたぐときだけ二極ランプ、それ以外は青の単色ランプ。
 */

// FIPS -> 州略号。データ側は略号で来る（partd.state の state_abrvtn）
const FIPS_TO_ABBR: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

const WIDTH = 975;
const HEIGHT = 610;

interface Props {
  spec: PlotSpec;
  result: SqlResult;
  mode: Mode;
}

export default function Choropleth({ spec, result, mode }: Props) {
  const { t } = useLang();
  const ink = chartInk(mode);
  const [states, setStates] = useState<FeatureCollection<Geometry> | null>(null);
  const [hover, setHover] = useState<{ abbr: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    // 地図データは重い（84KB）ので、コロプレスを描くときだけ読む
    import("us-atlas/states-albers-10m.json").then((mod) => {
      if (!alive) return;
      // us-atlas の JSON は数値配列がタプル型に落ちないので unknown 経由で渡す
      const topo = (mod.default ?? mod) as unknown as Topology;
      setStates(feature(topo, topo.objects.states) as unknown as FeatureCollection<Geometry>);
    });
    return () => { alive = false; };
  }, []);

  const { values, min, max, diverging } = useMemo(() => {
    const xi = spec.x ? result.columns.indexOf(spec.x) : -1;
    const yi = spec.y ? result.columns.indexOf(spec.y) : -1;
    const map = new Map<string, number>();
    if (xi >= 0 && yi >= 0) {
      for (const r of result.rows) {
        const v = Number(r[yi]);
        if (Number.isFinite(v)) map.set(String(r[xi]).toUpperCase(), v);
      }
    }
    const nums = [...map.values()];
    const lo = nums.length ? Math.min(...nums) : 0;
    const hi = nums.length ? Math.max(...nums) : 1;
    return { values: map, min: lo, max: hi, diverging: lo < 0 && hi > 0 };
  }, [result, spec.x, spec.y]);

  const path = useMemo(() => geoPath(null), []);

  const colorOf = (v: number | undefined): string => {
    if (v === undefined) return mode === "dark" ? "#2a2a27" : "#eceae5";
    if (diverging) {
      const bound = Math.max(Math.abs(min), Math.abs(max)) || 1;
      return divergingColor(v / bound, mode);
    }
    const span = max - min || 1;
    return sequentialColor((v - min) / span);
  };

  if (!states) {
    return <div className="h-[320px] animate-pulse rounded-lg bg-sunken" aria-hidden />;
  }

  const hovered = hover ? values.get(hover.abbr) : undefined;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={spec.title}
      >
        <g>
          {states.features.map((f) => {
            const abbr = FIPS_TO_ABBR[String(f.id).padStart(2, "0")];
            const v = abbr ? values.get(abbr) : undefined;
            const d = path(f);
            if (!d) return null;
            return (
              <path
                key={String(f.id)}
                d={d}
                fill={colorOf(v)}
                /* 面と面の間に地色の隙間を置く */
                stroke={ink.surface}
                strokeWidth={hover?.abbr === abbr ? 2.5 : 1}
                className="transition-[stroke-width] duration-100"
                onMouseEnter={(e) =>
                  abbr && setHover({ abbr, x: e.clientX, y: e.clientY })
                }
                onMouseMove={(e) =>
                  abbr && setHover({ abbr, x: e.clientX, y: e.clientY })
                }
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>
      </svg>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-semibold text-ink">{hover.abbr}</div>
          <div className="tnum text-ink-2">
            {hovered === undefined ? t("chart.noData") : formatNumber(hovered, spec.y)}
          </div>
        </div>
      )}

      <Legend min={min} max={max} diverging={diverging} mode={mode} column={spec.y} />
    </div>
  );
}

function Legend({
  min, max, diverging, mode, column,
}: { min: number; max: number; diverging: boolean; mode: Mode; column?: string }) {
  const steps = 7;
  const swatches = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    if (diverging) {
      const bound = Math.max(Math.abs(min), Math.abs(max)) || 1;
      return divergingColor(((min + (max - min) * t) / bound), mode);
    }
    return sequentialColor(t);
  });

  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
      <span className="tnum">{formatNumber(min, column)}</span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full">
        {swatches.map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <span className="tnum">{formatNumber(max, column)}</span>
    </div>
  );
}
