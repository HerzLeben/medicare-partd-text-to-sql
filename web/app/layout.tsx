import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medicare Part D × Text-to-SQL — HerzLeben",
  description:
    "米国 CMS の Medicare Part D 処方データ（CY2022–2024、8,000万行超）を、"
    + "自然言語の質問から SQL を生成して探索できる公開デモ。",
};

/** 初回描画のちらつきを防ぐため、CSS より先にテーマと言語を確定させる。 */
const BOOT_SCRIPT = `
try {
  var t = localStorage.getItem('partd-theme');
  document.documentElement.dataset.theme =
    t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var l = localStorage.getItem('partd-lang');
  document.documentElement.lang =
    l || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
