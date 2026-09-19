/**
 * ごく小さな SQL ハイライタ。
 * 依存を増やさずに、キーワード・文字列・数値・コメントだけ色分けする。
 */
const KEYWORDS =
  /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|LIMIT|JOIN|LEFT|RIGHT|INNER|FULL|OUTER|ON|AS|AND|OR|NOT|IN|IS|NULL|WITH|CASE|WHEN|THEN|ELSE|END|HAVING|DISTINCT|UNION|ALL|DESC|ASC|BETWEEN|LIKE|OVER|PARTITION|QUALIFY|USING|CROSS)\b/gi;
const FUNCTIONS =
  /\b(SUM|COUNT|COUNTIF|AVG|MIN|MAX|ROUND|SAFE_DIVIDE|IF|IFNULL|COALESCE|CAST|UPPER|LOWER|CONCAT|ARRAY_AGG|STRING_AGG|RANK|ROW_NUMBER|DENSE_RANK|EXTRACT|ANY_VALUE|APPROX_COUNT_DISTINCT)\s*\(/gi;

export type Tok = { t: "kw" | "fn" | "str" | "num" | "com" | "txt"; v: string };

export function tokenizeSql(sql: string): Tok[] {
  const out: Tok[] = [];
  const pattern =
    /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)/g;

  let last = 0;
  for (const m of sql.matchAll(pattern)) {
    const i = m.index!;
    if (i > last) out.push(...plain(sql.slice(last, i)));
    if (m[1]) out.push({ t: "com", v: m[1] });
    else if (m[2]) out.push({ t: "str", v: m[2] });
    else out.push({ t: "num", v: m[3] });
    last = i + m[0].length;
  }
  if (last < sql.length) out.push(...plain(sql.slice(last)));
  return out;
}

function plain(chunk: string): Tok[] {
  const marks: { s: number; e: number; t: Tok["t"] }[] = [];
  for (const m of chunk.matchAll(KEYWORDS)) marks.push({ s: m.index!, e: m.index! + m[0].length, t: "kw" });
  for (const m of chunk.matchAll(FUNCTIONS)) {
    const name = m[0].replace(/\s*\($/, "");
    marks.push({ s: m.index!, e: m.index! + name.length, t: "fn" });
  }
  marks.sort((a, b) => a.s - b.s);

  const out: Tok[] = [];
  let pos = 0;
  for (const mk of marks) {
    if (mk.s < pos) continue;
    if (mk.s > pos) out.push({ t: "txt", v: chunk.slice(pos, mk.s) });
    out.push({ t: mk.t, v: chunk.slice(mk.s, mk.e) });
    pos = mk.e;
  }
  if (pos < chunk.length) out.push({ t: "txt", v: chunk.slice(pos) });
  return out;
}
