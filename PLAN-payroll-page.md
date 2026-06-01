# 급여명세서 페이지 — 통합 계획

> 4월 근태(이카운트/출입통제 로그)를 업로드하면 인원별 기본 급여명세서가 나오고,
> 세부 조정(시급 개별 책정, 시간 보정, 수당/공제)을 할 수 있는 페이지.
> **마스터 권한 계정만** 볼 수 있고, 사이드바에서 **마케팅 캔버스 아래**에 위치.
> 마케팅 캔버스도 이참에 **마스터 전용**으로 전환.

## 진행 상태

- [x] **밑작업: 근태 파서 + 급여 계산 로직** (실제 4월 PDF로 검증 완료)
  - `src/utils/payroll/attendanceParser.js` — 원본 → 직원·일자별 근무 세션
  - `src/utils/payroll/payrollCalc.js` — 명세서 모델(기본급=시급×7h×일수, 지급/공제, 고용보험 0.9%)
  - `tests/transform/payroll.spec.js` — 정식 테스트 19건 (※ vitest는 Node 20+ 필요, 현 셸 node v19라 순수 node로 전건 통과 확인)
- [x] **앱 배선 (Phase 1)** — `npm run build` 통과
  - `PaneProvider.jsx`: paneData에 `isMaster` 노출 + usePages로 전달
  - `usePages.js`: 비마스터에게 frame/engine/payroll 트리 숨김
  - `Sidebar.jsx`: "+ 마케팅 캔버스" 마스터 게이팅 + 아래 "급여명세서" 버튼(마스터 전용, find-or-create)
  - `App.jsx`: `page_type==='payroll'` → `<PayrollPage>` 라우팅 + 비마스터 접근 거부
- [x] **DB 마이그레이션 (작성, 실행 대기)** — `migrate-create-payroll.sql`
  - pages CHECK에 'payroll' 추가 + `payroll_sheets`(월별 jsonb) + RLS 마스터 전용
- [x] **페이지 UI (Phase 2~3 MVP)** — `src/components/Payroll/PayrollPage.jsx` + `Payroll.css`
  - 월 선택 / 근태 붙여넣기→파싱 / 인원별 시급 설정 / 간이형 명세서 카드(지급·공제 편집·실시간 합계) / 저장
  - `src/hooks/usePayrollSheet.js` — payroll_sheets 로드/저장(upsert)
- [ ] **남은 일**: ① 사용자가 `migrate-create-payroll.sql` 실행 ② 실제 앱에서 동작 테스트
  ③ (후속) 보너스/주휴 자동화, 정식형(근로기준법) 템플릿, 인쇄/PDF

## 검증된 파싱 규칙 (근태 데이터 특성)

원본이 지저분하여 라벨(01출근/02퇴근/00출입)에 의존하지 않는다:
- 발생일자가 첫 행에만 있고 이어지는 행 비어 있음(병합) → **forward-fill**
- 같은 사람 하루 출근 여러 번(예: 9:48,11:36,11:37) → **첫 스캔=출근, 마지막=퇴근**
- 라벨 뒤바뀜(퇴근 9:33 → 출근 9:34) → 순서로만 판단하므로 영향 없음
- 스캔 1회뿐 → `anomaly: 'single-scan'`, 0분 + 경고. 화면에서 수동 보정 대상
- 토/일 → 주말 시급 적용 (UTC 기준 요일 계산으로 타임존 영향 제거)
- 시급: 기본 평일 10,500 / 주말 12,500, **인원별 override** 지원

4월 원본에서 발견된 직원(15명): 김지연 안선영 신민정 이재환 배미진 김가을 장아린
문지선 유지현 서효경 이다경 조우영 장원희 김도윤 김향숙

## 앱 통합 지점 (코드 위치)

### 1. 마스터 권한 전달 경로
`useAuth()`(`src/hooks/useAuth.js`)가 `isMaster` 계산 →
`App.jsx`가 `PaneProvider`에 prop 전달(`PaneProvider.jsx:24`).
**단, `paneData` 컨텍스트 value에 `isMaster`가 없음**(`PaneProvider.jsx:434-447`).
→ Sidebar에서 쓰려면 `paneData`에 `isMaster` 추가 후 `usePaneData()`로 읽기.

### 2. 사이드바 버튼 (마케팅 캔버스 + 급여명세서)
`src/components/Sidebar/Sidebar.jsx:182-189` 의 "+ 마케팅 캔버스" 버튼.
- 이 버튼을 `isMaster &&` 로 감싸 마스터 전용화
- 바로 아래에 "급여명세서" 버튼 추가(역시 `isMaster &&`), 클릭 시 page_type='payroll' 페이지 찾기/생성 → 선택 (캘린더/업무일지 버튼의 find-or-create 패턴 그대로)

### 3. 마케팅 캔버스 페이지 트리 숨김
`usePages.js:16` `visiblePages = pages.filter(p => p.page_type !== 'calendar' && p.page_type !== 'daily')`.
frame/engine(캔버스)·payroll 페이지가 트리에 노출되므로, 비마스터에게는
frame/engine/payroll 도 필터링 필요. (isMaster를 usePages/PageTree까지 전달)

### 4. 페이지 라우팅
`App.jsx:135` 부근 — `pageType === 'frame' || 'engine'` → `CanvasViewer`,
`'schedule'` → `SchedulePage`. 여기에 `'payroll'` → `<PayrollPage>` 분기 추가.
마스터 아닐 때 payroll/frame/engine 페이지 직접 접근 시 접근 거부 처리도 함께.

### 5. page_type 제약 (DB)
`pages` 테이블의 page_type 체크/RLS가 'payroll'을 허용하는지 확인 필요.
`migrate-pages-allow-schedule.sql` 가 'schedule' 허용한 선례 → 동일 패턴으로
`migrate-pages-allow-payroll.sql` 작성.

## 저장 모델 (양식 확정 후 결정)

급여명세서는 (a) 업로드된 근태 원본 (b) 인원별 시급/조정값 (c) 산출 결과 를 가진다.
선택지:
- **A. pages.content(JSON)에 저장** — 기존 패턴 재사용, 별도 테이블 불필요. 단순.
- **B. 전용 테이블** `payroll_records` — 월별/직원별 행. 이력·집계 유리, RLS 마스터 전용.

권장: 초기엔 A(빠름), 월별 명세 누적·조회 요구 생기면 B로 마이그레이션.

## 미정 — 사용자 확인 필요

- 페이지 양식/레이아웃 (사용자가 기존 양식 링크 제공 예정) ← **대기 중**
- 휴게시간 차감 규칙 적용 여부 (calc는 `breakRule` 옵션으로 지원, 기본 미적용)
- 단일 스캔(퇴근 누락) 처리 정책: 0원 / 수동입력 / 표준근무시간 가정 중 택
- 월 단위 명세 저장·이력 필요 여부 (저장 모델 A vs B)
