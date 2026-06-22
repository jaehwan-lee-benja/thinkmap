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
- 다매장 동시 운영(현재 단일 매장 = 단일 board 전제. 스키마는 board_id로 이미 다매장 대비).

## 3. 도메인 용어

| 용어 | 정의 |
| --- | --- |
| 자리후 | 주문은 됐지만 좌석이 미확정인 대기 주문. `seat_status='pending'` |
| 올리기(올림) | 자리가 잡혀 그 번호를 제조로 올려 진행. `raised=true` / `seat_status='raised'` |
| 자리대기번호(queue_no) | (매장, 영업일)별 1,2,3… 자동 부여. 주문번호(order_no)와 별개 |
| 영업일(business_date) | 그 날의 운영 단위. 매일 queue_no 리셋 |
| 스테이션(station) | 제조 거점. `'kaymak'`(카이막) / `'coffee'`(커피) / 확장. text라 추가에 스키마 불변 |
| 역할(role) | 화면 주체. 자리안내·제조매니저·카이막·커피. 태블릿 1대 = 1역할(탭 전환 가능) |
| 보드(board) | 4명 직원이 멤버로 속한 업무일지 보드(`pages`). 자리후 데이터의 테넌시 기준 |

## 4. 핵심 결정

1. **신규 모듈로 격리**: 기존 ThinkMap 기능(토글/목표/로스터/데일리)과 코드·테이블을 섞지 않는다.
   테이블은 `seat_` 프리픽스, 컴포넌트는 `src/components/Seat/`. daily 본문(`daily_blocks`)·TipTap에
   절대 얽지 않는다(독립 구조 데이터).
2. **roster와 같은 테넌시·권한 패턴 재사용**: 자리후 데이터는 "날짜별 · 같은 매장 직원이 공유·편집"
   으로 `roster_assignments`와 성격이 동일하다. 따라서 **board_id 테넌시 + `is_board_member()`**를
   그대로 쓴다. 새 권한 패러다임·새 헬퍼·`businesses` 같은 신규 테넌시 테이블을 **만들지 않는다**.
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
> 전제: `is_master()`(migrate-dynamic-master.sql), `is_board_member(board_id)`(migrate-create-members.sql).

### 6.1 `seat_orders` — 주문 행 (로그인 읽기 / 마스터·보드멤버 쓰기)

```sql
seat_orders (
  id              uuid PK DEFAULT gen_random_uuid(),
  board_id        uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,  -- 테넌시(매장)
  business_date   date NOT NULL DEFAULT current_date,
  queue_no        int  NOT NULL,                       -- (board,date)별 1,2,3… 트리거 자동
  order_no        text,                                -- 주문번호(수기, 자유 텍스트)
  seat_status     text NOT NULL DEFAULT 'pending'
                    CHECK (seat_status IN ('pending','raised','canceled')),
  review_flag     text NOT NULL DEFAULT 'none'         -- R3: 기본 '-'(=none)
                    CHECK (review_flag IN ('none','확인필요','주문중','차후주문')),
  opt_outdoor          boolean NOT NULL DEFAULT false, -- 야외
  opt_takeout          boolean NOT NULL DEFAULT false, -- 포장
  opt_outdoor_parallel boolean NOT NULL DEFAULT false, -- 야외병행
  seat_order_alive     boolean NOT NULL DEFAULT true,  -- R4: 살아있음 / false=순서없이(취소)
  seated          boolean NOT NULL DEFAULT false,      -- 자리앉음
  raised          boolean NOT NULL DEFAULT false,      -- 올리기 전달
  menu_out        boolean NOT NULL DEFAULT false,      -- R5: 제조매니저만
  notes           text,                                -- 특이사항
  created_by_role text,                                -- 입력 주체 역할 key(스냅샷)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz                          -- soft delete
)
```

### 6.2 `seat_station_status` — 스테이션별 진행 (로그인 읽기 / 마스터·보드멤버 쓰기)

스테이션을 행으로 분리해, 카이막·커피가 **서로 독립**(R6)으로 받음/완료를 누른다.

```sql
seat_station_status (
  id            uuid PK DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES seat_orders(id) ON DELETE CASCADE,
  board_id      uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
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
    FROM seat_orders WHERE board_id = NEW.board_id AND business_date = NEW.business_date;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_seat_orders_queue_no
  BEFORE INSERT ON seat_orders FOR EACH ROW EXECUTE FUNCTION seat_orders_assign_queue_no();
```

- `updated_at`은 기존 컨벤션대로 클라이언트가 갱신 시 `new Date().toISOString()`로 세팅(useProjects 선례).
- 인덱스: `seat_orders(board_id, business_date, queue_no)`,
  `seat_station_status(board_id, business_date)`, `seat_station_status(order_id)`.

