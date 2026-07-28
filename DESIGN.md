---
version: alpha
name: 사르르목장 (Saruru Farm)
description: 포천 사르르목장 정본 브랜드 디자인 시스템. 어르신 친화·목장 진정성·플랫 라인아트. 웹 UI 토큰(키오스크·대시보드·게임 위성 공유). 인쇄는 프로즈의 인쇄 노트 참조.
colors:
  primary: "#2D4B82"
  primary-dark: "#1F3860"
  secondary: "#3CB44B"
  secondary-dark: "#2E9A3E"
  neutral: "#FCFAF4"
  surface: "#FFFFFF"
  ink: "#40465A"
  slate: "#8C96A8"
  line: "#CED6E4"
  on-primary: "#FFFFFF"
  black: "#111318"
typography:
  display:
    fontFamily: Gmarket Sans
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.15
  h1:
    fontFamily: Gmarket Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
  h2:
    fontFamily: Gmarket Sans
    fontSize: 25px
    fontWeight: 700
    lineHeight: 1.25
  h3:
    fontFamily: Gmarket Sans
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
  body-lg:
    fontFamily: Gmarket Sans
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.55
  body-md:
    fontFamily: Gmarket Sans
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.6
  body-sm:
    fontFamily: Gmarket Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: Gmarket Sans
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.2
  caption:
    fontFamily: Gmarket Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  base: 16px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  gutter: 24px
  margin: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 56px
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 56px
  button-secondary-hover:
    backgroundColor: "{colors.neutral}"
  chip-accent:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.black}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 8px
  chip-accent-hover:
    backgroundColor: "{colors.secondary-dark}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  caption-meta:
    textColor: "{colors.slate}"
    typography: "{typography.caption}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 56px
---

# 사르르목장 · DESIGN.md (정본 브랜드 시스템)

> 정본 성문화. 근거: `사르르목장_brand_manual.ai`(2021·2022) · `DESIGN-SYSTEM.md` · `DESIGN-CRAFT-CANON.md`.
> 위성(키오스크 멤버십·대시보드·게임)이 공유. 토큰은 규범값, 프로즈는 적용 맥락. 값 변경은 supabase/브랜드 정본 절차 준수.

## Overview

사르르목장은 경기 포천의 **실제 목장 카페**다. 브랜드 성격 = **정직·신선·따뜻함**, 그리고 **목장 진정성(진짜 소·오늘의 우유)**. 낙농 클리셰(파스텔·흰색·세리프)를 거부하고 **네이비+그린**을 소유한다.

- **핵심 사용자에 어르신 비중이 높다** → 어르신 친화가 최우선 기본값: **큰 글씨·고대비·단순·명확한 정보 위계**. 장식용 소형 텍스트 지양.
- **톤**: 다정하지만 유치하지 않게. 냉소·공격성 금지(Oatside/Innocent식 온기, Liquid Death 아님).
- **마스코트**: 네이비 라인아트 젖소(트리오: 콘·우유팩·스쿱 모자 / 단일 얼굴 엠블럼). 플랫·단색·균일선. 포즈 라이브러리 `assets/poses/`.
- **워드마크는 opt-in**: 브랜드 노출물(포스터·사이니지·명함·굿즈)만. 기능성 UI(버튼·안내·입력)엔 기본 미적용.

## Colors

팔레트는 **딥 네이비 1 + 채도 높은 그린 액센트 + 웜 뉴트럴**. 그린은 **면적을 적게(액센트)**. 60-30-10(뉴트럴/화이트 60 · 네이비 30 · 그린 10).

