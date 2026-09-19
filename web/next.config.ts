import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // リポジトリ直下に package.json が無いため、ルートを明示して警告を止める
  turbopack: { root: __dirname },
  // Cloud Run 用に依存ごと1ディレクトリへまとめる（イメージを小さくする）
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
