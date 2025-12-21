# Todo Note 기획서

## 📋 프로젝트 개요

**프로젝트명**: Todo Note
**목적**: 날짜별 투두 관리 및 루틴 트래킹을 위한 웹 애플리케이션
**배포 URL**: https://jaehwan-lee-benja.github.io/todo-note/

### 핵심 가치
- 과거 미완료 투두의 자동 이월로 할 일을 놓치지 않음
- 루틴 설정을 통한 반복 작업 자동화
- 완료 히스토리를 통한 진행 상황 시각화

---

## 🎯 주요 기능

### 1. 투두 관리

#### 1.1 기본 CRUD
- **생성**: 날짜별로 투두 추가
- **수정**: 더블클릭으로 텍스트 수정
- **삭제**: 스와이프 또는 버튼으로 삭제
- **완료 토글**: 체크박스로 완료/미완료 상태 변경

#### 1.2 순서 변경
- 드래그 앤 드롭으로 투두 순서 변경 가능
- DnD Kit 라이브러리 사용

#### 1.3 날짜 네비게이션
- 날짜 선택기로 특정 날짜 이동
- 이전/다음 날 버튼으로 빠른 이동

---

### 2. 이월 로직 (Carryover System)

#### 2.1 개념
과거 날짜의 미완료 투두를 현재로 **복사** (이동 아님)

#### 2.2 작동 방식
1. **원본 보존**: 과거 날짜의 미완료 투두는 원본으로 남음
2. **복사본 생성**: 오늘 날짜에 새로운 투두 생성
3. **관계 추적**: `original_todo_id`로 원본-복사본 관계 저장

#### 2.3 이월 시점
- **앱 시작 시**: 과거의 모든 미완료 항목 자동 이월
- **자정**: 전날 미완료 항목을 다음날로 자동 이월

#### 2.4 특징
- 중복 방지: 이미 이월된 항목은 다시 이월하지 않음
- 서브투두 제외: 나노투두는 이월하지 않음
- 루틴 유지: 루틴 정보는 복사본에도 유지

---

### 3. 루틴 (Routine System)

#### 3.1 개념
특정 요일마다 자동으로 생성되는 반복 투두

#### 3.2 루틴 관리
- **생성**: 텍스트와 반복 요일 설정
- **수정**: 텍스트 또는 요일 변경
- **삭제**: 루틴 완전 제거

#### 3.3 자동 생성
- 설정된 요일의 페이지를 열면 자동으로 루틴 투두 생성
- 형식: `{루틴명}-for {월/일(요일)}`
- 예시: "여행 정산하기-for 11/17(월)"

#### 3.4 화면 구성
- **📌 루틴 섹션**: 페이지 상단에 루틴 투두 표시
- **📝 일반 투두 섹션**: 루틴 아래에 일반 투두 표시

#### 3.5 루틴 히스토리
- **📊 버튼**: 각 루틴마다 히스토리 보기 버튼
- **달력 시각화**:
  - 루틴 생성일부터 오늘까지 달력 표시
  - 완료한 날짜에 ✓ 체크 표시
  - 루틴 요일이 아닌 날은 흐리게 표시
- **통계**: 총 투두, 완료/미완료 개수, 완료율

---

### 4. 나노투두 (Sub-Todo)

#### 4.1 개념
투두 항목 하위의 세부 작업 목록

#### 4.2 기능
- 🔬 아이콘으로 나노투두 섹션 토글
- 나노투두 추가/삭제
- 나노투두도 완료 체크 가능
- 드래그로 순서 변경 가능

---

### 5. 히스토리 추적

#### 5.1 수정 히스토리
- 투두 텍스트 수정 시 이전 내용 자동 저장
- 📜 아이콘으로 히스토리 보기
- 수정 날짜와 변경 내용 표시

#### 5.2 이월된 투두의 히스토리
- 복사본을 수정하면 원본의 히스토리도 함께 업데이트
- `changed_on_date`로 어느 날짜에 수정했는지 추적

---

### 6. 완료 날짜 추적

#### 6.1 개념
투두를 완료한 실제 날짜 기록

#### 6.2 작동 방식
- `completed_at` 컬럼에 완료 시각 저장
- 완료 날짜와 투두 날짜가 다르면 배지 표시
- 예: "17일✓" - 17일에 완료됨

#### 6.3 이월된 투두의 완료
- 미래 날짜에서 완료 시 원본도 자동 완료 처리
- 원본에는 완료 날짜 배지로 구분 표시

---

### 7. 휴지통 (Trash)

#### 7.1 소프트 삭제
- 투두 삭제 시 `deleted=true`로 표시
- 실제 데이터는 DB에 보존

