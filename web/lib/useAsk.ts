"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AppConfig, Filters, Overview, SqlResult, SseEvent, Turn } from "./types";

export interface AskOptions extends Partial<Filters> {
  model: string;
  lang: string;
}

// 言語は <html lang> が正で、ハイドレーション中は "ja"、直後に実際の言語へ切り替わる。
// つまり初回ロードで lang が2回変わり、fetch も2回走る。ガードが無いと先に投げた
// 古い言語のレスポンスが後から届いて新しいほうを上書きする（英語ブラウザで実際に発生した）。
// AbortController で古い要求を打ち切る。abort 起因の catch では state を触らない。

/** 設定（質問例・モデル一覧・残り質問数）を API から読む。 */
export function useConfig(lang: string) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/config?lang=${lang}`, { signal: ac.signal })
      .then((r) => r.json()).then(setConfig)
      .catch(() => { if (!ac.signal.aborted) setConfig(null); });
    return () => ac.abort();
  }, [lang]);
  return config;
}

/** データ紹介（規模・切り口・できること）を読む。 */
export function useOverview(lang: string) {
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/overview?lang=${lang}`, { signal: ac.signal })
      .then((r) => r.json()).then(setOverview)
      .catch(() => { if (!ac.signal.aborted) setOverview(null); });
    return () => ac.abort();
  }, [lang]);
  return overview;
}

/** SSE を読みながら会話の状態を組み立てる。 */
export function useAsk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  // ask のクロージャが古い turns を掴まないように ref で持つ
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => setRemaining(d.remaining))
      .catch(() => {});
  }, []);

  const patch = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const ask = useCallback(
    async (question: string, opts: AskOptions) => {
      if (busy) return;
      // 直前までのやり取りを渡して会話を続けられるようにする。
      // 「それを州別に」「同じ条件で2023年は？」のような質問に答えるため。
      const history = turnsRef.current.slice(-3).map((t) => ({
        question: t.question,
        sql: [...t.steps].reverse().find((s) => s.result && !s.result.error)?.sql ?? "",
        answer: t.answer.slice(0, 800),
      }));
      const id = crypto.randomUUID();
      setTurns((prev) => [
        ...prev,
        { id, question, steps: [], answer: "", running: true, status: "送信しています" },
      ]);
      setBusy(true);

      const controller = new AbortController();
      abort.current = controller;

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, ...opts, history }),
          signal: controller.signal,
        });
        if (!res.body) throw new Error("no body");

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;

          let cut: number;
          while ((cut = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            apply(id, JSON.parse(line.slice(6)) as SseEvent);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patch(id, (t) => ({ ...t, error: "接続に失敗しました。もう一度お試しください。" }));
        }
      } finally {
        patch(id, (t) => ({ ...t, running: false, status: undefined }));
        setBusy(false);
        abort.current = null;
      }

      function apply(turnId: string, ev: SseEvent) {
        switch (ev.type) {
          case "status":
            patch(turnId, (t) => ({ ...t, status: ev.text }));
            break;
          case "sql":
            patch(turnId, (t) => ({
              ...t,
              steps: [...t.steps, { index: ev.index, purpose: ev.purpose, sql: ev.sql }],
            }));
            break;
          case "result": {
            const { type, index, ...rest } = ev;
            void type;
            patch(turnId, (t) => ({
              ...t,
              steps: t.steps.map((s) =>
                s.index === index ? { ...s, result: rest as SqlResult } : s,
              ),
            }));
            break;
          }
          case "plot":
            patch(turnId, (t) => ({ ...t, plot: ev.spec }));
            break;
          case "answer":
            patch(turnId, (t) => ({ ...t, answer: t.answer + ev.text, status: undefined }));
            break;
          case "done":
            setRemaining(ev.remaining);
            patch(turnId, (t) => ({
              ...t,
              running: false,
              status: undefined,
              elapsedSec: ev.elapsedSec,
              usage: ev.usage,
              stoppedEarly: ev.stoppedEarly,
            }));
            break;
          case "error":
            if (typeof ev.remaining === "number") setRemaining(ev.remaining);
            patch(turnId, (t) => ({ ...t, error: ev.message, running: false, status: undefined }));
            break;
        }
      }
    },
    [busy, patch],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  return { turns, ask, stop, busy, remaining };
}

/**
 * 明暗の切り替え。テーマの実体は <html data-theme> に持たせ（layout.tsx の
 * インラインスクリプトが描画前に確定させる）、React はそれを購読するだけにする。
 * effect の中で setState すると初期描画がちらつくうえ lint にも引っかかる。
 */
const THEME_EVENT = "partd-theme";

function subscribeTheme(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

function readTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme() {
  const mode = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);

  const toggle = useCallback(() => {
    const next = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("partd-theme", next);
    } catch {
      // プライベートウィンドウなどで書けなくても動作は続ける
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { mode, toggle };
}
