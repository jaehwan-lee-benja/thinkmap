# 접근/권한 모델 총괄 (ACCESS-MODEL)

> **권한/RLS 를 다루는 코드·마이그레이션을 만들거나 고치기 전에 이 문서를 먼저 본다.**
>
> 이 문서는 ThinkMap 의 권한 모델을 **한 곳에서** 정의하는 허브다. 각 도메인 SPEC
> (SCHEDULE / DASHBOARD / PAYROLL / WORKLOG / IMPERSONATION)은 자기 도메인의 RLS 를
> 기술하되, "전체 권한이 어떻게 생겼고 어디로 가는가"는 이 문서를 참조한다.
>
> 배경: ThinkMap 은 노트앱으로 시작해 업무일지 → 캘린더 → 데일리 → 목표/대시보드 →
> 페이롤로 확장됐다. 그 과정에서 권한 표현이 **3가지 패러다임**으로 분화했다. 이 문서는
> 그 지도를 그리고, **단일 접근(access) 헬퍼로의 점진 수렴**이라는 장기 방향을 명시한다.

---

## 목차

- [1. 권한 주체](#1-권한-주체)
- [2. RLS 헬퍼 인벤토리 (수렴 재료)](#2-rls-헬퍼-인벤토리-수렴-재료)
- [3. 3 패러다임 지도](#3-3-패러다임-지도)
- [4. 장기 방향 — 단일 access 헬퍼로 수렴](#4-장기-방향--단일-access-헬퍼로-수렴)
- [5. 신규 도메인 원칙](#5-신규-도메인-원칙)
- [6. 멤버십 = L1 테넌시 선행 작업](#6-멤버십--l1-테넌시-선행-작업)
- [7. 알려진 예외 / 정정](#7-알려진-예외--정정)
- [8. 수렴 로드맵](#8-수렴-로드맵)

---

## 1. 권한 주체

| 주체 | 판정 | 정의 위치 |
|---|---|---|
| **마스터** | `app_users.role = 'master'` (동적, 이메일 매핑) | `migrate-dynamic-master.sql` → `is_master()` |
| **연결 계정(linked)** | `linked_accounts(primary_email → linked_email, viewer\|editor)` | `create-linked-accounts.sql`, `fix-linked-account-rls.sql` |
| **보드 멤버(member)** | `worklog_board_members(board_id, user_id, role)` | `migrate-step2-members.sql`, `phase07-step2-rls.sql` |
| **공유 수신자(shared)** | `shares(resource, viewer\|editor)` | `create-shares-table.sql` |
| **임퍼소네이션** | 마스터가 `effectiveSession` 으로 대상 계정 관점 전환 | [IMPERSONATION-SPEC.md](./IMPERSONATION-SPEC.md) |

임퍼소네이션은 **권한을 새로 부여하지 않는다** — `auth.uid()` 를 대상 계정으로 바꿔
기존 RLS 를 그 계정 기준으로 평가할 뿐이다. 마스터 민감 데이터(payroll 등)는 *실제 세션*
기준이라 임퍼소네이션 중에는 보이지 않아야 한다.

---

## 2. RLS 헬퍼 인벤토리 (수렴 재료)

아래 헬퍼들은 **버려지지 않는다.** §4 의 단일 access 헬퍼는 이들을 *조합·재사용*하는
방향이지, 갈아엎는 방향이 아니다.

| 헬퍼 | 의미 | 정의 |
|---|---|---|
| `is_master()` | 마스터 전권 | `migrate-dynamic-master.sql:8` |
| `is_linked_account(owner)` | linked + editor | `fix-linked-account-rls.sql:26` |
| `is_linked_account_viewer(owner)` | linked + viewer/editor | `fix-linked-account-rls.sql:12` |
| `can_view_schedule_owner(owner)` | `is_master OR self OR linked(viewer)` | `migrate-create-schedule-events.sql:138` |
| `can_edit_schedule_owner(owner)` | `is_master OR self OR linked(editor)` | `migrate-create-schedule-events.sql:156` |
| `is_board_member_of_page(page_id)` | 그 페이지의 보드 멤버인가 | `phase07-step2-rls.sql:18` |

> `can_*_schedule_owner` 는 사실상 **"마스터/본인/linked 를 한 함수로 합성한" 프로토타입**
> 이다. §4 단일 access 헬퍼가 지향하는 모양에 가장 가깝다.

---

## 3. 3 패러다임 지도

현재 RLS 는 한 `pages` 테이블 위에 **세 패러다임이 겹쳐** 있다. 도메인마다 셋 중 하나를
(때로는 둘을) 쓴다.

```
패러다임 A — 노트 공유형
  모델 : owner(user_id) + shares + linked
  대상 : pages(normal), projects, blocks
  컨셉 : "내 문서를 특정인에게 공유한다"

패러다임 B — 공개형 (업무일지에서 출발)
  모델 : page_type IN ('calendar','daily','schedule') AND 로그인  (pages_*_worklog 절)
         + daily_blocks: visibility='all' OR is_master()
         + (Phase 0.7) daily_blocks UPDATE: OR (visibility='all' AND is_board_member_of_page)
  대상 : 업무일지(calendar/daily), 캘린더 진입(schedule)
  컨셉 : "워크스페이스 안에서는 기본 공개, master 콘텐츠만 가림"
  진화 : '만든 사람' 기준 → '보드 멤버십' 기준으로 이동 중 (§6)

패러다임 C — 마스터 전용
  모델 : is_master() 단일 게이트
  대상 : payroll_sheets, goals, (dashboard 진입 페이지는 pages 기본 is_master 분기로 보호)
  컨셉 : "마스터만 보고 쓴다" (민감/전략 데이터)
  선례 : payroll → goals/dashboard 가 그대로 재사용
```

도메인별 적용 요약:

| 도메인 | 진입 page_type | 데이터 테이블 | 패러다임 | RLS 표현 |
|---|---|---|---|---|
| 노트 | normal | blocks | A | owner+shares+linked |
| 업무일지 | calendar/daily | daily_blocks | B | 공개 절 + visibility + (멤버십) |
| 캘린더/루틴 | schedule | schedule_events 외 | B(진입) + 헬퍼(데이터) | `can_*_schedule_owner` |
| 페이롤 | payroll | payroll_sheets | C | `is_master()` |
| 목표/대시보드 | dashboard | goals | C | `is_master()` |
| 캔버스 | frame/engine | canvas_* | C(진입) + owner | `is_master` + master_id |

---

## 4. 장기 방향 — 단일 access 헬퍼로 수렴

**3 패러다임은 영구 분립이 아니라, 하나의 access 모델로 점진 수렴할 대상이다.**

목표 형태:

```
can_access(resource_owner, resource_visibility, viewer_role, membership) → boolean

  -- 파라미터로 세 패러다임을 모두 표현:
  A(노트 공유형)   = owner + shares/linked 를 viewer_role 로
  B(공개형)        = visibility + membership 으로
  C(마스터 전용)    = is_master() 단락(short-circuit)으로
```

원칙:
- **기존 헬퍼는 수렴 재료다.** `can_*_schedule_owner`(A 합성형), `is_board_member_of_page`
  (멤버십 1차 함수), `is_master`(C 단락)는 단일 헬퍼의 *부품*으로 흡수된다 — 폐기 아님.
- **빅뱅 금지.** 동작 중인 보안 계층을 한 번에 재작성하지 않는다. schedule 의 헬퍼 위임
  방식을 기준점으로, 도메인을 **하나씩** 단일 모델로 재표현한다.
- **새 도메인부터 적용.** 신규 도메인은 처음부터 단일 모델로 짓고, 기존 도메인은
  무중단 점진 이관한다.

---

## 5. 신규 도메인 원칙

> **새 권한 패러다임을 발명하지 않는다. §3 의 3개 중 컨셉에 맞는 것을 재사용한다.**

| 새 도메인의 성격 | 재사용할 패러다임 |
|---|---|
| 사용자가 서로 공유하는 개인 문서 | A (owner + shares/linked) |
| 워크스페이스 안에서 기본 공개되는 협업 데이터 | B (공개/멤버십) |
| 마스터만 다루는 민감/전략 데이터 | C (`is_master()` 단일) |

**선례**: 대시보드(goals)는 새 패러다임을 만들지 않고 **payroll 의 C 패턴을 그대로
재사용**했다 — `can_*_schedule_owner` 재사용을 검토했으나 self/linked 까지 열려 컨셉
(마스터 전용)과 안 맞아 *철회*하고 C 를 택했다. 이 의사결정 과정이 이 원칙의 표준 사례다.
([DASHBOARD-SPEC §6.1](./DASHBOARD-SPEC.md) 참조.)

새 page_type 진입 페이지를 추가할 때 RLS 결정 순서:
1. 마스터 전용인가? → C. `pages` 기본 `is_master()` 분기로 보호. CHECK 제약에만 추가.
   (worklog 공개 절에는 넣지 않는다 — §7.)
2. 워크스페이스 공개인가? → B. `pages_*_worklog` 공개 절에 page_type 추가 + 데이터 RLS.
3. 사적 공유인가? → A.

---

## 6. 멤버십 = L1 테넌시 선행 작업

`worklog_board_members` + `is_board_member_of_page` (Phase 0.7) 로 도입된 **보드 멤버십**
개념은, 단발 기능이 아니라 **향후 L1 테넌시 계층(workspace / members / roles)의 선행 작업**
이다.

- 현재: "보드(데일리 parent 페이지)의 멤버"라는 좁은 범위.
- 방향: `워크스페이스(=마스터의 사이트) → 멤버 → 역할` 이라는 1급 테넌시 모델의 씨앗.
  권한이 `pages.user_id`(만든 사람)가 아니라 **멤버십 + 역할에서 파생**되어야 한다는 원칙
  ([PLAN-daily-carryover-authority.md](../PLAN-daily-carryover-authority.md) **P6**)이 이미
  이 방향을 가리킨다.
- 따라서 멤버십을 확장할 때는 "보드 한정 기능"이 아니라 "테넌시의 일부"로 설계한다
  (예: 멤버십 테이블/역할을 보드 밖 도메인도 참조할 수 있게).

§4 단일 access 헬퍼의 `membership` 파라미터가 이 계층의 진입점이 된다.

---

## 7. 알려진 예외 / 정정

- **"새 page_type → CHECK + worklog RLS 3종 동시 확장" 규칙은 공개(B) page_type 한정**
  이다. payroll·dashboard 같은 **마스터 전용(C)** 은 의도된 예외 — `pages_page_type_chk`
  CHECK 에만 값을 추가하고 worklog 공개 절(`pages_*_worklog`)에는 넣지 않는다. 마스터의
  진입 페이지 INSERT/SELECT 는 `pages` 기본 정책의 `is_master()` 분기로 통과한다.
  (관련: [SCHEDULE-SPEC §14-7](./SCHEDULE-SPEC.md), [DASHBOARD-SPEC §6.2](./DASHBOARD-SPEC.md))
- **`page_type='calendar'` = 업무일지, `page_type='schedule'`/`schedule_*` = 실제 캘린더.**
  명명이 직관과 반대다. 권한 절에서 page_type 목록을 다룰 때 혼동 주의.

---

## 8. 수렴 로드맵

권한 관점의 점진 수렴 단계 (실행 계획이 아니라 방향 지표):

```
1. 표준화(저비용)  — 신규 도메인은 §5 결정 순서를 강제. 소유자 컬럼(owner_user_id)·
                     soft delete(deleted_at)·정책 명명 컨벤션을 신규부터 통일.
        ↓
2. 멤버십 정착     — worklog_board_members 를 "보드 한정"에서 "테넌시 멤버십"으로 일반화
                     검토 (§6). is_board_member_of_page 를 워크스페이스 역할 질의로 확장.
        ↓
3. 단일 헬퍼 도입  — can_access(...) 설계. 신규 도메인부터 적용. 기존은 schedule 을
                     기준점으로 "한 번에 하나씩" 이 헬퍼로 재표현(무중단).
        ↓
4. L1 테넌시 분리  — workspace/members/roles 를 1급 계층으로. pages 의 진입 레지스트리
                     역할을 별도 표면 계층으로 분리(빅뱅, 가치 크나 마지막).
```

> 출처: 2026-06-13 아키텍처 분석(권한 결론). 위 단계는 그 보고서의 "접근 모델 수렴
> (Phase 3)"과 "구조 전환(Phase 4)"을 권한 축으로 옮긴 것.
