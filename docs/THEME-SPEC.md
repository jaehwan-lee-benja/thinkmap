# 테마(라이트/다크) 명세서 — THEME-SPEC

> 상태: **Phase 1 구현(2026-07-12)** — 토큰 core 이관 + 라이트 값 세트 + prefers-color-scheme 기본 + 토글/저장.
> 결정(유저 승인 2026-07-12): (1) 토큰 파일 `packages/core` 단일 소스 (2) Phase 1 먼저 (3) 기본=시스템(prefers-color-scheme)+user_preferences 저장.
> 배경·설계 근거는 [DESIGN-PHILOSOPHY.md](DESIGN-PHILOSOPHY.md)(건조한 스타일)·[MOBILE-DESIGN.md](MOBILE-DESIGN.md) 위에서. UI 색을 만지면 이 문서를 따른다.

## 0. 원칙
- **색은 반드시 시맨틱 토큰(`var(--color-*)`)으로.** 하드코딩 hex/rgba 금지(신규 코드). 토큰이 라이트/다크를 자동 처리한다.
- **토큰 이름은 의미(semantic)로.** `--color-bg-primary`(o) / `--color-gray-800`(x, primitive는 내부용).
- **단일 소스**: `packages/core/src/styles/variables.css`. 모선·위성 5개가 전부 여기서 import. 앱별 색 정의 금지.

