# ThinkMap 모바일 최적화 기획서

## 1. 현황 분석

### 1.1 프로젝트 개요
- Notion 스타일의 계층형 노트 에디터 (TipTap/ProseMirror 기반)
- 사이드바 + 헤더 + 에디터 3단 레이아웃
- 에디터/컬럼뷰/마인드맵 3가지 뷰 모드
- Supabase 백엔드, React 19, Vite, 순수 CSS

### 1.2 현재 모바일 대응 상태
| 영역 | 현재 상태 | 평가 |
|------|----------|------|
| 뷰포트 메타 | 설정됨 (user-scalable=yes) | OK |
| 반응형 브레이크포인트 | 600px / 768px / 1024px | OK |
| 사이드바 | 오버레이 방식 토글 | 기본만 됨 |
| 터치 타겟 | 일부 44px 적용 | 미흡 |
| 컨텍스트 메뉴 | 480px 이하 바텀시트 | OK |
| 스와이프 제스처 | 없음 | 미구현 |
| PWA 지원 | 없음 | 미구현 |
| Safe Area (노치) | 없음 | 미구현 |
| 모바일 내비게이션 | 햄버거만 존재 | 미흡 |
| 에디터 터치 UX | 기본 TipTap 동작만 | 미흡 |
| 마인드맵 터치 | 마우스 이벤트만 | 미구현 |
| 오프라인 지원 | 없음 | 미구현 |
| 모바일 키보드 대응 | 없음 | 미구현 |

---

## 2. 모바일 최적화 목표

### 핵심 원칙
1. **모바일 퍼스트가 아닌 "모바일 동등"** - 데스크톱 경험을 해치지 않으면서 모바일에서도 자연스러운 사용
2. **네이티브 앱 수준의 터치 UX** - 스와이프, 제스처, 햅틱 피드백 패턴 적용
3. **점진적 개선** - 기존 코드를 최소한으로 변경하며 단계별 적용

### 성공 지표
- 모바일에서 모든 핵심 기능 (페이지 CRUD, 편집, 뷰 전환) 사용 가능
- 터치 타겟 100% 44px 이상 준수
- 사이드바 스와이프 오픈/클로즈
- Safe Area 완벽 대응 (iPhone 노치/Dynamic Island)

---

## 3. 단계별 실행 계획

### Phase 1: 기반 인프라 (필수/즉시)

#### 1-1. Safe Area 대응
- `env(safe-area-inset-*)` 적용
- index.html viewport에 `viewport-fit=cover` 추가
- 헤더, 사이드바, 바텀 영역에 safe area 패딩 반영

**대상 파일:**
- `index.html`
- `src/App.css`
- `src/components/Sidebar/Sidebar.css`

#### 1-2. 모바일 전용 CSS 변수 체계 정비
- `variables.css`에 모바일 전용 spacing/font-size 변수 추가
- 미디어 쿼리 내에서 변수 오버라이드 방식으로 통일

**대상 파일:**
- `src/styles/variables.css`

#### 1-3. 터치 타겟 전수 점검 및 보완
- 모든 인터랙티브 요소 최소 44x44px 보장
- 페이지 트리 항목, 토글 버튼, 툴바 버튼 등 누락 영역 보완
- `@media (hover: none) and (pointer: coarse)` 쿼리 확장

**대상 파일:**
- `src/components/Sidebar/Sidebar.css`
- `src/components/TipTapEditor/TipTapEditor.css`
- `src/components/TipTapEditor/TipTapPage.css`
- `src/components/Navigation/Header.css` (있다면)

#### 1-4. 모바일 감지 유틸리티
- `useIsMobile` 훅 생성 (CSS 미디어 쿼리 + matchMedia 기반)
- 터치 디바이스 감지 (`pointer: coarse`)
- 컴포넌트에서 조건부 렌더링에 활용

**새 파일:**
- `src/hooks/useIsMobile.js`

---

### Phase 2: 내비게이션 & 레이아웃 (핵심 UX)

#### 2-1. 사이드바 스와이프 제스처
- 화면 왼쪽 가장자리에서 오른쪽 스와이프 -> 사이드바 오픈
- 사이드바 위에서 왼쪽 스와이프 -> 사이드바 클로즈
- 오버레이 영역 탭 -> 사이드바 클로즈 (기존 유지)
- 제스처 감도 조절 (threshold: 50px, velocity 고려)

**대상 파일:**
- `src/App.jsx` (또는 새 훅)
- `src/components/Sidebar/Sidebar.jsx`
- `src/components/Sidebar/Sidebar.css`

**새 파일:**
- `src/hooks/useSwipeGesture.js`

#### 2-2. 모바일 하단 액션바
- 모바일(600px 이하)에서 뷰 전환 버튼을 하단 고정 바로 이동
- 에디터 | 컬럼뷰 | 마인드맵 탭 형태
- Safe Area 하단 패딩 적용
- 스크롤 시 자동 숨김/표시 (선택적)

