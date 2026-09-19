/** api/main.py が SSE で流すイベント。Python 側と1対1に対応させる。 */
export type SseEvent =
  | { type: "status"; text: string }
  | { type: "sql"; index: number; purpose: string; sql: string }
  | { type: "result"; index: number } & Partial<SqlResult>
  | { type: "plot"; spec: PlotSpec }
  | { type: "answer"; text: string }
  | { type: "done"; elapsedSec: number; usage: Usage; stoppedEarly: string | null; remaining: number }
  | { type: "error"; message: string; remaining?: number };

export interface SqlResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  total_rows: number;
  returned_rows: number;
  bytes_billed: number;
  elapsed_sec: number;
  truncated?: string;
  hint?: string;
  error?: string;
}

export type PlotKind = "bar" | "line" | "choropleth_state" | "table" | "scatter";

export interface PlotSpec {
  kind: PlotKind;
  x?: string;
  y?: string;
  color?: string;
  title: string;
  note?: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface SqlStep {
  index: number;
  purpose: string;
  sql: string;
  result?: SqlResult;
}

export interface Turn {
  id: string;
  question: string;
  steps: SqlStep[];
  plot?: PlotSpec;
  answer: string;
  status?: string;
  running: boolean;
  elapsedSec?: number;
  usage?: Usage;
  error?: string;
  stoppedEarly?: string | null;
}

export interface Option {
  value: string;
  label: string;
}

export interface AppConfig {
  examples: string[];
  models: Record<string, { id: string; label: string; note: string }>;
  years: number[];
  specialties: Option[];
  drugClasses: Option[];
  states: Option[];
  populations: Option[];
  areas: Option[];
  maxQuestions: number;
  dataNote: { period: string; suppression: string; source: string; sourceUrl: string };
}

/** サイドバーの絞り込み。質問文に添えてエージェントへ渡す。 */
export interface Filters {
  years: number[];
  state: string | null;
  specialty: string | null;
  drugClass: string | null;
  population: string | null;
  area: string | null;
}

/** 初回に見せるデータ紹介。/api/overview から取る。 */
export interface Topic {
  key: string;
  title: string;
  lead: string;
  questions: string[];
}

export interface Overview {
  period: string;
  rows: number;
  stats: Partial<{
    prescribers: number;
    specialties: number;
    claims: number;
    cost: number;
    generics: number;
    brands: number;
  }>;
  topics: Topic[];
  canDo: string[];
  cannotDo: string[];
  tables: { name: string; grainJa: string; grainEn: string; rows: number }[];
}