- **Primary — Navy (#2D4B82):** 정본 네이비. 제목·핵심 텍스트·주요 액션·라인아트. 최대 대비·신뢰. (구값 #38528a는 폐기)
- **Primary Dark (#1F3860):** 네이비의 hover/pressed·짙은 배경.
- **Secondary — Green (#3CB44B):** 정본 그린. **액센트 전용**(강조·성공·아이콘·칩). ★흰 배경 위 본문 텍스트로 쓰지 않는다(대비 부족).
- **Secondary Dark (#2E9A3E):** 그린 강조의 hover·본문 위 그린 텍스트가 꼭 필요할 때(대형·굵게).
- **Neutral — Cream (#FCFAF4):** 페이지 바탕. 순백보다 부드럽고 목장답게 따뜻.
- **Surface (#FFFFFF):** 카드·입력 표면.
- **Ink (#40465A):** 본문 보조 텍스트(순네이비가 과할 때).
- **Slate (#8C96A8):** 캡션·메타·비활성.
- **Line (#CED6E4):** 보더·구분선.
- **On-Primary (#FFFFFF):** 네이비/그린 위 텍스트.

## Typography

**웹/UI = G마켓산스(Gmarket Sans)** — 본문·제목 공용(Bold=제목·라벨, Medium=본문). 라틴·한글 모두 커버, 렌더 일관.
**인쇄 = 오동통(Sandoll Odongtong) 제목 + G마켓산스 본문** (오동통은 인쇄 전용, 웹 임베드 라이선스 불가 → 웹 토큰엔 미사용).
모듈러 스케일 ≈ 1.25. **어르신 매체는 본문을 body-lg(20px)부터** 시작해 위계 대비를 더 벌린다.

- **Display/H1~H3 (G마켓 Bold):** 목장다운 또렷한 목소리. 한글 특성상 letterSpacing은 최소.
- **Body-lg (20px):** 어르신·키오스크 기본 본문. Body-md(16)는 정보밀도 높은 화면.
- **Label (Bold 15px):** 버튼·칩. Caption(12): 메타·보조.

## Layout

- **그리드**: 데스크톱 고정 최대폭 + 모바일/키오스크 유동. 왼끝 정렬축을 기본으로(스위스), 중앙정렬 남발 금지.
- **간격 리듬**: 8px 기반 스케일(xs4·sm8·md16·lg24·xl40·xxl64). 그룹 사이 여백 > 그룹 내 여백(근접 원리).
- **키오스크(어르신)**: 터치 타깃 ≥ 56px, 넉넉한 패딩(카드 24), 한 화면 1주인공.
- **재단 안전여백(인쇄)**: 가장자리 최소 3mm. 아트워크는 캔버스 엣지에 닿지 않는다.

## Elevation & Depth

**플랫 우선.** 깊이는 그림자가 아니라 **색·면 분리·보더**로. 배경=크림, 콘텐츠=화이트 카드(톤 레이어). 드롭섀도우·글로우·베벨 지양(꼭 필요하면 아주 옅은 1단만).

## Shapes

부드럽지만 과하지 않은 곡률. 기본 라운드 **md(10px)**, 카드 lg(16px), 칩/뱃지 full. 사각과 원의 대비를 의도적으로. rounded 남발 금지(모든 모서리를 둥글리지 않는다).

## Components

- **Button — Primary:** 네이비 배경 / 흰 텍스트 / 라운드 md / 높이 56(어르신 터치). hover·pressed는 primary-dark. 주요 액션 전용.
- **Button — Secondary:** 화이트 배경 / 네이비 텍스트(+네이비 보더) / 동일 사이즈. 보조 액션.
- **Chip — Accent:** 그린 배경 / 짙은 텍스트(black) / full 라운드. 상태·강조 소면적.
- **Card:** 화이트 표면 / 잉크 텍스트 / 라운드 lg / 패딩 24 / 보더 line.
- **Input:** 화이트 / 잉크 / 라운드 md / 높이 56 / 포커스 시 네이비 보더.
> 상태 변형(hover/pressed/focus)은 명도 한 단계 이동(primary↔primary-dark)로 통일. 그린 버튼+흰 텍스트는 대비 미달이라 지양(그린은 칩·아이콘·면 강조).

## Do's and Don'ts

**Do**
- 네이비를 주역으로, **그린은 소면적 액센트**로. 60-30-10 유지.
- 어르신 친화: **큰 글씨·고대비·단순**. 본문은 body-lg부터, 대비 AA 이상.
- 플랫 라인아트·정본 팔레트. 마스코트는 `assets/poses/` 재사용.
- 왼끝 정렬 그리드·여백 존중. 워드마크는 브랜드 노출물에만(opt-in).

**Don't**
- 그린을 흰 배경 본문 텍스트로 쓰지 않기(대비 부족).
- 보라→파랑 그라디언트, 드롭섀도우·글로우 남발(‘AI slop’·촌스러움).
- 멤버십=뱃지+리본+별+동심원 클리셰, 중앙정렬+rounded 남발.
- 구(舊) 네이비 #38528a / 구 그린 #45bc51 사용 금지(정본과 이탈).
- 여백을 장식으로 메우기, 소형 장식 텍스트(어르신 가독 저해).
