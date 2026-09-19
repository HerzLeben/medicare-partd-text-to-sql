/**
 * Clawd — Claude Code のマスコットを SVG で描いたもの（外部画像に依存しない）。
 * 角ばった胴体・両脇の腕・3本の脚・「> <」の目。色は Claude のテラコッタ。
 * 「Claude Code × Medical app series」の表記に添える小さな印としてだけ使う。
 */
export default function Clawd({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 34"
      width={size}
      height={size * 34 / 40}
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* 胴体と腕 */}
      <path
        fill="#d97757"
        d="M6 2h28v8h5v10h-5v13h-6v-6h-4v6h-8v-6h-4v6H6V20H1V10h5z"
      />
      {/* 目（> <） */}
      <path
        d="M10 9l6 3-6 3M30 9l-6 3 6 3"
        fill="none"
        stroke="#1a1a19"
        strokeWidth="2.4"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export const SERIES_NAME = "Claude Code × Medical app series";