#### 7.2 복구 기능
- 삭제 후 Undo 토스트로 즉시 복구 가능
- 🗑️ 휴지통 메뉴에서 삭제된 항목 확인 및 복구

---

### 8. 더미 데이터 관리

#### 8.1 동적 생성
- 현재 날짜 기준 ±2일 범위로 20개 테스트 데이터 생성
- 세션 ID로 각 생성 세션 구분

#### 8.2 삭제 기능
- 세션별 삭제
- 전체 더미 데이터 일괄 삭제

#### 8.3 중복 제거
- 같은 텍스트의 투두 중 가장 오래된 것만 남기고 삭제
- 삭제 전 목록 확인 가능

---

## 🗄️ 데이터베이스 구조

### Todos 테이블

```sql
CREATE TABLE todos (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,           -- 완료 시각
  date DATE NOT NULL,                 -- 투두 날짜
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  order_index INTEGER,                -- 정렬 순서
  parent_id BIGINT REFERENCES todos(id) ON DELETE CASCADE, -- 나노투두용
  routine_id BIGINT REFERENCES routines(id) ON DELETE SET NULL, -- 루틴 연결
  original_todo_id BIGINT REFERENCES todos(id) ON DELETE SET NULL, -- 이월 원본 추적
  deleted BOOLEAN DEFAULT false,
  deleted_date DATE
);
```

### Routines 테이블

```sql
CREATE TABLE routines (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  days TEXT[] NOT NULL,               -- 요일 배열 ['mon', 'wed', 'fri']
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT false
);
```

### Todo History 테이블

```sql
CREATE TABLE todo_history (
  id BIGSERIAL PRIMARY KEY,
  todo_id BIGINT REFERENCES todos(id) ON DELETE CASCADE,
  previous_text TEXT,
  new_text TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_on_date DATE                -- 어느 날짜 페이지에서 수정했는지
);
```

---

## 🛠️ 기술 스택

### Frontend
- **React 19.1.1**: UI 라이브러리
- **Vite 5.4.21**: 빌드 도구
- **@dnd-kit**: 드래그 앤 드롭
- **CSS**: 커스텀 스타일링

### Backend
- **Supabase**: PostgreSQL 데이터베이스 + Realtime
- **Supabase Realtime**: 실시간 데이터 동기화

### 배포
- **GitHub Pages**: 정적 사이트 호스팅
- **gh-pages**: 배포 자동화

---

## 📱 UI/UX 특징

### 반응형 디자인
- 모바일/데스크톱 최적화
- 터치 제스처 지원 (스와이프 삭제)

### 다크 모드
- 기본 다크 테마
- 눈의 피로 최소화

### 시각적 구분
- 루틴/일반 투두 섹션 분리
- 이월된 투두 구분선 ("이전에서 넘어옴")
- 완료 날짜 배지

### 인터랙션
- 드래그 앤 드롭으로 순서 변경
- 더블클릭으로 수정
- 스와이프로 삭제
- 호버 효과

---

## 🔄 주요 플로우

### 1. 일반 투두 생성 → 완료
```
1. 투두 입력 후 "추가" 버튼
2. 해당 날짜에 투두 생성
3. 체크박스 클릭으로 완료
4. completed_at 기록
```

### 2. 과거 투두 이월 → 완료
```
1. 16일에 "투두1" 생성 (미완료)
2. 17일 앱 접속
3. "투두1" 자동으로 17일에 복사됨
4. 16일 원본은 그대로 유지
5. 17일 복사본을 완료
6. 16일 원본도 완료 처리되며 "17일✓" 배지 표시
```

### 3. 루틴 생성 → 자동 생성
```
1. 루틴 관리에서 "여행 정산하기" 생성
2. 월,수,금 요일 선택
3. 월요일 페이지 접속
4. "여행 정산하기-for 11/17(월)" 자동 생성
5. 완료 시 히스토리에 기록
```

### 4. 나노투두 활용
```
1. "프로젝트 완성" 투두 생성
2. 🔬 아이콘 클릭
3. 나노투두 추가:
   - "DB 설계"
   - "API 개발"
   - "프론트엔드 구현"
4. 각각 체크하며 진행
```

---

## 🚀 배포 방법

### 개발 서버
```bash
npm run dev
# http://localhost:5173/todo-note/
```

### 프로덕션 배포
```bash
npm run deploy
# GitHub Pages에 자동 배포
# https://jaehwan-lee-benja.github.io/todo-note/
```

---

## 📝 데이터베이스 마이그레이션

### 초기 설정
1. Supabase 프로젝트 생성
2. 테이블 생성 (todos, routines, todo_history)
3. `.env` 파일에 Supabase 키 설정