## 7. 권한 / RLS

> [ACCESS-MODEL.md §5](./ACCESS-MODEL.md) 결정 순서를 따른다. 새 패러다임을 만들지 않는다.
> `roster_assignments`(MEMBER-SPEC §6)와 **동일 패턴**.

| 테이블 | SELECT | INSERT/UPDATE/DELETE | 패러다임 |
| --- | --- | --- | --- |
| `seat_orders` | 로그인 사용자(`auth.uid() IS NOT NULL`) | `is_master() OR is_board_member(board_id)` | B(공개) + 보드멤버/마스터 쓰기 |
| `seat_station_status` | 로그인 사용자 | `is_master() OR is_board_member(board_id)` | B(공개) + 보드멤버/마스터 쓰기 |

```sql
ALTER TABLE seat_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_station_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY seat_orders_select ON seat_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY seat_orders_write  ON seat_orders FOR ALL
  USING (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));

CREATE POLICY seat_station_select ON seat_station_status FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY seat_station_write  ON seat_station_status FOR ALL
  USING (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));
```

- **board_id 배선**: 4명 직원이 멤버(`worklog_board_members`)로 속한 기존 보드 1개. 구현 시
  "어느 보드인가"만 확정(스키마 영향 없음). 미존재 시 직원을 그 보드 멤버로 등록하는 선행 필요.
- 새 헬퍼·새 테넌시 테이블 도입 없음. `is_master()`·`is_board_member()` 재사용만.

## 8. 실시간 동기화

> 기존 `useDailyBlocks`/`useWorklogComments` 패턴(채널 + cleanup + mountedRef) 준수.

- 훅: `useSeatOrders(boardId, businessDate)` · `useStationStatus(boardId, businessDate)`.
- 채널: `seat_orders:${businessDate}` / `seat_stations:${businessDate}`.
  필터 `business_date=eq.${today}`(페이로드 경량, 매일 리셋). 매장 구분은 RLS(board_id)가 보장.
- 이벤트 `*`(INSERT/UPDATE/DELETE). 콜백은 로컬 상태 머지(낙관적 UI) 또는 단순 리페치.
- 충돌 = **last-write-wins**. `created_at`·`completed_at` 등 타임스탬프를 남겨 후속 소요시간 분석.
- cleanup: `supabase.removeChannel(channel)`. 언마운트 보호 `mountedRef`.
- R7("전체에게 전달") = 해당 행 변경이 Realtime으로 모든 역할 화면에 즉시 반영 = 위 구독으로 자동 충족.

## 9. 화면 명세

공통: 상단에 오늘 날짜 + 역할 탭. 주문은 행 리스트, queue_no 1,2,3… 자동.

### 9.1 자리안내 (`guide`) — 입력 핵심
- 행: queue_no / order_no(텍스트) / [자리후 전달] / 상태선택(확인필요·주문중·차후주문, 기본 '-')
  / 제조옵션 체크(야외·포장·야외병행) / 자리순서 살아있음·자리순서없이(취소)
  / 자리앉음 → [제조 올리기·올리기 전달] / 특이사항.
- 하단: 카이막·커피 현황 거울 표시(읽기).
- 카메라 없음.

### 9.2 제조매니저 (`manager`)
- 자리안내와 유사 입력부 + **메뉴 나감**(이 역할만, R5) + 카메라 슬롯.
- 자리잡음(올림)/완료/완료된 리스트 + 자리후(대기중) 목록.

### 9.3 카이막 / 커피 (`kaymak`/`coffee`) — 동일 컴포넌트·독립
- 카메라 슬롯 + 자리후(대기중) 목록 + 자리잡음(올림) + 각 번호 [완료] + 변동사항("포장으로 변경" 등).
- 내가 누른 완료만 "완료된 리스트"로(스테이션 독립, R6).

## 10. 비즈니스 규칙 R1~R7

| # | 규칙 | 구현 위치 |
| --- | --- | --- |
| R1 | 제조옵션(야외/포장/야외병행) 하나라도 체크되면 자리후 아님 → 자리후 비활성, 올림으로 처리 | OrderRow 파생상태 |
| R2 | 자리앉음/올리기 전달 시에만 오른쪽 제조 칸 활성화(그 전엔 비활성) | OrderRow 파생상태 |
| R3 | 상태선택 기본값 '-'(=`review_flag='none'`) | 스키마 DEFAULT |
| R4 | "자리 순서없이"=자리대기 취소(`seat_order_alive=false`), "살아있음"=순서 유지 | OrderRow 토글 |
| R5 | "메뉴 나감"(`menu_out`)은 제조매니저만 | 역할 게이트(config) |
| R6 | 카이막/커피 완료는 서로 독립 | `seat_station_status` 행 분리 |
| R7 | "전체에게 전달"=해당 행을 모든 역할 화면에 즉시 실시간 반영 | Realtime 구독(§8) |

