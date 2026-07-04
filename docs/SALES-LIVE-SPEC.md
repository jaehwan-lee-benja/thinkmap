# 실시간 매출(Sales-Live) 기능 명세서

> 상태: **Phase 0(엔드포인트 발견) 완료 · 구현 보류(parked)** — 재개 시 §11 **Phase 1**부터.
> 작성 2026-06-28 · 보류 2026-07-04 · 브랜치 `feat/sales-live` · **docs-only(앱 코드 없음)**
>
> UnionPOS(asp2.unionpos.co.kr) 매출을 ThinkMap 안에서 "실시간 느낌"으로 보는 **마스터 전용** 페이지.
> 공식 외부 API 없음 → POS 웹의 내부 XHR을 재사용한다.
>
> 권한 모델은 [ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md), 대시보드 배선 선례는
> [DASHBOARD-SPEC.md](./DASHBOARD-SPEC.md)를 따른다. 마이그/Edge는 SQL·코드 **제시만**,
> 적용은 통합 세션(§10 안전 가드).
>
> **▶ 재개하려면 먼저 §0(재개 방법)을 읽어라.**

---

## 0. 재개 방법 (parked → resume)

1. **§2·§3을 먼저 읽는다** — Phase 0에서 실측한 내부 엔드포인트(`/v2/onday` 등)와 인증/세션
   구조. 재개의 핵심 자산이며 코드 없이도 여기서 바로 이어간다.
2. **§12 결정 필요 항목을 사용자와 확정한다** — 이게 재개의 **첫 관문**이다(특히 자격증명/세션
   보관 방식, "기억하기" 기본값). 미결이면 구현을 시작하지 않는다.
3. 결정 후 **§11 Phase 1**(Edge Function 프록시)부터 착수. Phase 1→2→3 순서.
4. DB 마이그·Edge·RLS는 **직접 적용 금지** → SQL/코드 제시 → supabase-guardian 검수 →
   사용자 승인 → 통합 세션 적용(§10).
5. 새 page_type 배선은 §7(공용 파일 pageTypes/App/Sidebar 수정 — 머지충돌 주의).

---