## 1. 토큰 구조 (2-계층)
`packages/core/src/styles/variables.css`:
```
:root {
  /* 비색상 토큰(간격·폰트크기·반경·레이아웃·z-index·트랜지션·브레이크포인트·safe-area) — 테마 무관 */
  /* + 색상 토큰 다크 기본값 (다크가 디폴트) */
}
:root[data-theme="light"] {
  /* 색상 토큰 라이트 오버라이드 — 여기만 라이트 값. 나머지(비색상·다크)는 :root 상속 */
}
```
- **다크 = `:root` 기본.** 라이트 = `[data-theme="light"]` 오버라이드 1곳(중복 없음).
- 오버라이드 대상 = 실제로 뒤집혀야 하는 것: `bg-*`·`text-*`·`border-*`·`scrollbar-*` + 강조/상태의 **텍스트 색**(`*-text`, `master-text`·`admin-text`·`text-title`). 반투명 hue 틴트(`*-bg`, `primary-active` 등)는 라이트/다크 공통이라 오버라이드 안 함.
- 솔리드 강조/상태색(`--color-primary`=#646cff, `--color-success`=#4CAF50 등)은 버튼 배경(흰 글씨)/hue로 양쪽 공통 유지.

## 2. 전환 방식
- **`<html data-theme="light|dark">`** 속성으로 전환. JS가 항상 명시값(light/dark)으로 세팅 → CSS는 `[data-theme="light"]` 1블록만 필요(system 해석은 JS가).
- **사용자 설정 = `system | light | dark`** 3택. `system`이면 `matchMedia('(prefers-color-scheme: light)')`로 실제값 해석 + 변경 리스닝.
- **무-플래시(FOUC 방지)**: 각 `index.html` `<head>`에 인라인 스크립트로 페인트 **전** data-theme 세팅(localStorage 읽어). React 로드 전에 이미 올바른 테마.
- **저장 = localStorage `thinkmap-theme`(즉시·오프라인·같은 origin이라 모선+위성 6개 공유) + user_preferences.theme(크로스 디바이스).** 로그인 시 DB값으로 동기, 토글 시 양쪽 기록.
- 헬퍼: `@thinkmap/core` `applyTheme(pref)` / `resolveTheme(pref)` / `initTheme()`.

## 3. 토글 UI
- 모선 `GlobalTopBar`에 테마 토글 1개(system/light/dark 순환 또는 select). 건조한 스타일(아이콘+최소 라벨).
- 같은 origin localStorage 공유라 모선에서 바꾸면 위성도 따라감(위성엔 별도 토글 없이 Phase 1 충분).

## 4. 라이트 값 세트 (핵심 토큰)
| 토큰 | 다크(:root) | 라이트([data-theme=light]) |
|---|---|---|
| bg-primary | #242424 | #ffffff |
| bg-secondary | #1a1a1a | #f4f4f5 |
| bg-hover | rgba(255,255,255,.05) | rgba(0,0,0,.04) |
| bg-active | rgba(255,255,255,.08) | rgba(0,0,0,.06) |
| bg-input | rgba(255,255,255,.03) | rgba(0,0,0,.02) |
| bg-overlay | rgba(0,0,0,.5) | rgba(0,0,0,.4) |
| text-primary | rgba(255,255,255,.9) | rgba(0,0,0,.88) |
| text-secondary | rgba(255,255,255,.7) | rgba(0,0,0,.6) |
| text-tertiary | rgba(255,255,255,.5) | rgba(0,0,0,.45) |
| text-disabled | rgba(255,255,255,.35) | rgba(0,0,0,.3) |
| border-light/medium/strong | white .08/.12/.3 | black .1/.15/.28 |
| primary-text | rgba(100,108,255,.9) | #4f46e5 |
| success-text | rgba(76,175,80,.7) | #2e7d32 |
| warning-text | rgba(255,193,7,.9) | #b45309 |
| danger-text(-strong) | rgba(239,68,68,.7/.8) | #dc2626 |
| amber-text | rgba(245,158,11,.8) | #b45309 |
| master-text / admin-text / text-title | #a78bfa / #818cf8 / #e0e7ff | #7c3aed / #4f46e5 / #4338ca |
| scrollbar-thumb(/hover) | white .3/.5 | black .25/.4 |

## 5. 영향 범위 / Phase
- **Phase 1(이번)**: 위 토큰 구조 + core 이관 + 토글/저장. → `var()`로 색을 쓰는 부분(~1,100회)이 **즉시 라이트 대응**.
- **Phase 2(진행 중)**: 하드코딩 ~1,532색(hex 586 + rgba 946, 26 CSS + 위성)을 토큰으로 이관(파일 단위) + 임시 `@media(prefers-color-scheme)` 블록(Roster/TipTapEditor) 정리. Phase 2 전까진 하드코딩 부분이 라이트에서 다크로 남을 수 있음(점진 개선).
  - **배치1(완료·배포)**: 글로벌 크롬 88건 — Sidebar/TabBar/GlobalTopBar/FavoritesRail/App.css.
  - **배치2(완료·배포)**: 사이드패널/모달 13건 — AdminModal/BackupModal/QuickTodo. (ProjectModal/ShareModal/MemoPanel/GoalCaptureDrawer는 이미 토큰화됨.)
  - **배치3(에디터계열) — 기계적 이관 불가로 판정**: TipTapEditor/TipTapPage/ColumnView/MindMapView(~660색)는 값 치환 배치가 아니라 **설계 과제**다. 이유: 에디터 본문·툴바·메뉴가 `var(--color-bg-editor, #2d2d2d)`를 쓰는데 **`--color-bg-editor`가 정의돼 있지 않아**(폴백 #2d2d2d로 다크 고정) 라이트에서 안 뒤집힘 + 자체 하드코딩 다크 팔레트(Tailwind 슬레이트) + 기본 텍스트 `#e5e7eb` 하드코딩(MindMap/Column). 이 위의 흰-알파 색을 토큰으로 바꾸면 라이트에서 회귀(어두운 글씨/어두운 면). TipTapPage 모바일 하단바 2건만 테마 배경 위라 안전 치환.
- **에디터 라이트모드 = 별도 설계 단계(선행 과제)**: ① `--color-bg-editor`를 variables.css에 라이트/다크 값으로 **정의**, ② 에디터 자체 다크 팔레트를 라이트에서 어떻게 다룰지 결정, ③ 기존 `@media(prefers-color-scheme: light)` 블록 2개(TipTapEditor.css: bubble-menu/색상픽커, block-context-menu/입력)를 data-theme 체계로 통합. 이 3개가 되기 전엔 에디터 색 대량 이관이 회귀를 부른다.

## 6. 수정 전 체크리스트
- [ ] 새 색은 토큰으로. 없으면 variables.css(양 테마 값)에 추가.
- [ ] 라이트/다크 × 360/768/1024/1440 대비(WCAG AA)·잘림 확인.
- [ ] 위성도 core 토큰 import 유지(앱별 색 정의 금지).
