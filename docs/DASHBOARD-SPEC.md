# 통합 대시보드(Dashboard) 기능 명세서

> **대시보드/목표(goals) 관련 코드를 수정하기 전에 이 문서를 반드시 확인할 것.**
>
> 이 문서는 통합 대시보드와 목표(goals) 레이어의 핵심 원칙, 데이터 모델, 진행률
> 계산 규칙, RLS, Phase 로드맵, 수정 원칙을 정의한다.
> 새 기능 추가/버그 수정 시 이 문서를 먼저 읽고, 변경 결과를 여기에 기록한다.
> 캘린더/루틴 데이터를 다루므로 [SCHEDULE-SPEC.md](SCHEDULE-SPEC.md) 도 함께 본다.

---

## 목차

- [1. 핵심 원칙](#1-핵심-원칙)
- [2. 용어 정의](#2-용어-정의)
- [3. 데이터 모델](#3-데이터-모델)
- [4. 진행률 계산 규칙](#4-진행률-계산-규칙)
- [5. UI / 컴포넌트 구조](#5-ui--컴포넌트-구조)
- [6. RLS / 라우팅](#6-rls--라우팅)
- [7. Phase 로드맵](#7-phase-로드맵)
- [8. 수정 원칙](#8-수정-원칙)
- [9. 알려진 제약 / 결정 필요 항목](#9-알려진-제약--결정-필요-항목)
- [10. 수정 전 체크리스트](#10-수정-전-체크리스트)

---

## 1. 핵심 원칙

대시보드는 루틴·시간 / 자산 / 체력 / 사업체 네 영역 위에 **목표(goals) 레이어**와
**통합 조회 화면**을 올린 것이다. 원칙은 4가지:

1. **기존 도메인 테이블이 single source of truth** — 범용 entries 테이블을 새로
   만들어 데이터를 복사하지 않는다. 대시보드는 기존 테이블(schedule_events /
   schedule_event_instances / daily_blocks …)을 **읽어서 집계만** 한다.
2. **목표는 다섯 번째 도구가 아니라 영역 전체에 걸치는 층** — `goals` 는 진행률을
   저장하지 않는다. `metric_source` + `metric_filter` 로 기존 데이터를 "가리키고",
   진행률은 **조회 시점에 클라이언트**(`goalUtils.js`)에서 계산한다.
3. **기존 컨벤션을 그대로 따른다** — owner_user_id 귀속, soft delete(`deleted_at`),
   pages 의 page_type 단일 row 진입 패턴, 사이드바 버튼 패턴.
4. **루틴 펼침은 재구현 금지** — 루틴 회차 집계는 `routineUtils.expandRoutine`
   단일 chokepoint 를 import 해서 재사용한다 (타임존 정규화 — SCHEDULE-SPEC §14-3).
5. **마스터 전용 기능** — 이 버전의 대시보드/목표는 "마스터가 운영하는 큰 사이트 +
   초대된 멤버는 일부 기능만" 모델이다. 따라서 **payroll 과 동일하게** goals 는
   `is_master()` 전용 RLS, 대시보드 진입(사이드바 버튼·라우팅)도 비마스터에게 숨긴다.
6. **사이트 비대화 방지** — DashboardPage 는 `React.lazy` 코드 스플리팅으로 분리해
   대시보드를 열지 않는 세션엔 번들 부담이 없다. 새 무거운 차트 라이브러리는 쓰지
   않고(순수 CSS/div 막대·매트릭스), 데이터 집계도 **진입 시점 lazy 조회**다.

---

## 2. 용어 정의

| 용어 | 의미 |
|---|---|
| **목표(goal)** | `goals` row. 한 영역의 측정 가능한 목표 정의. 진행률 미저장. |
| **measure source** | `metric_source` — 진행률을 무엇으로 잴지(routine/todo/manual). |
| **measure filter** | `metric_filter` jsonb — 집계 대상 지정(event_id / page_id). |
| **period** | 목표 측정 주기(daily/weekly/monthly/quarterly/yearly/once). |
| **위젯(widget)** | 대시보드 그리드의 한 칸. v1 은 3종(목표/루틴 매트릭스/투두 추이). |

---

## 3. 데이터 모델

### 3.1 goals — 목표 정의 (`migrate-create-goals.sql`)

```
id              uuid PK
owner_user_id   uuid NOT NULL → auth.users(id) ON DELETE CASCADE
domain          text NOT NULL CHECK IN ('routine','asset','fitness','business','general')
title           text NOT NULL DEFAULT ''
description     text
metric_source   text NOT NULL CHECK IN ('routine_completion','todo_completion','manual')
metric_filter   jsonb NOT NULL DEFAULT '{}'   -- routine: {"event_id"}, todo: {"page_id"?}
target_value    numeric NOT NULL
current_value   numeric                       -- metric_source='manual' 일 때만
unit            text                          -- 표시용 ('회','원','kg')
period          text NOT NULL DEFAULT 'weekly' CHECK IN (daily|weekly|monthly|quarterly|yearly|once)
deadline        date                          -- period='once' 용
is_shared       boolean NOT NULL DEFAULT false
sort_order      integer NOT NULL DEFAULT 0
created_at / updated_at  timestamptz          -- updated_at 은 schedule_touch_updated_at 트리거 재사용
deleted_at      timestamptz                   -- soft delete
```

| 인덱스 | 용도 |
|---|---|
| (owner_user_id) WHERE deleted_at IS NULL | 계정별 조회 |
| (is_shared) WHERE deleted_at IS NULL AND is_shared=true | 공유 목표 합산(후속) |

기존 테이블 스키마는 **변경하지 않는다**. 이번 범위는 신규 `goals` 테이블 +
pages CHECK/RLS 확장만.

### 3.2 진행률이 읽는 기존 테이블 (복사 X)

| metric_source | 읽는 테이블 | 키 컬럼 |
|---|---|---|
| `routine_completion` | schedule_events + schedule_event_instances | `event_id`, `instances.completed` |
| `todo_completion` | daily_blocks (is_todo=true) | `page_date`, `todo_checked`, (옵션 `page_id`) |
| `manual` | (없음) | `goals.current_value` |

---

## 4. 진행률 계산 규칙 (v1 — `src/components/Dashboard/goalUtils.js`)

진행률은 **클라이언트에서 조회 시점 계산**한다 (루틴 펼침이 클라이언트 소관이므로
서버 집계보다 일관적).

### 4.1 측정 구간 [from, to)

`goalPeriodRange(goal, now)` 가 goal.period 로 "현재 주기" 구간을 계산한다.
모두 로컬(Asia/Seoul) 기준, 주는 **일요일 시작**(캘린더 `startOfWeek` 재사용).

| period | 구간 |
|---|---|
| daily | 오늘 00:00 ~ 내일 00:00 |
| weekly | 이번 주 일요일 ~ +7일 |
| monthly | 이달 1일 ~ 다음달 1일 |
| quarterly | 분기 첫날 ~ +3개월 |
| yearly | 1/1 ~ 다음해 1/1 |
| once | created_at ~ deadline+1일 (deadline 없으면 오늘까지) |

### 4.2 측정값(current) / 진행 막대

- **routine_completion**: `expandRoutine(event, from, to, instances)` 로 펼친 회차 중
  - `scheduled` = 펼친 회차 수 (cancelled 는 expandRoutine 이 이미 제외)
  - `current` = 그중 `completed=true` 수
- **todo_completion**: 구간 내 daily_blocks(is_todo=true) 중
  (`metric_filter.page_id` 있으면 그 페이지로 한정)
  - `scheduled` = 전체 투두 수, `current` = `todo_checked=true` 수
- **manual**: `current = goals.current_value`

**진행 막대 = `current / target_value`** (작업지시서 §4.2 "현재/목표").
routine/todo 는 추가로 `scheduled`(예정 회차/전체 투두)를 부가 표시한다.
→ §3.3 의 "펼친 회차 수" 분모(달성률)와 §4.2 의 "현재/목표" 막대를 **둘 다** 만족시키는
절충: 막대는 목표 대비, 부가 텍스트로 예정 수를 노출. (§9.1 결정 필요 항목 참조)

---

## 5. UI / 컴포넌트 구조

```
src/components/Dashboard/
  DashboardPage.jsx        — 컨테이너(툴바 + 그리드 + 모달 오케스트레이션). session 만 prop.
  GoalProgressWidget.jsx   — 위젯1: 목표 카드(제목/진행막대/period). 클릭 → 편집 모달. 빈 상태 CTA.
  RoutineMatrixWidget.jsx  — 위젯2: 행=루틴, 열=요일(일~토). 완료=채움(ownerHue), 예정=빈칸, 없음=점.
  TodoTrendWidget.jsx      — 위젯3: 최근 14일 일별 (완료/전체) 막대.
  GoalEditorModal.jsx      — 목표 CRUD 모달(draft 패턴 — 저장 전 DB 무흔적).
  goalUtils.js             — 진행률 계산(순수). expandRoutine 재사용.
  Dashboard.css            — 디자인 토큰(var(--color-*)) 재사용.

src/hooks/
  useGoals.js              — goals 목록 + CRUD(soft delete). v1 본인만.
  useDashboardData.js      — schedule_events(routine)/instances/daily_blocks(todo) fetch + 파생맵.
```

- **레이아웃**: 데스크톱 2열, 모바일(≤768px) 1열. `useIsMobile` 재사용.
- **툴바**: 제목 + 주차 네비(◀ 이번 주 ▶, 라벨 클릭=오늘 주로) + "목표" 추가 버튼.
  주차 네비는 **루틴 매트릭스**가 보는 주를 제어한다. (월/직접선택 범위는 후속 — §9.2)
- **모달**(`GoalEditorModal`): 영역/제목/측정방식/측정대상(루틴 드롭다운=`useDashboardData`
  의 routineEvents)/목표치+단위/주기/마감일(once)/공유. **저장 버튼 전엔 DB 미반영**,
  신규일 때 삭제 버튼 숨김 (EventEditor draft 패턴 — SCHEDULE-SPEC §6.1).

---

## 6. RLS / 라우팅

> 전체 권한 모델과 "패러다임 C(마스터 전용) 재사용" 원칙은 [ACCESS-MODEL.md](./ACCESS-MODEL.md)
> 참조. 아래 goals 의 `is_master()` 단일 게이트는 payroll(패턴 C)을 재사용한 것으로,
> ACCESS-MODEL §5 의 "새 패러다임을 발명하지 않는다" 원칙의 표준 선례다.

### 6.1 goals RLS — 마스터 전용 (`migrate-create-goals.sql`)

**schedule 헬퍼 재사용은 철회했다.** `can_view/can_edit_schedule_owner` 는
self/linked 까지 허용하는데, 대시보드는 마스터 전용(핵심원칙 5)이라 범위가 맞지 않는다.
→ `payroll_sheets` 와 동일하게 `is_master()` 단일 게이트를 쓴다.

| 정책 | 조건 |
|---|---|
| `goals_master_all` (FOR ALL) | USING `is_master()` / WITH CHECK `is_master()` |

`owner_user_id` 컬럼은 귀속/후속 확장(D5)용으로 유지하되 **접근 제어엔 쓰지 않는다.**
(향후 멤버에게 일부 개방 시, 이 정책을 헬퍼 기반으로 완화하면 된다.)

### 6.2 pages 'dashboard' 타입 — CHECK 만 확장 (`migrate-pages-allow-dashboard.sql`)

대시보드 진입 = pages 의 `page_type='dashboard'` row 1개(project_id NULL, 마스터 소유).

**payroll 과 동일한 판단**: 마스터 전용 진입 페이지이므로 worklog **공개** 절
(`pages_*_worklog`)에는 `'dashboard'` 를 넣지 **않는다**. 마스터의 INSERT/SELECT 는
pages 기본 정책("Users can insert/view ... pages")의 `is_master()` 분기로 통과한다.
→ 이 마이그레이션은 `pages_page_type_chk` CHECK 에 `'dashboard'` 만 추가
(기존 값 전부 보존 — payroll 포함). 실제 목표 데이터는 goals 의 is_master() RLS 로 보호.

> 참고: SCHEDULE-SPEC §14-7 의 "CHECK + worklog 3종 동시 확장" 규칙은 **공개**
> page_type(calendar/daily/schedule) 한정이다. payroll·dashboard 처럼 마스터 전용은
> CHECK 만 확장하고 worklog 절은 건드리지 않는 것이 의도된 예외.

### 6.3 진입 경로 + UI 가드 (window.reload 금지 — SCHEDULE-SPEC §11.2)

- **사이드바**: 캘린더 버튼 아래 "대시보드" 버튼(`LayoutDashboard`). **`{isMaster && …}`
  로 감싸 비마스터에겐 버튼 자체가 안 보인다.** 클릭 시 캐시 검색 → DB 조회 →
  없으면 INSERT(1회) → `fetchPages()` → `handlePageSelect()`.
- **App.jsx**: `PaneInner` 분기 `isDashboardPage(pageType)` →
  **`!isMaster` 면 "마스터 전용" 거부 화면**, 마스터면 `<Suspense><DashboardPage/></Suspense>`.
- **코드 스플리팅**: `const DashboardPage = lazy(() => import('./components/Dashboard/DashboardPage'))`.
  → 대시보드 전용 코드/CSS 가 별도 청크로 빠져 메인 번들에서 제외된다.
- `pageTypes.js`: `PAGE_TYPES.DASHBOARD`, `isDashboardPage`, `INDEPENDENT_PAGE_TYPES` 등록.

---

## 7. Phase 로드맵

| Phase | 범위 | 상태 |
|---|---|---|
| **D1** | goals 테이블 + pages 'dashboard' 허용 + DashboardPage 뼈대 + 사이드바 진입 | 완료 |
| **D2** | 목표 CRUD 모달 + 목표 진행률 위젯(routine/todo/manual) | 완료 |
| **D3** | 루틴 달성률 위젯(요일×루틴 매트릭스) + 투두 완료 추이 위젯 | 완료 |
| D4 | 사업체 위젯(payroll/worklog 집계) | 예정 — payroll_sheets 스키마 확인 후 |
| D5 | 자산(asset_snapshots+transactions)·체력(fitness_logs) 테이블 신설 + metric_source 확장 | 예정 — goals 설계는 이미 호환 |

### 후속 확장 시 호환성

- `goals.domain` / `metric_source` CHECK 에 값만 추가하면 D5 의 asset/fitness 가 붙는다.
- `metric_filter` 는 jsonb 라 새 측정 대상 키(snapshot_id 등) 추가에 스키마 변경 불필요.

---

## 8. 수정 원칙

1. **기존 도메인 테이블을 복사하지 않는다** — 항상 읽어서 집계. 새 집계는 `goalUtils`
   또는 위젯 내부 `useMemo` 로.
2. **루틴 회차는 `expandRoutine` 만 사용** — 타임존 정규화 재구현 금지(SCHEDULE-SPEC §14-3).
3. **진행률은 저장하지 않는다** — `goals` 에 progress/percent 컬럼 추가 금지. 조회 시 계산.
4. **schema 변경은 단일 트랜잭션 `migrate-*.sql`** — CHECK/정책은 DROP IF EXISTS 후 재생성.
5. **RLS 는 헬퍼 함수 위임** — 정책 본문에 linked_accounts JOIN 직접 작성 금지.
6. **새 page_type 은 CHECK + worklog RLS 3종 동시 확장** (하나만 풀면 400).
7. **window.location.reload() 금지** — fetchPages + handlePageSelect 패턴.
8. **모달은 draft 패턴** — 저장 전 DB 무흔적, 신규 시 삭제 버튼 숨김.
9. **시간 경계는 로컬(Asia/Seoul) 주=일요일 시작** — 캘린더 `startOfWeek` 재사용.

---

## 9. 알려진 제약 / 결정 필요 항목

### 9.1 진행 막대 분모 — current/target vs current/scheduled (결정 필요)

작업지시서 §3.3 은 routine 분모를 "펼친 회차 수"(달성률)로, §4.2 는 "현재/목표"로
정의한다. v1 은 **막대=current/target**, 부가 텍스트로 scheduled 를 노출하는 절충을
택했다. 사용자가 "주 5회 운동" 같은 목표에서 막대가 달성률(완료/예정)을 보길 원하면
`computeGoalProgress` 의 ratio 기준을 scheduled 로 바꾸면 된다.

### 9.2 대시보드 범위 선택 (이번 주/이번 달/직접) — 부분 구현

v1 툴바는 **주차 네비**(매트릭스 제어)만 제공. 월간/직접 범위 선택과 그에 따른
목표 카드 범위 동기화는 후속. 목표 카드는 각 goal 의 period 기준으로 계산된다.

### 9.3 데이터 범위 — 마스터 본인 데이터

`useGoals` / `useDashboardData` 는 owner=self(=마스터) 의 goals/routines/todos 를
fetch 한다. RLS 는 is_master() 라 마스터가 모든 owner 의 goals 를 볼 수 있지만, v1 UI 는
마스터 본인 것만 보여준다(owner 필터). 멤버 데이터 합산/타 계정 조회는 후속 범위.

### 9.4 todo_completion 페이지 한정 UI 미구현

`metric_filter.page_id` 는 스키마/계산 모두 지원하나, 모달엔 페이지 선택기가 없어
v1 은 **전체 투두** 집계만. PagePicker 연동은 후속.

### 9.5 fetch 범위 비용

`useDashboardData` 는 연초~현재주끝 범위의 instances/todo 를 한 번에 가져온다.
연간 목표 + 매트릭스 양쪽을 커버하기 위함. 데이터가 매우 많아지면 목표 period 별
범위 분할 fetch 로 최적화 검토.

---

## 10. 수정 전 체크리스트

- [ ] 기존 도메인 테이블을 복사하지 않고 읽어서 집계하는가
- [ ] 루틴 회차 집계가 `expandRoutine` 재사용인가 (직접 RRULE 펼침 금지)
- [ ] `goals` 에 진행률을 저장하지 않는가
- [ ] schema 변경이 단일 `migrate-*.sql` 로 분리되었는가
- [ ] 새 page_type 도입 시 CHECK + worklog RLS 3종을 함께 갱신했는가
- [ ] RLS 가 헬퍼 함수(can_view/can_edit_schedule_owner) 위임인가
- [ ] 페이지 진입에서 window.reload 를 쓰지 않았는가
- [ ] 목표 모달이 draft 패턴(저장 전 무흔적)인가
- [ ] 모바일(≤768px) 1열 레이아웃이 동작하는가
- [ ] 본 문서의 [9. 결정 필요 항목] 이 해소되면 해당 섹션을 갱신했는가
```