**대상 파일:**
- `src/components/TipTapEditor/TipTapTestPage.jsx`
- `src/components/TipTapEditor/TipTapPage.css`

**새 파일 (선택):**
- `src/components/Navigation/MobileBottomBar.jsx`
- `src/components/Navigation/MobileBottomBar.css`

#### 2-3. 헤더 최적화
- 모바일에서 헤더 요소 재배치 (타이틀 + 햄버거만 표시)
- 나머지 액션은 하단바 또는 더보기(...) 메뉴로 이동
- 헤더 높이 축소 (모바일: 48px)

**대상 파일:**
- `src/components/Navigation/Header.jsx`
- `src/App.css`

---

### Phase 3: 에디터 터치 최적화 (핵심 기능)

#### 3-1. 모바일 에디터 툴바
- 플로팅 툴바 -> 모바일에서는 키보드 위 고정 툴바로 변경
- 기본 포맷팅 (Bold, Italic, H1~H3, 리스트, 코드) 빠른 접근
- 좌우 스크롤 가능한 가로 툴바
- 키보드 올라올 때 자동으로 표시

**대상 파일:**
- `src/components/TipTapEditor/TipTapEditor.jsx`
- `src/components/TipTapEditor/TipTapEditor.css`

**새 파일 (선택):**
- `src/components/TipTapEditor/components/MobileToolbar.jsx`
- `src/components/TipTapEditor/components/MobileToolbar.css`

#### 3-2. 모바일 키보드 대응
- `visualViewport` API로 키보드 높이 감지
- 키보드 올라올 때 에디터 영역 리사이즈
- 커서 위치가 키보드에 가려지지 않도록 자동 스크롤
- iOS Safari 키보드 바운스 방지

**대상 파일:**
- `src/components/TipTapEditor/TipTapEditor.jsx`
- `src/App.css`

**새 파일:**
- `src/hooks/useKeyboardHeight.js`

#### 3-3. 블록 드래그 & 드롭 터치 개선
- 롱프레스(500ms) -> 드래그 모드 진입
- 드래그 중 시각 피드백 (그림자, 스케일)
- 드롭 영역 하이라이트 확대 (터치 부정확성 보완)
- dnd-kit의 `TouchSensor` 활성화 및 `activationConstraint` 설정

**대상 파일:**
- `src/components/TipTapEditor/ColumnView.jsx`
- `src/components/Sidebar/components/PageTree.jsx`

#### 3-4. 컨텍스트 메뉴 모바일 UX 개선
- 롱프레스로 컨텍스트 메뉴 트리거 (기존 우클릭 대체)
- 바텀시트 형태 유지하되, 핸들바 추가 (드래그로 닫기)
- 메뉴 아이템 간격 확대 (오탭 방지)

**대상 파일:**
- `src/components/TipTapEditor/components/BlockContextMenu.jsx`
- `src/components/TipTapEditor/TipTapEditor.css`

---

### Phase 4: 뷰별 모바일 최적화

#### 4-1. 마인드맵 터치 인터랙션
- 핀치 줌 (확대/축소) 구현
- 2-finger 패닝 (기존 마우스 드래그 대체)
- 1-finger 노드 탭 -> 선택/편집
- 더블탭 -> 줌 리셋
- 노드 롱프레스 -> 편집 메뉴

**대상 파일:**
- `src/components/TipTapEditor/MindMapView.jsx`
- `src/components/TipTapEditor/MindMapView.css`

#### 4-2. 컬럼뷰 모바일 최적화
- 가로 스크롤 스냅 (CSS scroll-snap)
- 현재 컬럼 인디케이터 (도트)
- 컬럼 너비를 화면 너비에 맞춤 (모바일에서 1컬럼 = 1화면)

**대상 파일:**
- `src/components/TipTapEditor/ColumnView.jsx`
- `src/components/TipTapEditor/ColumnView.css`

#### 4-3. 토글 블록 터치 개선
- 토글 버튼 터치 영역 확대 (48px)
- 토글 영역 전체를 탭으로 열기/닫기 (제목 영역)
- 애니메이션 부드럽게 (GPU 가속)

**대상 파일:**
- `src/components/TipTapEditor/extensions/ToggleView.jsx`
- `src/components/TipTapEditor/TipTapEditor.css`

---

### Phase 5: 모달 & 오버레이 (세부 UX)

#### 5-1. 모달 전체 모바일 최적화
- 모바일에서 모달 -> 풀스크린 바텀시트로 변환
- 드래그 핸들 + 스와이프 다운으로 닫기
- 모달 내부 스크롤 독립 (body 스크롤 잠금)

**대상 파일:**
- `src/components/Project/ProjectModal.jsx` / `.css`
- `src/components/Share/ShareModal.jsx` / `.css`
- `src/components/Backup/BackupModal.jsx` / `.css`
- `src/components/Admin/AdminModal.jsx` / `.css`

#### 5-2. 토스트 위치 조정
- 모바일에서 토스트를 하단 중앙으로 이동 (하단바 위)
- Safe Area 고려

