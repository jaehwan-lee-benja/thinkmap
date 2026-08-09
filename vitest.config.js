import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 모선 테스트(tests/) + 위성 소스 옆 테스트(apps/*/src/**). 위성은 소스 옆에 두는 편이
    // «규칙 파일과 그 판정표가 한 폴더에» 있어 낡을 확률이 낮다. (2026-08-09 자리후 리팩토링 ⑸)
    include: [
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'apps/*/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    environment: 'node',
    globals: false,
  },
})