## 목차
- [0. 재개 방법 (parked → resume)](#0-재개-방법-parked--resume)
- [1. 핵심 원칙](#1-핵심-원칙)
- [2. UnionPOS 내부 엔드포인트 (Phase 0 결과)](#2-unionpos-내부-엔드포인트-phase-0-결과)
- [3. 인증 / 세션 처리](#3-인증--세션-처리)
- [4. 아키텍처](#4-아키텍처)
- [5. 데이터 모델](#5-데이터-모델)
- [6. RLS / 권한 (마스터 전용)](#6-rls--권한-마스터-전용)
- [7. 배선 — 새 page_type](#7-배선--새-page_type)
- [8. UI / 컴포넌트 구조](#8-ui--컴포넌트-구조)
- [9. 호출 예의 (과설계 금지)](#9-호출-예의-과설계-금지)
- [10. 안전 가드](#10-안전-가드)
- [11. Phase 로드맵](#11-phase-로드맵)
- [12. 결정 필요 항목](#12-결정-필요-항목)
- [13. 수정 전 체크리스트](#13-수정-전-체크리스트)

---

## 1. 핵심 원칙

1. **과설계 금지 — 폴러 없음.** 백그라운드 cron·주기 폴링을 두지 않는다. 데이터는 **페이지를
   열 때 1회 자동 조회** + **수동 새로고침 버튼**으로만 갱신한다. 화면에 **"업데이트 HH:MM:SS"**
   를 표시한다.
2. **마스터 전용.** dashboard/goals/payroll과 동일 등급(워크스페이스 노드, 읽기·쓰기 **owner**).
   사이드바 버튼·라우팅을 비마스터에게 숨기고, 진입 시 거부한다(§6, dashboard 선례).
3. **프록시는 필수, 그러나 가볍다.** 브라우저는 CORS + httpOnly 쿠키 때문에 UnionPOS를 직접
   호출할 수 없다. 새로고침을 누르면 **Edge Function 프록시가 1회** UnionPOS를 호출해 결과만
   돌려준다(폴러 아님).
4. **데이터 복사 최소.** v1은 매출 스냅샷을 DB에 영구 저장하지 않는다. 프록시가 매번 라이브로
   `/v2/onday`를 가져와 그대로 표시한다. (영구 추세 저장은 §11 후속.)
5. **자격증명은 선택적·서버측 보관.** "기억하기"를 켜면 자동 재로그인, 끄면 만료 시에만 수동
   입력. 자격증명은 **절대 브라우저로 내려보내지 않고**, DB 행/깃에 평문 저장하지 않는다(§3·§5).
6. **단일 매장.** 현재 매장 1개(사르르목장, StoreCode `3000000052881`) = 워크스페이스 1:1.
   다매장은 후속(§11) — `store_code`를 데이터에 남겨 확장 흡수.

---

## 2. UnionPOS 내부 엔드포인트 (Phase 0 결과)

> 2026-06-28 headless 캡처로 실측. 모두 `https://asp2.unionpos.co.kr` 하위, 세션쿠키 필요.

### 2.1 ★ `POST /v2/onday` — v1 핵심 (집계, 파라미터 없음)
- 인증: `JSESSIONID` 쿠키만. **요청 본문/파라미터 없음.**
- 응답 JSON:
  ```
  { MSG, CODE("0"=성공),
    MONTH:  { ReceiveAmt, CardAmt, CashAmt, EtcAmt, SellCnt, UnitAmt, VoidAmt, CancelAmt, TickAmt },
    ONEDAY: { ...同上 (오늘 누적) },
    WEEK:   [ { EndTimeDate:"YYYYMMDD", StoreCode, ReceiveAmt, CardAmt, CashAmt, SellCnt,
               SellAllCnt, UnitAmt, DcAmt, CouponAmt, PointAmt, CashReceiptAmt, EdenredAmt,
               KeepAmt, CashbagAmt, WorkAmt, CustNum }, ... ] }
  ```
- 필드 뜻: `ReceiveAmt`=총수납(=매출), `SellCnt`=객수, `UnitAmt`=객단가, `CardAmt`/`CashAmt`/`EtcAmt`
  =결제수단별, `VoidAmt`/`CancelAmt`=취소.
- **실시간성 검증:** 수 분 사이 `ReceiveAmt 3,721,400 → 3,770,800`, `SellCnt 187 → 190` 증가
  확인 → 새로고침마다 최신값.

### 2.2 `POST /v2/sales/out/sales_payment/day/get` — 결제/입금 상세 (참고)
- form: `startDate=YYYYMMDD&endDate=YYYYMMDD`. 응답 `{ MSG, CODE, LIST[] }`. (입금건 없으면 빈 배열.)

### 2.3 `POST /v2/sales/detail/receipt` — 거래 단위 피드 (v2 옵션)
- form: `pageNo`(숫자), **`pageSize`(숫자 필수 — 빈값이면 500)**, `startDate=YYYY-MM-DD`,
  `endDate=YYYY-MM-DD`, `SellType`, `rangeDate`, `detailSearch`.
- 응답: **JSON 아님 — 서버렌더 HTML 테이블**. 컬럼: 판매일시(분단위)·포스번호·영수증번호·결제합계·
  현금·카드·기타·할인·판매타입·좌석·고객수·공급가액·부가세. → HTML 파싱 필요. v2에서 검토.

### 2.4 `POST /v2/sales/etc/tableStatus/{table|tableOrder|tableOrder/detail}/get` — 실시간 테이블 현황 (후속)
- AJAX JSON. 영업 중 테이블/주문 점유. 현황판 용도 후속.

> 그 외 시간별/일별/월별 페이지는 모두 **form submit → 전체 HTML 렌더** 방식이라 v1 비대상.

---

## 3. 인증 / 세션 처리

- **세션 주체:** `JSESSIONID` (httpOnly 쿠키). 서버 세션 타임아웃으로 **만료된다**(주기는
  미실측 — §12-1). localStorage엔 `userId`/`saveCheck`만(자동로그인 체크 표시일 뿐, 인증 아님).
- **로그인:** 단순 폼 `POST /loginCheck` (`userId`, `password`, `save`). **캡차 없음** →
  프록시 대리 로그인 가능.
- **프록시의 세션 수명주기:**
  1. 캐시된 `JSESSIONID`로 `/v2/onday` 시도.
  2. 만료 감지(로그인 페이지 리다이렉트 / `CODE`≠"0" / HTML 응답) →
     - 자격증명이 보관돼 있으면 → `/loginCheck`로 **자동 재로그인** → 새 세션 캐시 → 재시도.
     - 보관 안 돼 있으면 → 프론트에 `needLogin` 신호 → 페이지에서 1회 수동 입력.
- **자동로그인 토글:** "기억하기" ON = 자격증명 서버측 보관(§5). OFF = 보관 안 함, 만료 시마다
  페이지에서 입력.

---

## 4. 아키텍처

```
[ThinkMap 브라우저]                 [Supabase Edge Function: unionpos-onday]        [UnionPOS]
 SalesLivePage                       (service role, 서버측)
   - 마운트 시 1회 호출  ───POST──▶   1) 캐시 세션으로 /v2/onday 호출 ───────────▶  /v2/onday
   - "새로고침" 버튼                  2) 만료면 /loginCheck 재로그인 후 재시도 ───▶  /loginCheck
   - "업데이트 HH:MM:SS"  ◀──JSON──   3) onday JSON 정규화해서 반환
   - needLogin 시 로그인 폼          (자격증명/세션은 서버에만, 브라우저로 안 감)
```

- **프록시 = Supabase Edge Function** (`supabase/functions/unionpos-onday/`). 선례:
  `supabase/functions/ensure-daily-page/`, 공유 CORS = `_shared/cors.ts`.
- 호출자 검증: Edge Function은 **요청자가 마스터인지** 확인한다(JWT → `app_users.role='master'`).
  비마스터 호출은 거부.
- 프론트는 `supabase.functions.invoke('unionpos-onday')`로 호출(앵커=세션 JWT).

---

## 5. 데이터 모델

### 5.1 v1 — 매출 스냅샷 테이블 **없음**
라이브 조회만 한다. "업데이트 시각"은 프록시 응답 시각(클라이언트 표시). DB 영구화는 §11 후속.

### 5.2 자격증명 / 세션 보관 (서버측 전용) — **방식 결정 필요(§12-2)**
"기억하기" ON일 때 UnionPOS `userId`/`password`와 캐시 `JSESSIONID`를 서버측에만 둔다.
후보:

| 방식 | 설명 | 비고 |
|---|---|---|
| **(A) Supabase Vault** (권장) | 워크스페이스별 비밀을 Vault에 암호화 저장, Edge Function(service role)만 복호화 | 토글=레코드 유무. DB 평문 아님 |
| (B) Edge Function 환경변수(secret) | 단일 매장이면 가장 단순 | 토글/멀티매장 표현 어려움 |
| (C) 보관 안 함(완전 수동) | 만료 시마다 페이지 입력 | 가장 안전, 가끔 손이 감 |

세션쿠키 캐시도 같은 저장소에 둔다(짧은 TTL). **클라이언트에는 어떤 경우에도 노출하지 않는다.**

---

## 6. RLS / 권한 (마스터 전용)

dashboard/payroll과 **동일 패턴**(DASHBOARD-SPEC §6 선례).

- **프론트 판정:** `useAuth().isMaster` (= `app_users.role==='master'`). PaneProvider→`usePaneData()`로 전파.
- **사이드바:** "실시간 매출" 버튼을 `{isMaster && (…)}`로 감싼다(비마스터엔 안 보임).
- **App.jsx:** `if (isSalesLivePage(pageType)) { if (!isMaster) return <거부화면>; return <Suspense><SalesLivePage/></Suspense> }`.
- **pages 진입 row:** `page_type='sales-live'` 1개(project_id NULL, 마스터 소유).
  마이그는 `pages_page_type_chk` CHECK에 `'sales-live'`만 추가(마스터 전용은 worklog 공개 절
  **건드리지 않음** — DASHBOARD-SPEC §6.2의 의도된 예외와 동일).
- **자격증명/세션 테이블(§5.2 A 채택 시):** RLS는 owner 능력(`can_in_workspace(current_workspace(),
  'owner')`) 또는 `is_master()` 게이트. **password 컬럼은 클라이언트 SELECT 불가**(Edge service role 전용).
  → SQL은 supabase-guardian 검수 필수(§10).

---

## 7. 배선 — 새 page_type

새 page_type `sales-live` 추가 시 공통 파일 수정(통합 세션 머지충돌 주의 — 변경 최소·명확):

1. **`src/utils/pageTypes.js`**
   - `PAGE_TYPES.SALES_LIVE = 'sales-live'`
   - `INDEPENDENT_PAGE_TYPES`에 추가(프로젝트 비소속 독립 엔티티)
   - `MASTER_ONLY_PAGE_TYPES`에 추가 **또는** dashboard처럼 조건부 렌더로 처리(택1, dashboard와 통일 권장)
   - `export const isSalesLivePage = (page) => typeOf(page) === PAGE_TYPES.SALES_LIVE`
2. **`src/App.jsx`** — import에 `isSalesLivePage` 추가, `PaneInner` 렌더 분기(dashboard 블록 옆)에
   마스터 거부 + `lazy` SalesLivePage 추가.
3. **`src/components/Sidebar/Sidebar.jsx`** — import 추가 + 마스터 전용 버튼(find-or-create 패턴,
   `window.location.reload()` 금지 → `fetchPages()`+`handlePageSelect()`).
4. **컴포넌트:** `src/components/SalesLive/SalesLivePage.jsx` + `const SalesLivePage = lazy(...)`.

---

## 8. UI / 컴포넌트 구조

```
src/components/SalesLive/
  SalesLivePage.jsx     — 컨테이너. session prop. 마운트 시 1회 invoke + 새로고침 버튼 + 업데이트시각.
                          needLogin이면 로그인 폼 표시.
  useUnionSales.js      — Edge Function 호출 훅(로딩/에러/needLogin/lastUpdated 상태).
  SalesLive.css         — 디자인 토큰 var(--color-*) 재사용.
```

- **표시(건조 스타일, DESIGN-PHILOSOPHY):** 오늘 매출(ReceiveAmt)·객수·객단가, 카드/현금/기타
  내역, 주간 추이(WEEK[] — 순수 div 막대, 새 차트 라이브러리 X). 상단에 "업데이트 HH:MM:SS" +
  새로고침 버튼.
- **모바일(≤768px) 1열**, 입력 폰트 ≥16px(MOBILE-DESIGN).
- **코드 스플리팅:** `React.lazy`로 분리(대시보드 선례) — 매출 안 여는 세션엔 번들 부담 0.

---

## 9. 호출 예의 (과설계 금지)

- 폴러 없음. 사용자가 **열거나 새로고침을 누를 때만** 1회 호출. 본인 매장이라도 UnionPOS 서버에
  불필요한 부하를 주지 않는다.
- (후속에서 자동 갱신을 붙이더라도) 영업시간 한정 + 저빈도로만. v1엔 없음.

---

## 10. 안전 가드

1. **authz/secret 변경 = 사고 후보.** RLS·자격증명 테이블 SQL, Edge Function은 **SQL/코드 제시 →
   supabase-guardian 검수 → 사용자 승인 → 통합 세션 적용**. 워커 세션 직접 적용 금지.
2. **자격증명 비노출.** password는 브라우저로 내려보내지 않고, DB 평문/깃 커밋 금지(§5).
3. **무중단·무삭제.** 기존 page_type CHECK 값 전부 보존하며 `'sales-live'`만 추가.
4. **세션 1회 수동 로그인 보안 규칙(메모리):** Phase 0 조사 시 headless + storageState 재사용,
   browser.close, 좀비 pkill(공유 메모리 규율).

---

## 11. Phase 로드맵

> **현재 위치:** Phase 0 완료 · 구현 보류(parked). 재개는 **Phase 1**부터(§12 결정 선행).

| Phase | 범위 | 상태 |
|---|---|---|
| **0** | 내부 엔드포인트 발견(`/v2/onday` 등) + 인증/세션 파악 | ✅ **완료(2026-06-28)** — §2·§3에 결과 기록 |
| **1** | Edge Function 프록시(`unionpos-onday`) + 자격증명/세션 보관(§5.2) + 마스터 호출 검증 | ⏸ 보류(재개 시작점) |
| **2** | page_type `sales-live` 배선(§7) + SalesLivePage(오늘 매출·객수·객단가·결제수단·주간추이) + 새로고침/업데이트시각 | ⏸ 보류 |
| **3** | 세션 만료 자동 재로그인 + 페이지 내 로그인 폼(needLogin) | ⏸ 보류 |
| 4 | (옵션) 영수증 단위 피드(§2.3 HTML 파싱) / 테이블 현황(§2.4) | 후속 |
| 5 | (옵션) 매출 스냅샷 영구 저장 + 추세, 다매장(store_code) | 후속 |

**보류 시점 산출물:** 이 SPEC 문서뿐(앱 코드·마이그·Edge **없음** = docs-only). Phase 0의 조사
스크립트/캡처는 세션 scratchpad에만 있고 리포에 커밋하지 않는다(재현 방법은 §2 주석 참고).

---

## 12. 결정 필요 항목 — ★재개 전 첫 관문★

> 아래를 사용자와 확정하기 전에는 Phase 1 구현을 시작하지 않는다. (2·4가 자격증명/보안 핵심.)

1. **세션 만료 주기 실측** — 톰캣 기본(무활동 30분) 추정이나 미확인. 자동 재로그인 필요성과
   캐시 TTL을 정하려면 1회 실측 권장. (폴링이 세션을 살려 거의 만료 안 날 가능성도.)
2. **자격증명 보관 방식** ⭐ — §5.2의 (A) Supabase Vault / (B) Edge env secret / (C) 무보관(완전 수동)
   중 택1. (권장 A.) 이게 Phase 1·3 설계를 좌우한다.
3. **마스터 노출 방식 통일** — `MASTER_ONLY_PAGE_TYPES` 등록 vs dashboard식 조건부 렌더 — dashboard와
   동일하게 갈지 확정(§7).
4. **"기억하기" 기본값** ⭐ — ON(편의, 자동 재로그인) vs OFF(보안, 만료 시 수동). (권장: 첫 도입 OFF,
   만료가 잦으면 ON 전환.)
5. **v1 범위 확정** — `/v2/onday` 집계만으로 시작(권장)인지, 영수증 피드(§2.3)까지 v1에 넣을지.

---

## 13. 수정 전 체크리스트

- [ ] 폴러/cron을 추가하지 않았는가(열기+새로고침 only)
- [ ] 마스터 전용 게이트(사이드바 `{isMaster&&}`, App 거부화면, Edge 호출자 검증)를 모두 걸었는가
- [ ] 자격증명/세션이 브라우저로 내려가지 않는가(서버측 전용)
- [ ] page_type CHECK에 기존 값 보존하며 `'sales-live'`만 추가했는가(마스터 전용=worklog 절 미수정)
- [ ] RLS/Edge/마이그를 직접 적용하지 않고 guardian 검수→통합 세션 경로를 지켰는가
- [ ] `window.location.reload()` 대신 fetchPages+handlePageSelect를 썼는가
- [ ] 코드 스플리팅(lazy)으로 분리했는가
- [ ] 모바일 1열·입력 폰트 ≥16px·건조 스타일을 지켰는가
- [ ] §12 결정 항목이 해소되면 본 문서를 갱신했는가
