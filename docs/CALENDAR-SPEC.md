# 캘린더(Calendar) 플랫폼 명세서

> **캘린더 통합 구조(shell + 레이어 + 뷰)를 만들거나 고치기 전에 이 문서를 반드시 확인할 것.**
>
> 이 문서는 ThinkMap 캘린더를 **여러 날짜축 데이터 도메인을 한 표면에 겹쳐 보여주는 플랫폼**으로
> 정의한다. 시간박스 스케줄(`schedule_events`)은 이 플랫폼의 **첫 번째 레이어**일 뿐이며,
> 데일리 인덱스 · 날씨 · 매출 등은 같은 계약을 따르는 **추가 레이어**로 붙는다.
>
> 시간박스 레이어 자체의 상세 명세(데이터 모델·인터랙션·루틴·링크)는
> [SCHEDULE-SPEC.md](./SCHEDULE-SPEC.md) 가 담당한다 — 이 문서의 **하위 레이어 명세**다.
> 권한/RLS 토대는 [ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md) 를 따른다.

---

## 목차

- [1. 배경 — 왜 통합인가](#1-배경--왜-통합인가)
- [2. 핵심 원칙](#2-핵심-원칙)
- [3. 용어 정의](#3-용어-정의)
- [4. 아키텍처 — Shell · 레이어 · 뷰](#4-아키텍처--shell--레이어--뷰)
- [5. 레이어 계약 (contract)](#5-레이어-계약-contract)
- [6. 레이어 카탈로그](#6-레이어-카탈로그)
- [7. 뷰 명세](#7-뷰-명세)
- [8. 접근권한 모델 — 레이어별](#8-접근권한-모델--레이어별)
- [9. 데이터 모델 / 마이그레이션 영향](#9-데이터-모델--마이그레이션-영향)
- [10. 진입 / 배선](#10-진입--배선)
- [11. SCHEDULE-SPEC 과의 관계](#11-schedule-spec-과의-관계)
- [12. Phase 로드맵](#12-phase-로드맵)
- [13. 수정 원칙](#13-수정-원칙)
- [14. 수정 전 체크리스트](#14-수정-전-체크리스트)
- [15. 결정 대기 / 미해결](#15-결정-대기--미해결)

---

## 1. 배경 — 왜 통합인가

통합 전 코드에는 캘린더성 화면이 **둘** 있었다:

| | ① 데일리 인덱스 캘린더 | ② 시간박스 캘린더 |
|---|---|---|
| page_type | `calendar` | `schedule` |
| 컴포넌트 | `CalendarView/CalendarView.jsx` | `Schedule/SchedulePage.jsx` 외 |
| 사이드바 | "업무일지(개발중)" | "캘린더" |
| 본질 | 데일리 페이지 월간 인덱스(존재 마커·todo X/Y·코멘트·날짜클릭→데일리·오래된 todo 정리) | 시간박스 스케줄러(주간/월간/3일, 드래그·루틴·링크) |
| 데이터 | `pages`(parent=calendar) + `daily_blocks` 집계 | `schedule_events`/`_instances`/`_links` |

이 둘은 **데이터 패러다임이 달라** 어느 한쪽이 다른 쪽을 대체하지 못한다. 동시에 사이드바에
캘린더성 항목이 둘이라 사용자가 혼란스럽고, 월간 그리드 UI가 중복 구현돼 있었다.

게다가 앞으로 **날씨·매출(최근 3년 비교)** 등 *날짜에 매달리는 또 다른 도메인*이 계속 들어온다.
"새 데이터를 넣을 때마다 어느 캘린더에 넣을지" 고민하거나 핵심 파일을 매번 고치는 구조는
파편화·회귀 위험이 커진다.

→ 결론: 캘린더를 **단일 화면**이 아니라 **날짜축 집계 플랫폼**으로 재정의한다.
화면 격자(shell)는 데이터 의미를 모르고, 각 데이터 도메인은 **레이어**로 끼워진다.

## 2. 핵심 원칙

1. **Shell 은 데이터 의미를 모른다** — `CalendarShell` 은 시간격자·날짜연산·네비게이션·뷰 전환만
   소유한다. 무엇을 그릴지는 레이어가 결정한다.
2. **데이터 도메인 1개 = 레이어 1개** — 스케줄·데일리·날씨·매출은 각자 자기 테이블/소스·자기 RLS·
   자기 렌더러를 가진 독립 레이어다.
3. **개방-폐쇄(Open/Closed)** — 새 데이터 추가 = 레이어 파일 1개 + 레지스트리 등록 1줄.
   기존 레이어·shell 코드는 건드리지 않는다.
4. **레이어는 호스트 독립적** — 한 레이어의 `renderDaySummary` 는 캘린더 월간 셀에도,
   데일리 페이지 헤더에도 mount 될 수 있다 (예: 날씨를 양쪽에 표시).
5. **뷰도 확장 가능** — 기본 뷰(주간/3일/월간) 외에, 레이어가 자기 전용 분석 뷰를 등록할 수 있다
   (예: "최근 3년 매출 비교" 월간 변형).
6. **접근권한은 레이어가 각자 선언** — 캘린더 진입은 워크스페이스 grant 로 열되, 민감한 레이어
   (매출)는 마스터 기본 + 공유 시 직원 노출. 직원은 *자기에게 공유된 레이어만* 본다.
7. **과설계 금지** — 레이어 3~5개 규모를 전제한다. 무거운 플러그인 프레임워크가 아니라
   가벼운 레지스트리 + 최소 계약까지만.

## 3. 용어 정의

| 용어 | 의미 |
|---|---|
| **Shell** | 시간격자·날짜범위·네비·뷰전환을 소유하는 컨테이너. 데이터 비의존. |
| **레이어(layer)** | 한 날짜축 데이터 도메인. `useData` + 렌더 슬롯 + (선택)뷰를 제공. |
| **뷰(view)** | 격자의 표시 형태. 기본=주간/3일/월간. 레이어가 추가 등록 가능. |
| **day-summary 슬롯** | 월간 셀 / 주간·3일 헤더에 그리는 per-day 요약(배지·막대). |
| **time-axis 슬롯** | 주간/3일 본문 시간축에 그리는 박스(스케줄 전용). |
| **레지스트리(registry)** | shell 에 레이어·뷰를 등록하는 가벼운 목록 + 표시순서·on/off. |

## 4. 아키텍처 — Shell · 레이어 · 뷰

```
CalendarShell ── 시간격자 / 날짜연산 / 네비 / 오늘선 / 뷰 전환만 소유
   │
   ├ [뷰 레지스트리]   주간 · 3일 · 월간(기본)  +  레이어가 등록한 분석 뷰
   │
   └ [레이어 레지스트리]   (표시순서 + on/off 토글 = 설정 모달)
        ScheduleLayer    schedule_events     → time-axis 박스 + 월간 막대
        DailyIndexLayer  pages+daily_blocks  → day-summary 배지(todo/코멘트) + 날짜→데일리
        WeatherLayer*    외부 API(+캐시)      → day-summary 배지(아이콘·기온)   [미래]
        SalesLayer*      sales 집계 테이블    → day-summary 배지 + "3년 비교" 뷰 [미래]
```
\* = 향후 별건. 이번 통합에서는 콘센트(계약·레지스트리)만 깔고 레이어 본체는 추가하지 않는다.

- **렌더 합성**: 한 날짜 셀은 활성 레이어들의 day-summary 렌더 결과를 정해진 순서로 쌓아 그린다.
- **장애 격리**: 한 레이어의 데이터 fetch 실패가 격자/다른 레이어를 깨뜨리지 않는다(레이어별 에러 경계).
- **범위 fetch**: 각 레이어는 shell 이 알려주는 **보이는 날짜 범위**만 자기 소스에서 가져온다(lazy).

## 5. 레이어 계약 (contract)

레이어는 다음을 제공하는 객체다. **모든 슬롯은 선택** — 레이어가 기여하는 표면만 구현한다.
(Phase 1 구현 확정 계약 — 데이터 fetch 는 레이어 훅 내부에서 처리하므로 별도 `useData` 메서드는 두지 않는다.)

```
{
  id:        string                      // 'schedule' | 'daily' | 'weather' | 'sales'
  label:     string                      // 설정 모달 표기명
  access:    'workspace' | 'master' | 'shared'   // [필수] §8 — 레이어 권한 선언
  enabled:   boolean                     // 레이어 ON 여부 (OFF 면 렌더/툴바 null)
  // day-summary — 월간 셀 vs 주간/3일 헤더는 폭·맥락이 달라 슬롯을 분리한다
  renderDayBadges?(date): node           // [선택] 월간 셀 배지 (데일리/날씨/매출)
  renderHeaderBadges?(date): node        // [선택] 주간/3일 헤더 배지 (컴팩트)
  renderTimeAxis?(range): node           // [선택] 주간/3일 본문 박스 (ScheduleLayer 전용)
  views?: [{ id, label, render }]        // [선택] 자기 전용 뷰 등록 (3년 비교 등)
  toolbar?:  node                        // [선택] 미리 렌더된 툴바 노드 (예: 오래된 todo 정리)
  modals?:   node                        // [선택] 레이어 소유 모달 (예: LeftoverManager)
}
```

- **ScheduleLayer 는 격자를 소유하는 1차 레이어** — 별도 슬롯을 노출하지 않고 `Schedule/*`(WeekView/MonthView)가
  격자+시간박스를 직접 렌더한다. 다른 레이어(데일리 등)는 위 day-summary 슬롯으로 그 격자에 **주입(데코레이트)** 한다.
  (= shell 이 빈 격자를 그리고 모든 레이어가 칠하는 완전 일반화는 향후 리팩터 여지. 현재는 schedule=격자주인 + 데코레이터 모델.)
- **`renderDayBadges` 합성 규칙**: 좁은 셀(모바일/월간)에서 넘치지 않게 `flex-wrap` + 셀 `overflow:hidden` 으로
  레이어가 자기 1줄만 책임. 다수 레이어 누적 시 `+N` 축약은 shell 이 강제(향후).
- **재사용**: day-summary 렌더는 캘린더 밖(데일리 페이지 헤더 등)에서도 동일 시그니처로 mount 가능(날씨 레이어 예정).
- **범위**: shell 이 `from`/`to`(현재 뷰가 결정, 둘 다 memo)를 레이어 훅에 넘기고, 레이어는 이 범위 밖을 fetch 하지 않는다.

## 6. 레이어 카탈로그

### 6.1 ScheduleLayer (현재 — SCHEDULE-SPEC)

- 데이터: `schedule_events` / `_instances` / `_links` (상세 = SCHEDULE-SPEC).
- time-axis: 주간/3일 본문 시간박스(드래그·리사이즈·루틴·링크).
- day-summary: 월간 셀 막대(기존 `Schedule/MonthView` 의 막대 표현).
- 뷰: 기본 뷰(주간/3일/월간)를 그대로 사용. 별도 등록 뷰 없음.
- 접근: SCHEDULE-SPEC §4 (self/linked + 마스터, 일정 단위 `is_shared`).

### 6.2 DailyIndexLayer (현재 — 구 CalendarView 흡수)

- 데이터: `pages`(parent_id = calendar 컨테이너) + `daily_blocks` 집계
  (`useCalendarTodoStats`, `useCalendarCommentCounts` 재사용).
- day-summary: 데일리 존재 마커 · todo X/Y · 코멘트 수.
- 인터랙션: 날짜 클릭 → 그날 데일리 페이지 열기(없으면 `ensureDailyPage` 로 생성).
- toolbar: "오래된 todo 정리"(`LeftoverManager`).
- 뷰: 월간이 1차 호스트(구 CalendarView 가 월간 그리드였음). 주간/3일 헤더에도 배지 가능(선택).
- 접근: 기존 daily/pages RLS 그대로 (변경 없음).

### 6.3 WeatherLayer (미래)

- 데이터: 외부 날씨 API. 키 보호 위해 **edge function 경유** 권장 + 캐시 테이블/클라이언트 캐시.
- day-summary: 아이콘 + 기온. 월간 셀 + **데일리 페이지 헤더**에 동일 컴포넌트 재사용.
- 접근: 워크스페이스 공개(민감 X).
- 결정 대기: 매장 위치(좌표), 사용할 API → §15.

### 6.4 SalesLayer (미래)

- 데이터: `sales` 집계 테이블(또는 POS/배치도/급여 파생 뷰).
- day-summary: 당일 매출 금액 배지.
- 뷰: **"최근 3년 매출 비교"** 전용 뷰 등록(월간 격자 변형).
- 접근: **마스터 기본 + 공유 플래그 시 직원 viewer** (§8).
- 결정 대기: 매출 출처/입력 경로, 3년 비교 기준(날짜 vs 요일) → §15.

## 7. 뷰 명세

| 뷰 | 출처 | 비고 |
|---|---|---|
| 주간(week) | shell 기본 | 7컬럼 time-axis. ScheduleLayer 의 1차 호스트. SCHEDULE-SPEC §5.1. |
| 3일(3day) | shell 기본 | 모바일 기본. WeekView 일반화(dayCount=3). |
| 월간(month) | shell 기본 | day-summary 합성의 1차 호스트(데일리·날씨·매출 배지). |
| 분석 뷰 | 레이어 등록 | 레이어 `views[]` 가 shell 본문을 점유. 예: "3년 매출 비교". |

- 모바일 기준은 [MOBILE-DESIGN.md](./MOBILE-DESIGN.md), 시각 스타일은
  [DESIGN-PHILOSOPHY.md](./DESIGN-PHILOSOPHY.md)(건조 스타일) 를 따른다.
- 뷰 전환 UI(툴바)는 shell 소유. 레이어 등록 뷰도 같은 전환 메뉴에 합류.

## 8. 접근권한 모델 — 레이어별

> 토대: [ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md). 워크스페이스 자산 RLS 는
> `can_in_workspace(current_workspace(), 'viewer'|'editor'|'owner')`.

- **캘린더 진입**: 워크스페이스 grant `viewer` 이상이면 shell 진입 가능.
- **민감도는 레이어가 선언** (`access` 필드):
  - `workspace` — 워크스페이스 멤버 누구나(날씨, 데일리).
  - `master` — 마스터 전용 기본(매출).
  - `shared` — 기본 비공개지만 **공유 플래그가 켜진 항목만** 직원 viewer 에 노출.
- 직원이 캘린더를 열면 **자기에게 보이는 레이어만** 렌더된다(RLS 가 0행을 돌려주면 그 레이어는 빈 상태).

| 레이어 | 기본 | 공유 시 | 근거 |
|---|---|---|---|
| Schedule | self/linked + 마스터 | 일정 단위 `is_shared` 만 직원 | SCHEDULE-SPEC §4 (그대로) |
| DailyIndex | 기존 daily/pages RLS | — | 변경 없음 |
| Weather | 워크스페이스 공개 | (민감 X) | — |
| **Sales** | **마스터 전용** | **공유 플래그 → 직원 viewer** | `can_in_workspace` + `is_shared` 패턴 |

원칙(SCHEDULE-SPEC §4.3 계승): **RLS 는 "접근 가능한 모든 것"을 열고, UI 레이어 토글은
"지금 무엇을 볼지"만 정한다.** 레이어 on/off 는 설정 모달에서 토글(스케줄의 다중 owner 필터 모달을
일반화 — `localStorage` 영속).

## 9. 데이터 모델 / 마이그레이션 영향

### 9.1 이번 통합 (Phase 1) — **신규 스키마/마이그레이션 없음**

- `schedule_*` 테이블: 변경 없음.
- 데일리 인덱스: 신규 테이블 없음(`pages` + `daily_blocks` 집계 재사용).
- **`page_type='calendar'` row 는 삭제하지 않는다.** 이유:
  - 모든 데일리 페이지의 `parent_id`(= `board_id`)가 이 row 를 가리킨다.
  - `ensureDailyPage(parentId)`, `daily_section_settings(board_id)`, 이월 파이프라인이 이 앵커에 의존.
  - 삭제하면 데일리 전체가 고아화된다. → **UI 로만 제거하고 컨테이너 row 로 보존**.
- 따라서 데이터 마이그레이션 **불필요**. 통합은 프론트 구조 변경(추가/추출)만으로 달성.
- **컨테이너 최초 생성 주체(미해결)**: 현재 `useDailyIndexLayer.ensureContainer` 는 컨테이너가
  DB 에도 없을 때만 현재 로그인 유저(`user_id`)로 1개 생성한다. 실사용에서는 데일리가 이미 있어
  컨테이너가 존재하므로 거의 트리거되지 않으나, "워크스페이스 단일(마스터 소유) 컨테이너" 제약이
  SPEC 에 없으면 직원이 만든 컨테이너에 데일리가 붙는 multi-container 가 이론상 가능 → §15 결정 대기.

### 9.2 미래 레이어 (별건)

- WeatherLayer/SalesLayer 도입 시 **각자 추가전용 마이그레이션**(`migrate-*.sql`)으로 신규 테이블 +
  레이어별 RLS 를 추가한다. 기존 정책 무수정. 적용은 통합 세션(supabase-guardian → 승인 → 적용).

## 10. 진입 / 배선

- **사이드바**: 캘린더 진입 버튼 **1개**(`page_type='schedule'`). 구 "업무일지(개발중)"
  (`page_type='calendar'`) 버튼 제거.
- **렌더**: `App.jsx` PaneInner 의 `isSchedulePage` 분기에서 `CalendarShell`(현 `SchedulePage` 재정리)을 렌더.
- **`TipTapTestPage.jsx`**: `isCalendarPage` 분기(구 CalendarView 렌더)를 제거. (calendar row 자체는
  데일리 컨테이너로 잔존하므로 page_type 정의·조회 로직은 유지.)
- **pageTypes.js**: `CALENDAR` 상수 **유지**(컨테이너 식별용). `isCalendarPage` 도 데일리 부모 탐색에
  계속 쓰일 수 있으므로 유지.
- **배선 충돌 주의**: 사이드바/App 은 다중 세션 머지 충돌 빈발 지점. 변경 최소화 + 명확히 표기.

## 11. SCHEDULE-SPEC 과의 관계

- `SCHEDULE-SPEC.md` 는 **ScheduleLayer 한 레이어의 상세 명세**로 격하된다(데이터 모델·시간박스
  인터랙션·루틴·링크·Google 동기). 폐기 아님 — 여전히 시간박스 작업의 1차 기준.
- 이 문서(CALENDAR-SPEC)는 그 위의 **플랫폼 계약**(shell·레이어·뷰·레이어별 접근)을 정의한다.
- 충돌 시: 플랫폼 구조(shell/레이어/뷰/접근 합성)는 CALENDAR-SPEC, 시간박스 내부 동작은
  SCHEDULE-SPEC 가 우선.

## 12. Phase 로드맵

| Phase | 범위 | 상태 |
|---|---|---|
| **0** | 현행 파악 + 레이어드 플랫폼 설계(본 문서) | 완료(설계) |
| **1** | `CalendarShell` 추출 + 레이어/뷰 계약 + `DailyIndexLayer` 이관(구 CalendarView 흡수) + 주입 슬롯(`renderDayBadges`/`renderHeaderBadges`) + 레이어 토글(`useEnabledLayers`) + 사이드바 1개 정리 + 구 CalendarView/TipTapTestPage 분기 제거. **마이그 없음** | 완료 |
| 2 | `WeatherLayer` (edge function + 캐시, day-summary, 데일리 헤더 재사용) | 백로그(§15 결정 후) |
| 3 | `SalesLayer` (sales 테이블 + RLS) + "최근 3년 매출 비교" 뷰 | 백로그(§15 결정 후) |
| n | 추가 레이어(근무 인원/목표 진행/재고 알림 등) — 계약 그대로 흡수 | 미정 |

## 13. 수정 원칙

1. **shell 에 데이터 의미를 넣지 않는다** — 도메인 분기(`if layer==='sales'`)가 shell 에 생기면
   레이어로 빼낸다.
2. **새 데이터 = 새 레이어** — 기존 레이어 파일/`MonthView`/`WeekView` 에 분기를 하드코딩하지 않는다.
3. **레이어는 자기 범위만 fetch** — `range` 밖 조회 금지(성능·RLS).
4. **레이어별 RLS** — 새 레이어 테이블은 ACCESS-TIERS `can_in_workspace` 기반 + 필요 시 `is_shared`.
   정책 본문에 JOIN 직접 작성 금지(헬퍼 경유).
5. **스키마 변경은 추가전용 단일 마이그레이션** — 기존 정책 무수정, 적용은 통합 세션.
6. **`window.location.reload()` 금지** — `fetchPages` + `setCurrentPageId` 패턴(SCHEDULE-SPEC §14.6).
7. **calendar 컨테이너 row 를 삭제하지 않는다** — 데일리 앵커(§9.1).
8. **외부 API 키는 클라이언트에 두지 않는다** — 날씨 등은 edge function 경유.

## 14. 수정 전 체크리스트

- [ ] shell 에 특정 데이터 도메인 분기를 넣지 않았는가(레이어로 분리)
- [ ] 새 데이터는 레이어 1파일 + 레지스트리 1줄로 끝나는가(기존 레이어 무수정)
- [ ] 레이어가 보이는 `range` 만 fetch 하는가
- [ ] 레이어별 RLS 가 ACCESS-TIERS(`can_in_workspace`) 기반인가, 새 정책이 추가전용인가
- [ ] 민감 레이어(매출)가 마스터 기본 + 공유 모델을 따르는가
- [ ] calendar 컨테이너 row 를 보존했는가(데일리 고아화 방지)
- [ ] 사이드바/App/pageTypes 배선 변경을 최소화·명시했는가(머지 충돌)
- [ ] 모바일에서 day-summary 배지가 넘치지 않는가(`+N` 규칙)
- [ ] 외부 API 키를 클라이언트에 노출하지 않았는가

## 15. 결정 대기 / 미해결

미래 레이어의 *내부 디테일*은 레이어드 구조 덕에 **나중에 결정해도 설계가 흔들리지 않는다.**
Phase 1(통합)에는 영향 없음.

1. **매출 출처/입력 경로** — POS 연동 / 수기 입력 / 배치도·급여 파생 중 무엇인가
   → `sales` 테이블 스키마와 입력 UI 결정.
2. **날씨** — 매장 위치(좌표) 고정 여부, 사용할 API. 외부 호출은 edge function 경유.
3. **"최근 3년 매출 비교" 기준** — 같은 날짜(월/일) 비교 vs 요일 정렬 비교 → 비교 셀 레이아웃.
4. **레이어 후보 추가** — 근무 인원/목표 진행/재고 알림 등 더 나오면 표시형태(배지/막대/숫자)를
   §5 계약이 커버하는지 재점검.
5. **calendar 컨테이너 소유/단일성** — 데일리 컨테이너 row 를 워크스페이스 단일(마스터 소유)로
   강제할지 결정(§9.1). 강제 시 `ensureContainer` 가 임의 유저로 생성하지 않도록 조정 + 기존
   다중 컨테이너 정리 마이그 검토.
6. **데일리 인덱스 헤더 UX 비대칭** — 월간 셀은 데일리 없는 날에 "+생성"을 노출하지만, 주간/3일
   헤더는 컴팩트 유지를 위해 존재하는 날만 칩 표시(생성 버튼 없음). 의도된 비대칭 — 필요 시 헤더에도
   생성 도입 검토.
