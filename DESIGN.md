---
version: alpha
name: 사르르목장 (Saruru Farm)
description: 포천 사르르목장 정본 브랜드 디자인 시스템. 어르신 친화·목장 진정성·플랫 라인아트. 웹 UI 토큰(키오스크·대시보드·게임 위성 공유). 인쇄는 프로즈의 인쇄 노트 참조.
colors:
  primary: "#2D4B82"
  primary-dark: "#1F3860"
  secondary: "#3CB44B"
  secondary-dark: "#2E9A3E"
  green-text: "#2A7D34"
  dark-bg: "#141A28"
  dark-surface: "#1D2536"
  dark-raised: "#232D44"
  on-dark: "#E7ECF7"
  on-dark-primary: "#BCCCEA"
  on-dark-muted: "#8297C3"
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
    textColor: "{colors.ink}"
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

## 이 파일에 대해 (공개본)

> **브랜드 값 전용 공개본.** 이 저장소는 공개(public)이므로, 이 파일에는 **브랜드 토큰과 적용 지침만** 둔다.
> 정본은 **디자인 도메인의 비공개 저장소**에 있고 이 파일은 그 **사본(미러)**이다.
>
> ★내부 운영 정보는 **여기 두지 않는다** —
> 2026-08-03 에 그 절이 이 공개 저장소로 나갔다가 제거됐다. 값 변경은 정본 절차를 따른다.
>
> ⚠**제거는 현재 시점의 파일에서만 유효하다.** git 이력에는 남아 있고 **force-push 하지 않았다**
> (되감기의 위험이 실익보다 크다). ***커밋 sha 를 아는 사람은 옛 내용을 계속 볼 수 있다*** —
> 이 사실을 「회수 완료」로 덮지 않는다. 회수의 실제 범위 = **앞으로 이 파일을 보는 사람**이다.

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
- **Secondary Dark (#2E9A3E):** 그린 강조의 hover·**대형(18.7px 굵게/24px 이상) 그린 텍스트 전용**. ★소형 본문 금지 — 실측 3.37~3.62:1 로 **AA Large(3:1)만 통과하고 AA(4.5:1)는 어느 표면에서도 미달**(2026-08-03 실측).
- **Green Text (#2A7D34):** ★**소형 텍스트용 그린**(신설 2026-08-03). 정본 그린에서 **색상각·채도 고정, 명도만 하강**해 파생(LCh 색상각 Δ0.2°). 밝은 표면 전수에서 AA 통과 — 흰 5.15 · Cream #FCFAF4 4.93 · 최악 표면 4.80. 성공/완료 등 **상태 텍스트가 소형일 때 여기를 쓴다**.
- **Neutral — Cream (#FCFAF4):** 페이지 바탕. 순백보다 부드럽고 목장답게 따뜻.
- **Surface (#FFFFFF):** 카드·입력 표면.
- **Ink (#40465A):** 본문 보조 텍스트(순네이비가 과할 때).
- **Slate (#8C96A8):** 비활성·대형 라벨·비필수 메타 **전용**(흰 배경 대비 3.0:1 — 작은 본문/캡션엔 부적합, 캡션은 Ink 사용).
- **Line (#CED6E4):** 보더·구분선.
- **On-Primary (#FFFFFF):** 네이비/그린 위 텍스트.

### Dark Mode (신설 2026-08-03 · ★모드는 «축»이다)

라이트 토큰을 그대로 두고 **배경만 뒤집는 것은 다크 모드가 아니다.** 실측(사르르 놀이동산 `privacy.html`,
2026-08-03): 다크 블록이 **배경을 뒤집고 전경 토큰은 0개** 재선언해 **규칙 3개가 AA 미달**로 깨졌다
(h2 **1.78** · `.back` 2.02 · footer 3.25). ⇒ **모드 축을 열면 전경도 «쌍»으로 선언한다.**

> ★**계수 정정 2026-08-03**(game 되뜨기): 최초 등재는 **5건**이었으나 그중 `.note`·본문 링크 2건은
> **CSS 에만 있고 DOM 에 없는 팬텀**이었다. **최악값 1.78 은 `h2` 가 그대로 들고 있어 판정은 살고 계수만 준다** —
> ★그러나 **축의 발견이 옳아도 근거 실물은 팬텀일 수 있다**(아래 검증 규범이 여기서 나왔다).

| 표면 | 라이트 | 다크 |
|---|---|---|
| 페이지 바탕 | Cream `#FCFAF4` | **Dark BG `#141A28`** |
| 카드·섹션 | Surface `#FFFFFF` | **Dark Surface `#1D2536`** |
| 표 머리 등 융기면 | `#F2F5FB` | **Dark Raised `#232D44`** |

**전경 쌍** — 대비는 **선언된 다크 표면 3개 전수**에 대해 적고, 판정은 **전수 최악**으로 한다:

| 전경 역할 | 라이트 | 다크 | `#141A28` | `#1D2536` | `#232D44` | **전수 최악** |
|---|---|---|---|---|---|---|
| 본문 | Ink | **On-Dark `#E7ECF7`** | 14.68 | 12.95 | 11.59 | **11.59 ✓** |
| 제목·링크(네이비 역할) | Navy `#2D4B82` | **On-Dark Primary `#BCCCEA`** | 10.73 | 9.46 | 8.47 | **8.47 ✓** |
| 보조·캡션 | Muted/Slate | **On-Dark Muted `#8297C3`** | 5.93 | 5.23 | 4.68 | **4.68 ✓** |

> ★**Muted 개정 2026-08-03** (`#7C90BA` → `#8297C3`): 구값은 `#141A28`·`#1D2536` 에서만 통과하고
> **같은 표가 정본화한 융기면 `#232D44` 에서 4.28 = AA 미달**이었다. 원인은 값이 아니라 **열 선택** —
> 열 이름이 「최악 표면」인데 실제로 적힌 값은 **중간 표면**이었다(★**라벨이 실측보다 넓은 형태**,
> 오늘 Secondary Dark 산문 결함과 같은 병). 교정값은 **색상각·채도 고정, 명도만 상승**
> (ΔH 0.03° · ΔS 0.00% · V 72.9→76.5). 위계 유지 확인: Primary 8.47 대 Muted 4.68 = **1.81배 간격**.
> ⇒ **제약을 기억하게 하는 대신(「muted 는 raised 위 금지」) 값이 표면 전수에서 성립하게 했다** —
> 정본은 위성 전체가 쓰므로, 조건부 안전은 조건을 잊는 순간 깨진다.

- ★**네이비는 다크에서 그대로 쓸 수 없다** — 색상각·채도를 고정한 채 명도만 올려도 AA 를 만족하는 값이
  **존재하지 않는다**(V=100 까지 미달). 그래서 다크의 네이비 역할은 **Sky 계열로 이관**한다(정본에 이미 있던 색).
- ★**명도만 올리면 위계가 죽는다** — Navy 와 Muted 를 각각 AA 까지 끌어올리면 둘 다 L≈59.5 로 수렴해
  **거의 같은 색이 된다**(색상각 차 1.6°). 다크 대응은 «각 토큰 밝히기»가 아니라 **위계 재배분**이다.
- **적용 규범**: 다크 블록을 쓰는 문서는 위 **쌍 표를 통째로** 가져간다. 배경만 override 하면 안 된다.
- **검증 규범 ⑴ 축**: 대비 측정의 모집단에 **«모드» 축을 반드시 포함**한다(라이트만 재고 통과 선언 금지).
- **검증 규범 ⑵ 표면 전수**: 전경 토큰의 통과 판정은 **선언된 표면 전수의 최악값**으로만 한다.
  한 표면만 적고 「최악」이라 이름 붙이지 않는다(구 Muted 행 실물).
- ★**검증 규범 ⑶ 두 기전을 함께 쓴다** — 대비 모집단 = **⒜선언 규칙 순회 ∧ ⒝그 규칙의 실 타깃 증거**
  (정적 DOM 텍스트 ∨ JS 가 그 노드에 쓰는 지점). **어느 하나도 단독 불충분**이다.
  두 기전의 사각이 **정확히 반대**임이 실측됐다(2026-08-03, design↔game 교차):
  - **⒜단독은 팬텀을 센다** — 선언됐으나 렌더 0. 실물 `privacy.html` 의 `.note`·`.fill` 은
    **CSS 에만 있고 DOM 에 없다**(실 class 3개 · `<script>` 0개). 조사분 5건 중 2건,
    game 자체 조사 11종 중 2종이 여기였다.
  - **⒝단독은 런타임 표면을 잃는다** — `index.html` 을 요소 순회로 재면 **미달 0종**이 나온다.
    실제 미달 9종이 전부 **빈 채 대기하다 JS 가 채우는** 표면(`.nick-msg`·`.hud-value` 등)이라
    텍스트 노드가 없어 안 걸린다.
  ⇒ **같은 기전으로 두 번 재면 어느 쪽이든 통째로 잃는다.** 두 결과가 **일치하면 정보 ≈ 0,
  불일치가 사각의 위치를 지목한다**. (상위 «A ∧ B, 어느 하나도 단독 불충분»
  계열이라 **브랜드 정본인 여기에 등재**한다.)

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
- **브랜딩 각도**: 맛·경험·가족·따뜻함·**'사르르(녹는)' 컨셉**·산정호수 뷰·목장 디저트·2대 목장. (강점 최종은 고객 리뷰 스터디로 확정.)

**Don't**
- ★★**신선·즉시성 각도 금지 (유저 명시 2026-07-29)**: 브랜딩 카피에 **'당일 착유 / 오늘 짠 우유 / 방금 짠 / 오늘 아침 짠'** 류 금지. (※'포장 당일 소진' 같은 **보관 안내**는 신선 각도 아님 — 허용.) → **금지 언어 전체 정본 = `docs/BRAND-DONT-LIST.md`**(위성 포함 참조).
- 그린을 흰 배경 본문 텍스트로 쓰지 않기(green on white 2.7:1 미달). **소형 그린 텍스트가 필요하면 Green Text #2A7D34**(Secondary Dark #2E9A3E 는 대형 전용 — 3.6:1 로 소형엔 미달).
- ★**대비비를 「흰 배경」 하나로만 재고 통과 선언하지 않기** — 모집단은 **그 텍스트가 실제로 얹히는 표면 전수**다(크림·연한 톤이 항상 더 가혹하다). 배경을 안 적은 대비비는 판정으로 쓰지 않는다(단위·모드·모집단 병기).
- ★**그린 배경 위 흰 텍스트 금지**(white on green 2.7:1 미달) → 그린 면엔 **네이비/검정 텍스트**(black on green 6.9:1 ✓). Slate는 작은 본문/캡션 금지(3.0:1).
- 보라→파랑 그라디언트, 드롭섀도우·글로우 남발(‘AI slop’·촌스러움).
- 멤버십=뱃지+리본+별+동심원 클리셰, 중앙정렬+rounded 남발.
- 구(舊) 네이비 #38528a / 구 그린 #45bc51 사용 금지(정본과 이탈).
- 여백을 장식으로 메우기, 소형 장식 텍스트(어르신 가독 저해).
