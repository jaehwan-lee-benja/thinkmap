# 자리후 시스템 (Seat / 자리후·올리기) 기능 기획서 / 명세서

> **자리후 시스템(seat) 관련 코드·마이그레이션을 만들거나 고치기 전에 이 문서를 먼저 본다.**
>
> 작성일: 2026-06-21 / 최종 갱신: **2026-08-08**
> 작성자: jaehwan-lee-benja (with Claude)
> 상태: **Phase 1 완료 — 프로덕션 운영 중**(자리안내·주문서관리 화면 통합, R1~R12, 통계 §13).
> ※§9 는 2026-08-02 전면 갱신됨(현행 = §9.0/§9.3, §9.1~9.2 는 역사 참고).
> 상위 컨텍스트: 카페 주방 실시간 협업. ThinkMap 하위 기능(신규 모듈로 격리).
> 권한 맥락: [ACCESS-MODEL.md](./ACCESS-MODEL.md) — 신규 패러다임을 만들지 않고 B(공개형)+멤버십을 재사용한다.
> 형제 참조: [MEMBER-SPEC.md](./MEMBER-SPEC.md) — `roster_assignments`(날짜별·매장 공유·보드멤버 편집)와 RLS·테넌시 패턴이 동일하다.

---

## 목차

- [1. 배경 & 목표](#1-배경--목표)
- [2. 범위 / 비범위](#2-범위--비범위)
- [3. 도메인 용어](#3-도메인-용어)
- [4. 핵심 결정](#4-핵심-결정)
- [5. 역할 모델 (4역할 + 확장)](#5-역할-모델-4역할--확장)
- [6. 데이터 모델](#6-데이터-모델)
- [7. 권한 / RLS](#7-권한--rls)
- [8. 실시간 동기화](#8-실시간-동기화)
- [9. 화면 명세](#9-화면-명세)
- [10. 비즈니스 규칙 R1~R12](#10-비즈니스-규칙-r1r12)
- [11. 라이브 카메라 모듈](#11-라이브-카메라-모듈)
- [12. 진입 & 컴포넌트 구조](#12-진입--컴포넌트-구조)
- [13. 통계](#13-통계-2026-08-02-신설--구-phase-3)
- [14. 결정 로그 / 미해결](#14-결정-로그--미해결)
- [15. 수정 전 체크리스트](#15-수정-전-체크리스트)

---

## 1. 배경 & 목표

주말(11~16시) 카페 주방에서는 "자리후/올리기" 업무를 4개 역할(자리안내·제조매니저·카이막·커피)이
각자 태블릿으로 처리한다. 지금은 구두·수기로 흩어져 있어 누가 어떤 주문을 어디까지 진행했는지
역할 간 실시간 공유가 안 된다. 같은 건물·같은 와이파이, 태블릿 4대+ 환경에서 **한 주문의 상태를
모든 역할이 1~2초 내로 같이 보는** 웹앱이 필요하다.

**목표**
- 주문 행 하나를 **자리후 → 올림 → 제조 → 완료**까지 4역할이 공유·협업하며 관리한다.
- 입력은 **수동**(자리안내가 기본 입력 주체). 영상 OCR 자동 번호인식은 비범위(향후 별도 과제).
- 역할은 **데이터/설정으로 확장 가능**하게(하드코딩 금지). 역할이 늘어도 스키마 불변.
- 카메라 라이브는 **순수 슬롯**으로 분리(데이터 로직과 결합 금지). 하드웨어 입고 후 URL만 주입.

## 2. 범위 / 비범위

**범위 (Phase 1 — 이번 작업)**
- `seat_orders`(주문 행) + `seat_station_status`(스테이션 진행) 2개 테이블 + RLS.
- 역할별 화면 ~~4종~~ → **3화면**(주문 화면=자리안내·주문서관리 공용 · 카이막 · 커피) + 상단 역할 탭 전환(2026-08-02 통합).
- Supabase Realtime(postgres_changes) 구독으로 모든 화면 실시간 갱신(last-write-wins).
- 비즈니스 규칙 **R1~R12**(§10. R2·R5 는 폐지됨).
- `<LiveCameraFeed>` 슬롯(placeholder. enabled=false 기본).

**비범위 (향후)**
- 영상 OCR 자동 주문번호 인식(별도 PC 과제 · 백로그).
- POS / 영수증 프린터 연동.
- ~~소요시간(자리후→올림→완료) 분석 리포트~~ → **범위로 승격·구현 완료**(§13 통계, 2026-08-02).
- 다매장 동시 운영(현재 단일 워크스페이스. 스키마는 workspace_id로 다중 워크스페이스 대비).

## 3. 도메인 용어

| 용어 | 정의 |
| --- | --- |
| 자리후 | 주문은 됐지만 좌석이 미확정인 대기 주문. `seat_status='pending'` |
| 올리기(올림) | 자리가 잡혀 그 번호를 제조로 올려 진행. `raised=true` / `seat_status='raised'` |
| 자리대기번호(queue_no) | (매장, 영업일)별 1,2,3… 자동 부여. 주문번호(order_no)와 별개 |
| 영업일(business_date) | 그 날의 운영 단위. 매일 queue_no 리셋 |
| 스테이션(station) | 제조 거점. `'kaymak'`(카이막) / `'coffee'`(커피) / 확장. text라 추가에 스키마 불변 |
| 역할(role) | 화면 주체. 자리안내·제조매니저·카이막·커피. 태블릿 1대 = 1역할(탭 전환 가능) |
| 워크스페이스(workspace) | 자리후 자산이 속한 테넌트. 단일 매장=단일 워크스페이스(`current_workspace()`) |

## 4. 핵심 결정

1. **신규 모듈로 격리**: 기존 ThinkMap 기능(토글/목표/로스터/데일리)과 코드·테이블을 섞지 않는다.
   테이블은 `seat_` 프리픽스, 컴포넌트는 `src/components/Seat/`. daily 본문(`daily_blocks`)·TipTap에
   절대 얽지 않는다(독립 구조 데이터).
2. **워크스페이스 grant 권한 모델**: 자리후 데이터는 "워크스페이스 자산"이다. 읽기·쓰기 모두
   `can_in_workspace(workspace_id, 'editor')` 단일 기준(능력 서열 owner>editor>viewer). board 멤버십·
   `is_board_member`는 쓰지 않는다(Phase A grant 토대로 이관). 4역할은 권한 등급이 아니라 운영 역할/
   기기 모드 → RLS로 가르지 않고 앱 레벨 가드. ※2026-08-02 현재 앱 레벨 역할 가드도 사실상 없다(guide·manager 동일 화면, 메뉴나감 UI 제거).
3. **키오스크 전용 풀스크린**: 진입하면 사이드바/페인 크롬 없이 전체화면(태블릿 항상 켜둠). 단
   ThinkMap 페이지 시스템과는 `page_type='seat'` 1개로 연결(진입·생성은 기존 패턴).
4. **역할은 화면 내 탭 전환**: 상단 역할 탭(자리안내·매니저·카이막·커피)으로 전환. 태블릿당 보통
   1역할 고정 운용이되, 한 화면에서 토글 가능. 마지막 역할은 localStorage로 기억(편의).
5. **역할/스테이션은 데이터로**(`config/seatRoles.js` 상수). `station`/`created_by_role`이 text라
   역할·스테이션 추가 = 상수 배열 한 줄. 스키마 변경 0. (별도 roles/stations DB 테이블은 과설계 → 보류)
6. **카메라 = 순수 표시 슬롯**: orders/station 데이터 로직과 결합 금지. props(streamUrl/enabled)만 받는다.

## 5. 역할 모델 (4역할 + 확장)

`config/seatRoles.js`에 데이터로 선언(하드코딩 금지). 역할 추가는 이 배열만 수정.

| key | 이름 | 성격 | 입력 권한 | 카메라 | 스테이션 |
| --- | --- | --- | --- | --- | --- |
| `guide` | 자리안내 | 기본 입력 주체 | 주문 화면 풀기능(§9.0) | ✓* | — |
| `manager` | 주문서관리 | 공동 모니터/입력 | 주문 화면 풀기능(§9.0 — guide 와 동일) | ✓* | — |
| `kaymak` | 카이막 | 제조 스테이션 | 받음/완료/변동사항 | ✓ | `kaymak` |
| `coffee` | 커피 | 제조 스테이션 | 받음/완료/변동사항 | ✓ | `coffee` |

- 카이막·커피는 **동일 컴포넌트**(`StationScreen`)를 `station` 파라미터로 재사용. 서로 독립(R6).
- ★2026-08-02: `guide`·`manager` 는 **같은 화면·같은 기능**(§9.0). 표의 "이름"만 다르고 권한 차이는 없다.
- ★`*` 카메라 표시는 **역할이 아니라 설정 `cameraEnabled` 하나로** 결정된다(§11). `seatRoles.js` 의 `camera` 플래그는 현재 읽는 코드가 없다(죽은 데이터).
- ~~`menu_out`은 매니저 역할만 토글 가능(R5)~~ → UI 제거(R5 참조).
- 역할 추가(예: '디저트 스테이션') = `config`에 `{key:'dessert', station:'dessert', camera:true}` 한 줄.

## 6. 데이터 모델

> 마이그레이션: `migrate-create-seat-system.sql` (단일 트랜잭션, 재실행 안전 / 통합 세션 승인 후 적용).
> 전제(Phase A 토대, 라이브): `current_workspace() → uuid`(단일 테넌트: 사루루팜),
> `can_in_workspace(workspace uuid, need text) → bool`(능력 서열 owner>editor>viewer).

### 6.1 `seat_orders` — 주문 행 (워크스페이스 editor 읽기·쓰기)

```sql
seat_orders (
  id              uuid PK DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL DEFAULT current_workspace(),             -- 테넌시(워크스페이스 자산)
  business_date   date NOT NULL DEFAULT current_date,
  queue_no        int  NOT NULL,                       -- (workspace,date)별 1,2,3… 트리거 자동
  order_no        text,                                -- 주문번호(수기, 자유 텍스트)
  seat_status     text NOT NULL DEFAULT 'pending'
                    CHECK (seat_status IN ('pending','raised','canceled')),
  review_flag     text NOT NULL DEFAULT 'none'         -- R3: 기본 '-'(=none)
                    CHECK (review_flag IN ('none','확인필요','주문중','차후주문')),
  opt_outdoor          boolean NOT NULL DEFAULT false, -- 야외
  opt_takeout          boolean NOT NULL DEFAULT false, -- 포장
  opt_outdoor_parallel boolean NOT NULL DEFAULT false, -- 야외병행
  seat_order_alive     boolean NOT NULL DEFAULT true,  -- R4: 살아있음 / false=필요없음(순서취소)
  order_origin    text NOT NULL DEFAULT 'dine_in'      -- R9: 시작 갈래 dine_in(실내)/takeout(포장)/outdoor(야외). migrate-seat-order-origin.sql
                    CHECK (order_origin IN ('dine_in','takeout','outdoor')),
  seat_delivered  boolean NOT NULL DEFAULT false,      -- R8: 실내 주문 "자리후 전달" 관문. migrate-seat-delivered.sql
  deliver_mode    text,                                -- R11: 전달 갈래 NULL=일반 / maybe_store=포장도고려(영수증 매장) / maybe_receipt=포장도고려(영수증 포장). migrate-seat-deliver-mode.sql
                    CHECK (deliver_mode IS NULL OR deliver_mode IN ('maybe_store','maybe_receipt')),
  seated          boolean NOT NULL DEFAULT false,      -- 자리앉음
  raised          boolean NOT NULL DEFAULT false,      -- 올리기 전달
  raised_at       timestamptz,                         -- 올림 시각(후속 소요시간 분석)
  raise_canceled  text,                                -- R10: 올림취소 흔적+방식 takeout/outdoor/parallel/direct, NULL=이력없음. migrate-seat-raise-canceled.sql
  menu_out        boolean NOT NULL DEFAULT false,      -- ※UI 제거(2026-07-31). 컬럼만 존치 — R5 참조
  confirm_flag    boolean NOT NULL DEFAULT false,      -- 확인필요(주문서관리→자리안내 신호. 상태선택과 별개의 행 플래그)
  confirm_done    boolean NOT NULL DEFAULT false,      -- 확인완료(자리안내가 처리 응답). migrate-seat-confirm-done.sql
  notes           text,                                -- 특이사항(=화면 표기 '전달사항'). 스테이션 카드에도 표시
  memo            text,                                -- 비고/메모 — 표 오른쪽 자유 메모(스테이션 미노출). migrate-seat-memo.sql
  archived_at     timestamptz,                         -- R12: 안내 완료(아카이빙) 시각. NULL=안내중(대기열). migrate-seat-archived.sql
  order_no_at     timestamptz,                         -- 통계: 주문번호 최초 입력 시각(이후 수정해도 유지). migrate-seat-flow-timestamps.sql
  delivered_at    timestamptz,                         -- 통계: 자리후 전달 시각(전달 해제 시 NULL). migrate-seat-flow-timestamps.sql
  created_by_role text,                                -- 입력 주체 역할 key(스냅샷)
  created_by      uuid DEFAULT auth.uid(),             -- 작성자(감사용 보조; 공용계정 운영)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz                          -- soft delete
)
```

### 6.2 `seat_station_status` — 스테이션별 진행 (워크스페이스 editor 읽기·쓰기)

스테이션을 행으로 분리해, 카이막·커피가 **서로 독립**(R6)으로 받음/완료를 누른다.

```sql
seat_station_status (
  id            uuid PK DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES seat_orders(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL DEFAULT current_workspace(),    -- 테넌시(부모 order 와 동일 워크스페이스)
  business_date date NOT NULL DEFAULT current_date,    -- Realtime 필터용 비정규화
  station       text NOT NULL,                         -- 'kaymak' | 'coffee' | 확장
  received      boolean NOT NULL DEFAULT false,        -- 자리잡음(올림)을 그 스테이션이 받음
  completed     boolean NOT NULL DEFAULT false,        -- 그 스테이션 완료(독립)
  change_note   text,                                  -- ※사실상 폐기(2026-08-02) — 앱 미사용. 전달사항은 seat_orders.notes 로 통일(§14 결정로그)
  completed_at  timestamptz,                           -- 완료 시각(후속 소요시간 분석)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, station)
)
```

### 6.3 `queue_no` 자동 부여 트리거

동시 입력 시 클라이언트 max+1 경쟁을 피하려 DB에서 부여한다.

```sql
CREATE OR REPLACE FUNCTION seat_orders_assign_queue_no()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.queue_no IS NULL OR NEW.queue_no = 0 THEN
    SELECT COALESCE(MAX(queue_no), 0) + 1 INTO NEW.queue_no
    FROM seat_orders WHERE workspace_id = NEW.workspace_id AND business_date = NEW.business_date;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_seat_orders_queue_no
  BEFORE INSERT ON seat_orders FOR EACH ROW EXECUTE FUNCTION seat_orders_assign_queue_no();
```

- BEFORE INSERT 트리거가 `workspace_id`를 `current_workspace()`로 **강제**(클라 위조 차단), advisory lock으로
  queue_no 동시성 직렬화. `seat_station_status.workspace_id`는 부모 order에서 트리거로 강제(크로스테넌트 차단).
- `updated_at`은 BEFORE UPDATE 트리거가 자동 갱신(클라 의존 제거).
- 인덱스: `seat_orders(workspace_id, business_date, queue_no)` **UNIQUE**(중복 안전망),
  `seat_station_status(workspace_id, business_date)`, `seat_station_status(order_id)`.

## 7. 권한 / RLS

> 워크스페이스 grant 모델(docs/ACCESS-TIERS-SPEC.md, main). Phase A 토대 라이브.
> orders/station_status 는 **워크스페이스 자산** → 읽기·쓰기 모두 워크스페이스 editor 기준.

| 테이블 | SELECT / INSERT / UPDATE / DELETE | 기준 |
| --- | --- | --- |
| `seat_orders` | `can_in_workspace(workspace_id, 'editor')` | 워크스페이스 editor 단일(owner 포함) |
| `seat_station_status` | `can_in_workspace(workspace_id, 'editor')` | 워크스페이스 editor 단일 |

```sql
ALTER TABLE seat_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_station_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY seat_orders_rw ON seat_orders FOR ALL
  USING      (can_in_workspace(workspace_id, 'editor'))
  WITH CHECK (can_in_workspace(workspace_id, 'editor'));

CREATE POLICY seat_station_rw ON seat_station_status FOR ALL
  USING      (can_in_workspace(workspace_id, 'editor'))
  WITH CHECK (can_in_workspace(workspace_id, 'editor'));
```

- **4역할은 권한 등급이 아니라 운영 역할/기기 모드** → RLS로 가르지 않는다. RLS는 워크스페이스 editor
  단일 기준이고, 역할별 제약(예: 메뉴나감=매니저만)은 **앱 레벨 가드**로 처리한다.
- 공용 파트너 계정(`sarurufarm.partner`)·멤버는 이미 워크스페이스 editor grant 보유 → 태블릿이 어느
  계정으로 로그인하든 editor 면 동작. board 멤버십/`is_board_member`는 쓰지 않는다.
- 마스터(owner)는 능력 서열(owner>editor>viewer)상 editor 체크를 자동 통과.

## 8. 실시간 동기화

> 기존 `useDailyBlocks`/`useWorklogComments` 패턴(채널 + cleanup + mountedRef) 준수.

- 훅: `useSeatOrders(businessDate)` · `useStationStatus(businessDate)`.
- 채널: `seat_orders:${businessDate}` / `seat_stations:${businessDate}`.
  필터 `business_date=eq.${today}`(페이로드 경량, 매일 리셋). 워크스페이스 격리는 RLS(editor)가 보장.
- 이벤트 `*`(INSERT/UPDATE/DELETE). 콜백은 로컬 상태 머지(낙관적 UI) 또는 단순 리페치.
- 충돌 = **last-write-wins**. `created_at`·`completed_at` 등 타임스탬프를 남겨 후속 소요시간 분석.
- cleanup: `supabase.removeChannel(channel)`. 언마운트 보호 `mountedRef`.
- R7(행 변경의 전역 반영) = 해당 행 변경이 Realtime으로 모든 역할 화면에 즉시 반영 = 위 구독으로 자동 충족.
  (별도 "전체에게 전달" 버튼은 2026-07-31 제거 — 구독이 이미 충족하므로 버튼은 no-op 이었다.)

### 8.1 읽기 실패의 착지 — ★「없음」과 「못 읽음」을 절대 같은 화면으로 두지 않는다 (2026-08-17 신설)

**결함(자가감사 단일점 ②, 08-10 발견 → 08-17 수정).** 두 훅의 `refetch` 는 실패해도 `console.error` 만 하고 끝났다.
화면이 보는 것은 배열뿐이라 **읽기 실패와 「그 날 주문이 하나도 없음」이 픽셀 단위로 같았다** — 둘 다 「주문이 없습니다」,
스테이션은 둘 다 「— 올림 없음 —」. 영업 중 이게 나면 직원은 «없구나» 하고 **정상적으로 일한다**.
주방 태블릿의 콘솔을 보는 사람은 없다. ⇒ **고장이 정상 상태의 얼굴로 착지한다** = 가장 위험한 고장 형태.

**규율.** 빈 목록을 그릴 때 근거는 `length === 0` 이 **아니라** 「읽는 데 성공했는가」다.

| 상태 | 뜻 | 직원이 할 일 |
|---|---|---|
| `ready` | 읽었는데 비었다 | 새 주문을 만든다 |
| `loading` | 아직 못 읽었다 | 기다린다 |
| `failed` | 읽지 못했다 | 재시도·연결 확인 (여기서 「없음」이라 말하면 주문을 지운 것과 같다) |

**구현.**
- 훅 `useSeatOrders` / `useStationStatus` 가 `loadError`(마지막 읽기 실패) · `loadedAt`(마지막 **성공** 시각)을 노출한다.
  성공하면 `loadError=null`·`loadedAt=now`, 실패하면 `loadError` 세팅 — **기존 데이터는 지우지 않는다**(빈 화면으로 되돌리지 않는다).
- 판정 = `utils/seatLoadState.js` 의 **순수 함수** `dataLoadState({ live, errors, loadedAt })`.
  주문·스테이션은 한 화면이라 **하나만 실패해도 `failed`**(부분 성공을 정상으로 착지시키지 않는다).
  프리뷰·정적 데모(`live=false`)는 네트워크가 없어 항상 `ready` — 실패할 읽기가 없는데 경고를 띄우면 그게 오탐이다.
- 문구 = 같은 파일의 `emptyText(state, readyText)`. ★**빈 자리 문구는 전부 이걸 거친다.**
  ⚠**이 「전부」는 2026-08-17 에 적었을 때 거짓이었다** — 현황 모달(`StatusOverview`)의 「— 대기/올림/완료 없음 —」
  셋이 빠져 있었다(2026-08-18 D 트랙 적발). 읽기 실패 때 그 화면은 여전히 «고장을 정상 얼굴로» 착지시켰다.
  ⇒ 지금은 기계가 지킨다: `utils/emptyStateAudit.js` + 시험. **문서의 «전부»는 기계가 없으면
  «내가 그때 본 것 전부»라는 뜻일 뿐이다** — 이 줄이 그 값비싼 실례다.
  호출부가 `length===0` 만 보고 자기 문구를 쓰면 같은 결함이 그대로 재발하므로, 문구까지 이 함수가 준다.
- 화면 = `.seat-loadfail` 띠(헤더와 본문 **사이**, 스크롤포트 밖) + [다시 불러오기].
  ★**토스트가 아니다.** 저장 실패는 한 번의 사건이라 3.5초 토스트로 족하지만, 읽기 실패는 «지금 보는 화면이 진실이 아니다»라는
  **지속 상태**다. 사라지면 그 뒤로 다시 「주문 없음」과 구별되지 않는다 = 고치려던 결함으로 되돌아간다.
  성공한 적이 있으면(`loadedAt`) 「아래 목록은 마지막으로 받은 기록입니다」로, 없으면 「비어 보여도 『주문 없음』이 아닙니다」로 갈린다.

**남은 것(별건).** 이 항목은 «실패를 보이게 한다»까지다. **끊김을 스스로 알아채고 되살리는 것**(Realtime 구독 상태 콜백·
`visibilitychange` 복귀 refetch·저빈도 안전 폴링)은 자가감사 단일점 ①이고 별도 라운드다 — 재시도는 **아직 사람 손**이다.

> ★도메인 밖 관찰: 같은 형태가 membership 에서 독립적으로 나왔다(«서버 순단 시 직원이 유효 티켓을 거부»).
> 두 도메인이 같은 모양으로 틀렸다 = 코드 결함이 아니라 **설계 습관**이다. 교본 후보로 orch 에 올렸다.

### 8.2 실시간은 **한 겹이 아니다** — 세 겹 동기화 (2026-08-17 신설, 단일점 ①)

**결함.** 구독은 하나였고 `.subscribe()` 의 상태를 **아무도 보지 않았다**. 구독이 조용히 죽으면
(태블릿 절전 복귀·와이파이 전환·서버 순단) 화면은 끊긴 시점의 스냅샷을 **최신인 얼굴로** 계속 보여줬다.
§8.1(②)과 **같은 형태**다 — 다른 건 «비었다»가 아니라 «멈췄다»는 것뿐.

| 겹 | 무엇 | 주기·계기 | 죽으면 |
|---|---|---|---|
| ⑴ Realtime | `postgres_changes` 구독(250ms 디바운스) | 이벤트 즉시(R7 1~2초) | ⑵⑶이 받는다 |
| ⑵ 사건 | `visibilitychange`(깨움) · `online`(복귀) | 사람이 화면을 볼 때 | ⑶이 받는다 |
| ⑶ 폴링 | `refetch` | `POLL_MS`(60초). 화면이 꺼져 있으면 건너뜀 | **바닥선 — 여기 아래는 없다** |

- **끊김 감지·재구독**: `.subscribe(status)` 콜백에서 `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` → 백오프 재구독
  (`BACKOFF_MS` 2·4·8·15·30초, **상한에서 멈춘다** — 무한히 벌리면 「영영 안 돌아오는 태블릿」이 생긴다).
- ★**재연결 직후 반드시 한 번 읽는다.** 끊겨 있던 동안의 변경은 이벤트로 **오지 않는다**(영영 안 온다).
  이게 없으면 «재연결 성공»이 «화면 최신»을 뜻하지 않는다 — 연결은 초록인데 내용은 끊긴 시점 그대로 =
  또 하나의 «정상 얼굴을 한 고장». 첫 연결에는 하지 않는다(마운트 시 이미 읽었다).
- **판정은 순수 함수** `syncTransition(state, event)` (utils/seatLoadState.js). 훅은 그 결과를 **집행만** 한다.
  훅 안에 두면 「겹을 세 개 만들었다」가 **서술로만 남는다**(교본이 금한 형태) — 여기 있으면 결함을 주입해 적중을 볼 수 있다.
- **순서 규율**: 리스너·폴링을 **먼저** 걸고 마지막에 구독한다. 구독 설정이 던져도 ⑵⑶은 살아 있어야 한다
  (뒤집으면 «가장 약한 겹의 실패가 나머지 겹을 데려가는» 단일점이 되살아난다).
- **화면**: `.seat-syncwarn` 띠(헤더 **아래**, 읽기 실패 띠와 같은 자리) + [지금 새로고침].
  · `connecting`(첫 연결 중)은 **경고하지 않는다** — 오탐은 표시를 죽인다.
  · 문구가 「끊김」만 말하지 않고 «그래도 60초마다 새로고침한다»를 함께 말한다 — 안 그러면 직원이 화면을 통째로 못 믿는다.
  · 읽기 실패 띠가 떠 있으면 **침묵한다**(더 나쁜 소식이 이미 떠 있고, 그쪽 재시도가 이것도 덮는다).
  · ⚠**헤더 안 칩으로 만들지 마라** — 세로형 768에서 역할 탭이 두 줄로 밀려 표가 한 줄 잘린다(실측, 옮긴 이유).
    «고장 났을 때 화면이 더 좁아지는» 구조는 고장 대응을 방해한다.
  · 정상일 때 회색 점 같은 **상시 표시는 두지 않는다** — 늘 켜진 표시는 곧 안 보이는 표시가 된다.

## 9. 화면 명세

> ★2026-08-02 전면 갱신. **화면은 4역할 → 3화면**이다: 주문 화면(자리안내·주문서관리 공용) · 카이막 · 커피.
> 아래 9.0 이 현행이고, 9.1~9.3 은 구 서술(원본 슬라이드 기준)로 **역사 참고용**으로만 남긴다.

공통: 상단 앱바 = **날짜(달력 — 지난 날짜 조회)** + 역할 탭 + 전체화면 + 설정 + **버전 스탬프**. 주문은 행 리스트, queue_no 자동.

★**버전 스탬프**(2026-08-09 유저 지시 「자리후도 버전 기록 페이지마다」) — 헤더 **우상단 끝**, 연회색 소형, `pointer-events:none`.
- 표기 = **`v<월.일>-<그날 커밋 수>` + hash 괄호 병기**(예 `v8.9-2 (61029cd)`). **멤버십 키오스크(`BuildStamp`)와 같은 문법** —
  두 위성 표기가 갈리면 원격에서 판 번호를 대조하지 못한다. 값은 빌드 시 git 에서 주입(`apps/seat/vite.config.js` define).
  hash 는 비교·기억이 안 돼서(`9e765e8` ↔ `7c8eccd` 중 뭐가 최신인지 눈으로 못 가른다) **사람은 앞을, 배포 검증은 뒤를 쓴다.**
- 위치 = **헤더 안 인라인**(멤버십은 fixed 오버레이). 자리후 우상단은 `[⛶][설정]` 이 차지해 fixed 로 얹으면 버튼 위에 글자가 겹친다.
  헤더는 **4역할 탭이 공유하는 한 줄**이라 여기 하나면 «페이지마다» 가 자동 충족된다. 로그인 화면만 헤더가 없어 `corner`(fixed) 변형.
- ★**세로형(≤820px)은 흐름에서 빼고(absolute) 헤더 위 여백에 얹는다.** 실측: 768px 헤더는 이미 폭 한계(날짜+탭4+버튼2 ≈ 767px)라
  스탬프를 그냥 두면 **역할 탭이 한 줄 밀려 헤더 64→116px**(내용 52px 손실). absolute + `padding-top` 8px 추가로 64→72px 에 그친다. hash 는 숨긴다.

### 9.0 주문 화면 (`guide`·`manager` 공용 = `SeatOrderScreen`) — 현행

- **두 역할이 완전히 같은 화면·같은 권한**(2026-08-01 통합). 역할별 게이팅(`gateMode`)은 **제거**됐다.
  차이는 오직 §11.2 의 **역할별 기능 설정**(기기 로컬)뿐.
- 표 열(그룹 2줄 카드 그리드): 테이블링 / 주문번호 / (자리후 전달·상태) / (자리순서·야외포장) /
  (올림·전달사항) / 확인(확인필요·확인완료) / **메모** / 삭제.
  - 열 **숨김**(기기별)·**폭 조절**(★워크스페이스 공유, §11) 대상. 헤더는 sticky.
  - **자리순서 옆 리셋(↺)** — '처음 자리후 전달을 눌렀던 상태'로 복귀(재확인 모달). 전달은 유지하고
    그 이후 진행분(자리앉음·올림·제조옵션·올림취소이력)만 되돌린다.
- **관문은 자리후 전달 하나**(R8). 전달 전에는 자리순서·야외포장·올림·전달사항 **4셀을 확실히 비활성**
  (grayscale + 클릭 차단). 포장/야외 시작(`order_origin≠dine_in`)은 관문 없음.
- **주문번호가 없으면 전달 체크 불가**. 주문번호를 지우면 **전달 체크도 함께 해제**된다(표·키패드 양쪽).
- **전달 셀은 두 줄** — 위 `☑ 전달`(일반) / 아래 **`포장도고려`** 버튼(R11). 버튼을 누르면 영수증 갈래를
  고르는 모달(`영수증 매장`·`영수증 포장`, 이미 고른 상태면 `일반 전달로` 되돌리기)이 뜨고, **그 선택이 곧 전달**이다
  (미전달 행이면 전달까지 함께 확정). 고른 뒤 버튼 라벨은 `포장도고려(매장)`/`포장도고려(포장)` 로 바뀐다.
  전달을 풀거나 주문번호를 지우면 갈래도 함께 NULL 로 리셋.
- ★**[안내중] ↔ [완료] 탭**(2026-08-08, R12) — 표 위 **탭 바**(건수 뱃지). 기본 = **안내중**.
  - ★**상단 고정(sticky)**(2026-08-08) — 표를 길게 스크롤해도 지금 어느 리스트를 보는 중인지가 계속 보인다.
    표 헤더도 sticky 라 **탭바 높이만큼 내려 붙는다**. 높이는 `.seat-screen-order` 에 정의한 **단일 출처 변수**
    (`--seat-tab-h` 48 + `--seat-tab-gap` 8 → `--seat-tabs-h`)에서 파생되고, 탭 `min-height`·마진·배경 메움도 같은 변수를 쓴다.
    ★변수 정의는 **공통 조상**에 둔다 — `.seat-tabs` 에 정의하면 형제인 헤더가 읽지 못한다.
    ★소비처의 폴백(`, 56px`)은 **일부러 뺐다**: 정의가 사라지면 조용히 어긋나느니 바로 티나게 깨지는 편이 낫다(2026-08-08 회귀 예방).
    둘 사이 여백은 배경색으로 메워 행이 비치지 않게 했다.
  - ★**스크롤 컨테이너(`.seat-scrollport`)에는 패딩을 두지 않는다** — 패딩이 있으면 sticky 자식이 «패딩만큼 아래»에 멈춰
    상단에 빈 띠가 생긴다(2026-08-08 유저 신고 「상단탭 고정 아래로 좀 내려와있어」의 원인). 같은 16px 여백은 `.seat-screen` 이 갖고,
    탭바는 음수 마진으로 좌우 패딩을 덮어 **전폭 바**가 된다. **sticky 를 새로 얹을 때 이 규칙을 먼저 확인할 것.**
  - ★★**표 컨테이너(`.seat-table`)는 `overflow: clip` 이어야 한다 — `hidden` 금지**(2026-08-08 실측 확정).
    `hidden` 은 «스크롤 불가능한 스크롤포트» 를 만들어 자식의 sticky 기준을 바깥(`.seat-scrollport`)이 아니라 그 박스로 바꾼다.
    그 결과 표 헤더가 ①표 상단에서 `top`(56px)만큼 안으로 밀려 **빈 띠**를 만들고 ②세로 스크롤 시 표와 함께 화면 밖으로 나가
    **헤더 고정이 사실상 죽어 있었다**(2026-08-01 «헤더 sticky» 기록 이래 계속 — 표 안쪽이라 눈에 안 띄었다).
    `clip` 은 스크롤포트를 만들지 않아 모서리 자르기는 유지하면서 sticky 기준을 바깥으로 돌려준다. 미지원 브라우저는 clip 을 무시해 모서리만 안 잘린다(안전한 실패).
  - ★★**규칙을 코드로 강제한다**(2026-08-09 리팩토링 ⑶ — 위 세 함정이 하루에 3연속으로 났고 원인이 전부 같은 종류였다):
    - **스크롤 상자는 `.seat-scrollport` 하나뿐**이다(`<main>` 이 이 클래스만 단다 — 옛 이름 `.seat-main` 은 2026-08-10 제거). 규칙(overflow·overscroll·**패딩 0**)이
      그 클래스 한 곳에 모여 있고, 새 스크롤 상자를 만들려면 그 주석을 먼저 읽게 된다.
    - **z 척도는 토큰**(`--z-header` 2 / `--z-sticky-head` 3 / `--z-sticky-bar` 4 / `--z-tooltip` 5 / `--z-modal` 10 /
      `--z-numpad` 30 / `--z-undo` 60 / `--z-confirm` 70 / `--z-toast` 2000). **즉흥 숫자 금지** — 새 층은 이름을 하나 더 만든다.
      ※`.seat-app` 자신의 `z-index: 1000` 과 로그인 스탬프 `1400` 은 **페이지 레벨**(다른 스태킹 컨텍스트)이라 척도 밖이다.
    - **dev 가드**(`utils/seatDevGuard.js`, 프로덕션 무영향) — ★판정부는 **순수 함수**(`stickyViolations`)라
      브라우저 없이 변이 시험이 가능하다(`seatDevGuard.test.js`, 2026-08-10 감사 ⒝ 반영).
      ★검사①(«스크롤 상자»)과 검사③(«sticky 조상»)은 **다른 명제**다: `overflow:hidden` 은 버튼 리플·말줄임에 지천이라
      ①에서 세면 정상 화면에 39건이 쏟아진다(실측) → ①은 `auto/scroll` 만, `hidden` 의 위험은 ③이 정확히 본다.
      스크롤이 본래 기능인 폼 컨트롤(메모 `textarea` 등)도 ①에서 제외한다(안 빼면 8건) — 스크롤포트가 둘이 되거나 / 스크롤포트에 패딩이 붙거나 /
      sticky 와 스크롤포트 사이에 `overflow` 상자·`transform` 조상이 끼면 **콘솔에 즉시 경고**한다.
      실측: 2026-08-08 결함 ①(패딩)·②(`.seat-table` hidden)를 심어보면 둘 다 잡는다. 정상 상태에서는 조용하다.
  - 시각 문법 = **구글 설문 편집(질문/응답/설정)** 방식(유저 지시): 텍스트 탭 나열 + **활성 탭만 하단 굵은 언더바**(primary) + 활성 진한 색/비활성 흐린 색.
    ※최초엔 알약 버튼 2개였는데 '누르는 것'으로 읽혀 *지금 무엇을 보는 중인지*가 약했다 → 언더바로 교체.
  - **완료 버튼 = 확인 셀의 «확인완료» 아래**(★2026-08-08 유저 지시로 이동. 초록 = 브랜드 정본 그린 `--seat-done`).
    누르면 **안내 완료 → 완료 리스트로 아카이빙**(`archived_at=now()`). 안내 동선의 마지막 칸이라 여기가 제자리다.
  - ★**완료 버튼 3색**(2026-08-09 유저 지시 「올림까지 된것은 완료버튼 지금. 야외병행은 파란색. 그 전것은 회색(눌리기는함)」)
    — 직원 **2명이 병행**할 때 버튼 색만 보고 그 줄이 어디까지 갔는지 알게 한다.
    | 판정 순서 | 조건 | 색 |
    |---|---|---|
    | ① | `opt_outdoor_parallel` (야외병행) | **파랑** `--seat-done-parallel` = 브랜드 정본 네이비 `#2D4B82` |
    | ② | `raised && !raiseIgnored` (올림까지 끝) | **초록** `--seat-done` (기존 색 유지) |
    | ③ | 그 외 | **회색** `--md-surface-container-high` + `--md-outline` 테두리 |
    - **야외병행이 초록보다 앞선다** — 야외병행은 올림이 걸려도 **자리순서가 살아있어**(R1, `removesFromSeatQueue` 제외)
      자리가 나면 안내가 남는다. 세 상태 중 유일하게 «올렸는데 아직 내 일» 이라 초록에 묻히면 안 된다.
    - **회색 = 비활성 아님.** 눌리며, 누르면 «올림도 체크?» 모달로 간다. 그래서 굵기·테두리를 살려 *지금은 이르다* 만 말하게 하고
      `disabled` 처럼 흐리게 죽이지 않는다.
    - **포장도고려(포장영수증, R11)은 회색에 남는다** — 올림이 개념상 없는 줄이라 초록으로 칠하면 '주방에 나갔다'는 거짓 신호가 된다.
  - ★**완료 ↔ 올림 연동**(2026-08-08 유저 확정) — «완료를 눌렀는데 **아직 안 올린**» 줄에서만 모달이 뜬다.
    선택지 = **[올림도 체크하고 완료]**(기본 강조) / [올리지 않고 완료만] **2개뿐**, 닫기는 **우상단 X**(유저 확인 2026-08-08 — [취소] 버튼은 X 와 중복이고 완료 탭의 «취소» 라벨과 어휘가 충돌해 제거). «다음부터 묻지 않기» 도 **유저 지시로 제외**(매번 묻는다).
    - 전달 전이면 R8 순서를 지켜 **[전달·올림까지 하고 완료]** 로 한 번에 처리. 단 **주문번호가 없으면 전달 자체가 불가**(R8)라 그 선택지를 막고 «완료만» 만 남긴다.
    - 묻지 **않는** 경우 = ①이미 올림(주방에 이미 나갔다) ②올림 무효 줄(R11 포장영수증) ③자리대기 취소 줄(올리면 유령 주문이 된다). **바쁜 주방에서 매번 묻는 건 마찰**이라 애매할 때만 묻는다.
    - 쓰기는 **1회로 묶는다**(완료+올림을 한 patch 로) — 중간 상태가 다른 기기에 잠깐 비치지 않게.
  - **완료 탭**에서는 같은 자리가 **`대기열로`**(복귀, `archived_at=null`) — 중립색. **되돌릴 수 있는 상태 전환이라 재확인 모달 없이 즉시.**
    ※최초 구현(삭제 셀 안 `✓`/`↩`)은 **제거**했다 — 같은 동작이 두 곳이면 헷갈리고, 삭제 `✕` 바로 옆이라 오조작 위험이 컸다.
  - 완료 탭 정렬 = **최근 완료가 위**(방금 잘못 누른 걸 바로 되돌리게). 드래그 순서 이동은 안내중 탭에서만.
  - Realtime 은 기존 경로 그대로 — `archived_at` 변경이 곧 다른 기기에 전파된다(별도 배선 없음).
  - **열은 늘리지 않았다** — 삭제 셀 *안쪽*에 버튼을 하나 더 넣었다(열 추가 = 4곳 동기화 함정 회피).
- **테이블링 셀의 작은 버튼 2종**(2026-08-03 / ★2026-08-08 위치 변경 — 번호 **오른쪽**이 아니라 번호 **아래 줄**에 가운데 정렬. 32px 숫자가 폭을 온전히 쓰게):
  - **`+`** — 같은 테이블링 번호로 줄을 하나 더 만든다. *한 대기번호에 주문번호(영수증)가 여러 장 걸리는* 실제 케이스용.
    새 줄은 `1-a`/`1-b` 접미사가 자동으로 붙고, 표에서 **원래 줄 바로 아래**에 붙어 보인다(`groupByQueue` — 표시 전용 정렬).
  - **`취소`** — 자리대기 취소(`seat_status='canceled'` + `seat_order_alive=false`). 대기하다 그냥 가시는 손님용.
    ★2026-08-08: 취소를 누르면 **그 줄은 곧바로 «완료» 탭으로 넘어간다**(`archived_at` 동반) — 대기를 접은 손님은 더 이상 안내 대상이 아니라 대기열에 남을 이유가 없다.
    완료 탭에서는 **붉은 «취소» 라벨**로 정상 완료와 구분된다. 되살리기는 완료 탭의 **[대기열로] 하나로 모았고**(경로 이원화 방지),
    그때 **취소 상태도 함께 풀린다** — 손님이 돌아온 경우이고, 취소인 채로 대기열에 되돌리면 흐린 줄이 남아 더 헷갈린다.
    줄 삭제(✕)와 달리 **기록으로 남고** 되돌릴 수 있다. 취소된 줄은 스테이션 '자리후(대기)'에서 빠진다.
- **표 표시 순서** = 저장 순서(생성순) 위에 **같은 테이블링 번호끼리 인접**하게만 재배열한다(`groupByQueue`).
  DB·드래그 저장 순서는 건드리지 않는다 — 드래그 인덱스는 항상 원본 배열 기준으로 환산한다.
- ★**모든 번호·텍스트 입력은 «로컬 draft» 방식** — 화면은 입력 중 로컬 값만 그리고, 저장은 입력이 멎은 뒤 + 확정(blur/Enter/닫기) 시.
  - 표 입력칸 = `SeatTextField`(2026-08-03, 450ms). 한글 IME 조합 중에는 서버 값 미반영·sanitize 미적용.
  - **화면키패드 = `SeatNumpad`(2026-08-08 수정, 300ms)** — 2026-08-03 수정에서 «해당 없음» 으로 **잘못 제외했던 경로**다.
    실제로는 같은 병이었다: 키패드가 **서버에서 온 값(raw)** 을 읽어 `raw + 누른키` 를 만들고 즉시 서버로 보내는
    read-modify-write 라, 연타하면 두 번째 키가 아직 갱신 안 된 raw 를 읽어 앞 글자가 통째로 사라졌다(“132” → “12”/“2”).
    ▸ 수정 = 로컬 draft + **함수형 setState**(연타 순서 보장) + 닫기·언마운트 flush. 누적 로직은 순수 함수
    `utils/numpadDraft.js` 로 분리해 단위 검증 가능하게 했다.
    ▸ ★키패드는 **주문서관리 역할 기본 ON**(§11.2)이라, 이 경로가 곧 그 역할의 상시 입력 경로였다 — 체감 빈도가 높았던 이유.
- **올림 셀은 체크박스 3종**(2026-08-03) — `자리앉음` · `올리기 전달` · **`한번에`**(둘을 동시에).
  실무에선 대부분 한 번에 누르게 되지만 나눠 누르는 경우도 있어 **개별 2 + 함께 1** 을 다 둔다.
  `한번에` 는 두 값이 모두 켜져야 체크로 보이고, 풀면 재확인 후 **자리앉음까지 함께** 되돌린다(건 단위 = 푸는 단위).
  자리앉음이 잠긴 줄(야외·포장)과 올림 무효 줄(R11 포장영수증)에서는 함께 잠긴다.
- **재확인 모달**(실수 방지) — ★**행 단위 모달 6종은 전부 공용 `SeatConfirm` 한 벌**(2026-08-09 수렴).
  **닫는 길은 셋이고 전부 «아니오»다: 우상단 `✕` · 스크림 클릭 · `Esc`.** 그래서 액션 줄에는 **«할 것»만** 둔다
  — `[취소]`·`[유지]` 같은 순수 취소 버튼은 두지 않는다(2026-08-08 유저 지시. 당시 1곳만 반영됐던 것을 2026-08-09 에 6곳 완제).
  ※새 확인 모달을 만들 때 **스크림·다이얼로그를 손으로 그리지 않는다** — 그러면 다음 지시가 또 한쪽에만 반영된다(실증).
  ※`SeatModal`(설정·현황·통계)과 용도가 다르다: 저쪽은 «열어놓고 보는 판», 이쪽은 «묻고 닫는 판». 합치지 않는다.
  ※`SeatNumpad` 는 제목/설명/액션 구조가 아니라(숫자 그리드) 별도로 둔다 — 단 `Esc` 닫기는 이미 있다.
  - 올림된 주문의 **주문번호 수정/삭제** → "이미 올림이 전달된 주문입니다…". 승인하면 그 행에서는 계속 편집.
  - **줄 삭제** → 전 줄 재확인. 올림된 줄은 "이 줄은 이미 올림이 진행된 줄입니다…"로 문구 강화.
  - **올리기 전달 취소** → 모달 재확인 후 R10(한 스텝 취소).
  - **자리순서 리셋(↺)** · **포장도고려 전달(R11) 갈래 선택** · **완료↔올림 연동(R12)** 도 같은 한 벌을 쓴다.
- 표 아래 툴바: `+새 주문` · `+주문번호만`(queue_no NULL) · **기능 설정**(+ 물음표 툴팁).
  - ★**하단 고정(sticky bottom)**(2026-08-08 유저 승인) — 행이 많으면 이 버튼이 화면 밖이라 스크롤 왕복이 필요했고,
    **모멘텀 스크롤 중 첫 탭이 «스크롤 정지» 에 먹혀** 「한 번에 안 눌린다」 체감에 기여했다(iOS 표준 동작이라 코드로는 못 고친다).
    좌우·아래는 화면 패딩을 음수 마진으로 덮어 **전폭 바**, 아래는 `env(safe-area-inset-bottom)` 으로 **홈 인디케이터 회피**.
    실측: 스크롤 0·중간·끝 어디서든 툴바 아래끝 = 스크롤영역 아래끝(차이 0px), 버튼 히트테스트 통과.
- **세로형**: 삭제 열은 평소 접힘 → 행을 **오른쪽→왼쪽 스와이프**하면 나타난다.
- 카메라: 설정 `cameraEnabled` 켤 때만.

### 9.1 (구) 자리안내 (`guide`) — 원본 슬라이드 열 구성 기준 · 역사 참고
- 행: **테이블링**(=queue_no, 자동 1,2,3…) / order_no(텍스트) / 상태선택(확인필요·주문중·차후주문, 기본 '-') / **자리후 전달 체크박스**(실내만 표시, `seat_delivered` 반영·R8. 상태와 제조옵션 사이)
  / 제조옵션 드랍다운('-'·야외·포장·야외병행 단일선택, 폭 축소) / 자리순서 살아있음·필요없음(포장/야외 또는 순서취소 시 앰버 '필요없음'; 야외병행은 유지)
- **시작 갈래(`order_origin`·R9)는 UI에 아예 노출하지 않음** — 내부 게이팅 로직·DB에만 유지.
  표의 열도 없고, **생성 시 origin 선택 픽커도 두지 않는다**(2026-07-31 제거).
  ※ '+새 주문' **버튼 자체는 유지**(2026-08-01 복구) — 제거한 건 origin 픽커뿐, 버튼은 픽커 없이 `dine_in` 기본 생성.
  새 주문은 DB 기본값 `dine_in`(실내)으로 생성 → 항상 자리후 전달 관문(R8)을 거친다.
  포장·야외로 빠지는 건 전달 후 **제조옵션**(야외/포장/야외병행)에서 기록한다(R9).
- **큰 마디 색 구분**: 자리후(착석) 단계 = 테이블링·주문번호·상태·자리후 = 한 색 그룹(자리후 우측 경계선), 이후 제조 단계와 시각 구별.
  / 자리앉음·**올리기 전달** = 체크박스(2026-07-31 체크박스화, R2) / 특이사항
  / **확인**: 확인필요(`confirm_flag`)·확인완료(`confirm_done`) 체크박스 2상태(§14 결정로그).
  ※ 오늘(2026-07-31) UI 대개편으로 이 §9 서술 일부(명칭 주문서관리·그룹 카드 그리드·현황 앱바 모달·
  menu_out 버튼 제거·열 숨김)는 코드가 앞선다. UI가 유저 피드백으로 안정된 뒤 §9 전면 갱신 예정.
- **전달 흐름 = 명시 트리거(A안)**: 자리후 전달=체크박스 토글 / [올리기 전달]=버튼.
  ★명시 전달은 **상태를 실제로 바꾸는 관문에만** 둔다(`seat_delivered`·`raised`).
  일반 필드 수정(상태·제조옵션·특이사항 등)은 예나 지금이나 즉시 Realtime 전파된다.
- **새 주문 추가 버튼 = 표 아래·왼쪽 정렬**(`.seat-toolbar-below`) — 자리안내·주문서관리 공통(2026-08-01 통일).
- 하단: 카이막·커피 현황 거울(각 '올라감 / 제조완료함', 읽기).
- 카메라 없음.

### 9.2 (구) 제조매니저 (`manager`) — 역사 참고 (현행은 §9.0 으로 통합)
- 자리안내와 유사 입력부(전체폭 테이블) + **메뉴 나감**(이 역할만, R5).
- 입력부 아래 가로 배치: 카메라 슬롯 + 자리후(대기중)/올림/완료된 리스트 요약.
- ※ 원본 슬라이드의 매니저 페이지엔 카메라가 그려져 있지 않으나, 기획서 §9(매니저에도 카메라 슬롯)
  에 따라 **카메라 유지**(2026-06-25 결정). 매니저도 주방을 모니터하므로 둔다.

### 9.3 카이막 / 커피 (`kaymak`/`coffee`) — 동일 컴포넌트·독립 (현행, 2026-08-02 갱신)

- **세로 3구역**(각 타이틀 + 가로 스크롤 트랙, 오른쪽으로 쌓임). 높이 비율 **5:3:2**:
  1. **올라감(제조하기)** — 큰 카드. 번호 + 전달사항(**읽기 전용**) + [완료] 버튼. 카드 **밖 아래**에 동그라미 `◀ ▶` 이동 버튼.
  2. **자리후(대기)** — 곧 올라올 대기. 번호 + 전달사항(읽기 전용).
  3. **완료** — 번호 + 되돌리기(`↺`, 번호 옆 아이콘).
- **정렬 = 올린 시간순(`raised_at` asc)**. ★번호순이 아니다. 그 위에 수동 순서(◀▶)를 얹는다.
  - 수동 순서는 **워크스페이스(매장) 공유** — `seat_workspace_prefs.prefs.stationOrder = { kaymak:[id…], coffee:[id…] }`.
    새 카드는 시간순 위치로 뒤에 붙고, 완료/사라진 id 는 자동으로 빠진다.
- **주문 필드는 이 화면에서 수정하지 않는다(읽기 전용)** — 전달사항 수정은 주문 화면(§9.0)에서. 스테이션이 쓰는 건 `seat_station_status`(완료)뿐.
- **번호 표시에 중복 접미사(-a/-b)를 붙이지 않는다**(주문번호 그대로). 접미사는 주문 화면에서만.
- **포장 배지**: 제조옵션이 '포장'이면 카드에 `✓ 포장으로 변경됨`(수기 영수증에서 포장을 체크로 적는 관행과 통일).
  ★레이아웃 비침습(absolute 오버레이) — 배지가 떠도 번호 위치가 밀리면 안 된다.
- 완료 = 축하 효과(색종이 입자) 재생 후 처리(카드별 독립, 연속 완료 가능). 내가 누른 완료만 완료 구역으로(R6).

## 10. 비즈니스 규칙 R1~R12

| # | 규칙 | 구현 위치 |
| --- | --- | --- |
| R1 | **야외·포장**을 고르면 자리큐에서 빠진다 → 자리순서 '필요없음' 표시 + 자리앉음 잠금(✕ + 취소선). ★**야외병행은 예외 — 자리순서 유지·자리앉음 활성**(R9). ★제조옵션 셋 중 무엇을 골라도 `raised=true` 자동 세팅(2026-07-31 결정, 구 '미집계' 미해결 항목 해소) | OrderRow.setOpt / seatRules.removesFromSeatQueue |
| ~~R2~~ | ~~자리앉음/올림/제조옵션 중 하나 충족 시 올림 활성~~ → **폐지(2026-08-02 유저 지시)**. 주방에서 자리 배정과 제조 올림은 순서가 고정돼 있지 않은데 이 선행조건이 절차를 꼬았다. **올림의 관문은 R8(자리후 전달) 하나뿐**이며 `isRaiseEnabled` 는 삭제됐다. ※자리앉음의 ✕(해당없음) 표시 규칙(R1·R4)은 유지 | (삭제됨) |
| R3 | 상태선택 기본값 '-'(=`review_flag='none'`) | 스키마 DEFAULT |
| R4 | "필요없음"=자리대기 취소(`seat_order_alive=false`) 또는 야외·포장(R1), "살아있음"=순서 유지. 파생: **`seatNeeded = dineIn && seat_order_alive && !removesFromSeatQueue`** (★야외병행은 제외되지 않음 — R9) | OrderRow 파생상태 |
| ~~R5~~ | ~~"메뉴 나감"(`menu_out`)은 제조매니저만~~ → **UI 제거(2026-07-31)**. `menu_out` 컬럼과 `config`의 `canMenuOut` 플래그는 존치하나 읽는 코드가 없다(죽은 플래그). 되살릴 때 역할 게이트를 다시 배선할 것 | (제거됨) |
| R6 | 카이막/커피 완료는 서로 독립 | `seat_station_status` 행 분리 |
| R7 | 해당 행 변경을 모든 역할 화면에 즉시 실시간 반영 (전용 버튼 없음 — 구독이 자동 충족, 2026-07-31) | Realtime 구독(§8) |
| R8 | **실내(dine_in) 주문**은 "자리후 전달"(`seat_delivered`)이 **유일한** 관문. ★2026-08-02 갱신: 역할별 게이팅(`gateMode` — Manager 행 dim / Guide 부분 잠금)은 화면 통합으로 **폐지**. 대신 두 역할 공통으로 **전달 전에는 자리순서·야외포장·올림·전달사항 4셀을 비활성**(grayscale+클릭차단). 포장·야외 시작은 관문 없음. 주문번호가 없으면 전달 불가, 주문번호를 지우면 전달도 해제 | OrderRow(`preDeliver`)·commitOrder |
| R9 | **주문 시작 갈래 `order_origin`**: dine_in(실내→자리후 관문)/takeout(포장)/outdoor(야외, 자리후 우회). 제조옵션(opt_*)은 실내 주문의 *전달 후 변경기록*: 야외·포장=자리큐 제외 / **야외병행=자리순서 유지**(실내 자리 나면 입장). `seatNeeded=dineIn && seat_order_alive && !(opt_outdoor\|\|opt_takeout)` | OrderRow·seatRules(isDineIn·removesFromSeatQueue) |
| R10 | **올리기 전달 취소 = 한 스텝만 되돌린다**(재확인 모달 후). 올림이 이뤄졌던 경로 그대로: **제조옵션 경로**(야외/포장/야외병행)면 그 옵션 해제 + `seat_order_alive=true`(자리큐 복귀), 자리앉음 조작 재개 / **직접체크 경로**면 `raised` 만 해제하고 `seated` 는 유지. 취소 흔적·방식은 `raise_canceled`(text)에 남아 세부보기에 '올림취소됨(방식)'으로 표시되고, 다시 올림 시 NULL 로 리셋 | OrderRow.uncheckRaise·seatRules.raiseDetailText |
| R11 | **자리후 전달의 갈래 `deliver_mode` — '포장도고려 전달'**(2026-08-03 유저 지시). 제조옵션이 아니라 **전달과 같은 위계의 분기**다: "자리가 나면 앉겠지만, 주문은 일단 포장으로 간다". 자리큐 규칙(R1)은 건드리지 않는다 — **자리순서는 계속 살아있다**. 달라지는 건 주방 통지 여부 하나: **`maybe_store`(영수증 매장)** = 주방엔 포장이 새 정보 → 올림은 평소대로 + 스테이션 카드에 **'✓ 포장' 라벨** / **`maybe_receipt`(영수증 포장)** = 주방은 이미 포장으로 제조 중(자리후 우회) → **올림 무시**: 올림 체크박스 ✕+취소선 무효, 스테이션의 **올라감·자리후(대기) 양쪽에서 제외**, 제조옵션을 골라도 자동 올림 안 걸림(자리큐 제외만). 그 줄은 자리안내·주문서관리 **표에만** 남는다 | OrderRow(전달 셀·`raiseVoid`)·seatRules(`raiseIgnored`·`showsTakeoutLabel`·`isWaitingOrder`·`isRaisedOrder`)·StationScreen |
| R12 | **안내 «완료» 아카이브 `archived_at`**(2026-08-08 유저 지시). 자리안내·주문서관리가 안내를 끝낸 줄을 **완료 리스트로 옮긴다**(삭제 아님 — `↩` 로 대기열 복귀). 표는 상단 탭으로 [안내중]↔[완료] 전환. ★'끝'을 뜻하는 세 상태는 축이 다르다: `deleted_at`(줄 삭제·표에서 사라짐) / `seat_status='canceled'`(자리대기 취소·흐리게 남음) / `archived_at`(안내 완료·완료 탭). 스테이션 영향: **자리후(대기)에서는 빠지고**(안내 끝난 건은 '곧 올라올 대기'가 아니다) **올라감은 유지**(제조 진행·완료 판단은 스테이션 몫, R6 독립) | SeatOrderScreen(탭)·OrderRow(✓/↩)·seatRules(isArchived·isWaitingOrder) |

## 11. 라이브 카메라 모듈

- 독립 컴포넌트 `<LiveCameraFeed station=... streamUrl=... enabled=... />`.
- 현재: `enabled=false` 또는 `streamUrl` 없으면 placeholder("카메라 연동 예정 — 하드웨어 입고 후
  MJPEG 연결") 박스.
- 향후: `streamUrl` 주입 시 같은 슬롯에 `<img src={streamUrl}>` 드롭인(레이아웃 재작업 없이).
- **표시 여부 = 설정 패널의 `cameraEnabled`**(§11.1). 꺼져 있으면 화면이 카메라 슬롯 자체를
  렌더하지 않는다(placeholder도 안 보임) → 스테이션 작업 영역이 그만큼 넓어진다. 기본값 **off**.
- 설정: `streamUrl`(실제 스트림 주소)은 env 또는 Supabase config 레코드(운영자가 URL만 넣으면 켜짐) — 미결.
- 배치: **주문 화면(자리안내·주문서관리 공용)·카이막·커피 — 4탭 모두** `cameraEnabled` 하나로 통제(2026-08-02 화면 통합 후 역할 분기 없음).

### 11.1 설정 패널 (기기별 로컬 설정)

- 진입 = 상단 앱바 **우측 끝 "설정" 버튼** → 모달 다이얼로그(스크림 클릭·Esc·닫기로 종료).
- **저장 = 기기별 localStorage**(`seat.settings.v1`). 주방 태블릿마다 역할이 달라 기기 단위가 맞고,
  DB 마이그레이션 없이 늘릴 수 있다. (계정/워크스페이스 단위 설정이 필요해지면 그때 승격.)
- **확장 규칙**: 설정 항목은 `config/seatSettings.js`의 `SEAT_SETTINGS` 배열에 **항목만 추가**한다.
  `SettingsPanel`은 그 배열만 보고 그리는 범용 렌더러 — 새 항목 때문에 UI 코드를 고치지 않는다
  (새 `type` 도입 시에만 렌더 분기 추가). 저장값에 없는 키는 로드 시 기본값으로 채워진다(하위호환).
- 현재 `SEAT_SETTINGS` 항목: `cameraEnabled`(토글, 기본 off) / `hiddenColumns`(열 숨김).
- **★배열 밖 항목**(하드코딩 렌더 — 액션이거나 저장 위치가 달라 배열 규칙에 안 맞는 것들):
  화면 테마(시스템/라이트/다크, 공유 헬퍼 `@thinkmap/core` — 모선·타 위성과 같은 저장키) ·
  현황 열기 · **통계 열기**(§13) · 열 너비 초기화 · **오늘자 초기화**.
  - **오늘자 초기화** = 그 날 주문 전체 soft delete(한 타임스탬프로 묶음) + **10초간 하단 '초기화 취소'**
    (그 묶음만 정확히 복구 — 초기화 후 새로 만든 주문은 건드리지 않는다). ★지난 날짜 열람 중에는 **숨긴다**(과거 기록 보호).
- **열 폭은 예외적으로 워크스페이스 공유** — `seat_workspace_prefs.prefs.columnWidths`(가로/세로 각각).
  매장 내 어느 계정·기기든 같은 기준치. 저장 RPC `seat_save_workspace_prefs` 는 **shallow merge** 라
  다른 prefs 키(`stationOrder` 등)를 덮어쓰지 않는다. ★단 각 키 자체는 통째 교체이므로,
  `stationOrder` 처럼 하위 맵이 있는 키는 **전체 맵을 함께 써야** 한다.
- **경계**: 설정은 표시(view)에만 관여. orders/station_status 데이터 로직·권한과 결합 금지.
- **모듈 경계**: orders/station_status 데이터 로직과 결합 금지. 순수 "스트림 표시"만.

### 11.2 역할별 기능 설정 (기기 × 역할, 2026-08-02 신설)

- 진입 = 주문 화면(§9.0) 표 아래 툴바의 **"기능 설정"** 버튼 + 옆 물음표(hover/focus 툴팁:
  "역할별에 따라 개별 조절되는 세부 설정하기"). 모달 제목에 역할명이 붙는다.
- **저장 = `localStorage['seat.<name>.<roleKey>']`** — 자리안내와 주문서관리가 **각각** 독립.
  (같은 기기라도 역할 탭을 바꾸면 다른 설정. 화면 통합 후 두 역할의 유일한 차이가 여기다.)
- ★§11.1 의 "SEAT_SETTINGS 배열에 항목만 추가" **확장 규칙이 적용되지 않는다** — 저장 단위가
  기기 전역이 아니라 기기×역할이라 별도 렌더러로 하드코딩한다. 새 항목은 `useRoleFlag` + JSX 추가.
- 항목(4):
  | 항목 | 성격 | 기본값 |
  | --- | --- | --- |
  | 번호 맞춰 정렬하기 | **1회 액션**(비영속) | — |
  | 새 주문 시작번호 | 세션 한정(비영속, 새로고침·역할전환 시 초기화) | 자동채번 |
  | 번호 화면키패드 사용하기 | 영속 | 주문서관리 **켬** / 자리안내 끔 |
  | 올리기 전달 세부 보기 | 영속 | 전 역할 **켬** |
- ★**세부 보기는 표시 전용**이다. 꺼도 올림 취소(R10)와 그 재확인 모달은 그대로 동작한다
  (한때 꺼면 취소 자체가 불가능했던 버그 — 2026-08-02 수정).

### 11.3 터치 반응성 (아이패드 — 2026-08-08 실측)

- **인터랙티브 요소는 `touch-action: manipulation`** (`.seat-app` 의 button/input/select/textarea/label).
  `index.html` 뷰포트가 `user-scalable=yes, maximum-scale=5` 라 **더블탭 줌이 살아 있어**, 이게 없으면 Safari 가
  두 번째 탭을 기다리느라 click 을 늦게 쏜다 = 「한 번에 안 눌리는 느낌」. 핀치 줌은 그대로 유지된다.
  ※**드래그 핸들·열 리사이저는 `touch-action: none` 유지** — 위 선택자에 안 걸리게 span 으로 두었다.
- **hover 효과는 `@media (hover: none)` 에서 끈다.** 터치에서는 첫 탭이 hover 로 소비되거나 손을 뗀 뒤에도
  눌린 듯 남아 «안 눌렸나?» 로 오인된다.
- 터치 타깃은 **≥44px**(현행 버튼 48px). 표 아래 툴바는 화면 밖에 있을 수 있으니 신고 시 **버튼이 보이는 위치인지**부터 확인.

### 11.4 태블링 나란히 보기 (2026-08-09 유저 승인)

유저 원문: 「혹시 자리후에 좌우를 나눠서 `https://ceo.tabling.co.kr/list` 의 리스트를 함께 볼 수 있나?」 → 지휘부 헤더 실측 후 「만들어보자」.

- **설정 = 기기별 토글**(`tablingPane`, `SEAT_SETTINGS`). 역할별 «기능 설정»이 아니라 **기기 설정**에 둔다 —
  액자는 셸 레이아웃이라 4역할 전부에 걸리고, «기능 설정»은 주문 화면(guide·manager)에만 있어 스테이션에서 켤 길이 없다.
- **DOM 위치 = 스크롤포트(`.seat-scrollport`) 밖 형제.** `.seat-body`(flex) 안에 `[액자][손잡이][본문]`.
  ★액자를 스크롤포트 **안**에 넣으면 스크롤 상자가 하나 끼어 탭바·표 헤더·툴바의 sticky 기준이 통째로 흔들린다
  (2026-08-08 실증, §9.0). `.seat-body` 에는 **overflow 를 주지 않는다** — 같은 이유.
- **분할비 = flex-basis 퍼센트**(기본 0.28 ≈ 3:7, 하한 0.15 / 상한 0.6, `seat.tablingPane.ratio.v1` 로 기기별 지속).
  퍼센트라 **가로형(row)=폭 / 세로형(column)=높이** 로 같은 값이 그대로 먹힌다 → 방향 분기 없는 한 벌.
- **세로형(≤820px)은 위/아래 분할.** 768px 에서 좌우로 가르면 표가 못 쓰게 좁아진다.
- **손잡이 드래그** = `SeatTableHead.ColumnResizer` 와 같은 문법(DOM `pointerdown` + document 추적 —
  React 합성 이벤트가 이 환경에서 발동 안 함). ★드래그 중 `.is-splitting` 으로 **액자에 `pointer-events:none`** —
  포인터가 iframe 위로 들어가면 이벤트를 태블링 문서가 먹어 리사이즈가 끊긴다(iframe 리사이저의 고전적 함정).
- **액자는 역할 전환에 살아남는다**(`.seat-body` 형제, role 로 키를 주지 않음) — 탭 옮길 때마다 재로그인하면 못 쓴다. 실측 확인.
- ★**배율(줌)**(2026-08-09 유저 지시 「테이블링 같이 뜨는 영역 화면 더 넓게 보고 싶은데, 배율 조정 가능할까? 태블릿이야」).
  머리말 `[−][%][+]`, 50~150% 10% 단위, 숫자를 누르면 100% 복귀. `seat.tablingPane.zoom.v1` 로 기기별 지속.
  - 구현 = `transform: scale(k)` + `width/height: calc(100%/k)`, `transform-origin: 0 0`.
    **액자의 레이아웃 크기를 1/k 로 키우고 그림만 k 로 줄인다** — 태블링은 «더 큰 화면»으로 인식하고 우리는 작게 본다.
    폰트만 줄이는 게 아니라 **반응형 분기까지 넓은 쪽으로 넘어가서** 표가 잘리지 않는 게 핵심.
    실측: 330×791 칸에서 60% → 태블링이 보는 화면 551×1318, 50% → 661×1582 (그려지는 크기는 칸 그대로).
  - ★**내부 스크롤은 산다**(실측: 휠·터치 스와이프 양쪽, 배율 100%/60% 모두 내부 `scrollTop` 이동 확인.
    자리후 본문이 대신 스크롤되지 않음). transform 은 그리기만 바꾸고 내부 스크롤포트는 건드리지 않는다.
    배율 60%에서 400px 스와이프 → 내부 668px 이동(=400/0.6) — 손가락 밑 내용이 1:1 로 따라오므로 정상이다.
  - 분할비(칸 크기)와 배율(내용 크기)은 **다른 축**이다. 「더 넓게」는 칸을 키우거나 내용을 줄이거나 둘 다 되는데,
    칸은 이미 손잡이가 맡고 있어 배율은 후자를 맡는다.
- **폴백**: 머리말에 상시 `[새 탭]`, 12초 안에 `load` 가 한 번도 안 오면 「태블링을 불러올 수 없어요」 + [새 탭으로 열기]/[다시 시도].
  ★**교차 출처라 «차단당함»은 JS 로 알 수 없다** — `X-Frame-Options` 로 막히면 크롬이 오류 페이지를 그리고 `load` 는 **정상 발화**한다.
  그래서 타이머는 «영영 안 뜨는» 경우만 잡고, 「빈 액자」는 머리말 `[새 탭]` 이 받는다.
- 실측(2026-08-09): `ceo.tabling.co.kr/list` 는 `X-Frame-Options`·`CSP frame-ancestors` **없음** → 액자에 뜬다.
  headless 에서 `/login` 으로 리다이렉트되어 로그인 폼까지 정상 렌더 확인.
- ⚠**미해결(실기기 게이트)**: 액자 안 로그인은 **제3자 쿠키** 맥락이다. iPadOS Safari 는 기본으로 제3자 쿠키를 막아
  **액자 안에서 로그인이 안 되거나 세션이 유지되지 않을 수 있다.** 코드로 우회할 수 없는 축이라 실기기 판정이 최종 게이트고,
  실패 시 상시 `[새 탭]` 이 대안이다.

## 12. 진입 & 컴포넌트 구조

- `pageTypes.js`: `PAGE_TYPES.SEAT='seat'` + `isSeatPage()`. `INDEPENDENT_PAGE_TYPES`에 포함.
- `App.jsx`: `isSeatPage(pageType)`면 사이드바/페인 크롬 없이 **풀스크린** `<SeatSystemPage>` 렌더.
- `Sidebar.jsx`: 진입 버튼(기존 find-or-create 패턴 — `page_type='seat'` 페이지 조회/생성).

```
src/components/Seat/
  SeatSystemPage.jsx        풀스크린 컨테이너 + 상단 역할 탭 → 선택 역할 화면 렌더 + boardId 해석
  config/seatRoles.js       ROLES[] · STATIONS[] 데이터(하드코딩 금지)
  config/seatSettings.js    SEAT_SETTINGS[] · SEAT_COLUMNS · 열 폭 기본값 · load/save (§11.1)
  config/demoData.js        프리뷰 데모 행(orderDefaults = 전 컬럼 기본값 — 새 컬럼 추가 시 여기도 append)
  screens/
    SeatOrderScreen.jsx     ★자리안내·주문서관리 공용 주문 화면(§9.0) + 역할별 기능설정 모달(§11.2)
    StationScreen.jsx       station prop으로 카이막/커피 재사용(R6) — §9.3
    ※ GuideScreen/ManagerScreen 은 2026-08-01 통합으로 삭제됨
  components/
    OrderRow.jsx            행 단위 입력/표시 + 파생상태 + 재확인 모달(주문번호·삭제·올림취소)
    SeatTableHead.jsx       표 헤더(sticky) + 열 폭 리사이즈 핸들
    SeatNumpad.jsx          번호 화면키패드(테이블링/주문번호)
    SeatModal.jsx           공용 모달(스크림·Esc)
    SettingsPanel.jsx       설정 다이얼로그(SEAT_SETTINGS 범용 렌더러 + 배열 밖 항목들)
    StatusOverview.jsx      통합 현황(역할 공용)
    QueueChips.jsx          번호 칩 목록(StatusOverview 하위)
    SeatStats.jsx           통계 화면(§13) — 날짜 선택·과거 조회
    LiveCameraFeed.jsx      격리된 카메라 슬롯(placeholder)
  hooks/
    useSeatOrders.js        fetch + Realtime + CRUD + resetToday/undoResetToday
    useStationStatus.js     fetch + Realtime + CRUD
    useSeatSettings.js      기기별 설정 상태 + localStorage 지속
    useColumnWidths.js      열 폭(워크스페이스 서버 + localStorage 폴백)
    useStationOrder.js      스테이션 카드 수동 순서(워크스페이스 공유, prefs.stationOrder)
    useDemoSeat.js          프리뷰 전용 로컬 메모리 CRUD
  utils/
    seatRules.js            R1·R4·R9·R10·R11·R12 파생 순수함수(isDineIn·isWaitingOrder·raiseDetailText·isArchived 등)
    numpadDraft.js          화면키패드 입력 누적 순수함수(applyNumpadKey) — 연타 잘림 방지의 핵심
    seatStats.js            통계 집계 순수함수(computeSeatStats·formatDuration)
```

### 12.1 디자인 — ★Google Material Design 3 (seat 위성 한정 예외)

- seat 위성(`apps/seat`)은 프로젝트 기본 **'건조한 스타일'**(docs/DESIGN-PHILOSOPHY.md)을 **이 위성에 한해 Material Design 3 으로 오버라이드**한다(2026-07-25 유저 지시). 다른 위성·모선은 건조 스타일 유지.
- 구현 = **기존 컴포넌트에 Material 3 디자인토큰**(@material/web 미채택). JSX/DOM/클래스명 불변, 스타일만 Material. → 기능·구조 보존.
- 토큰(`--md-*`: surface tiers·primary/container·shape·elevation·state layer)은 **`.seat-app`/`.pv-center` 스코프에만** 정의 → `@thinkmap/core` 공유 토큰 무변(타 위성·모선 누수 0). `Seat.css` / `index.css`.
- 상태색은 시맨틱 유지(살아있음=초록 톤 / 필요없음=앰버 톤 / is-on=primary). 라이트/다크(`data-theme`) 양 지원, reduced-motion.
- 터치타겟 48dp 기본(주방 태블릿). **단 자리안내/제조매니저 입력 테이블(`.seat-table`)은 dense 모드**(행·패딩 압축)로 한 화면에 더 많은 행 — 세로 밀도 우선(유저 조정). 입력 폰트는 16px 유지.
- design-guardian(건조 스타일 검수)은 seat 위성엔 **비적용**(이 예외 때문). 향후 seat UI 작업은 Material 3 방향 유지.
- **운용 기기·방향(2026-07-31 유저 확인)** — 레이아웃 검증 기준:
  - **제조매니저 = 태블릿 세로(portrait) 주력.** 입력 테이블이 10열이라 세로 폭(≈768px)에서 가장 빡빡하다.
    가로 스크롤 없이 한 화면에 들어오는지가 이 화면의 합격선.
    → **`max-width:1023px`에서 행 하나를 2줄 카드로 접는다**(CSS Grid `grid-template-areas`, Seat.css).
    좌측 = **테이블링·주문번호가 좌우로 나란히, 각각 2줄 높이를 통째로 차지**(세로 병합) +
    그 오른쪽에 **상태(위)/자리후(아래)가 두 줄로 한 칸**, 우측 = 나머지 전부
    (제조옵션·특이사항·전달·확인 / 자리순서·올림). 헤더 행은 세로에서 숨긴다.
    ★**DOM 은 건드리지 않는다** — OrderRow 는 자리안내와 공용이라 셀 순서를 바꾸면 헤더 3곳 동기화
    함정에 걸린다. 세로 대응은 CSS 배치만으로.
  - **카이막·커피 = 가로·세로 둘 다.** 스테이션 3분할([카메라]·[올림/완료]·[자리후 대기])은
    가로에서만 3열, 세로에선 세로 적층으로 떨어진다(현재 분기 `min-width:1024px`).
    카메라를 끈 상태(§11.1 기본값)에선 세로에서도 작업 영역이 충분해야 한다.
  - **자리안내**는 기존대로 넓은 화면 우선.

## 13. 통계 (2026-08-02 신설 — 구 Phase 3)

- 진입 = 설정 → **"통계 열기"**. 구현 = `components/SeatStats.jsx` + `utils/seatStats.js`(순수 집계).
- **날짜 선택**: 보고 있는 날짜가 기본, 달력으로 **지난 날짜도 조회**(최대값 = 오늘).
  오늘(=화면이 이미 들고 있는 날)이면 메모리 데이터를 그대로 쓰고, 다른 날짜면 그 날짜로 직접 조회한다(중복 조회 없음).
- **기본 플로우 = 테이블링(`created_at`) → 주문(`order_no_at`) → 자리후 전달(`delivered_at`) → 올림(`raised_at`) → 완료(`completed_at`)**.
  각 구간은 **양끝 시각이 모두 있는 주문만** 집계(부분 데이터 허용 — 통계 도입 이전 주문은 자연히 빠진다).
  음수 구간(시계 역전·수동 수정)은 버린다.
- 지표:
  - **주문 흐름 퍼널** — 단계별 통과 건수.
  - **구간 소요시간** — 구간별 + 전체 + 스테이션별(올림→완료, 카이막/커피 분리). **중앙값을 앞세우고** 평균·최대·건수를 함께.
    ★평균은 방치 1건에 크게 흔들려 주방 체감과 어긋나므로 중앙값이 대표값이다.
  - **제조옵션 변경** — 야외/포장/야외병행/변경없음 건수·비율.
  - **운영 신호** — 확인필요(미확인 포함)·올림취소 이력·테이블링 번호 없는 주문·실내 비율·피크 시간대.
- ★새 지표를 넣을 땐 `seatStats.js`(순수 함수)에만 로직을 두고 컴포넌트는 표시만 한다.

## 13.1 단계별 로드맵

- **Phase 0 (완료)**: 본 기획서 합의.
- **Phase 1 (완료)**: 스키마 적용 → 진입 배선 → 데이터 훅+Realtime → 화면 3종 → R1~R10 → 카메라 슬롯.
- **Phase 2**: 카메라 실연결(streamUrl 주입), 운영 설정 UI(역할·스테이션·카메라 URL).
- **~~Phase 3~~ (완료, §13)**: 소요시간 집계·리포트.
- **Phase 4(비범위 후보)**: 영상 OCR 자동 번호인식 연동, POS/프린터.

## 14. 결정 로그 / 미해결

**결정됨 (2026-06-21)**
- 신규 모듈로 격리(`seat_` 테이블 / `src/components/Seat/`). daily 본문·TipTap과 분리.
- 진입 = `page_type='seat'` + 키오스크 풀스크린(사이드바/크롬 없음).
- 역할 = 화면 내 탭 전환(태블릿당 1역할 운용, localStorage로 마지막 역할 기억).
- 역할·스테이션 = `config` 상수로 데이터화(별도 DB 테이블 보류 = 과설계 회피).
- queue_no = (workspace, business_date)별 DB 트리거 자동 부여.
- (※ 초기엔 board_id 테넌시였으나 2026-06-25 워크스페이스 grant 모델로 이관 — 아래 참조.)
- 카메라 = 순수 슬롯(데이터 로직과 결합 금지), 지금은 placeholder.

**결정됨 (2026-06-25, 원본 기획서·슬라이드 대조)**
- 자리안내 전달 흐름 = **명시 버튼 방식(A안)**: [자리후 전달]·[올리기 전달]·[전체에게 전달].
  ※ **2026-07-31 정정**: [전체에게 전달]은 제거. `updated_at`만 갱신하는 no-op 이었고(모든 필드 수정이
  이미 Realtime 전파), 원칙을 지탱하던 건 상태를 바꾸는 두 관문(`seat_delivered`·`raised`)이었다.
  "필드 편집도 눌러야 공유"가 정말 필요해지면 그건 초안 버퍼가 필요한 별도 작업.
  모든 변경 자동 전파가 아니라, 버튼을 눌러 공유하는 명시 트리거(주방 실수 방지). 향후 개선 가능.
- '확인필요'는 상태선택(확인필요/주문중/차후주문)과 **별개의 행 플래그**(`confirm_flag`).
  ※ **2026-07-31 확장**: 확인 신호는 2상태로 분리 — `confirm_flag`(확인필요, 주문서관리가 켜는 신호)
  + `confirm_done`(확인완료, 자리안내가 처리했다는 응답). 하이라이트 = `confirm_flag AND NOT confirm_done`,
  **양 화면(주문서관리·자리안내) 동일 표시**. 확인필요/확인완료 모두 체크박스(윗줄/아랫줄).
  확인완료를 켜면 하이라이트만 꺼지고 확인필요 체크는 남는다(처리 기록). 확인필요를 껐다 켜면
  `confirm_done`을 false로 되돌려 재신호(앱 컴포지트 patch). migrate-seat-confirm-done.sql.
- 분석용 `raised_at`(올림 시각) 컬럼 추가.
- ★ **권한 = 워크스페이스 grant 모델로 이관**(Phase A 토대 라이브). `board_id`+`is_board_member` 폐기 →
  `workspace_id` + `can_in_workspace(workspace_id, 'editor')`. 4역할은 RLS가 아닌 앱 가드. 공용 파트너
  계정(`sarurufarm.partner`)·멤버는 워크스페이스 editor grant 보유(멤버십·로그인 계정 무관).

**결정됨 (2026-08-02)**
- **화면 4 → 3**: 자리안내·주문서관리를 `SeatOrderScreen` 하나로 통합(동일 기능·동일 위계). 역할 게이팅(`gateMode`) 폐지.
  두 역할의 유일한 차이는 §11.2 역할별 기능 설정(기기×역할 localStorage).
- **R2 폐지**: '자리앉음 → 올리기 전달' 선행조건 제거. 주방에서 자리 배정과 제조 올림은 순서가 고정돼 있지 않다.
  올림의 관문은 **자리후 전달(R8) 하나**. `isRaiseEnabled` 삭제.
- **R10 신설**: 올림 취소 = 재확인 모달 + **한 스텝만** 되돌림. 흔적·방식은 `raise_canceled`(text).
- **전달사항 필드 통일**: 스테이션 카드도 `seat_orders.notes` 를 쓴다 → `seat_station_status.change_note` 는 **사실상 폐기**(컬럼은 존치).
  트레이드오프: 카이막·커피가 서로 다른 메모를 남길 수 없고 last-write-wins 로 덮인다. 한 주문의 전달사항은 하나라는 판단으로 수용.
  스테이션은 **읽기 전용**(수정은 주문 화면에서) — 실수 수정 경로를 한 곳으로 모았다.
- **메모 열 신설**(`memo`): 표 오른쪽 행 단위 자유 메모. 두 역할 공용, 스테이션 미노출. notes(전달사항)와 역할 분리.
- **스테이션 정렬 = 올린 시간순**(번호순 아님) + 수동 ◀▶ 순서는 **워크스페이스 공유**(`prefs.stationOrder`).
  ※`seat_workspace_prefs` Realtime 등록 필요(migrate-seat-prefs-realtime.sql). 미등록이어도 저장·공유는 되고 반영만 새로고침 시점.
- **파괴적 조작에 재확인 모달**: 올림된 주문의 주문번호 수정/삭제 · 줄 삭제(전 줄) · 올림 취소.
  '오늘자 초기화'는 10초 되돌리기 창(soft delete 묶음 복구) + 지난 날짜 열람 중 숨김.
- **날짜 달력**: 헤더 날짜로 지난 날짜 조회(그 날 데이터를 그대로 로드). 통계도 날짜 선택 지원(§13).
- **화면 테마**(시스템/라이트/다크)를 설정에 노출 — 공유 헬퍼 `@thinkmap/core`(모선·타 위성과 동일 저장키).

**결정됨 (2026-08-03) — R11 포장도고려 전달**
- 처음엔 '포장도고려'를 **제조옵션 드롭다운 4번째 항목**으로 설계했다가, 유저 정정으로 **'전달'과 같은 위계의 분기**로 옮겼다.
  이유가 설계를 갈랐다: 제조옵션은 *전달 후 변경기록*이라 자리큐 규칙(R1)을 건드리는데, 포장도고려는
  자리순서를 그대로 둔 채 **주방 통지 여부만** 달라지는 일이다. 위계를 옮기니 R1을 손대지 않아도 됐다
  (구 안은 "큐가 유지되는 제조옵션"이 야외병행 말고 하나 더 생겨 R1/R4 서술이 지저분해졌다).
- 영수증 갈래로 두 갈래: **매장**(주방엔 새 정보 → 올림 + '✓ 포장' 라벨) / **포장**(주방은 이미 제조 중 → 올림 무시).
- '올림 무시'는 새 개념을 만들지 않고 기존 관용을 재사용 — 체크박스 **✕+취소선(`seat-check--void`)**, 자리앉음 잠금과 같은 표현.
- 함께: 제조옵션 표기를 **포장 → 포장으로변경**으로 통일(스테이션 태그 "포장으로 변경됨"과 언어 일치),
  드롭다운 순서 `야외 / 야외병행 / 포장으로변경`. 통계 '운영 신호'에 포장도고려 건수 2종 추가.
- 열·DOM 은 무변경(전달 셀 **안쪽**에 두 번째 줄을 넣었을 뿐) → 헤더 7셀·행 10셀 그대로, 세로형 배치 영향 0.
- **★타이핑 끝 글자 유실 수정**(유저 신고: "132 쳐야 하는데 1만 남고, '취소' 치면 '취'까지만"). 표시 문제가 아니라
  **입력 모델의 구조 문제**였다 — 키 입력마다 서버로 쓰고 화면은 서버 값을 그렸으니, 타이핑 중 도착한 Realtime refetch 가
  방금 친 글자를 되돌리고 한글 IME 조합 중 리렌더는 조합 글자를 잘랐다. 개별 증상을 막는 대신 **입력 중 화면은 로컬 draft만
  본다**는 규칙(`SeatTextField`)으로 바꿔 원인을 없앴다. 부수 효과로 서버 쓰기 횟수도 글자수→타이핑 단위로 줄었다.
  ※기존의 `pendingRef` 보호(useSeatOrders)는 그대로 둔다 — 다른 경로(화면키패드 등)의 안전망.
- **한 대기번호 : 여러 영수증** — 별도 데이터 모델을 만들지 않았다. 이미 중복 `queue_no` 를 허용하고 `1-a/1-b` 로 구분하고 있어서,
  부족했던 건 **줄을 쉽게 늘리는 수단(+ 버튼)** 과 **같은 번호가 떨어져 보이는 문제(표시 그룹핑)** 둘뿐이었다. 스키마 무변경.
- **자리대기 취소 버튼** — 삭제(soft delete)와 구분되는 별도 상태로 뒀다. 이미 스키마에 있던 `seat_status='canceled'` 를 처음으로 UI에 연결.
- **'한번에' 체크박스 신설**(같은 날, 유저 지시 "실질적으론 한번에 누르게 되더라. 물론 나눠서 할 때도 있어서").
  개별 2개를 없애고 하나로 합치는 대신 **3종 병존**(각각·각각·함께)을 택했다 — 나눠 누르는 흐름이 실재하고,
  합치면 '자리앉음만' 같은 중간 상태를 표현할 수 없다. 푸는 단위도 건 단위와 맞춘다(함께 걸었으면 함께 풀린다).

**결정됨 (2026-08-08) — R12 안내 «완료» 아카이브**
- 유저 원문: 「자리후에 완료 항목을 넣을거야. 자리안내와 주문서 관리용이고, 안내를 모두 완료해서 아카이빙 되는거야.
  확인된것을 누르면 다시 대기열로 가도록하는 장치도 있고. 위에서 안내중(대기열), 완료 리스트를 전환해서 보는 방식이면 되겠다」
- **기존 컬럼 재사용을 일부러 피했다.** `deleted_at`(삭제)·`seat_status='canceled'`(대기취소)는 뜻이 다른 '끝'이라,
  거기에 완료를 얹으면 세 가지가 한 축에서 뒤엉킨다. 새 컬럼 `archived_at`(nullable timestamptz) 하나가 가장 싸고 되돌리기 쉽다.
- **완료/복귀에 재확인 모달을 붙이지 않았다** — 삭제와 달리 한 번 눌러 되돌아오는 상태 전환이라, 모달은 되레 마찰이다.
  대신 완료 탭을 **최근순**으로 둬서 오조작 직후 맨 위에서 바로 ↩ 하게 했다.
- 스테이션 영향 판단: 대기에서는 빼고 **올라감은 남긴다**. 안내가 끝나도 제조는 진행 중일 수 있고, 제조 완료 판단은 스테이션 몫이다(R6).

**미해결 (진행하며 합의)**
- [x] 권한·로그인 = 워크스페이스 grant(editor)로 확정. 태블릿이 어느 계정으로 로그인하든 editor 면 동작.
- [ ] 완료 처리 후 행 표시 — 완료 행을 리스트에서 숨길지/접을지/유지할지.
- [x] 카메라 **표시 on/off** = 설정 패널 `cameraEnabled`(기기별 localStorage, 기본 off)로 확정
      (2026-07-31 유저 지시 "카메라는 당장 필요없으니 설정 칸을 만들어 거기서 켜고 끄자").
- [ ] 카메라 **streamUrl** 저장 위치(env vs Supabase config 레코드) 최종 결정 — 하드웨어 입고 후.
- [x] **제조옵션만 체크·미올림 주문의 리스트 누락** → 해소: 제조옵션 선택 시 `raised=true` **자동 세팅**으로 결정(2026-07-31). R1 갱신 반영.

## 15. 수정 전 체크리스트

- [ ] RLS 변경 시 워크스페이스 grant 모델(`can_in_workspace`/`current_workspace`)을 따랐는가(역할로 RLS 가르지 않기).
- [ ] 자리후 데이터를 daily 본문(`daily_blocks`)·TipTap에 섞지 않았는가(독립 테이블 유지).
- [ ] 역할·스테이션을 하드코딩하지 않고 `config`/text 컬럼으로 두었는가(역할 추가 시 스키마 불변).
- [ ] 카메라 컴포넌트가 orders/station_status 데이터 로직과 결합되지 않았는가(순수 슬롯).
- [ ] Realtime 채널에 cleanup(`removeChannel`)·`mountedRef` 보호가 있는가.
- [ ] **새 구독을 손으로 만들지 않았는가** — `useRealtimeSync` 를 써라(§8.2). 맨 `supabase.channel(...).subscribe()` 는
      **한 겹**이고, 조용히 죽으면 화면이 끊긴 시점 스냅샷을 «최신인 얼굴로» 계속 보여준다.
- [ ] **끊김 감지를 붙였으면 «재연결 직후 한 번 읽기»가 있는가** — 끊긴 동안의 변경은 이벤트로 오지 않는다.
      이게 빠지면 연결 표시만 초록이고 내용은 굳는다(또 하나의 «정상 얼굴을 한 고장»).
- [ ] 마이그레이션이 재실행 안전(IF NOT EXISTS / DROP POLICY IF EXISTS)한가.
- [ ] 마이그레이션을 합의 없이 프로덕션에 적용하지 않았는가(SQL 제시 → 승인 → 통합 세션 적용).
- [ ] `seat_orders` 에 컬럼을 추가했으면 `config/demoData.js` 의 `orderDefaults` 에도 기본값을 넣었는가(프리뷰 정합).
- [ ] 표에 열을 추가했으면 **4곳**을 동기화했는가 — `SEAT_COLUMNS`(숨김) · `grid-template-areas`(가로/세로) · `.seat-cell-<key>` grid-area · `is-hide-<key>` 규칙.
- [ ] 파괴적 조작(삭제·초기화·올림취소)에 재확인 또는 되돌리기를 붙였는가.
- [ ] 스테이션 화면에서 주문 필드를 직접 수정하고 있지 않은가(읽기 전용 — 수정은 주문 화면).
- [ ] 스테이션 노출 조건을 바꿨으면 `isWaitingOrder`·`isRaisedOrder` **양쪽**을 함께 봤는가(R11처럼 한쪽만 제외하면 대기·올라감 사이에 틈이 생긴다).
- [ ] **sticky 를 건드렸으면** — 스크롤포트는 `.seat-scrollport` **하나뿐인가** / 그 패딩이 0인가 / 새 sticky 층의 오프셋을
      토큰(`--seat-tab-h`·`--seat-tab-gap`)으로 더했는가 / 조상에 `overflow: hidden` 을 새로 만들지 않았는가(**`clip` 을 써라**).
- [ ] **CSS 에서 클래스를 지웠으면** — 지운 이름이 **콤마 셀렉터 목록의 마지막 줄**이 아니었는가?
      마지막 줄에는 `{ ... }` 선언부가 붙어 있어, 그 줄을 지우면 **앞의 형제 셀렉터들이 고아가 되어 다음 규칙에 흡수된다**
      (2026-08-09 실제 발생). `npx vitest run apps/seat` 의 구조 검사(§16.1)가 이걸 잡는다.
- [ ] **아이콘을 넣었으면** `components/SeatIcon.jsx` 를 썼는가 — **문자 글리프(✕·✓·●·▼)는 UI 부품으로 쓰지 않는다**
      (폰트 폴백에 크기·기준선이 흔들리고 최악엔 두부로 뜬다). 의사요소라 SVG 를 못 넣는 자리는 `--seat-icon-*` 토큰 + `mask`.
      ⚠**mask 의 실패 모드는 «안전»하지 않다** — 미지원 환경에선 `background-color` 만 남아 **11×11 실심 사각형**이 된다
        (사라지는 게 아니라 **검은 네모**). 지금 타깃(WebView 126·iPadOS)에선 이론적이지만, 이 우회를 쓸 땐 그 사실을 안고 쓴다.
        ★이 자리가 도는 근거: 부모 `.seat-check input` 이 `display: inline-grid` 라 `::after` 가 그리드 아이템으로 블록화돼
        width/height 가 먹는다(inline 이면 0×0 으로 사라졌을 자리다). 같은 파일 `:checked::after` 가 이미 그 패턴에 의존한다.
- [ ] **아이콘을 텍스트와 나란히 놓았으면** 그 컨테이너가 `flex`/`inline-flex` + `align-items: center` 인가 —
      인라인 흐름에 두면 SVG 의 기본 `vertical-align: baseline` 때문에 아이콘이 글자 위로 뜬다(실측 ~2px, 2026-08-10 재감사).
      Seat.css 에는 `vertical-align` 선언도 svg 전역 규칙도 **없다** — 받쳐주는 게 없으니 컨테이너가 책임진다.
      ★**자동 검사로는 안 잡힌다**(「측정은 통과, 그림은 깨짐」). 그래서 픽셀을 확인하는 대신 **확인이 필요 없는 구조**로 둔다.
- [ ] **확인 모달을 추가했으면** `SeatConfirm` 을 썼는가(스크림·다이얼로그를 손으로 그리지 않는다 — §9.0 재확인 모달).
- [ ] **「없습니다」·「— … 없음 —」 류 빈 문구를 새로 썼으면** `emptyText(loadState, …)` 를 거쳤는가 —
      **`length === 0` 만 보고 「없다」고 말하면 읽기 실패가 정상 상태의 얼굴로 착지한다**(§8.1).
      새 데이터 훅을 만들었으면 `loadError`·`loadedAt` 을 노출하고 `dataLoadState` 의 `errors` 에 넣었는가.
- [ ] **읽기 실패 알림을 토스트로 만들지 않았는가** — 읽기 실패는 사건이 아니라 **지속 상태**다.
      사라지는 알림은 사라진 뒤 다시 「없음」과 구별되지 않는다(§8.1).
- [ ] **모션을 넣거나 고쳤으면** — `npx vitest run apps/seat` 의 모션 감사(§16.1)를 통과하는가.
      기계가 **안 보는 둘은 사람이 본다**: ⑴요소별 딜레이 체인(순차 등장)이 §5 예외 4조건 안인가
      ⑵애니메이션을 못 봐도 뜻이 전달되는가(정보를 모션으로만 나르지 않는가).
- [ ] `seatRules.js` 의 판정을 고쳤으면 `seatRules.test.js` 판정표도 함께 고쳤는가(레포 루트 `npx vitest run apps/seat`).
- [ ] 같은 판정을 화면에서 **다시 인라인으로** 쓰고 있지 않은가(규칙은 `seatRules.js` 한 곳 — 인라인 사본은 규칙 수정을 안 따라온다).

### 15.1 쓰기 규율 (2026-08-09 리팩토링 ⑵)

★**`seat_status` 와 `raised` 는 같은 사실을 두 번 적는다.** 짝을 손으로 맞추던 지점이 **11곳**이었고,
한 곳만 빠뜨리면 «올림인데 pending» 같은 유령 상태가 생겨 스테이션 목록(`isRaisedOrder`)과 통계(`seatStats`)가
**서로 다른 답**을 낸다. 지금까지 맞아 있던 건 구조가 보장해서가 아니라 우연이었다.

⇒ 상태 전이는 **`seatRules.js` 의 쓰기 헬퍼로만** 만든다. 화면에서 `seat_status:` 를 직접 쓰지 않는다.

| 헬퍼 | 쓰는 곳 | 하는 일 |
|---|---|---|
| `raisePatch(o, now?)` | 제조옵션 선택 · 올리기 체크 · 한번에 · 완료+올림 | 올림 켜기(+`seat_status`·시각·취소이력 해제). **이미 올라간 줄이면 `raised_at` 유지** |
| `unraisePatch(canceled?)` | 갈래 전환(R11) · 자리순서 리셋 · 올림취소(R10) | 올림 끄기. 인자 `undefined`=이력 손대지 않음 / `null`=지움 / 방식 문자열=그 방식으로 취소 기록 |
| `cancelPatch(now?)` | 자리대기 취소 | 상태 + 자리순서 종료 + 완료 탭(`archived_at`) **셋을 함께** |
| `uncancelPatch(o)` | 완료 탭 [대기열로] | 올림 여부에 맞는 상태로 복원 |
| `deliverPatch(now?)` | `commitOrder('seat')` (라이브·프리뷰 훅 **양쪽**) | 자리후 전달(R8) + 통계 시각 |
| `undeliverPatch()` | 주문번호 비움(표·키패드) · 전달 체크 해제 | 전달 해제 3키(플래그·시각·갈래)를 함께 |
| `raiseMethodOf(o)` | 올림취소 이력(R10) | ★2026-08-17 `optOf` 로 **순서 통일**(아래 주) — 두 함수가 한 순서만 쓴다 |
| `optOf(o)` / `optPatch(v)` | 제조옵션 드롭다운 | boolean 3개는 **실제로 단일 선택** — 여기를 통하면 «둘이 켜진» 상태를 만들 수 없다 |
| `isParallel(o)` | 완료 버튼 3색 | 야외병행 판정(§9.0) |

※**해소됨(2026-08-17)** — `raiseMethodOf` 는 이제 `optOf` 와 **같은 한 순서**를 쓴다.
  전에는 여기만 «포장 먼저»라, 두 컬럼이 동시에 `true` 인 행에서 **화면 드롭다운은 「야외」인데 올림취소 이력은 「포장」**으로 갈렸다.
  「구 데이터에 그런 행이 있는지 몰라서」 미뤄 뒀던 것을 **실측으로 닫았다**(orch 승인 · 읽기 전용 1쿼리 · 쓰기 0):
  · `seat_orders` **294행 중 동시 true = 1행**(2026-07-20, id `a1000000-…-0004` = 손으로 만든 시드 꼴).
  · 그 1행은 `raised=false` · `raise_canceled=null` ⇒ **`raiseMethodOf` 가 애초에 호출되지 않는다. 관측 영향 0.**
  ⇒ 단일 `true` 행에서는 두 순서가 원래 같은 답을 내므로 **도달 가능한 모든 데이터에서 동작 동일**이고,
    그 1행은 이제 드롭다운과 같은 라벨을 받는다. 시험이 양쪽을 다 본다(구 구현으로 되돌리면 2건 red — 실측).

※컬럼 구조는 그대로다(**DB 마이그 없음**). `seat_status` 를 파생값으로 강등하는 것은 별건이다 —
  여기서는 «두 번 적되 **한 곳에서** 적는다» 까지만 했다.

## 16. 회귀 가드 (2026-08-09 신설)

### 16.1 단위 테스트

- `apps/seat/src/components/Seat/utils/seatRules.test.js` — **R1~R12 판정표**(19 케이스).
  순수 함수라 값이 싸고, **쓰기 경로 리팩토링의 안전망**이다. 규칙 파일 바로 옆에 둔다(같은 폴더 = 함께 낡지 않는다).
- 실행 = 레포 루트에서 `npx vitest run apps/seat` (전체는 `npx vitest run`). 루트 `vitest.config.js` 의 include 가
  `apps/*/src/**` 를 포함한다.
- `apps/seat/src/components/Seat/seatCss.test.js` — **Seat.css 구조 검사**(6 케이스, 2026-08-09 감사 후 신설).
  ★**픽셀 대조로는 볼 수 없는 CSS 결함**을 잡는다 — 렌더되지 않는 셀렉터(`.seat-row--gated` 처럼 지금 아무도 안 쓰는 것)는
  스크린샷에 나타나지 않아 «16/16 동일»을 통과해 버린다. 검사 항목:
  ⑴ 서로 다른 행 모드(`--gated`/`--guide-locked`)가 한 규칙에 섞이지 않음 ⑵ 게이트 행 입력에 이중 dim 없음
  ⑶ **셀렉터 목록 한가운데 주석 문단이 끼지 않음**(구획을 삼킨 지문) ⑷ sticky 3층이 z 토큰 사용
  ⑸ 스크롤포트 1개 + 패딩 0 ⑹ `.seat-table` 은 `clip`.
  ※⑴⑵⑶은 실제 결함 커밋(`e131115`)에 돌려 **셋 다 잡히는 것**을 확인하고 넣었다(검사가 헛돌지 않는다는 증거).
- `apps/seat/src/components/Seat/utils/cssAudit.{js,test.js}` — 위 검사가 쓰는 **파서와 술어, 그리고 그 파서의 자체 시험**.
  ★교본 «가드 자체도 감사 대상»: 파서에 사각이 있으면 «위반 0» 은 거짓 안심이 된다. 그래서 파서를 따로 두고
  합성 CSS 로 시험한다 — ⑴블록 없는 at-rule(`@import …;`)이 뒤 규칙을 삼키지 않는지(놓치면 `.seat-app` 의 z 토큰
  정의가 지도에서 통째로 사라진다) ⑵중첩 `@media` ⑶주석 속 중괄호·백틱 ⑷`@keyframes` 스텝 제외,
  그리고 **변이 시험**(결함을 인위로 주입 → 적중 / 고친 판 → 조용).
  ⚠실전 교훈: 주석 마스킹 토큰을 **공백으로 두면 술어가 무의미해진다**(후손 셀렉터가 전부 공백을 포함 — 실측 335/335 오탐).
  토큰은 대상 문법에 **등장할 수 없는 문자열**로 잡고, 도입 시 반드시 양방향(정상본 0건 / 결함본 그 1건)으로 확인한다.
- `apps/seat/src/components/Seat/utils/seatLoadState.test.js` — **화면이 지금 진실인가**(31 케이스, §8.1·§8.2).
  §8.1 읽기 실패가 「없음」으로 착지하지 않는지 + §8.2 구독 상태 기계(`syncTransition`)·백오프·경고 침묵 규칙.
  ★이 시험의 성질: 상태가 갈리는지만 보지 않고 **세 문구가 서로 다른지**까지 본다(`new Set(three).size === 3`).
  결함의 정의 자체가 「세 사실이 같은 화면으로 착지한다」였으므로, 문구를 하나로 합쳐도 초록불이면 시험이 결함을 안 보는 것이다.
  도입 시 **변이 2종**으로 확인했다 — ⑴`failed` 분기 삭제 → 2건 red ⑵「성공한 적 있으면 실패 무시」로 순서 뒤집기 → 2건 red.
  §8.2 부분도 **변이 4종**으로 확인했다 — ⑴재연결 후 refetch 제거 → 2건 red ⑵재시도를 `connecting` 으로 되돌림(경고가 꺼진다) → 1건
  ⑶백오프 상한 제거(무한 증가) → 2건 ⑷깨어남 refetch 제거 → 1건. 넷 다 되돌리면 green.
- `apps/seat/scripts/verify-mutations.sh` — **변이 시험 재현기**(2026-08-17 신설, orch 술어 ⑹ 확장).
  ★「변이 6종 전부 red」는 그동안 **커밋 메시지 서술로만** 남아 있었다 — 다음 사람이 재현할 수 없고
  회원님은 확인할 방법이 없다(교본이 금한 바로 그 형태). **서술을 파일로 옮겼다.**
  `seatLoadState.js` 의 판정을 하나씩 일부러 틀리게 바꿔 시험이 빨개지는지 본다(~10초, 트리는 항상 원복).
  · **변이가 살아남으면 실패로 잡는다** — 그건 「시험이 그 주장을 안 보고 있다」는 뜻이다.
  · **변이 주입 실패(대상 코드가 바뀜)도 실패로 잡는다** — 조용히 넘기면 «초록 거짓말»이 된다.
  · ★`--self-test` — 「채점기가 조용하다 ≠ 깨끗하다」(design 자기고지). 시험이 **안 보는** 변이를 일부러
    끼워, 이 재현기가 그걸 «살아남음»으로 **보고하는지** 증명한다. **이게 통과한 뒤의 조용함만 초록이다.**
- `apps/seat/src/components/Seat/utils/motionAudit.{js,test.js}` — **모션 규범 수신자 술어**(2026-08-17 신설).
  정본 = `saruru-design/docs/MOTION-CANON.md`(소유 design, **적용 범위 = 화면 산출 전부** → 자리후 포함).
  ★**나에게 온 통지는 0건이었다.** 발신자 의존 규범에서 **침묵은 «규범이 안 바뀜»과 «통지가 안 옴» 둘 다와 양립**하고,
  수신자가 스스로 재지 않으면 그 둘은 **원리적으로 구별 불가능**하다. 그 사이 금지 목록 항목이 살아 있었다.
  ⇒ 규범을 **읽는 것**에서 **재는 것**으로 옮겼다. 규범을 어기면 통지를 기다리지 않고 여기가 빨개진다.
  · 재는 것: §6-1 슬라이드 인 · §6-3 오버슈트 6%/되튐 1회 · §6-8 linear 등장 · §7 축하 색(무지개 금지).
  · **일부러 안 재는 것**: §6-2 딜레이 체인 · §6-7 「정보를 모션으로만」 — 화면 맥락이 필요하다.
    기계가 못 보는 것을 「봤다」고 적으면 그 자체가 거짓 초록이다(사람 칸 = 아래 체크리스트).
  · ★**물리 입자(`seat-confetti-fly`)는 §6-1·§6-3 대상이 아니다** — §7 이 「중력·회전·항력 있는 물리 낙하」를
    명시한다. 이 예외가 없으면 감사기가 «정본이 시킨 것»을 위반이라 부른다(오탐은 가드를 죽인다).
  · ★**미해결 목록은 «정확 일치»**다(와일드카드 아님) — 새 위반도 red, 고쳐서 사라져도 red(명단을 지워야 한다).
    지금 4건이 남아 있고 전부 **축하 연출**이다: 「내가 못 고쳐서」가 아니라 **「내가 정할 일이 아니어서」** —
    유저가 명시로 요청한 기능이고(2026-08-02) 한도에 맞추면 성격이 눈에 띄게 바뀐다. design·유저 결정 대기.
- `apps/seat/src/components/Seat/utils/emptyStateAudit.{js,test.js}` — **「빈 자리 문구는 전부 emptyText 를 거친다」에 붙인 기계**(2026-08-18).
  ★이 검사가 도입 즉시 **살아 있는 결함 2건**을 잡았다(`StatusOverview` 3자리 · `QueueChips` 기본값) —
  그 문장이 SPEC 에 적힌 지 하루 만이었다. 주장에 기계가 없으면 그 주장은 **작성 시점의 스냅샷**이다.
  · 판별이 확실한 꼴(`— … 없음 —`)만 본다. `…없습니다` 류는 안내문과 섞여 못 가르므로 **일부러 안 본다**(사람 칸).
  · ★**주석을 마스킹한다** — 안 하면 «내가 방금 쓴 주석»이 위반으로 잡힌다(실제로 잡혔다).
    이건 반대 방향 오탐이라 더 고약하다: 고칠 게 없는데 빨간불이라 다음 사람이 멀쩡한 코드를 고치러 온다.
- ★여기가 빨개지면 **리팩토링이 동작을 바꾼 것**이다. 「테스트가 낡았네」로 먼저 결론내지 않는다.

### 16.2 배포 반영 확인 — 대조군 리터럴

배포 후 「새 코드가 실제로 나갔나」를 가르는 방법. ★**아무 문자열이나 고르면 안 된다** — 실제로 세 번 틀렸다:

| 실패 사례 | 왜 틀렸나 |
|---|---|
| 「`대기열로` 는 신규 리터럴」 | 이미 있던 문자열이었다(R12 최초 구현분) |
| 「JS 해시 불변이니 JS 변경 없음」 | vite 는 **참조된 CSS 를 청크 해시에 반영**한다 |
| 「`--seat-tabs-h` 구1→신4」 | 실제 신2 (세는 방식을 잘못 잡았다) |

**규율**:
1. **구 번들에서 `grep -c` 가 0 인 문자열만** 대조군으로 쓴다(신 번들에만 있어야 판별이 된다).
2. 리터럴은 **한국어 UI 문자열이나 CSS 클래스명**을 쓴다 — 식별자·함수명은 **미니파이로 사라진다**
   (`applyNumpadKey`·`groupByQueue` 로 확인하려다 실패한 적 있다).
3. CSS 는 `::after` → `:after` 로 줄어드는 등 **미니파이 변형**이 있으니 변형형까지 확인한다.
4. 개수보다 **한 줄 문맥**을 보고한다(개수는 세는 방식에 따라 달라진다).
5. `grep` 에 `--seat-…` 처럼 `-` 로 시작하는 패턴을 줄 때는 `grep -e` 를 쓴다(옵션으로 파싱된다).
6. **버전 스탬프**(§9.0)가 있으면 그게 1차 확인이다 — 화면 우상단 `v<월.일>-<판>` 숫자가 커졌는지부터 본다.

**절차**: 로컬 `apps/seat` 빌드 → `dist/assets/*.css|js` 해시를 to-conductor 에 남긴다 →
배포본에서 같은 해시/리터럴을 확인한다.

### 16.3 «동작 동일» 대조 (리팩토링용)

리팩토링 커밋은 **화면이 달라지지 않았음**을 숫자로 남긴다. 이번 라운드에서 쓴 두 가지:

- **픽셀 대조** — 4역할 × 가로1180/세로768 × (기본·설정모달) = 16장을 리팩토링 전후로 찍어 `cmp` 바이트 비교.
  CSS 정리(⑷·⑶)에 썼다. ★찍는 스크립트가 결정적인지 먼저 확인할 것(같은 코드로 두 번 찍어 16/16 동일).
- **흐름 대조** — 쓰기 경로 9종(제조옵션·올리기·올림취소·한번에·자리순서 리셋·포장도고려·자리대기 취소→대기열로·
  완료+올림·전달)을 프리뷰에서 실행하고 **관측 가능한 행 상태 전체**(체크박스·자리순서 pill·세부 텍스트·
  완료 버튼 클래스·탭 카운트)를 JSON 으로 떠서 비교. ⑵(쓰기 헬퍼)에 썼다.

## 17. 검토 후 «의도적 비수렴» (2026-08-09 신설)

> **본 적 있고, 재 봤고, 안 합치기로 한 것들.** 여기 적는 이유는 하나다 — 다음 세션이 같은 자리를 다시 파고
> 「중복이네, 합치자」로 되돌리는 것을 막기 위해. 함대 교본 `~/claude-project/docs/REFACTOR-DOCTRINE.md` 의
> **가치 서열**(독립·명확 > 영리한 압축 / 보수적 안정성 > 효율)과 **수렴 판단 5문**으로 판정했다.
>
> ★비수렴은 **영구 결정이 아니다.** 각 항목의 «재개 조건»이 충족되면 다시 올린다.

### 17.0 자리후 축하 연출 4건이 MOTION-CANON §6-3·§7 을 벗어난다 — **내가 정할 일이 아니라 보류**

> ★여기 적는 이유가 §17 의 나머지와 **다르다**: 「다시 파지 마라」가 아니라 **「이 명단이 읽히는 자리를 만들려고」**다.
> 미해결 4건을 `motionAudit.test.js` 의 명단으로만 두면 **초록일 때 아무도 안 본다** —
> 「남겼다」와 「닿았다」는 다른 명제다(2026-08-17 ops 자수: 로그는 쓰기 쉬워서 «했다»는 느낌을 싸게 준다).

| 대상 | 실측 | 정본 한도 |
|---|---|---|
| ~~`@keyframes seat-complete-pop`~~ **해소** | 오버슈트 18% · 되튐 4회 · 700ms | §7-1 면제 성립(경계 조건 **6/6**, 2026-08-17) |
| `@keyframes seat-check-burst` | 오버슈트 **90%** | 〃 |
| `.seat-confetti` 색 | `#FF7BAC` `#FFD54F` `#7BE0FF` | §7 정본 팔레트(#2D4B82·#3CB44B) + 무채색, **무지개 금지** |

- **왜 안 고쳤나**: 축하 연출은 **유저가 명시로 요청한 기능**이다(2026-08-02 「이모지 대신 실제 입자」).
  한도에 맞추면 **성격이 눈에 띄게 바뀐다** — 결함 수정이 아니라 **결정**이다.
  내가 조용히 정본에 맞추면 유저는 「내 축하가 왜 밋밋해졌지」를 겪는다. 그건 고친 게 아니라 **몰래 뺀 것**이다.
- **누가 정하나**: 정본 소유 = design, 기능 소유 = 유저. orch 경유로 판정 요청 올렸다(2026-08-17).
- ★**design 판정 도착(2026-08-17, orch 경유)** — 정본이 **개정**됐다(§7-1 신설: 축하 «입자·물리»는 §6-3 바운스 한도 면제):
  · 콘페티 물리 낙하 = **오탐**(정본이 시킨 것) — 내 감사기는 이미 입자를 §6-1·§6-3 대상에서 뺐다.
  · 오버슈트·되튐 = **면제 대상**. ⚠단 면제는 **경계 조건 6개를 전부 지킬 때만**이다. 실측 = **4/6 통과**:
    ⓐ총 ≤2.0s ✓(.7~.85s) · ⓑ1회·재트리거 금지 ✓(`celebrating` Set) · ⓔ완전 정지 ✓(루프 0)
    · ⓕreduced-motion 렌더 안 함 ✓(`animation:none` → 입자의 초기 `opacity:0` 유지)
    · ⓒ스킵 가능 · ⓓ입력을 막지 않는다 → **처음엔 둘 다 ✗ 였고, 고쳐서 6/6 이 됐다**(아래).
  · ★**design 재판정(정본 v1.2, 2026-08-17 밤)**: 내가 올린 실측이 **규범 문장이 됐다** —
    **「연출이 업무를 기다리게 하면 축하가 아니라 지연이다」**(면제 조건 ⓓ를 조임).
    처방도 함께 왔다: **쓰기는 즉시, 연출은 그 위에서.** 그러면 **연출을 하나도 줄이지 않고** 조건을 통과한다.
  · **고친 내용**(`StationScreen`): `complete()` 가 `setTimeout(…,700)` **안에서** 쓰던 것을 **즉시 쓰기**로 옮기고,
    축하 중인 카드는 «올라감» 목록에 700ms 더 붙잡아 둔다(연출이 안 끊긴다). 완료 버튼의 `disabled` 는 **뺐다** —
    ★비활성 요소는 click 을 내보내지도 버블하지도 않아서, **카드에서 가장 큰 탭 자리가 「건너뛰기」를 삼켰다**(실측).
    지금은 축하 중 누르면 **연출만 끝난다**(쓰기는 이미 나갔으므로 두 번 눌러도 안전 — `complete()` 가 즉시 되돌아온다).
  · **재실측 6/6**(headless 실측): ⓐ.7~.85s ✓ ⓑ재트리거 금지 ✓ ⓒ버튼·카드 탭으로 스킵 ✓ ⓓ쓰기 즉시·비활성 0 ✓
    ⓔ루프 0 ✓ ⓕreduced-motion 미렌더 ✓ ⇒ **`seat-complete-pop` 두 줄은 명단에서 빠졌다**(내가 고쳐서가 아니라
    조건을 충족시켜 **정본의 면제가 성립해서**다).
  · ⚠**주방 체감이 바뀐다**: 「완료를 눌렀는데 0.7초 뒤 반영」이 **즉시 반영**이 된다. 화면에 보이는 변화 2건 중 하나.
  · 체크 버스트 90% · 축하 색 = **회원님 결정 대기**(묶음 카드 B칸). ※색은 §7-1 이 «면제하지 않는다»고 명시 — 브랜드 문제라 모션 한도로 못 푼다.
- ★**재개 조건**: design 판정 또는 유저 지시. 판정이 「맞춰라」면 §6-3 한도(6%·1회·200~300ms)로 조정하고
  `motionAudit.test.js` 의 `PENDING` 에서 해당 줄을 **지운다**(명단이 정확 일치라 안 지우면 red 가 된다).
- ※§6-1 슬라이드 인은 **여기 없다** — 그건 유저 상시 지시가 이미 있어 결정할 것이 없었고, 그날 고쳤다(`c36a153`).

### 17.1 `OrderRow`(584줄) 셀 단위 분해 — **보류**

인벤토리 단계에서는 「안전망(테스트)이 깔리면 단독 라운드로」 권고했다가, 5문으로 재평가해 **뒤집었다**(2026-08-09, 지휘부 승인).

| 문 | 판정 |
|---|---|
| ① 같은 지식인가 | **해당 없음** — 중복 수렴이 아니라 분해다. 낡아서 갈라진 두 벌이 없다. |
| ② 혼자 읽히는가 | **아니오** — 셀로 쪼개면 파생 플래그 8종(`preDeliver`·`raiseVoid`·`canceled`·`archived`·`seatNeeded`·`doneTone`·`needsRaiseAsk`…)과 모달 state 8개를 **호출측 사전지식**으로 넘겨야 한다. `<RaiseCell preDeliver raiseVoid canceled …/>` 는 인라인보다 못 읽힌다 — 엮임이지 단순화가 아니다. **서열 ① 위반.** |
| ③ 실패 반경 | 쓰기 경로 + **DOM/열 순서**(§15 「열 추가 시 4곳 동기화」 함정과 같은 자리). **서열 ② 기본값 = 손대지 않기.** |
| ④ 울타리 이유를 아는가 | **안다, 그리고 살아 있다** — 「`OrderRow` 는 자리안내·주문서관리 **공용**이라 DOM 을 건드리지 않는다」(§12). |
| ⑤ 낡아서 사고를 냈나 | **아니오** — 584줄은 크지만 **단일 출처**다. 사고 이력은 전부 «두 벌» 쪽(모달 7벌·상태 동기 11곳)이었고 그건 이미 수렴했다. |

**결론**: 지금 분해로 얻는 건 줄 수뿐이고 파는 건 안정성이다.
**재개 조건** = **두 번째 행 레이아웃이 필요해질 때**(그때 비로소 진짜 중복이 생긴다).
※그 파일에서 값이 있던 건 파생·쓰기 로직의 `seatRules` 이관이었고, 그건 §15.1 로 끝났다.

### 17.2 `raiseMethodOf` ↔ `optOf` 우선순위 통일 — **조사 항목**(수렴 권고 아님)

5문 ④에서 걸린다: **왜 취소 이력 쪽만 «포장 먼저» 였는지 모른다.** 이유 소멸의 입증 책임은 수렴을 주장하는 쪽에 있고,
지금은 그 입증을 할 수 없다(구 데이터에 `opt_takeout`·`opt_outdoor` 가 **동시에 true** 인 행이 있는지 확인 필요 — DB 접근 권한이 있는 세션 몫).
그래서 §15.1 에 «구 동작 보존»으로 못박고, 통일은 **실데이터 확인 후**로 미룬다.

### 17.3 `SeatModal` ↔ `SeatConfirm` 통합 — **하지 않는다**

용도가 다르다: `SeatModal` 은 **열어놓고 보는 판**(설정·현황·통계 — 머리말/본문/꼬리말), `SeatConfirm` 은 **묻고 닫는 판**
(제목/설명/액션). 억지로 합치면 모드 플래그가 생겨 5문 ②에 걸린다. **모양이 비슷할 뿐 다른 지식**이다(우연한 중복).

### 17.4 `SeatNumpad` 를 `SeatConfirm` 으로 흡수 — **하지 않는다**

숫자 그리드는 제목/설명/액션 구조가 아니다. `Esc` 닫기는 이미 있고, 나머지 문법을 억지로 맞추면 키패드 쪽이 어색해진다.

### 17.5 `seat_status` 를 파생값으로 강등 — **이번 라운드 범위 밖**

`raised` 와 `seat_status` 가 같은 사실을 두 번 적는 건 사실이나, 강등은 **DB 마이그 + 통계 재계산**을 부른다(실패 반경 = 쓰기 경로 + 과거 데이터).
§15.1 의 쓰기 헬퍼로 **«두 번 적되 한 곳에서 적는다»** 까지만 하고 멈췄다 — 교본의 «보폭은 보수적으로».
**재개 조건** = 컬럼 정리를 요구하는 별도 필요(예: 상태 축 신설)가 생기고, 통계 재계산 계획이 함께 설 때.

### 17.6 `menu_out` 컬럼 제거 — **하지 않는다**

UI 는 2026-07-31 에 제거됐지만 컬럼은 DB 에 남긴다(§R5). 과거 기록의 의미가 살아 있고, 지우면 되돌릴 수 없다.
`demoData.js` 의 기본값도 스키마 정합(§15 체크리스트)상 유지가 맞다.