### 기능 추가 시 마이그레이션
- `add-original-todo-id-column.sql`: 원본 투두 추적
- `add-completed-at-column.sql`: 완료 날짜 추적
- `restore-past-todos-from-carryover.sql`: 기존 데이터 복원

---

## 🐛 알려진 이슈 및 해결

### 1. React StrictMode 중복 실행
**문제**: 개발 모드에서 useEffect가 두 번 실행되어 루틴 투두 중복 생성
**해결**: `routineCreationInProgress` useRef로 실행 중 플래그 관리

### 2. 타임존 이슈
**문제**: UTC 타임존 사용 시 날짜가 하루 앞당겨짐
**해결**: 모든 타임스탬프를 KST (`+09:00`) 명시

### 3. 더미 데이터 패턴 매칭
**문제**: `[DUMMY-TEST]%` 패턴이 `[DUMMY-숫자]` 데이터와 매칭 안됨
**해결**: 패턴을 `[DUMMY-%`로 변경

---

## 🎨 디자인 시스템

### 색상
- **Primary**: `#646cff` (파란색)
- **Success**: `#4caf50` (초록색)
- **Danger**: `#ff6b6b` (빨간색)
- **Background**: `#242424` (다크 그레이)
- **Surface**: `#1a1a1a` (카드 배경)

### 타이포그래피
- **Font Family**: system-ui
- **Base Size**: 16px
- **Heading**: 1.2rem ~ 2rem

### 간격
- **Small**: 8px
- **Medium**: 16px
- **Large**: 24px

---

## 📊 통계 및 인사이트

### 투두 통계
- 전체 개수
- 완료/미완료 개수
- 완료율

### 루틴 히스토리
- 루틴별 완료율
- 달력 시각화
- 최근 활동 추적

---

## 🔐 보안 고려사항

### Supabase RLS (Row Level Security)
- 사용자별 데이터 격리 필요 시 RLS 정책 설정
- 현재는 단일 사용자 환경

### 환경 변수
- Supabase URL 및 API Key는 `.env` 파일로 관리
- GitHub에 커밋되지 않도록 `.gitignore` 설정

---

## 📚 참고 문서

### README.md
프로젝트 개요 및 배포 방법, Claude Code 작업 지침

### SQL 파일
- `create-dummy-data-v2.sql`: 동적 더미 데이터 생성
- `delete-dummy-data-v2.sql`: 더미 데이터 삭제
- `add-*.sql`: 데이터베이스 마이그레이션

---

## 🎯 향후 개선 사항

### 기능 개선
- [ ] 다중 사용자 지원 (인증 시스템)
- [ ] 투두 필터링 (완료/미완료/루틴)
- [ ] 투두 검색 기능
- [ ] 태그/카테고리 시스템
- [ ] 우선순위 설정
- [ ] 마감일 알림

### UX 개선
- [ ] 키보드 단축키
- [ ] 모바일 앱 (PWA)
- [ ] 오프라인 지원
- [ ] 다크/라이트 모드 토글

### 성능 최적화

#### 현재 상태
- **번들 크기**: 537 kB (gzip: 153 kB)
- **상태**: 경고 수준이지만 동작에는 문제 없음
- **전략**: 구조 리팩토링 완료 후 최적화 진행

#### 최적화 계획 (리팩토링 후 진행)

**Phase 1: 코드 스플리팅**
- [ ] React.lazy를 사용한 컴포넌트 lazy loading
- [ ] 모달 컴포넌트 동적 import (TrashModal, GanttChartModal 등)
- [ ] Route-based code splitting (라우터 도입 시)

**Phase 2: 번들 분석 및 최적화**
- [ ] `rollup-plugin-visualizer`로 번들 구성 분석
- [ ] `build.rollupOptions.output.manualChunks` 설정
- [ ] Vendor 라이브러리 분리 (react, dnd-kit, supabase)
- [ ] Tree shaking 최적화 확인

**Phase 3: 추가 최적화**
- [ ] 무한 스크롤 (페이지네이션)
- [ ] 이미지 최적화
- [ ] Service Worker (PWA)
- [ ] 컴포넌트 메모이제이션 (React.memo, useMemo)

#### 예상 효과
- 초기 로딩 번들 크기 30-40% 감소
- Time to Interactive (TTI) 개선
- Lighthouse 성능 점수 향상

---

## 📞 문의 및 피드백

GitHub Issues: https://github.com/jaehwan-lee-benja/todo-note/issues

---

**작성일**: 2025-11-17
**버전**: 1.0.0
**작성자**: Claude Code
