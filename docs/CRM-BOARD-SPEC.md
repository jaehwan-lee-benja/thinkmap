# CRM 운영 보드(CRM Board) 기능 명세서

> **CRM 운영 보드 / 지표–투두 연계 관련 코드를 수정하기 전에 이 문서를 반드시 확인할 것.**
>
> 이 문서는 CRM 운영 보드의 핵심 원칙, 화면 구조(2레인·3뷰), 데이터 모델, 지표–투두
> 양방향 연계, 기간 축(주/월/년)·월보 내보내기, RLS, 크로스도메인 조율, Phase 로드맵을 정의한다.
> 새 기능 추가/버그 수정 시 이 문서를 먼저 읽고, 변경 결과를 여기에 기록한다.
>
> 관련 문서: [DASHBOARD-SPEC.md](DASHBOARD-SPEC.md)(goals·집계 원칙),
> [WORKLOG-SPEC.md](WORKLOG-SPEC.md)(daily_blocks·todo 규격),
> [ACCESS-TIERS-SPEC.md](ACCESS-TIERS-SPEC.md)(권한),
> [crm-archive/ENGINE-HANDOFF.md](../../crm-archive/ENGINE-HANDOFF.md)(CRM 지표 페이로드).

---

## 목차

- [1. 핵심 원칙](#1-핵심-원칙)
- [2. 용어 정의](#2-용어-정의)
- [3. 화면 구조 — 2레인 · 3뷰](#3-화면-구조--2레인--3뷰)
- [4. 데이터 모델](#4-데이터-모델)
- [5. 지표 ↔ 투두 양방향 연계](#5-지표--투두-양방향-연계)
- [6. 기간 축 & 월보 내보내기](#6-기간-축--월보-내보내기)
- [7. RLS / 라우팅 / 배선](#7-rls--라우팅--배선)
- [8. 크로스도메인 조율 (engine-metrics)](#8-크로스도메인-조율-engine-metrics)
- [9. Phase 로드맵](#9-phase-로드맵)
- [10. 수정 원칙](#10-수정-원칙)
- [11. 결정 필요 / 미확정](#11-결정-필요--미확정)
- [12. 수정 전 체크리스트](#12-수정-전-체크리스트)

---

## 1. 핵심 원칙

CRM 운영 보드는 **월보(주간·월간·연간) 중심의 지표 관리**와, 그 지표에서 파생되는
**투두·우선순위**를 하나의 화면에서 다룬다. 원칙 6가지:

1. **정본 테이블을 복사하지 않는다** — 투두는 `daily_blocks`, 목표는 `goals`가
   single source of truth. 보드는 이들을 **읽어서 나란히 놓고 집계**만 한다.
   (DASHBOARD-SPEC 핵심원칙 1과 동일.)
2. **두 레인은 독립적이면서 연결된다** — 지표 레인과 투두 레인은 각자 자기 정본에 살고,
   보드는 둘 사이의 **연결 링크만** 별도 저장(`board_todo_links`). 링크 제거해도 원본 무손상.
3. **기간이 1급 축** — 주/월/년 세그먼트가 두 레인 집계를 함께 제어한다. "월보"는
   월 모드에서의 지표+목표+투두 요약이다.
4. **뷰 모드로 비중을 조절** — 균형/지표 집중/투두 집중. 데이터는 그대로, 무엇을 크게
   볼지만 바뀐다.
5. **마스터 전용** — CRM 재무 지표를 담으므로 dashboard/payroll과 동일하게
   `is_master()` 단일 게이트. 보드 진입(사이드바·라우팅)도 비마스터에게 숨긴다.
   투두 레인도 이 보드 안에서는 마스터 전용으로 통일(유저 결정 2026-07-20).
6. **사이트 비대화 방지** — 보드 페이지는 `React.lazy` 코드 스플리팅. 무거운 차트
   라이브러리 없이 순수 CSS/div(막대·스파크라인). 지표는 진입 시점 lazy 조회.

---

## 2. 용어 정의

| 용어 | 의미 |
|---|---|
| **운영 보드** | page_type `crmboard` 진입 화면. 지표 레인 + 투두 레인 2축. |
| **지표 레인** | CRM 월지표 + goals 진행률 + 루틴/매출 집계를 보는 패널. |
| **투두 레인** | `daily_blocks`(is_todo)를 우선순위순으로 보는 패널. **P1 스코프 = 마스터 본인 `daily_blocks`만**(`user_id = self`). 팀 전체 CRM 투두 집계로의 확장은 P3 연결 설계와 함께 후속 결정. |
| **뷰 모드** | 균형 / 지표 집중 / 투두 집중 — 두 레인의 화면 비중. |
| **기간** | 주간/월간/연간. 두 레인 집계 범위를 함께 제어. |
| **월보** | 월 모드의 지표+목표+완료 투두 요약. 화면 + 내보내기(PDF/이미지). |
| **연결 링크** | 투두 ↔ 지표(또는 goal) 연결. `board_todo_links` 1행. |

---

## 3. 화면 구조 — 2레인 · 3뷰

```
┌─ 운영 보드 ──────── [주][월][년]  ◀ 2026-07 ▶ ── [뷰: 균형|지표|투두]  ⭳내보내기 ┐
│  ┌── 지표 레인 ──────────┐   ┌── 투두 레인 ──────────────┐                     │
│  │ CRM 방문·경험·결정·단골 │   │ ▸ 우선순위순 투두          │                     │
│  │ 매출/객단가 스파크라인   │   │  □ 할일  ↳연결지표          │                     │
│  │ 목표 진행막대            │   │  ☑ 완료                    │                     │
│  │ [+ 이 지표로 할일]       │   │                            │                     │
│  └─────────────────────────┘   └────────────────────────────┘                    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**뷰 모드 3종** (툴바 토글):
- **균형**: 지표 레인 + 투두 레인 나란히(데스크톱 2열, 모바일 1열 세로).
- **지표 집중**: 투두 레인 접힘. 지표 전폭 = 월보 프린트/PDF 대상 레이아웃.
- **투두 집중**: 지표는 상단 미니바(핵심 수치 + 증감 화살표)로 축소, 투두가 화면 대부분.

**컴포넌트 구조(예정)**:
```
src/components/CrmBoard/
  CrmBoardPage.jsx       — 컨테이너(툴바 + 뷰모드 + 두 레인 오케스트레이션). session prop.
  MetricsLane.jsx        — 지표 레인(CRM 카드 + goals 진행 + 매출 스파크).
  TodoLane.jsx           — 투두 레인(daily_blocks 우선순위 렌더 + 연결 표시).
  PeriodNav.jsx          — 주/월/년 세그먼트 + 기간 네비.
  MonthlyReportExport.jsx— 월보 내보내기(P4).
  crmBoardUtils.js       — 집계/기간 계산(순수).
  CrmBoard.css           — var(--color-*) 토큰 재사용(THEME-SPEC).
src/hooks/
  useCrmMetrics.js       — crm_metrics 조회(기간 필터).
  useBoardTodos.js       — daily_blocks(is_todo) + board_todo_links 조인 조회.
```
> ※ (결정됨 2026-07-20) **모선 page-scoped 채택** — dashboard/backoffice와 동일 모델.
>   satellites.jsx 미등록, `App.jsx`에서 `React.lazy`로 모선 내부 코드 스플리팅. (§7)

---

## 4. 데이터 모델

| 테이블 / 자산 | 역할 | 상태 |
|---|---|---|
| `daily_blocks` | 투두 정본(is_todo/todo_checked/todo_status). 그대로 사용. | 재사용 |
| `goals` | 목표·진행률. period 주/월/년 이미 지원. | 재사용 |
| `crm_metrics` (신규) | 월별 CRM 지표 스냅샷(engine-metrics/v2 적재). | 조율(§8) |
| `board_todo_links` (신규) | 투두 ↔ 지표/목표 연결 + 우선순위. | 신규 |
| page_type `crmboard` | 보드 진입점. | 신규 |
| Edge `engine-metrics-sync` | crm 엔드포인트 호출 → crm_metrics 적재. | 조율(§8) |

### 4.1 crm_metrics (신규 — 확정, `migrate-create-crm-metrics.sql`)

engine-metrics/v2(R8/R9 키셋) 페이로드를 월별 raw로 적재. **마케팅 엔진 캔버스와 원천 공유**(단일 적재·다중 뷰).
소유=tmcrm, 적용=seat 경유(§8). ★2026-07-23 정렬: region_key `visitor`→`unregistered`, business `퍼널이익` 폐기.
```
ym              text        NOT NULL   -- 'YYYY-MM'
region_key      text        NOT NULL   -- CHECK 8종(아래)
metric          text                   -- 표시용 라벨
value           numeric                -- 월값 (NULL=데이터 없음; application/target_pool)
extra           jsonb       NOT NULL DEFAULT '{}'
generated_month text                   -- 스냅샷 payload 의 최신월
updated_at      timestamptz NOT NULL DEFAULT now()
PK (ym, region_key)
CHECK region_key IN (unregistered,experience,decision,retention,fan_pool,application,target_pool,business)
```
- `extra`: retention → `{총단골, 활성단골율}`, business → `{매출,객단가,단골총마진,관리비,임대료,원재료율}`,
  application/target_pool → `{note}`.
- 적재 = `upsert(onConflict 'ym,region_key')` — sync Edge 가 매월 24개월치 재생성 적재해도 멱등.
- RLS: `crm_metrics_master_all` FOR ALL `USING/WITH CHECK is_master()`. service_role(Edge)만 우회.
- 캔버스(apps/canvas)는 region 매핑해 읽고, 운영 보드는 직접 읽는다.

### 4.2 board_todo_links (신규)

투두와 지표(또는 goal)의 연결. 원본 복사 금지 — 링크만.
```
id            uuid PK
todo_block_id uuid NOT NULL   -- daily_blocks.block_id 참조. FK ON DELETE CASCADE
                              --   (투두 삭제 시 링크도 사라짐 — 원본 무손상 원칙2와 일관)
link_type     text NOT NULL CHECK IN ('metric','goal')
metric_key    text            -- link_type='metric': region_key 등
goal_id       uuid            -- link_type='goal': goals.id
priority      integer NOT NULL DEFAULT 0   -- 수동 우선순위(P1)
created_by    uuid
created_at    timestamptz
deleted_at    timestamptz     -- soft delete
-- link_type 상호배타 강제(고아 링크 방지):
--   CHECK ((link_type='metric' AND metric_key IS NOT NULL AND goal_id IS NULL)
--       OR (link_type='goal'  AND goal_id   IS NOT NULL AND metric_key IS NULL))
```
RLS: `is_master()` 단일 게이트(핵심원칙 5 — access-tiers 워크스페이스 owner 기대치와 정합).
FK `ON DELETE CASCADE` + link_type XOR CHECK 포함. — 마이그 확정 시 supabase-guardian 재검수.
(위 제약들은 supabase-guardian 설계 리뷰, 2026-07-20 반영.)

---

## 5. 지표 ↔ 투두 양방향 연계

- **지표 → 투두**: 지표 카드의 `[+ 이 지표로 할일]` → `quickTodoOps.insertTodoIntoSection`로
  오늘 데일리에 todo 생성 + `board_todo_links(link_type='metric')` 1행. 투두 밑에 `↳연결지표` 표시.
- **투두 → 지표/목표**: `TodoPicker` 패턴(Schedule의 것 참고)을 "지표/목표에 연결"로 확장.
  goal 연결은 기존 `goals.metric_source='todo_completion'` 진행률 계산과 정렬(DASHBOARD-SPEC §4).
- **표시 규칙**: 투두 레인 → 연결지표 배지. 지표 레인 → 관련 투두 개수/미완료 수.
- 연결은 `board_todo_links`에만 저장. 링크 삭제해도 투두·지표 원본 무손상(핵심원칙 2).

---

## 6. 기간 축 & 월보 내보내기

- **기간 세그먼트(주/월/년)**: 두 레인 집계를 함께 제어. DASHBOARD-SPEC §9.2(주차→월/범위
  확장 후속)와 정렬 — 가능하면 공용 기간 유틸로 수렴.
- **월보(월 모드)**: 그 달 CRM 지표 스냅샷 + 달성 목표 + 완료 투두 요약을 한 화면에.
- **내보내기(P4)**: "지표 집중" 뷰를 프린트/PDF 레이아웃으로. 무거운 라이브러리 지양 —
  우선 `window.print()` + 프린트 전용 CSS, 이미지화는 후속 검토.

---

## 7. RLS / 라우팅 / 배선

- **RLS**: `crm_metrics`·`board_todo_links` = `is_master()` 단일 게이트(payroll/dashboard 선례).
  page_type `crmboard`는 pages CHECK만 확장(마스터 전용 진입 — worklog 공개 절 미포함).
- **진입 UI 가드**: 사이드바 버튼 `{isMaster && …}`, App.jsx 분기에서 `!isMaster` 거부 화면.
  `window.reload` 금지(SCHEDULE-SPEC §11.2).
- **배선 파일**(P1 확정 — 모선 page-scoped): `src/utils/pageTypes.js`(`PAGE_TYPES.CRMBOARD`·
  `isCrmBoardPage`·`INDEPENDENT_PAGE_TYPES`·`MASTER_ONLY_PAGE_TYPES` 등록), `src/App.jsx`
  (lazy import + `isCrmBoardPage` 마스터 전용 분기), `src/components/Sidebar/Sidebar.jsx`(진입 블록).
  page-scoped라 `src/config/satellites.jsx`에는 **미등록**(위성 아님).
- **사이트맵 노출**: CRM 보드는 page-scoped 마스터 전용이라 P1에서는 백오피스 사이트맵
  (`siteNodesSeed.js`)에 **미등록**(위성 URL이 없음). dashboard는 전례상 등록돼 있으나, CRM 보드는
  진입이 사이드바 버튼 단일 경로라 사이트맵 노출은 후속 필요 시 판단(§11).

---

## 8. 크로스도메인 조율 (engine-metrics)

- CRM engine-metrics 적재는 **마케팅 엔진 캔버스**(기존 thinkmap 세션 담당)와 원천이 같다.
  → **원천 테이블(`crm_metrics`) + sync Edge(`engine-metrics-sync`)를 공유**해 중복 적재를 피한다.
- crm Edge: `POST https://rstazttwlghsorpzsugy.supabase.co/functions/v1/engine-metrics`,
  헤더 `x-api-key: <ENGINE_API_KEY>`(crm-archive/.env, 코드/mailbox에 값 미기재). payload=engine-metrics/v2(24개월).
- **v2 정렬(2026-07-23, ENGINE-HANDOFF v2 / crm R8·R9)**: region `visitor`→`unregistered`(미등록), business `퍼널이익` 폐기,
  schema 검증 `engine-metrics/v2`. v2 `regions` 뷰는 v1과 구조 호환(`.series`/`retention.extra` 유지)이라 region 기반 파서 그대로.
  ※ 멤버십 독립 레이어·`rows[]` raw 소비·대시보드 "거의 같게" 치환은 별도 트랙(v2 대시보드, 후속).
- **소유·마이그·배포는 기존 thinkmap 세션(seat)이 단일 창구**(도메인 규약). tmcrm은 SQL/함수
  설계 → seat에 요청 → guardian+유저승인 → seat 적용.
- **결정됨(2026-07-20)**: 원천 1개 공유(`crm_metrics`) 채택, 소유=tmcrm. 캔버스는 region 매핑해
  읽고 운영보드는 직접 읽음(단일 적재·다중 뷰). 시크릿 `ENGINE_API_KEY`는 sync Edge env에만
  (유저 세팅, 값=`crm-archive/.env`). 재무숫자는 서버사이드만(브라우저 미노출).
- **구현 자산**: `migrate-create-crm-metrics.sql`(테이블+마스터전용 RLS),
  `supabase/functions/engine-metrics-sync/index.ts`(JWT+is_master 게이트→crm 호출→upsert),
  `useCrmMetrics.js`+`MetricsLane.jsx`(렌더+새로고침). 적용 게이트: guardian→유저승인→seat 배포+마이그.

---

## 9. Phase 로드맵

| Phase | 범위 | 상태 |
|---|---|---|
| **P1** | page_type `crmboard` 배선 + 2레인 셸 + 뷰모드 토글(균형/지표/투두) + 기간 축(주/월/년, 투두 레인에 적용) + 투두 레인(daily_blocks 읽기, 마스터 본인, 수동 우선순위) | 완료 |
| P2 | 지표 레인(crm_metrics 렌더 + 새로고침) + crm_metrics 마이그 + engine-metrics-sync Edge (기간 축은 P1 유틸 재사용) | 코드 완료 · 적용 게이트 대기 |
| P2b | goals 진행률 카드를 지표 레인에 결합(useGoals/goalUtils 재사용) | 예정 |
| P3 | 지표↔투두 양방향 연결(board_todo_links) + 레인 간 상호 표시 | 예정 |
| P4 | 월보 내보내기(프린트/PDF) | 예정 |
| 후속 | 우선순위 자동 부각(지표 이상치), 매출 깊이 확장(sales-live 연동), 멤버 개방 검토 | 백로그 |

---

## 10. 수정 원칙

1. 투두·목표 데이터는 정본 테이블에만 쓴다. 보드는 읽기 + 링크만.
2. 지표 적재는 §8 조율 창구(기존 thinkmap 세션)를 거친다. tmcrm이 직접 마이그·배포하지 않는다.
3. 색은 `var(--color-*)` 토큰만(THEME-SPEC, 하드코딩 금지). 건조 스타일(DESIGN-PHILOSOPHY).
4. 마스터 전용 가드는 UI + RLS 양쪽에(진입 버튼 숨김 + 정책). 한쪽만 막지 않는다.
5. 머지·배포는 기존 thinkmap 세션을 통한다(to-thinkmap). tmcrm은 feat/crm-board-todo에서 작업.

---

## 11. 결정 필요 / 미확정

- (결정됨 2026-07-20) 매출 = 월 단위로 시작, 향후 조정. 우선순위 = 수동부터, 자동 부각은 후속. 지표·보드 = 마스터 전용.
- (결정됨 2026-07-20) 그릇 = **모선 page-scoped**(위성 앱 아님) — dashboard/backoffice 동일 모델(§3·§7).
- (조율 중) `crm_metrics` 최종 스키마 + sync Edge 소유/형태 — §8, to-thinkmap 회신 대기.
- (미정) 투두 레인 스코프 확장 — P1은 마스터 본인만. 팀 전체 CRM 투두 집계는 P3와 함께 결정.
- (미정) 백오피스 사이트맵(`siteNodesSeed.js`) 등록 여부 — P1 미등록. 필요 시 후속.
- (미정) 월보 내보내기 형식(프린트 CSS vs 이미지화) — P4.

---

## 12. 수정 전 체크리스트

- [ ] 정본 복사 금지 지켰나(투두=daily_blocks, 목표=goals, 지표=crm_metrics 읽기).
- [ ] 마스터 가드 UI+RLS 양쪽 확인.
- [ ] 색 토큰만 사용(하드코딩 없음), 건조 스타일·모바일 기준 준수.
- [ ] 지표 적재/마이그/배포는 §8 조율 창구 경유.
- [ ] 배선 4파일(pageTypes/App/Sidebar/+satellites) 정합.
- [ ] 머지 요청은 to-thinkmap 경유.
