# 캘린더(Schedule) 기능 명세서

> **캘린더 관련 코드를 수정하기 전에 이 문서를 반드시 확인할 것.**
>
> 이 문서는 캘린더(schedule_events) 의 핵심 원칙, 데이터 모델, 인터랙션, RLS,
> Phase 로드맵, 미해결 이슈를 정의한다.
> 새로운 기능 추가나 버그 수정 시 이 문서를 먼저 읽고, 변경 후 결과를 여기에 기록한다.

---

## 목차

- [1. 핵심 원칙](#1-핵심-원칙)
- [2. 용어 정의](#2-용어-정의)
- [3. 데이터 모델](#3-데이터-모델)
- [4. 계정/공유 모델](#4-계정공유-모델)
  - 4.1 기본 분리, 4.2 공유, 4.3 다중 계정 필터, 4.4 마스터 권한, 4.5 owner 시각 구분
- [5. 뷰 명세](#5-뷰-명세)
- [6. 시간박스 인터랙션](#6-시간박스-인터랙션)
- [7. 루틴 (Phase 2)](#7-루틴-phase-2)
- [8. 외부 링크 + 양방향 체크 동기 (Phase 3)](#8-외부-링크--양방향-체크-동기-phase-3)
- [9. Google Calendar 동기 (Phase 5)](#9-google-calendar-동기-phase-5)
- [10. RLS / RPC](#10-rls--rpc)
- [11. 라우팅 / 사이드바 통합](#11-라우팅--사이드바-통합)
- [12. Phase 로드맵](#12-phase-로드맵)
- [13. 알려진 제약 / 미해결 이슈](#13-알려진-제약--미해결-이슈)
- [14. 수정 원칙](#14-수정-원칙)
- [15. 수정 전 체크리스트](#15-수정-전-체크리스트)

---

## 1. 핵심 원칙

캘린더는 **시간박스**를 다루는 시스템이다. 모든 일정은 **owner 계정**에 귀속되며,
**기본 분리 / 명시적 공유 / 마스터 전권** 모델을 따른다. 외부 데이터(투두/페이지/블록)와의 연결은
**양방향 참조**로 표현하고, 체크 상태는 **단일 진실 원천(single source of truth)**
이 아닌 **약결합 동기화(soft sync)** 로 관리한다.

원칙은 다음 7가지로 요약된다:

1. **시간박스가 1급 객체** — 일정 = 시작 시각 + 종료 시각 + 표시 속성. 드래그/리사이즈로 직접 조작 가능해야 한다.
2. **계정 분리가 기본** — 일정은 owner 한 명에게 속한다. 다른 일반 계정에서는 owner 가 명시적으로 공유(is_shared)했을 때만 보인다.
3. **마스터는 전권을 가진다** — `is_master()` 사용자는 owner 와 무관하게 모든 계정의 일정(+인스턴스 체크/이동/취소, 링크)을 조회·생성·편집·삭제할 수 있다. 단순 가시성이 아니라 **편집 권한까지 포함**된다는 점이 일반 linked 계정과의 차이.
4. **계정 가시성은 사용자가 결정한다 — 다중 선택 모델** — 캘린더 사이드 패널에 사용자가 접근 가능한 계정 목록이 체크박스로 표시되며, 체크된 계정들의 일정이 한 화면에 합쳐 표시된다. owner 별로 자동 부여된 hue 가 박스의 좌측 띠로 나타나 누구의 일정인지 한눈에 식별 가능하다.
5. **루틴은 템플릿 + 인스턴스** — 루틴은 RRULE 로 정의된 템플릿이고, 발생한 각 회차는 필요할 때만 인스턴스 row 가 생성된다(체크/이동/취소가 일어났을 때).
6. **연결은 양방향이지만 동기화는 약결합** — 일정과 외부 엔티티는 schedule_event_links 로 양쪽에서 조회 가능하지만, 체크 상태 변경은 sync_check 옵션이 켜진 링크에 한해 한쪽 변경이 다른 쪽으로 전파된다.
7. **Google 은 미래의 확장, 컬럼은 지금 깔아둔다** — Google Calendar 양방향 동기는 Phase 5 작업이지만, schema 에는 처음부터 google_event_id / google_calendar_id / google_etag / google_synced_at 컬럼을 두어 마이그레이션 부담을 없앤다.

---

## 2. 용어 정의

| 용어 | 의미 |
|---|---|
| **이벤트(event)** | schedule_events row. 단발 일정 또는 루틴 템플릿. |
| **인스턴스(instance)** | schedule_event_instances row. 루틴의 한 회차에 대한 override (체크/이동/취소). 필요할 때만 lazily 생성. |
| **링크(link)** | schedule_event_links row. 이벤트(또는 인스턴스) ↔ todo/page/block 참조. |
| **owner** | 이벤트의 소유 계정 (owner_user_id). 편집 권한의 기본 주체. |
| **linked account** | 현재 로그인 사용자가 접근 가능한 다른 owner. linked_accounts 테이블 기반. |
| **공유 일정** | is_shared = true 인 이벤트. linked 계정 전체에서 합쳐 표시됨. |
| **루틴(routine)** | is_routine = true 이고 rrule 이 있는 이벤트. 시간이 흐르며 인스턴스가 발생한다. |
| **시간박스(time box)** | 주간/일간 뷰에서 이벤트를 시각적으로 표현하는 사각형 UI 요소. |

---

## 3. 데이터 모델

### 3.1 schedule_events — 일정 마스터

```
id                  uuid PK
owner_user_id       uuid NOT NULL → auth.users(id)
title               text NOT NULL DEFAULT ''
description         text
color               text NOT NULL DEFAULT '#3b82f6'   -- HEX
start_at            timestamptz NOT NULL              -- UTC 저장
end_at              timestamptz NOT NULL
all_day             boolean NOT NULL DEFAULT false
timezone            text NOT NULL DEFAULT 'Asia/Seoul'
is_shared           boolean NOT NULL DEFAULT false
is_routine          boolean NOT NULL DEFAULT false
rrule               text                              -- RFC 5545. is_routine=true 일 때만 의미.
routine_until       timestamptz                       -- UNTIL 캐시 (검색 가속용)
google_event_id     text                              -- Phase 5
google_calendar_id  text                              -- Phase 5
google_etag         text                              -- Phase 5
google_synced_at    timestamptz                       -- Phase 5
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
deleted_at          timestamptz                       -- soft delete
CHECK (all_day = true OR end_at > start_at)
```

| 인덱스 | 용도 |
|---|---|
| (owner_user_id) WHERE deleted_at IS NULL | 계정별 조회 |
| (owner_user_id, start_at, end_at) WHERE deleted_at IS NULL | 범위 조회 |
| (is_shared, start_at) WHERE deleted_at IS NULL AND is_shared=true | 공유 일정 합산 |
| UNIQUE (google_calendar_id, google_event_id) WHERE google_event_id IS NOT NULL | Google 동기 중복 방지 |

### 3.2 schedule_event_instances — 루틴 회차별 override

```
id                  uuid PK
event_id            uuid NOT NULL → schedule_events(id)
instance_start_at   timestamptz NOT NULL    -- RRULE 펼침의 원본 시작 시각 (override 전)
moved_start_at      timestamptz             -- NULL = 원본 사용
moved_end_at        timestamptz
cancelled           boolean NOT NULL DEFAULT false
completed           boolean NOT NULL DEFAULT false
completed_at        timestamptz
notes               text
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()
UNIQUE (event_id, instance_start_at)
```

**핵심 규칙**: 인스턴스는 **체크/이동/취소가 발생했을 때만** 만든다. 발생 자체는 RRULE 펼침으로 클라이언트가 계산한다. instance row 가 없으면 = 원본대로 미체크 상태로 진행.

### 3.3 schedule_event_links — 외부 엔티티 참조

```
id                  uuid PK
event_id            uuid NOT NULL → schedule_events(id)
instance_id         uuid → schedule_event_instances(id)   -- NULL = 마스터 전체에 적용
target_type         text NOT NULL CHECK (target_type IN ('todo','page','block'))
target_id           uuid NOT NULL
sync_check          boolean NOT NULL DEFAULT true         -- 체크 양방향 동기 여부
created_at          timestamptz NOT NULL DEFAULT now()
UNIQUE (event_id, instance_id, target_type, target_id)
```

| target_type | target_id 가 가리키는 것 |
|---|---|
| `todo` | daily_blocks.block_id 중 is_todo=true 인 row |
| `page` | pages.id |
| `block` | daily_blocks.block_id (일반 블록 — todo 아닌 것 포함) |

---

## 4. 계정/공유 모델

### 4.1 기본 분리 원칙

- 모든 이벤트는 **owner 1명**에 귀속된다 (owner_user_id).
- 다른 계정 사용자는 **자기 owner 가 만든 이벤트만** 본다.
- linked_accounts 에 등록된 사용자(primary)는 linked 계정의 이벤트를 **owner 별로 분리해서** 볼 수 있다.

### 4.2 공유 일정 (is_shared)

- `is_shared = true` 이면 해당 이벤트는 **linked 관계 전체에서 합쳐서** 표시된다 (업무일지 동일 패턴).
- 공유 일정의 owner 는 여전히 1명이고, 편집 권한도 owner 와 editor 권한 linked 만 가진다.
- 공유는 일정 단위 토글이지 캘린더 단위 개념이 아니다.

### 4.3 UI 계정 필터 — 모달 + 툴바 미니 마커

다중 계정 필터는 **설정 모달**로 제공한다. 사이드 패널/좌측 컬럼은 만들지 않는다.
(이전 단일 select 드롭다운 모델은 폐기.)

**툴바 진입점**
- 우측에 `[🟦 🟢 🟣 +N] ⚙️` 형태
  - 색 점들은 현재 ON 인 owner 들의 hue (최대 4개까지 표시, 초과는 `+N`)
  - 색 점 묶음 클릭 = ⚙️ 클릭 = 설정 모달 오픈
- 모달이 열려도 뒤의 캘린더는 즉시 갱신됨 (모달을 닫지 않아도 결과 확인 가능)

**모달 내용**
1. **내 계정** (session.user) — 기본 ON, **OFF 가능** (Q3 = A). OFF 시 본인 일정이 캘린더에서 사라지고 미니 마커에서도 점이 빠짐
2. **linked 계정 N개** — linked_accounts 의 linked_email 마다 1행. 기본 OFF, 사용자가 토글
3. **마스터 전용 — 전체 계정 토글** — `is_master()` 가 true 면 표시되는 특수 항목. ON 하면 시스템의 모든 owner 일정이 추가로 합쳐 표시됨
4. 각 행 좌측에 owner hue 마커 — 색상 범례 역할 (§4.5 와 일치)
5. (Phase 2 이후) 캘린더 기본 색, 알림, RRULE 디폴트 등 다른 캘린더 설정도 이 모달에 모임

**선택 상태 영속화**
- localStorage 에 `schedule.enabled_owners = uuid[]` 키로 저장 (계정 분리 환경이라 user-prefs 테이블 사용은 Phase 4 이후 검토)
- 새 linked 계정이 추가되면 기본 OFF 로 등장

**owner 별 자동 색상**
- 각 owner_user_id 에 결정론적 hue 부여 (uuid → hash → HSL hue 0–360)
- 자기 자신의 owner hue 는 항상 `--color-primary` (혼동 방지)
- 색상 적용 규칙은 §4.5 참조

**0개 체크된 경우**
- "표시할 계정을 선택해 주세요" placeholder 표시 + 모달 자동 오픈
- 본인 OFF 도 허용하므로 이 상태가 합법적으로 발생 가능

**원칙**: DB 레벨 RLS 는 "접근 가능한 모든 것"을 열어주고, UI 다중 필터는 "지금 누구를 볼지" 만 결정한다. 마스터의 "전체 계정 토글" 도 RLS 통과(이미 마스터는 통과)일 뿐, 별도 권한 부여가 아니다.

### 4.4 마스터 권한

`is_master()` = true 인 사용자는:

| 항목 | 권한 |
|---|---|
| 임의 owner 의 schedule_events SELECT | ✓ |
| 임의 owner 의 schedule_events INSERT/UPDATE/DELETE | ✓ |
| 임의 owner 의 routine 인스턴스 체크/이동/취소 | ✓ |
| 임의 owner 의 schedule_event_links 추가/제거 | ✓ |
| 4.3 의 "전체 계정 토글" 표시 | ✓ (마스터만 보임) |

구현:
- RLS 헬퍼 `can_view_schedule_owner` / `can_edit_schedule_owner` 의 첫 분기 `IF is_master() THEN RETURN true` 로 이미 보장됨.
- 추가 정책 불필요.
- UI 는 `useAuth().isMaster` 등 기존 마스터 판별 훅을 활용해 "전체 계정 토글" 노출 여부만 분기.

마스터 편집 시 audit trail (누가 누구의 일정을 바꿨는지 로그)은 Phase 4 이후 별도 검토 — Phase 1.5 범위 아님.

### 4.5 owner 별 시각 구분 규칙

| 위치 | 표현 |
|---|---|
| 박스 좌측 띠 (border-left 3px) | owner hue (auto-hash) |
| 박스 채우기 (fill) | `event.color` (사용자가 EventEditor 에서 고른 색) |
| 박스 hover 시 | tooltip 으로 owner email 표시 |
| 사이드 패널 체크박스 라벨 | "내 일정" / linked_email, 옆에 owner hue 사각 마커 |
| 공유 일정 (is_shared) | 좌측 띠가 double border (기존 규칙 유지) |

owner hue 와 event.color 가 시각적으로 다를 수 있어도 의도된 분리:
- owner hue = "누구의 것인가"
- event.color = "어떤 카테고리인가"

---

## 5. 뷰 명세

### 5.1 주간 뷰 (week) — Phase 1, 기본

| 구성 | 값 |
|---|---|
| 시간 축 | 0시–24시, 1시간 = 56px (HOUR_PX) |
| 스냅 단위 | 15분 (SLOT_MINUTES) |
| 컬럼 | 7개 (일–토). startOfWeek 는 일요일 00:00. |
| 헤더 | 요일 + 일자. 오늘은 파란 원 배지. |
| 현재시각 라인 | 빨간 가로선 + 좌측 점. 1분마다 갱신. |
| 초기 스크롤 위치 | 8시 위치 (8 * HOUR_PX) |
| 시간 겹침 처리 | layoutDayColumn 으로 겹치는 그룹 내 컬럼 분할 표시 |

### 5.2 월간 뷰 (month) — Phase 4

- 6주 × 7일 = 42칸 그리드
- 각 칸에 그날의 이벤트를 막대 형태로 1줄씩 (최대 3–4줄, 초과 시 "+N more")

### 5.3 3일 뷰 (3day) — Phase 4, 모바일 권장

- 주간 뷰와 동일 구조에 컬럼 수만 3개
- 디폴트는 어제·오늘·내일 또는 오늘·다음 2일 — 모바일 UX 합의 후 결정

---

## 6. 시간박스 인터랙션

### 6.0 이벤트 형태 분류

ThinkMap 캘린더 이벤트는 시각적으로 3 가지 형태:

| 형태 | 데이터 | 렌더 |
|---|---|---|
| **시간 범위** | `start_at < end_at` | 시간 길이에 비례한 박스 |
| **포인트 이벤트** ("종료 없이") | `start_at == end_at` | 그 시각에 22px 1줄 마커. 리사이즈 핸들 없음 |
| **종일** (Phase 4) | `all_day = true` | 헤더 영역에 박스 (예정) |

DB CHECK: `all_day = true OR end_at >= start_at` — `>=` 로 포인트 이벤트 허용.

### 6.1 신규 생성 — draft 패턴 (Google Calendar 동일)

- 빈 영역(day-column 본체)에서 **mousedown → mousemove → mouseup**
- 시작 Y 좌표 = 시작 시각, 끝 Y 좌표 = 종료 시각 (15분 스냅, 최소 15분)
- 위쪽으로 드래그하면 anchor 와 swap (시작/종료 자동 정리)
- mouseup 시 **DB 저장하지 않고** draft 객체(`{ __draft: true, start_at, end_at, ... 기본값 }`)만 만들어 EventEditor 로 넘김
- 사용자가 EventEditor 에서 **저장 버튼을 눌렀을 때 비로소** `createEvent` 호출
- 사용자가 저장 없이 닫으면 (X / 취소 / 백드롭 클릭) 그대로 폐기 — DB 에 아무 흔적도 남지 않음
- draft 상태에서는 EventEditor 의 삭제 버튼이 숨겨짐 (지울 게 없음)

이 패턴이 중요한 이유: 빈 일정이 잔뜩 쌓이는 것 방지 + 실수로 만든 박스가 자동 폐기되어 UX 부담 적음.

### 6.2 이동 (move)

- 박스 본체 mousedown → mousemove → mouseup
- duration 유지, grabOffsetPx 보정으로 잡은 지점 그대로 따라옴
- **Phase 1 제약**: 같은 날(컬럼) 안에서만 이동 가능. 다른 날 이동은 Phase 4 에서 X 축 드래그 추가.

### 6.3 리사이즈 (resize)

- 박스 하단 6px 핸들 mousedown → mousemove → mouseup
- end_at 만 변경. start_at 고정. 최소 SLOT_MINUTES.
- **Phase 1 제약**: 상단 리사이즈(시작 시각 변경)는 없음. 필요시 EventEditor 에서.

### 6.4 클릭

- 박스 본문 클릭 (드래그가 아닌 짧은 클릭) → EventEditor 팝오버 오픈
- 현재는 mousedown 으로 drag 가 무조건 시작되므로, 순수 클릭/드래그 구분이 모호함 → Phase 1 후속에서 임계값(예: 3px 미만 이동 = 클릭) 도입 필요.

### 6.5 키보드 / 접근성

- Phase 1 미구현. Phase 4 에서 화살표 키 이동, Enter/Space 편집, Delete 키 등 추가.

---

## 7. 루틴 (Phase 2)

### 7.1 RRULE 범위

iCalendar RFC 5545 를 따른다. 초기 UI 지원 범위:

| 패턴 | 예시 RRULE |
|---|---|
| 매일 | `FREQ=DAILY` |
| 평일 | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| 매주 X요일 | `FREQ=WEEKLY;BYDAY=MO` |
| 매월 N일 | `FREQ=MONTHLY;BYMONTHDAY=15` |
| 매월 N번째 요일 | `FREQ=MONTHLY;BYDAY=2MO` |
| 매년 | `FREQ=YEARLY` |
| 종료 | `;UNTIL=20260101T000000Z` 또는 `;COUNT=10` |

라이브러리: `rrule` (npm) — 검증되고 가벼움.

### 7.2 펼침 (expansion) 위치

- **클라이언트에서 펼침** — 주간 뷰는 7일치만 펼치면 되므로 비용 작음.
- 서버 RPC `get_schedule_events_in_range` 는 후보 이벤트만 반환 (단발 = 겹침, 루틴 = `start_at < to AND (routine_until IS NULL OR routine_until > from)`).
- 클라이언트가 RRULE 펼친 결과에 instance override (체크/이동/취소)를 머지.

### 7.3 인스턴스 생성 시점

- 발생 자체로는 row 안 만듦.
- 다음 중 하나가 일어날 때 INSERT (또는 UPSERT):
  - 사용자가 체크 토글
  - 사용자가 그 회차만 시간 이동 (moved_start_at)
  - 사용자가 그 회차만 취소
- `instance_start_at` 은 RRULE 펼친 원본 시각 그대로 사용 (override 전 기준).

### 7.4 시리즈 vs 단일 회차 편집

원칙은 다음 3개 scope:
- **이 회차만** → instance row 의 override 변경
- **이후 모든 회차** → 원본 event 의 UNTIL 직전까지로 자르고, 새 시각으로 새 event 생성
- **전체 시리즈** → 원본 event 직접 변경 (모든 기존 instance override 는 보존)

**Phase 2 (v1) 구현 범위:**
- **EventEditor 의 저장/삭제 = 항상 "전체 시리즈"** — 단순화 + 안전한 디폴트
- **단일 회차 편집은 캘린더 박스의 직접 조작으로만 제공**:
  - 박스 드래그/리사이즈 → 그 회차만 시간 이동 (instance 의 moved_start_at/moved_end_at upsert)
  - 박스 우상단 체크박스 → 그 회차만 완료/해제 (instance 의 completed)
- EventEditor 안에 "이 회차만 / 이후 모든 회차" 버튼은 Phase 2.1 이후 추가 (§13.7 참조)

이렇게 둔 이유: drag-to-move 와 check-to-complete 가 가장 빈번한 단일 회차 조작이고, 이 둘만으로도 일상 사용은 충분히 커버됨. 제목/색 변경처럼 시리즈 전체 의미가 강한 편집만 EventEditor 에서 처리.

---

## 8. 외부 링크 + 양방향 체크 동기 (Phase 3)

### 8.1 링크 종류

| target_type | 의미 | sync_check 의미 |
|---|---|---|
| `todo` | daily_blocks 의 todo (is_todo=true) | 박스 체크 ↔ todo_checked 양방향 |
| `block` | 일반 블록 (todo 아니어도 됨) | 단방향 표시만 (체크 동기 없음) |
| `page` | 페이지 통째 참조 | 단방향 표시만 |

### 8.2 양방향 체크 동기 알고리즘

박스 → 투두:
1. 박스 체크 시 schedule_event_instances.completed = true 로 upsert
2. 해당 instance/event 에 sync_check=true, target_type='todo' 인 링크 조회
3. 링크된 daily_blocks 의 todo_checked 도 true 로 update

투두 → 박스:
1. todo_checked 변경 시 그 block_id 를 가진 schedule_event_links (sync_check=true) 조회
2. 링크가 가리키는 event/instance 의 completed 상태 동기
3. 인스턴스가 없으면 만든다 (오늘 회차 등)

**충돌 처리**: 거의 동시에 양쪽에서 다른 값이 들어오면 마지막 write 가 이김 (last-write-wins). 양방향 무한 루프 방지를 위해 동기 호출 시 `_origin=user|sync` 플래그로 재호출 차단.

### 8.3 링크 UI

- EventEditor 하단에 "연결된 항목" 섹션
- "+ 투두 연결" / "+ 페이지 연결" / "+ 블록 연결" 버튼
- 투두 연결 시 검색 모달 (오늘 + 미체크 우선 정렬, 페이지명 그룹)
- 연결된 todo 의 체크 박스가 EventEditor 안에도 나타나 — 직접 토글 가능

---

## 9. Google Calendar 동기 (Phase 5 — 차후 이슈로 분리)

> **상태**: 본 명세서 작성 시점에는 차후 별도 이슈로 진행하기로 결정.
> 현재 코드에는 `schedule_events` 의 `google_event_id` / `google_calendar_id` / `google_etag` / `google_synced_at` 컬럼만 placeholder 로 존재하며, 어떤 코드 경로도 이 컬럼을 read/write 하지 않는다.
> 실제 구현 시점은 미정. 아래는 구현 시 참고할 설계 메모.

### 9.1 인증

- Supabase Auth Google OAuth scope 에 `https://www.googleapis.com/auth/calendar` 추가
- refresh_token 은 Supabase secret table 또는 Edge Function 환경에 저장

### 9.2 동기 방향과 충돌

- **양방향**, 5분 간격 polling + 사용자 액션 직후 즉시 push
- 충돌은 `google_etag` 로 감지: ThinkMap 에서 update 직전 etag 가 다르면 사용자에게 머지 다이얼로그
- google 측 deleted → ThinkMap soft delete
- ThinkMap 측 deleted → google 측 delete

### 9.3 매핑

| ThinkMap | Google Calendar |
|---|---|
| schedule_events.title | summary |
| description | description |
| start_at / end_at | start.dateTime / end.dateTime |
| all_day = true | start.date / end.date |
| color (HEX) | colorId (가장 가까운 사전 매핑) |
| is_routine + rrule | recurrence: [`RRULE:...`] |
| schedule_event_instances | recurringEventId + originalStartTime 로 매핑 |

### 9.4 캘린더 단위

- ThinkMap 의 owner 1명 = Google 1개 캘린더 매핑 (google_calendar_id)
- is_shared 일정은 어느 캘린더에 쓸지 owner 가 설정 (기본 = primary)

---

## 10. RLS / RPC

### 10.1 헬퍼 함수

```sql
can_view_schedule_owner(p_owner uuid) RETURNS boolean
can_edit_schedule_owner(p_owner uuid) RETURNS boolean
```

- can_view = master OR self OR linked(any permission)
- can_edit = master OR self OR linked(editor)

SECURITY DEFINER + STABLE 로 RLS 안에서 호출.

### 10.2 schedule_events 정책

| 정책 | 조건 |
|---|---|
| SELECT | `can_view_schedule_owner(owner_user_id)` |
| INSERT | `can_edit_schedule_owner(owner_user_id)` |
| UPDATE | `can_edit_schedule_owner(owner_user_id)` |
| DELETE | `can_edit_schedule_owner(owner_user_id)` (soft delete 시 UPDATE 로 처리 권장) |

### 10.3 schedule_event_instances / _links 정책

부모 event 의 권한에 위임:
- SELECT: 부모 event 가 SELECT 가능하면 통과
- INSERT/UPDATE/DELETE: 부모 event 가 edit 가능하면 통과

### 10.4 RPC

```sql
get_schedule_events_in_range(
  p_from        timestamptz,
  p_to          timestamptz,
  p_owner_ids   uuid[] DEFAULT NULL,
  p_shared_only boolean DEFAULT false
) RETURNS SETOF schedule_events
```

- p_owner_ids NULL = RLS 가 허용하는 모든 owner
- 단발: 시간 겹침으로 필터
- 루틴: 후보 반환 (펼침은 클라이언트)

### 10.5 pages 테이블 연계

- 캘린더 진입은 `pages` 테이블의 `page_type='schedule'` row 1개 (project_id NULL).
- `pages_page_type_chk` CHECK 제약에 `'schedule'` 포함 필요.
- `pages_select_with_worklog` / `pages_insert_worklog` / `pages_update_worklog` 정책에 `'schedule'` 포함 필요.
- 이 항목은 `migrate-pages-allow-schedule.sql` 에서 처리.

---

## 11. 라우팅 / 사이드바 통합

### 11.1 라우팅

- App.jsx 의 PaneInner 컨텐츠 분기에 `pageType === 'schedule'` 추가.
- SchedulePage 는 session 만 prop 으로 받음 (pageId 불필요).

### 11.2 사이드바 진입

- `sidebar-worklog-fixed` 영역의 **업무일지 위쪽**에 "캘린더" 버튼 1개.
- 클릭 시:
  1. 메모리 캐시(pages)에서 page_type='schedule' 찾기
  2. 없으면 DB 직접 조회
  3. 그래도 없으면 INSERT (단 1번)
  4. `fetchPages()` → `handlePageSelect()` (window.reload 금지 — 이전 시도에서 흰 화면/페이지 ID 유실 원인이었음)

### 11.3 활성 상태 표시

```js
className={`sidebar-worklog-btn ${
  currentPageId && pages.find(p => p.id === currentPageId)?.page_type === 'schedule' ? 'active' : ''
}`}
```

---

## 12. Phase 로드맵

| Phase | 범위 | 상태 |
|---|---|---|
| **1** | 스키마 + RLS + 사이드바 + 주간 뷰 + 단발 CRUD + 드래그/리사이즈 + 공유 토글 | 완료 |
| **1.5** | 다중 계정 필터(모달) + owner hue 자동 배색 + 마스터 "전체 계정 토글" + 박스 owner 표시 | 완료 |
| **2** | 루틴 RRULE 입력 UI(매일/평일/매주 요일/매월/매년 + COUNT/UNTIL) + 클라이언트 펼침 + 인스턴스 lazy upsert(체크/시간이동) + 박스 체크박스 + EventEditor 전체 시리즈 편집 | 완료 |
| 2.1 | EventEditor 의 "이 회차만 / 이후 모든 회차" scope 분기 (§13.7) | 예정 |
| **3a** | todo 링크 CRUD + TodoPicker + EventEditor 연결 섹션 + 박스 체크 → todo 단방향 push 동기 + TimeBox 링크 아이콘 | 완료 |
| **3b** | schedule_events.completed 추가(단발도 체크), 단발/루틴 통일 toggle, fetch 시점 머지(linked todo 전원 체크 → 박스 자동 완료), PagePicker + 페이지 연결, EventEditor 의 link checkbox 인터랙티브 | 완료 |
| **4a** | 박스 X 축 드래그(다른 날로 이동) + 링크된 todo 원본 페이지로 가기(빨강 펄스) | 완료 |
| **4b** | 월간 뷰 (6주×7일, 칸당 막대 3개 + 외 N개 팝오버, 빈 칸 클릭=09:00 draft, 막대 드래그=다른 날, 날짜숫자 클릭=주간 뷰 점프) | 완료 |
| **4c** | 3일 뷰 (WeekView 일반화 dayCount=3, 토글/오늘/이동 ±3일) | 완료 |
| **4d** | 키보드 단축키 (← → 이동, T 오늘, N 새 이벤트, Esc 닫기, 1/2/3 뷰 전환) | 완료 |
| **4e** | §13.1 클릭/드래그 임계값(3px), 알림(notify_minutes_before + Notification API), all-day 이벤트(EventEditor 토글 + 헤더 strip), §13.3 상단 리사이즈 핸들, 제목 검색(툴바 팝오버 + 결과 점프 + 펄스) | 완료 |
| **4f** | cross-day 박스 시각 연결(cont-prev/cont-next 모서리 평평 + ▲/▼), 색상 카테고리 라벨(localStorage → tooltip) | 완료 |
| **4g (모바일)** | isMobile 시 초기 3-day 뷰, 툴바 wrap+라벨 축약(≤768/480), EventEditor 바텀시트(≤600 화면 폭 가득), 터치 핸들 6→12px / 체크박스 14→20px (hover:none), 검색 popover 전폭, 월간 칸 폰트 축소 | 완료 |
| 5 | Google Calendar OAuth + 양방향 polling 동기 + 충돌 머지 다이얼로그 | **차후 이슈로 분리** — 현재는 schema 의 `google_*` 컬럼만 placeholder 로 유지. 실제 작업 시점은 미정. |

---

## 13. 알려진 제약 / 미해결 이슈

### 13.1 클릭/드래그 구분 — 해결 (Phase 4e)

- Phase 1 에서는 박스 mousedown 즉시 move 모드 → 짧은 클릭이 의도치 않게 시간 이동
- Phase 4e 에서 3px 임계 도입. 임계 미만이면 click 으로 처리 → EventEditor 오픈만, DB 변경 없음.

### 13.2 다른 날 이동 — 해결 (Phase 4a)

- Phase 1 에서는 같은 day-column 안에서만 시간 이동 가능
- Phase 4a 에서 `findDayIdxAt(clientX)` 로 mousemove 중 cursor 가 다른 컬럼 위에 있으면 `drag.dayIdx` 갱신 → 다른 날로 자유 이동
- 단발: 그대로 새 날짜의 start/end 로 update. 루틴: instance_start_at(원본) 유지하고 moved_start_at/moved_end_at 만 새 날로 override (이 회차만 이동)
- 리사이즈 / 신규 생성 은 시작 컬럼 고정 (Google Calendar 동일)

### 13.3 상단 리사이즈 — 해결 (Phase 4e)

- Phase 1 에서는 하단 핸들만 (end_at) — 시작 시각 변경은 EventEditor 만
- Phase 4e 에서 상단 6px 핸들 추가. `edge: 'top'|'bottom'` 으로 drag.mode='resize' 분기. top 은 start_at 만, bottom 은 end_at 만 변경.

### 13.4 자정 넘는 이벤트 — 해결 (Phase 4f)

- Phase 1 에서는 day-column 별로 잘려 표시되며 두 박스가 별개로 보임
- Phase 4a 에서 다른 날 드래그 가능해짐
- Phase 4f 에서 TimeBox 에 `continuesFromPrev`/`continuesToNext` 계산:
  - 잘린 모서리는 border-radius 0 + dashed 가장자리 선
  - 상단 ▲ / 하단 ▼ 미세한 인디케이터 (같은 이벤트의 연속임을 알림)
  - 해당 쪽 리사이즈 핸들 숨김 (의미 없음)

### 13.5 RLS 충돌 가능성

- linked_accounts 의 권한 변경이 즉시 적용되지 않을 수 있음 (auth.jwt() 캐시) — 재로그인 권장 메시지 필요

### 13.6 색상 매핑

- 7개 프리셋만 제공. Google colorId 매핑은 Phase 5 에서 처리.

### 13.7 루틴 EventEditor 의 scope 선택 미구현 (Phase 2.1 예정)

- 현재 EventEditor 의 저장/삭제는 "전체 시리즈" 단일 모드.
- "이 회차만 / 이후 모든 회차" 버튼은 추가 작업 필요:
  - "이 회차만" → instance row 의 title/color/description override 컬럼 신설 (현재 instances 는 time/cancel/complete 만 override). 컬럼 추가 + 머지 로직 + EventEditor 분기.
  - "이후 모든 회차" → 원본 RRULE 의 UNTIL 을 (선택 회차 - 1일) 로 자르고 새 event INSERT. 기존 instance override 가 어느 쪽에 귀속되는지 결정 필요.
- 일상 단일 회차 조작(시간 이동/체크)은 드래그·체크박스로 이미 가능하므로 Phase 2.1 우선순위 낮음.

---

## 14. 수정 원칙

1. **schema 변경은 항상 단일 트랜잭션 마이그레이션 파일로**. `migrate-*.sql` 명명. CHECK 제약 / 정책 변경은 DROP IF EXISTS 후 재생성.
2. **RLS 정책은 헬퍼 함수 통해 일원화**. 정책 본문에 linked_accounts JOIN 을 직접 적지 않는다.
3. **시간 저장은 timestamptz (UTC)**. 표시/RRULE 해석은 timezone 컬럼 + Asia/Seoul 기본.
4. **인스턴스는 lazily 생성**. RRULE 펼침 결과에 instance row 가 없으면 = 원본 상태로 그린다.
5. **양방향 동기는 origin 플래그로 무한 루프 차단**.
6. **window.location.reload() 금지** — fetchPages + setCurrentPageId 패턴 사용. (이전 시도에서 흰 화면 + 첫 클릭 미진입 버그 원인이었음)
7. **새 page_type 추가 시** — `pages_page_type_chk` CHECK 제약 + worklog 계열 RLS 3종(SELECT/INSERT/UPDATE) 모두 확장 필요. 하나만 풀면 400 으로 떨어진다.
8. **Google 컬럼은 절대 클라이언트에서 직접 채우지 않는다** — Edge Function / 서버 sync 로직만 갱신.

---

## 15. 수정 전 체크리스트

캘린더 관련 PR 을 만들 때 아래를 확인한다:

- [ ] 스키마 변경이 있다면 마이그레이션 파일이 분리되어 있는가
- [ ] RLS 정책이 헬퍼 함수 기반으로 일관되는가
- [ ] 새 page_type 을 도입한다면 CHECK 제약 + worklog RLS 3종이 같이 갱신되는가
- [ ] 시간 인터랙션이 15분 스냅을 따르는가
- [ ] 루틴 인스턴스가 필요할 때만 생성되는가 (불필요한 row 양산 X)
- [ ] 양방향 동기에 origin 플래그가 있어 루프 차단되는가
- [ ] 모바일에서 드래그/터치 인터랙션이 동작하는가 (Phase 4 이후)
- [ ] Google 동기 컬럼을 클라이언트에서 채우지 않았는가 (Phase 5 이후)
- [ ] 본 문서의 [13. 알려진 제약 / 미해결 이슈] 가 PR 로 해소된다면 13번 섹션을 갱신했는가
