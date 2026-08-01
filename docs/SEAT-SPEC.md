# 자리후 시스템 (Seat / 자리후·올리기) 기능 기획서 / 명세서

> **자리후 시스템(seat) 관련 코드·마이그레이션을 만들거나 고치기 전에 이 문서를 먼저 본다.**
>
> 작성일: 2026-06-21
> 작성자: jaehwan-lee-benja (with Claude)
> 상태: **Phase 0 (기획 합의 완료) — 스키마 승인·구현 대기**
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
- [10. 비즈니스 규칙 R1~R7](#10-비즈니스-규칙-r1r7)
- [11. 라이브 카메라 모듈](#11-라이브-카메라-모듈)
- [12. 진입 & 컴포넌트 구조](#12-진입--컴포넌트-구조)
- [13. 단계별 로드맵](#13-단계별-로드맵)
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
- 역할별 화면 4종(자리안내·제조매니저·카이막·커피) + 상단 역할 탭 전환.
- Supabase Realtime(postgres_changes) 구독으로 모든 화면 실시간 갱신(last-write-wins).
- 비즈니스 규칙 R1~R7.
- `<LiveCameraFeed>` 슬롯(placeholder. enabled=false 기본).

**비범위 (향후)**
- 영상 OCR 자동 주문번호 인식(별도 PC 과제 · 백로그).
- POS / 영수증 프린터 연동.
- 소요시간(자리후→올림→완료) 분석 리포트 — 타임스탬프는 지금부터 남겨 둠(후속에서 집계).
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
   기기 모드 → RLS로 가르지 않고 앱 레벨 가드(예: 메뉴나감=매니저만).
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
| `guide` | 자리안내 | 기본 입력 주체 | 주문번호·자리후·올림·제조옵션·상태·특이사항 | ✗ | — |
| `manager` | 제조매니저 | 공동 모니터/입력 | 자리안내 입력부 + **메뉴 나감(menu_out)** | ✓ | — |
| `kaymak` | 카이막 | 제조 스테이션 | 받음/완료/변동사항 | ✓ | `kaymak` |
| `coffee` | 커피 | 제조 스테이션 | 받음/완료/변동사항 | ✓ | `coffee` |

- 카이막·커피는 **동일 컴포넌트**(`StationScreen`)를 `station` 파라미터로 재사용. 서로 독립(R6).
- `menu_out`은 매니저 역할만 토글 가능(R5).
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
  seated          boolean NOT NULL DEFAULT false,      -- 자리앉음
  raised          boolean NOT NULL DEFAULT false,      -- 올리기 전달
  raised_at       timestamptz,                         -- 올림 시각(후속 소요시간 분석)
  menu_out        boolean NOT NULL DEFAULT false,      -- R5: 제조매니저만
  confirm_flag    boolean NOT NULL DEFAULT false,      -- 확인필요(주문서관리→자리안내 신호. 상태선택과 별개의 행 플래그)
  confirm_done    boolean NOT NULL DEFAULT false,      -- 확인완료(자리안내가 처리 응답). migrate-seat-confirm-done.sql
  notes           text,                                -- 특이사항
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
  change_note   text,                                  -- 변동사항 예: "포장으로 변경"
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

공통: 상단에 오늘 날짜 + 역할 탭. 주문은 행 리스트, queue_no 1,2,3… 자동.

### 9.1 자리안내 (`guide`) — 입력 핵심 (원본 슬라이드 열 구성 기준)
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

### 9.2 제조매니저 (`manager`)
- 자리안내와 유사 입력부(전체폭 테이블) + **메뉴 나감**(이 역할만, R5).
- 입력부 아래 가로 배치: 카메라 슬롯 + 자리후(대기중)/올림/완료된 리스트 요약.
- ※ 원본 슬라이드의 매니저 페이지엔 카메라가 그려져 있지 않으나, 기획서 §9(매니저에도 카메라 슬롯)
  에 따라 **카메라 유지**(2026-06-25 결정). 매니저도 주방을 모니터하므로 둔다.

### 9.3 카이막 / 커피 (`kaymak`/`coffee`) — 동일 컴포넌트·독립 (원본 슬라이드 레이아웃)
- **3열 배치: [카메라 라이브 大 — 좌측] · [자리잡음(올림)+완료된 리스트 — 중앙] · [자리후(대기중) — 우측].**
- 올림 카드 = 번호 + 변동사항("포장으로 변경" 등) + [완료] 버튼.
- 내가 누른 완료만 "완료된 리스트"로(스테이션 독립, R6).

## 10. 비즈니스 규칙 R1~R7

| # | 규칙 | 구현 위치 |
| --- | --- | --- |
| R1 | 제조옵션(야외/포장/야외병행) 하나라도 체크되면 자리후 아님 → 자리순서 '필요없음'(앰버) 표시, 수동토글 잠금(비활성 룩 없음). 올림 대상이나 [올리기 전달] 클릭 전까지 대기/올림 요약 리스트엔 미집계(§14 미해결) | OrderRow 파생상태 / seatRules |
| R2 | 자리앉음/올리기 전달/제조옵션(R1) 중 하나라도 충족 시 오른쪽 제조 칸 활성화(그 전엔 비활성) | OrderRow·seatRules.isRaiseEnabled |
| R3 | 상태선택 기본값 '-'(=`review_flag='none'`) | 스키마 DEFAULT |
| R4 | "필요없음"=자리대기 취소(`seat_order_alive=false`) 또는 제조옵션(R1), "살아있음"=순서 유지. 파생: `seatNeeded = seat_order_alive && !제조옵션` | OrderRow 토글 |
| R5 | "메뉴 나감"(`menu_out`)은 제조매니저만 | 역할 게이트(config) |
| R6 | 카이막/커피 완료는 서로 독립 | `seat_station_status` 행 분리 |
| R7 | 해당 행 변경을 모든 역할 화면에 즉시 실시간 반영 (전용 버튼 없음 — 구독이 자동 충족, 2026-07-31) | Realtime 구독(§8) |
| R8 | **실내(dine_in) 주문**은 "자리후 전달"(`seat_delivered`)이 관문. 전달 전 게이팅 — **Manager**: 행 dim + 하위버튼(자리순서·올림) 숨김 / **Guide**: 전달 체크박스는 살리고 제조옵션부터 이후 컨트롤 dim/disable. 포장·야외 시작은 관문 없음(전달 체크박스 미표시, 즉시 활성) | OrderRow(`gateMode`)·Guide/Manager·commitOrder |
| R9 | **주문 시작 갈래 `order_origin`**: dine_in(실내→자리후 관문)/takeout(포장)/outdoor(야외, 자리후 우회). 제조옵션(opt_*)은 실내 주문의 *전달 후 변경기록*: 야외·포장=자리큐 제외 / **야외병행=자리순서 유지**(실내 자리 나면 입장). `seatNeeded=dineIn && seat_order_alive && !(opt_outdoor\|\|opt_takeout)` | OrderRow·seatRules(isDineIn·removesFromSeatQueue) |

## 11. 라이브 카메라 모듈

- 독립 컴포넌트 `<LiveCameraFeed station=... streamUrl=... enabled=... />`.
- 현재: `enabled=false` 또는 `streamUrl` 없으면 placeholder("카메라 연동 예정 — 하드웨어 입고 후
  MJPEG 연결") 박스.
- 향후: `streamUrl` 주입 시 같은 슬롯에 `<img src={streamUrl}>` 드롭인(레이아웃 재작업 없이).
- **표시 여부 = 설정 패널의 `cameraEnabled`**(§11.1). 꺼져 있으면 화면이 카메라 슬롯 자체를
  렌더하지 않는다(placeholder도 안 보임) → 스테이션 작업 영역이 그만큼 넓어진다. 기본값 **off**.
- 설정: `streamUrl`(실제 스트림 주소)은 env 또는 Supabase config 레코드(운영자가 URL만 넣으면 켜짐) — 미결.
- 배치: 제조매니저·카이막·커피 화면에만. 자리안내 없음.

### 11.1 설정 패널 (기기별 로컬 설정)

- 진입 = 상단 앱바 **우측 끝 "설정" 버튼** → 모달 다이얼로그(스크림 클릭·Esc·닫기로 종료).
- **저장 = 기기별 localStorage**(`seat.settings.v1`). 주방 태블릿마다 역할이 달라 기기 단위가 맞고,
  DB 마이그레이션 없이 늘릴 수 있다. (계정/워크스페이스 단위 설정이 필요해지면 그때 승격.)
- **확장 규칙**: 설정 항목은 `config/seatSettings.js`의 `SEAT_SETTINGS` 배열에 **항목만 추가**한다.
  `SettingsPanel`은 그 배열만 보고 그리는 범용 렌더러 — 새 항목 때문에 UI 코드를 고치지 않는다
  (새 `type` 도입 시에만 렌더 분기 추가). 저장값에 없는 키는 로드 시 기본값으로 채워진다(하위호환).
- 현재 항목: `cameraEnabled`(토글, 기본 off) — 카메라 연동 보기/끄기.
- **경계**: 설정은 표시(view)에만 관여. orders/station_status 데이터 로직·권한과 결합 금지.
- **모듈 경계**: orders/station_status 데이터 로직과 결합 금지. 순수 "스트림 표시"만.

## 12. 진입 & 컴포넌트 구조

- `pageTypes.js`: `PAGE_TYPES.SEAT='seat'` + `isSeatPage()`. `INDEPENDENT_PAGE_TYPES`에 포함.
- `App.jsx`: `isSeatPage(pageType)`면 사이드바/페인 크롬 없이 **풀스크린** `<SeatSystemPage>` 렌더.
- `Sidebar.jsx`: 진입 버튼(기존 find-or-create 패턴 — `page_type='seat'` 페이지 조회/생성).

```
src/components/Seat/
  SeatSystemPage.jsx        풀스크린 컨테이너 + 상단 역할 탭 → 선택 역할 화면 렌더 + boardId 해석
  config/seatRoles.js       ROLES[] · STATIONS[] 데이터(하드코딩 금지)
  config/seatSettings.js    SEAT_SETTINGS[] · 기본값 · localStorage load/save (§11.1)
  screens/
    GuideScreen.jsx         자리안내 입력 핵심(R1~R4)
    ManagerScreen.jsx       제조매니저(R5 menu_out, 완료 리스트, 카메라)
    StationScreen.jsx       station prop으로 카이막/커피 재사용(R6)
  components/
    OrderRow.jsx            행 단위 입력/표시 + R1·R2 파생상태
    LiveCameraFeed.jsx      격리된 카메라 슬롯(placeholder)
    SettingsPanel.jsx       설정 다이얼로그(SEAT_SETTINGS 범용 렌더러)
  hooks/
    useSeatOrders.js        fetch + Realtime + CRUD
    useStationStatus.js     fetch + Realtime + CRUD
    useSeatSettings.js      기기별 설정 상태 + localStorage 지속
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

## 13. 단계별 로드맵

- **Phase 0 (완료)**: 본 기획서 합의.
- **Phase 1 (이번)**: 스키마 승인·적용 → 진입 배선(빈 화면) → 데이터 훅+Realtime →
  GuideScreen → ManagerScreen·StationScreen → R1~R7 → 카메라 슬롯.
- **Phase 2**: 카메라 실연결(streamUrl 주입), 운영 설정 UI(역할·스테이션·카메라 URL).
- **Phase 3**: 소요시간(자리후→올림→완료) 집계·리포트.
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

**미해결 (진행하며 합의)**
- [x] 권한·로그인 = 워크스페이스 grant(editor)로 확정. 태블릿이 어느 계정으로 로그인하든 editor 면 동작.
- [ ] 완료 처리 후 행 표시 — 완료 행을 리스트에서 숨길지/접을지/유지할지.
- [x] 카메라 **표시 on/off** = 설정 패널 `cameraEnabled`(기기별 localStorage, 기본 off)로 확정
      (2026-07-31 유저 지시 "카메라는 당장 필요없으니 설정 칸을 만들어 거기서 켜고 끄자").
- [ ] 카메라 **streamUrl** 저장 위치(env vs Supabase config 레코드) 최종 결정 — 하드웨어 입고 후.
- [ ] **제조옵션만 체크·미올림 주문의 요약 리스트 배치** — `isWaitingOrder`(제조옵션 있으면 제외)와 `isRaisedOrder`(`raised=true`만) 사이 틈에 빠져 Manager/Station "대기중"·"올림" 및 자리안내 하단 거울 어디에도 안 잡힘. R1의 "올림으로 처리"를 자동화(제조옵션 시 `raised` 자동 세팅)할지, 리스트 판정을 `seatNeeded` 기준으로 통일할지 결정 필요. (2026-07-20 spec-auditor 발견)

## 15. 수정 전 체크리스트

- [ ] RLS 변경 시 워크스페이스 grant 모델(`can_in_workspace`/`current_workspace`)을 따랐는가(역할로 RLS 가르지 않기).
- [ ] 자리후 데이터를 daily 본문(`daily_blocks`)·TipTap에 섞지 않았는가(독립 테이블 유지).
- [ ] 역할·스테이션을 하드코딩하지 않고 `config`/text 컬럼으로 두었는가(역할 추가 시 스키마 불변).
- [ ] 카메라 컴포넌트가 orders/station_status 데이터 로직과 결합되지 않았는가(순수 슬롯).
- [ ] Realtime 채널에 cleanup(`removeChannel`)·`mountedRef` 보호가 있는가.
- [ ] 마이그레이션이 재실행 안전(IF NOT EXISTS / DROP POLICY IF EXISTS)한가.
- [ ] 마이그레이션을 합의 없이 프로덕션에 적용하지 않았는가(SQL 제시 → 승인 → 통합 세션 적용).
