"use client";

import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { MAX_SERIES, OTHER_LABEL, chartInk, seriesColors, type Mode } from "@/lib/palette";
import { compact, formatNumber, isIdentifierColumn } from "@/lib/format";
import type { PlotSpec, SqlResult } from "@/lib/types";
import Choropleth from "./Choropleth";

/** 系列は合計の大きい順。8を超えたら「その他」に畳む（色は循環させない）。 */
function foldSeries(names: string[], totals: Map<string, number>): string[] {
  const sorted = [...names].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  if (sorted.length <= MAX_SERIES) return sorted;
  return [...sorted.slice(0, MAX_SERIES - 1), OTHER_LABEL];
}

interface Props {
  spec: PlotSpec;
  result: SqlResult;
  mode: Mode;
}

/**
 * 数量セルを数値にする。NULL（抑制：1〜10 件）・空文字・非数値は null を返し、0 にしない。
 * Number(null) は 0 になるので、そのまま集計すると抑制された値が 0 の棒として描かれる。
 */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function Chart({ spec, result, mode }: Props) {
  const ink = chartInk(mode);
  const colors = seriesColors(mode);
  const { columns, rows } = result;

  const xi = spec.x ? columns.indexOf(spec.x) : -1;
  const yi = spec.y ? columns.indexOf(spec.y) : -1;
  const ci = spec.color ? columns.indexOf(spec.color) : -1;

  const data = useMemo(() => {
    if (xi < 0 || yi < 0) return [];
    if (ci < 0) {
      return rows.flatMap((r) => {
        const y = numOrNull(r[yi]);
        return y === null ? [] : [{ x: r[xi], y }];
      });
    }
    // 系列あり: x をキーにして系列ごとの列を作る
    const totals = new Map<string, number>();
    for (const r of rows) {
      const v = numOrNull(r[yi]);
      if (v === null) continue;
      totals.set(String(r[ci]), (totals.get(String(r[ci])) ?? 0) + v);
    }
    const names = foldSeries([...totals.keys()], totals);
    const keep = new Set(names);
    const byX = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const key = String(r[xi]);
      const name = keep.has(String(r[ci])) ? String(r[ci]) : OTHER_LABEL;
      const bucket = byX.get(key) ?? { x: r[xi] };
      byX.set(key, bucket);
      const v = numOrNull(r[yi]);
      if (v === null) continue; // NULL（抑制）は 0 に畳まず、その系列の点を欠けさせる
      bucket[name] = (Number(bucket[name] ?? 0) || 0) + v;
    }
    return [...byX.values()];
  }, [rows, xi, yi, ci]);

  const seriesNames = useMemo(() => {
    if (ci < 0) return [];
    const totals = new Map<string, number>();
    for (const d of data) {
      for (const [k, v] of Object.entries(d)) {
        if (k === "x") continue;
        totals.set(k, (totals.get(k) ?? 0) + Number(v ?? 0));
      }
    }
    const names = [...totals.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
    // 「その他」は慣例どおり末尾へ
    return [...names.filter((n) => n !== OTHER_LABEL), ...names.filter((n) => n === OTHER_LABEL)];
  }, [data, ci]);

  if (spec.kind === "table") return null;
  if (spec.kind === "choropleth_state") {
    return <Choropleth spec={spec} result={result} mode={mode} />;
  }
  if (xi < 0 || yi < 0 || data.length === 0) return null;

  const showLegend = seriesNames.length >= 2;
  const axis = {
    tick: { fill: ink.ink2, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: ink.grid },
  } as const;

  // year のような識別子列は桁区切りしない
  const tickX = (v: unknown) =>
    isIdentifierColumn(spec.x) ? String(v) : compact(Number(v));
  const tickY = (v: unknown) =>
    isIdentifierColumn(spec.y) ? String(v) : compact(Number(v));

  const tooltip = (
    <Tooltip
      cursor={{ fill: mode === "dark" ? "#ffffff10" : "#0b0b0b08" }}
      contentStyle={{
        background: ink.surface,
        border: `1px solid ${ink.grid}`,
        borderRadius: 8,
        fontSize: 12,
        color: ink.ink,
        boxShadow: "0 4px 16px rgb(0 0 0 / 0.08)",
      }}
      labelStyle={{ color: ink.ink, fontWeight: 600, marginBottom: 4 }}
      formatter={(v, name) => [formatNumber(v, spec.y), String(name)]}
      labelFormatter={(l) => (isIdentifierColumn(spec.x) ? String(l) : String(l))}
    />
  );

  const legend = showLegend ? (
    <Legend
      verticalAlign="top"
      align="left"
      height={30}
      iconType="circle"
      iconSize={8}
      wrapperStyle={{ fontSize: 12, color: ink.ink2, paddingBottom: 8 }}
    />
  ) : null;

  // --- 棒 ------------------------------------------------------------------
  if (spec.kind === "bar") {
    // カテゴリ名は長いことが多いので横棒にして読めるようにする
    const horizontal = data.some((d) => typeof d.x === "string");
    const height = horizontal ? Math.max(260, data.length * 34 + 70) : 340;
    const sorted = horizontal && ci < 0
      ? [...data].sort((a, b) => Number(b.y) - Number(a.y))
      : data;

    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sorted}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 16, bottom: 4, left: horizontal ? 8 : 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            stroke={ink.grid}
            horizontal={!horizontal}
            vertical={horizontal}
          />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={tickY} />
              <YAxis type="category" dataKey="x" width={150} {...axis} interval={0} />
            </>
          ) : (
            <>
              <XAxis type="category" dataKey="x" {...axis} interval={0} />
              <YAxis type="number" {...axis} tickFormatter={tickY} />
            </>
          )}
          {tooltip}
          {legend}
          {ci < 0 ? (
            <Bar dataKey="y" name={spec.y} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={colors[0]} stroke={ink.surface} strokeWidth={1} />
              ))}
            </Bar>
          ) : (
            seriesNames.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                fill={colors[i % colors.length]}
                stroke={ink.surface}
                strokeWidth={1}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              />
            ))
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // --- 折れ線 --------------------------------------------------------------
  if (spec.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={ink.grid} vertical={false} />
          <XAxis dataKey="x" {...axis} tickFormatter={tickX} />
          <YAxis {...axis} tickFormatter={tickY} />
          {tooltip}
          {legend}
          {(ci < 0 ? [{ key: "y", name: spec.y ?? "" }] : seriesNames.map((n) => ({ key: n, name: n })))
            .map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                dot={{ r: 4, fill: colors[i % colors.length], stroke: ink.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: ink.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // --- 散布 ----------------------------------------------------------------
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ScatterChart margin={{ top: 4, right: 20, bottom: 12, left: 0 }}>
        <CartesianGrid stroke={ink.grid} />
        <XAxis type="number" dataKey="x" name={spec.x} {...axis} tickFormatter={tickX} />
        <YAxis type="number" dataKey="y" name={spec.y} {...axis} tickFormatter={tickY} />
        {tooltip}
        <Scatter data={data} fill={colors[0]} stroke={ink.surface} strokeWidth={2} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
