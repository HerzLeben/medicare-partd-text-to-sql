/**
 * 線画のピクトグラム。外部アイコンライブラリに依存せず、全部 24x24 の viewBox に
 * 太さ 1.8 の線で描く。色は currentColor なので、置いた場所の文字色に従う。
 * 装飾用途なので aria-hidden。意味はいつも隣のラベル文字が担う。
 */
const PATHS = {
  // フィルタ
  filter:      "M3 5h18l-7 8v6l-4 2v-8z",
  calendar:    "M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M3 10h18",
  mapPin:      "M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  stethoscope: "M6 3v6a5 5 0 0 0 10 0V3M10 14v3a5 5 0 0 0 10 0v-3M20 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  pill:        "M10.5 20.5l10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7zM8.5 8.5l7 7",
  users:       "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.9M17.5 13.6A6.5 6.5 0 0 1 21.5 20",
  building:    "M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2",
  hourglass:   "M6 2h12M6 22h12M7 2v4.5a5 5 0 0 0 2 4l3 1.5-3 1.5a5 5 0 0 0-2 4V22M17 2v4.5a5 5 0 0 1-2 4l-3 1.5 3 1.5a5 5 0 0 1 2 4V22",
  sliders:     "M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2M14 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM8 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM18 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0z",
  info:        "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  help:        "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01",
  book:        "M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z",
  x:           "M6 6l12 12M18 6L6 18",
  chevronRight:"M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  // トピック
  trendingUp:  "M3 17l6-6 4 4 8-8M15 7h6v6",
  map:         "M9 3L3 5v16l6-2 6 2 6-2V3l-6 2-6-2zM9 3v16M15 5v16",
  doctor:      "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21a7 7 0 0 1 14 0M19 9v6M16 12h6",
  coins:       "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 6v12M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5",
  // 規模
  receipt:     "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  database:    "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  table:       "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 11h18M9 5v14",
  // 可否
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
  xCircle:     "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6",
  // 回答
  chat:        "M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-5A8 8 0 1 1 21 12z",
  sparkles:    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  lightbulb:   "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
  code:        "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  copy:        "M11 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5 15V5a2 2 0 0 1 2-2h10",
  check:       "M5 12l5 5 9-10",
  download:    "M12 3v12M7 10l5 5 5-5M4 20h16",
  send:        "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  barChart:    "M4 20V10M10 20V4M16 20v-7M22 20H2",
  // 指標
  gauge:       "M12 14l3.5-3.5M4 18a9.5 9.5 0 1 1 16 0",
  clock:       "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  logIn:       "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  logOut:      "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  zap:         "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name, size = 14, className = "", strokeWidth = 1.8,
}: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** データ紹介のトピック（API の topics[].key）に対応する絵。 */
export const TOPIC_ICON: Record<string, IconName> = {
  trend: "trendingUp",
  geo: "map",
  drug: "pill",
  prescriber: "doctor",
  cost: "coins",
};
