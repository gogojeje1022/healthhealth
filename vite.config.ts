import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// GitHub Pages 배포용 base 경로 (저장소 이름과 동일하게 설정)
// 사용자 정의 도메인이나 user.github.io 저장소면 "/"로 변경
const base = process.env.VITE_BASE_PATH ?? "/healthhealth/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "헬스헬스 — 식단·건강 기록",
        short_name: "헬스헬스",
        description: "달력 기반 식단 기록과 AI 건강 분석 — 1인용",
        theme_color: "#10b981",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        lang: "ko",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: `${base}index.html`,
        // 캐시는 자산만, API 호출은 항상 네트워크
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        authTest: resolve(__dirname, "auth-test.html"),
      },
    },
  },
});
