import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 모선 테스트(tests/) + 위성 소스 옆 테스트(apps/*/src/**). 위성은 소스 옆에 두는 편이
    // «규칙 파일과 그 판정표가 한 폴더에» 있어 낡을 확률이 낮다. (2026-08-09 자리후 리팩토링 ⑸)
    include: [
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'apps/*/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      // ★모선 소스 옆 테스트(2026-08-14). 이 줄이 없어서 `src/**` 의 테스트는 **한 개도 수집되지 않았다**
      //   — 「테스트를 썼는데 조용히 안 도는」 상태였다(다행히 그때 실재 파일은 0이었다).
      //   위성과 같은 이유로 콜로케이트한다: 규칙 파일과 그 판정표가 한 폴더에 있어야 낡을 확률이 낮다.
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'packages/*/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    environment: 'node',
    globals: false,
  },
})
