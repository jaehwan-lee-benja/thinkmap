import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import postcssCustomProperties from 'postcss-custom-properties'
import { fileURLToPath } from 'node:url'

// 멤버십 키오스크(Membership) 위성. base=/thinkmap/membership/(gh-pages 하위폴더),
// envDir=레포루트(공유 .env=thinkmap DB=직원 인증용). 회원 데이터는 crm(로컬 RPC 1-hop).
//
// ★운영환경(2026-08-01): CS-273N(KICC POS, Android 5.1.1) + Fully Kiosk Browser.
//   Android 5.1.1 의 System WebView 는 최악의 경우 Chrome 40 대(모듈·옵셔널체이닝·CSS 변수 전부 미지원).
//   WebView 는 Play 로 갱신되면 최대 ~106 이라 실제 버전 편차가 크다 → **최악 가정으로 빌드**한다:
//   ① legacy 플러그인: nomodule ES5 번들 + core-js 폴리필(구형은 이쪽을 실행, 최신은 모듈 번들).
//   ② 모던 청크도 target=es2015 로 낮춤(모듈은 되지만 오래된 WebView 61~79 대비, ?./?? 제거).
//   ③ postcss-custom-properties: var() 사용처마다 정적 폴백을 함께 출력(CSS 변수 미지원 대응).
const tokenSources = [
  fileURLToPath(new URL('./src/components/Kiosk/Kiosk.css', import.meta.url)),   // --md-* (다크 기본)
  fileURLToPath(new URL('./src/components/Kiosk/brand.css', import.meta.url)),   // --brand-*, --mk-font-*
  fileURLToPath(new URL('../../packages/core/src/styles/variables.css', import.meta.url)), // --color-*
]

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 40', 'android >= 5'],
      // 구형 WebView 결손 보강: async/await(regenerator) + fetch(Chrome<42) — supabase-js 가 fetch 사용.
      additionalLegacyPolyfills: ['regenerator-runtime/runtime', 'whatwg-fetch'],
      renderLegacyChunks: true,
    }),
  ],
  css: {
    postcss: {
      // preserve:true → `color:#E3E2E6; color:var(--md-on-surface);` 순으로 출력.
      // 구형=앞의 정적값 사용(다크 기본), 최신=var() 사용(테마 전환 유지).
      plugins: [postcssCustomProperties({ preserve: true, importFrom: tokenSources })],
    },
  },
  build: {
    target: 'es2015',
    cssTarget: 'chrome61', // CSS 최소화 시 최신 문법(#RGBA 등)으로 다시 낮추지 않게
  },
  base: process.env.APP_BASE || '/thinkmap/membership/',
  envDir: '../../',
  server: { host: '0.0.0.0', port: 5178 },
})