**대상 파일:**
- `src/components/Common/Toast.jsx` / 관련 CSS
- `src/components/Common/DeleteToast.jsx` / 관련 CSS

---

### Phase 6: 성능 & PWA (고도화)

#### 6-1. 모바일 성능 최적화
- 모바일에서 불필요한 hover 애니메이션 비활성화
- CSS `will-change` 최적화 (사이드바 트랜지션)
- 이미지 lazy loading
- 에디터 렌더링 최적화 (큰 문서에서 가상 스크롤 검토)

#### 6-2. PWA 기본 설정 (선택)
- `manifest.json` 추가
- 서비스 워커 기본 캐싱
- 홈 화면 추가 지원
- 스플래시 스크린

**새 파일:**
- `public/manifest.json`
- `public/sw.js`

---

## 4. 우선순위 매트릭스

| 순위 | 항목 | 영향도 | 난이도 | Phase |
|------|------|--------|--------|-------|
| 1 | Safe Area 대응 | 높음 | 낮음 | 1 |
| 2 | 터치 타겟 보완 | 높음 | 낮음 | 1 |
| 3 | 사이드바 스와이프 | 높음 | 중간 | 2 |
| 4 | 모바일 키보드 대응 | 높음 | 중간 | 3 |
| 5 | 모바일 에디터 툴바 | 높음 | 중간 | 3 |
| 6 | 헤더 최적화 | 중간 | 낮음 | 2 |
| 7 | 하단 액션바 | 중간 | 중간 | 2 |
| 8 | 마인드맵 터치 | 중간 | 높음 | 4 |
| 9 | 컬럼뷰 스크롤 스냅 | 중간 | 낮음 | 4 |
| 10 | 모달 바텀시트화 | 중간 | 중간 | 5 |
| 11 | 블록 드래그 터치 개선 | 중간 | 중간 | 3 |
| 12 | 컨텍스트 메뉴 개선 | 낮음 | 낮음 | 3 |
| 13 | 토스트 위치 조정 | 낮음 | 낮음 | 5 |
| 14 | 성능 최적화 | 중간 | 중간 | 6 |
| 15 | PWA | 낮음 | 높음 | 6 |

---

## 5. 파일 변경 영향 범위

### 신규 파일 (최대 7개)
```
src/hooks/useIsMobile.js          - 모바일 감지 훅
src/hooks/useSwipeGesture.js      - 스와이프 제스처 훅
src/hooks/useKeyboardHeight.js    - 키보드 높이 감지 훅
src/components/Navigation/MobileBottomBar.jsx   - 하단 액션바
src/components/Navigation/MobileBottomBar.css
src/components/TipTapEditor/components/MobileToolbar.jsx  - 모바일 툴바
src/components/TipTapEditor/components/MobileToolbar.css
```

### 수정 파일 (주요)
```
index.html                        - viewport-fit=cover
src/styles/variables.css          - 모바일 변수 추가
src/App.jsx                       - 스와이프, 하단바 통합
src/App.css                       - Safe Area, 레이아웃
src/components/Sidebar/Sidebar.jsx  - 스와이프 연동
src/components/Sidebar/Sidebar.css  - Safe Area, 터치
src/components/Navigation/Header.jsx - 모바일 간소화
src/components/TipTapEditor/TipTapTestPage.jsx - 하단바, 툴바
src/components/TipTapEditor/TipTapEditor.jsx   - 모바일 툴바
src/components/TipTapEditor/TipTapEditor.css   - 터치, 키보드
src/components/TipTapEditor/MindMapView.jsx    - 터치 이벤트
src/components/TipTapEditor/ColumnView.jsx     - 스크롤 스냅
src/components/TipTapEditor/ColumnView.css     - 스냅 CSS
각 모달 컴포넌트 (.jsx, .css)                    - 바텀시트화
```

---

## 6. 구현 시 주의사항

1. **데스크톱 회귀 방지** - 모든 모바일 변경은 미디어 쿼리 또는 `useIsMobile` 조건 내에서만 적용
2. **iOS Safari 특이사항** - 100vh 문제 (`dvh` 단위 사용), 바운스 스크롤, 키보드 push 등
3. **기존 z-index 체계 준수** - variables.css의 z-index 변수 활용, 임의 값 사용 금지
4. **CSS 변수 우선** - 하드코딩된 px 값 대신 변수 시스템 활용
5. **점진적 배포** - Phase 단위로 커밋, 각 Phase 완료 후 테스트

---

## 7. 실행 순서 요약

```
Phase 1 (기반)     -> Safe Area + 터치 타겟 + 모바일 감지 훅
Phase 2 (내비)     -> 스와이프 사이드바 + 하단바 + 헤더
Phase 3 (에디터)   -> 모바일 툴바 + 키보드 대응 + 드래그 + 컨텍스트 메뉴
Phase 4 (뷰)      -> 마인드맵 터치 + 컬럼뷰 스냅 + 토글 개선
Phase 5 (세부)     -> 모달 바텀시트 + 토스트
Phase 6 (고도화)   -> 성능 + PWA
```
