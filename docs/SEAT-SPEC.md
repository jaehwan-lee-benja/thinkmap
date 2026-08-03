# 자리후 시스템 (Seat / 자리후·올리기) 기능 기획서 / 명세서

> **자리후 시스템(seat) 관련 코드·마이그레이션을 만들거나 고치기 전에 이 문서를 먼저 본다.**
>
> 작성일: 2026-06-21 / 최종 갱신: **2026-08-03**
> 작성자: jaehwan-lee-benja (with Claude)
> 상태: **Phase 1 완료 — 프로덕션 운영 중**(자리안내·주문서관리 화면 통합, R1~R11, 통계 §13).
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
- [10. 비즈니스 규칙 R1~R11](#10-비즈니스-규칙-r1r11)
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
- 비즈니스 규칙 **R1~R11**(§10. R2·R5 는 폐지됨).
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

## 9. 화면 명세

> ★2026-08-02 전면 갱신. **화면은 4역할 → 3화면**이다: 주문 화면(자리안내·주문서관리 공용) · 카이막 · 커피.
> 아래 9.0 이 현행이고, 9.1~9.3 은 구 서술(원본 슬라이드 기준)로 **역사 참고용**으로만 남긴다.

공통: 상단 앱바 = **날짜(달력 — 지난 날짜 조회)** + 역할 탭 + 전체화면 + 설정. 주문은 행 리스트, queue_no 자동.

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
- **테이블링 셀의 작은 버튼 2종**(2026-08-03):
  - **`+`** — 같은 테이블링 번호로 줄을 하나 더 만든다. *한 대기번호에 주문번호(영수증)가 여러 장 걸리는* 실제 케이스용.
    새 줄은 `1-a`/`1-b` 접미사가 자동으로 붙고, 표에서 **원래 줄 바로 아래**에 붙어 보인다(`groupByQueue` — 표시 전용 정렬).
  - **`취소`/`복구`** — 자리대기 취소(`seat_status='canceled'` + `seat_order_alive=false`). 대기하다 그냥 가시는 손님용.
    줄 삭제(✕)와 달리 **표에 기록으로 남고**(흐림 + 번호 취소선) 다시 누르면 되살아난다. 취소된 줄은 스테이션 '자리후(대기)'에서 빠진다.
- **표 표시 순서** = 저장 순서(생성순) 위에 **같은 테이블링 번호끼리 인접**하게만 재배열한다(`groupByQueue`).
  DB·드래그 저장 순서는 건드리지 않는다 — 드래그 인덱스는 항상 원본 배열 기준으로 환산한다.
- **입력칸은 로컬 draft 방식**(`SeatTextField`, 2026-08-03). 타이핑 중에는 화면이 로컬 값만 보고,
  저장은 타이핑이 멎은 뒤(450ms) 한 번 + blur·Enter 즉시. **끝 글자 유실**(“132 → 1”, 한글 “취소 → 취”)의 구조적 원인
  — 키 입력마다 서버 쓰기 + 그 사이 도착한 Realtime refetch·IME 조합 중 리렌더 — 를 없앤다. 화면키패드 경로는 해당 없음.
- **올림 셀은 체크박스 3종**(2026-08-03) — `자리앉음` · `올리기 전달` · **`한번에`**(둘을 동시에).
  실무에선 대부분 한 번에 누르게 되지만 나눠 누르는 경우도 있어 **개별 2 + 함께 1** 을 다 둔다.
  `한번에` 는 두 값이 모두 켜져야 체크로 보이고, 풀면 재확인 후 **자리앉음까지 함께** 되돌린다(건 단위 = 푸는 단위).
  자리앉음이 잠긴 줄(야외·포장)과 올림 무효 줄(R11 포장영수증)에서는 함께 잠긴다.
- **재확인 모달**(실수 방지):
  - 올림된 주문의 **주문번호 수정/삭제** → "이미 올림이 전달된 주문입니다…". 승인하면 그 행에서는 계속 편집.
  - **줄 삭제** → 전 줄 재확인. 올림된 줄은 "이 줄은 이미 올림이 진행된 줄입니다…"로 문구 강화.
  - **올리기 전달 취소** → 모달 재확인 후 R10(한 스텝 취소).
- 표 아래 툴바: `+새 주문` · `+주문번호만`(queue_no NULL) · **기능 설정**(+ 물음표 툴팁).
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

## 10. 비즈니스 규칙 R1~R11

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
    seatRules.js            R1·R4·R9·R10 파생 순수함수(isDineIn·isWaitingOrder·raiseDetailText 등)
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
- [ ] 마이그레이션이 재실행 안전(IF NOT EXISTS / DROP POLICY IF EXISTS)한가.
- [ ] 마이그레이션을 합의 없이 프로덕션에 적용하지 않았는가(SQL 제시 → 승인 → 통합 세션 적용).
- [ ] `seat_orders` 에 컬럼을 추가했으면 `config/demoData.js` 의 `orderDefaults` 에도 기본값을 넣었는가(프리뷰 정합).
- [ ] 표에 열을 추가했으면 **4곳**을 동기화했는가 — `SEAT_COLUMNS`(숨김) · `grid-template-areas`(가로/세로) · `.seat-cell-<key>` grid-area · `is-hide-<key>` 규칙.
- [ ] 파괴적 조작(삭제·초기화·올림취소)에 재확인 또는 되돌리기를 붙였는가.
- [ ] 스테이션 화면에서 주문 필드를 직접 수정하고 있지 않은가(읽기 전용 — 수정은 주문 화면).
- [ ] 스테이션 노출 조건을 바꿨으면 `isWaitingOrder`·`isRaisedOrder` **양쪽**을 함께 봤는가(R11처럼 한쪽만 제외하면 대기·올라감 사이에 틈이 생긴다).