## 11. 라이브 카메라 모듈

- 독립 컴포넌트 `<LiveCameraFeed station=... streamUrl=... enabled=... />`.
- 현재: `enabled=false` 또는 `streamUrl` 없으면 placeholder("카메라 연동 예정 — 하드웨어 입고 후
  MJPEG 연결") 박스.
- 향후: `streamUrl` 주입 시 같은 슬롯에 `<img src={streamUrl}>` 드롭인(레이아웃 재작업 없이).
- 설정: `enabled`/`streamUrl`은 env 또는 Supabase config 레코드(운영자가 URL만 넣으면 켜짐).
- 배치: 제조매니저·카이막·커피 화면에만. 자리안내 없음.
- **모듈 경계**: orders/station_status 데이터 로직과 결합 금지. 순수 "스트림 표시"만.

## 12. 진입 & 컴포넌트 구조

- `pageTypes.js`: `PAGE_TYPES.SEAT='seat'` + `isSeatPage()`. `INDEPENDENT_PAGE_TYPES`에 포함.
- `App.jsx`: `isSeatPage(pageType)`면 사이드바/페인 크롬 없이 **풀스크린** `<SeatSystemPage>` 렌더.
- `Sidebar.jsx`: 진입 버튼(기존 find-or-create 패턴 — `page_type='seat'` 페이지 조회/생성).

```
src/components/Seat/
  SeatSystemPage.jsx        풀스크린 컨테이너 + 상단 역할 탭 → 선택 역할 화면 렌더 + boardId 해석
  config/seatRoles.js       ROLES[] · STATIONS[] 데이터(하드코딩 금지)
  screens/
    GuideScreen.jsx         자리안내 입력 핵심(R1~R4)
    ManagerScreen.jsx       제조매니저(R5 menu_out, 완료 리스트, 카메라)
    StationScreen.jsx       station prop으로 카이막/커피 재사용(R6)
  components/
    OrderRow.jsx            행 단위 입력/표시 + R1·R2 파생상태
    LiveCameraFeed.jsx      격리된 카메라 슬롯(placeholder)
  hooks/
    useSeatOrders.js        fetch + Realtime + CRUD
    useStationStatus.js     fetch + Realtime + CRUD
```

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
- 테넌시 = `board_id` + `is_board_member()`(roster와 동일). 새 헬퍼·새 테넌시 테이블 없음.
- RLS = 로그인 SELECT 공개 / 쓰기 = `is_master() OR is_board_member(board_id)`.
- 역할·스테이션 = `config` 상수로 데이터화(별도 DB 테이블 보류 = 과설계 회피).
- queue_no = (board, business_date)별 DB 트리거 자동 부여.
- 카메라 = 순수 슬롯(데이터 로직과 결합 금지), 지금은 placeholder.

**미해결 (진행하며 합의)**
- [ ] board_id 소스 확정 — 4명 직원이 멤버로 속한 보드가 이미 있는가, 신규 등록 필요한가.
- [ ] 로그인 운용 — 태블릿이 공용 계정 1개로 로그인할지, 직원별 계정일지(RLS 보드멤버 판정 영향).
- [ ] 완료 처리 후 행 표시 — 완료 행을 리스트에서 숨길지/접을지/유지할지.
- [ ] "전체에게 전달" 버튼을 별도 액션으로 둘지, 모든 변경이 자동 실시간이라 생략할지.
- [ ] 카메라 enabled/streamUrl 저장 위치(env vs Supabase config 레코드) 최종 결정.

## 15. 수정 전 체크리스트

- [ ] RLS 변경 시 [ACCESS-MODEL.md](./ACCESS-MODEL.md) 패러다임을 새로 만들지 않았는가(`is_board_member` 재사용).
- [ ] 자리후 데이터를 daily 본문(`daily_blocks`)·TipTap에 섞지 않았는가(독립 테이블 유지).
- [ ] 역할·스테이션을 하드코딩하지 않고 `config`/text 컬럼으로 두었는가(역할 추가 시 스키마 불변).
- [ ] 카메라 컴포넌트가 orders/station_status 데이터 로직과 결합되지 않았는가(순수 슬롯).
- [ ] Realtime 채널에 cleanup(`removeChannel`)·`mountedRef` 보호가 있는가.
- [ ] 마이그레이션이 재실행 안전(IF NOT EXISTS / DROP POLICY IF EXISTS)한가.
- [ ] 마이그레이션을 합의 없이 프로덕션에 적용하지 않았는가(SQL 제시 → 승인 → 통합 세션 적용).
