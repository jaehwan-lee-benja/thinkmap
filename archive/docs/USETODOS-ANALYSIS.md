# useTodos.js 분석 보고서

> 📅 작성일: 2025-12-17
> 📝 Phase 11.1: useTodos.js 전체 구조 분석
> 🎯 목적: Hook Decomposition을 위한 사전 분석

---

## 📊 전체 개요

**파일 정보**:
- 파일명: `src/hooks/useTodos.js`
- 총 줄 수: **1,160줄**
- 파일 크기: **~36KB**
- 복잡도: **매우 높음** 🔴

**문제점**:
- 단일 훅이 너무 많은 책임을 가짐 (SRP 위반)
- 1,000줄이 넘는 거대한 파일 (권장: 200줄 이하)
- 유지보수 및 테스트 어려움

---

## 📦 State 목록 (총 27개)

### useState (24개)

#### 입력 관련 (3개)
1. `inputValue` - 통합 투두 입력 필드 값
2. `routineInputValue` - 루틴 투두 입력 필드 값
3. `normalInputValue` - 일반 투두 입력 필드 값

#### 로딩 및 상태 플래그 (3개)
4. `loading` - 데이터 로딩 상태
5. `isDraggingAny` - 드래그 중 여부
6. `isAdding` - 투두 추가 중 여부

#### 삭제 및 휴지통 관련 (4개)
7. `deletedTodo` - 최근 삭제된 투두
8. `showUndoToast` - Undo 토스트 표시 여부
9. `showTrashModal` - 휴지통 모달 표시 여부
10. `trashedItems` - 휴지통 아이템 목록

#### 토스트 메시지 (3개)
11. `showSuccessToast` - 성공 토스트 표시 여부
12. `successToastMessage` - 성공 토스트 메시지 내용
13. `lastDeleteAction` - 마지막 삭제 작업 정보

#### 포커스 및 선택 (2개)
14. `focusedTodoId` - 현재 포커스된 투두 ID
15. `selectedTodoForModal` - 모달에서 선택된 투두

#### 히스토리 관련 (3개)
16. `showTodoHistoryModal` - 히스토리 모달 표시 여부
17. `todoHistory` - 투두 히스토리 데이터
18. `expandedHistoryIds` - 확장된 히스토리 ID 목록

#### 루틴 모달 관련 (4개)
19. `showTodoRoutineSetupModal` - 루틴 설정 모달 표시 여부
20. `routineDaysForModal` - 모달용 루틴 요일 설정
21. `isEditingRoutineInModal` - 모달에서 루틴 편집 중 여부
22. `routineTimeSlotForModal` - 모달용 루틴 시간대

#### 삭제 확인 (2개)
23. `showDeleteConfirmModal` - 삭제 확인 모달 표시 여부
24. `todoToDelete` - 삭제할 투두 객체

### useRef (3개)

25. `carryOverInProgress` - 이월 작업 진행 중 플래그 (중복 실행 방지)
26. `routineCreationInProgress` - 루틴 생성 진행 중 플래그 (Set)
27. `recentlyEditedIds` - 최근 편집된 ID 목록 (Set)

---

## 🔧 함수 목록 (총 30개)

### 1. 유틸리티 함수 (1개)
- `getDayKey(dayNumber)` - 숫자 요일을 문자열 키로 변환

### 2. 이월 로직 (2개)
- `carryOverIncompleteTodos(todayStr)` - 미완료 투두 자동 이월 (핵심)
- `movePastIncompleteTodosToToday()` - 과거 미완료 투두를 오늘로 이월

### 3. 루틴 생성 (1개)
- `createRoutineTodosForDate(dateStr)` - 특정 날짜의 루틴 작업 자동 생성

### 4. 데이터 조회 (Fetch) (2개)
- `fetchTodos()` - 투두 목록 조회
- `fetchTrash()` - 휴지통 목록 조회

### 5. 투두 추가 (Create) (3개)
- `handleAddTodo()` - 통합 투두 추가
- `handleAddRoutineTodo()` - 루틴 투두 추가
- `handleAddNormalTodo()` - 일반 투두 추가

### 6. 투두 수정 (Update) (2개)
- `handleToggleTodo(id)` - 투두 완료/미완료 토글
- `handleEditTodo(id, newText)` - 투두 텍스트 수정

### 7. 투두 삭제 (Delete) (7개)
- `handleDeleteTodo(id)` - 투두 삭제 (진입점)
- `executeSimpleDelete(id)` - 단순 삭제 실행
- `hideOnThisDateOnly(todo)` - 이 날짜에만 숨김
- `deleteCompletely(todo)` - 완전 삭제
- `handleUndoDelete()` - 삭제 취소 (Undo)
- `handlePermanentDelete(id)` - 영구 삭제
- `handleEmptyTrash()` - 휴지통 비우기

### 8. 휴지통 관리 (3개)
- `handleRestoreFromTrash(id)` - 휴지통에서 복구
- `handleOpenTrash()` - 휴지통 모달 열기
- `handleCloseTrash()` - 휴지통 모달 닫기

### 9. 서브투두 (1개)
- `handleAddSubTodo(parentId, subTodoText)` - 서브투두 추가

### 10. 드래그 앤 드롭 (3개)
- `handleDragStart()` - 드래그 시작
- `handleDragCancel()` - 드래그 취소
- `handleDragEnd(event, arrayMove)` - 드래그 종료 및 순서 저장

### 11. UI 관리 (1개)
- `handleRemoveTodoFromUI(id)` - UI에서 투두 제거

### 12. 히스토리 모달 (3개)
- `handleOpenTodoHistoryModal(todo)` - 히스토리 모달 열기
- `handleCloseTodoHistoryModal()` - 히스토리 모달 닫기
- `toggleHistoryDetail(historyId)` - 히스토리 상세 토글

### 13. 루틴 설정 모달 (2개)
- `handleOpenTodoRoutineSetupModal(todo)` - 루틴 설정 모달 열기
- `handleCloseTodoRoutineSetupModal()` - 루틴 설정 모달 닫기

---

## 🔗 의존성 분석

### 외부 의존성
- **Supabase**: 모든 CRUD 작업에서 사용
- **Session**: 사용자 인증 확인
- **selectedDate**: 날짜별 투두 필터링
- **todos, setTodos**: App.jsx에서 전달받는 상태 (중앙 관리)
- **routines, setRoutines**: 루틴 데이터 (루틴 관련 작업에서 사용)

### 내부 함수 간 의존성

**높은 의존성 (서로 호출)**:
```
handleDeleteTodo
  ├─> executeSimpleDelete
  ├─> hideOnThisDateOnly
  └─> deleteCompletely

handleAddTodo
  ├─> handleAddRoutineTodo
  └─> handleAddNormalTodo

carryOverIncompleteTodos
  └─> (todos 상태 직접 업데이트)

createRoutineTodosForDate
  └─> (루틴 데이터 기반으로 투두 생성)
```

**독립적 함수** (다른 함수를 호출하지 않음):
- UI 모달 open/close 함수들
- 드래그 관련 함수들
- fetchTodos, fetchTrash

---

## 📋 분해 전략 (6개 새 훅 제안)

### 1. `useTodoCRUD.js` (기본 CRUD 작업)
**책임**: 투두 생성, 조회, 수정, 삭제의 기본 작업
**State** (9개):
- `inputValue`, `setInputValue`
- `routineInputValue`, `setRoutineInputValue`
- `normalInputValue`, `setNormalInputValue`
- `loading`
- `isAdding`
- `focusedTodoId`, `setFocusedTodoId`

**Functions** (9개):
- `fetchTodos()`
- `handleAddTodo()`
- `handleAddRoutineTodo()`
- `handleAddNormalTodo()`
- `handleToggleTodo(id)`
- `handleEditTodo(id, newText)`
- `handleRemoveTodoFromUI(id)`
- `getDayKey(dayNumber)` (유틸)
- `createRoutineTodosForDate(dateStr)`

**예상 크기**: ~350줄

---

### 2. `useTodoCarryOver.js` (이월 로직)
**책임**: 미완료 투두의 자동/수동 이월 처리

**State** (1개):
- `carryOverInProgress` (useRef)

**Functions** (2개):
- `carryOverIncompleteTodos(todayStr)`
- `movePastIncompleteTodosToToday()`

**예상 크기**: ~200줄

---

### 3. `useTodoHistory.js` (히스토리 관리)
**책임**: 투두 히스토리 조회, 표시, 확장/축소

**State** (4개):
- `showTodoHistoryModal`
- `todoHistory`
- `expandedHistoryIds`
- `selectedTodoForModal`

**Functions** (3개):
- `handleOpenTodoHistoryModal(todo)`
- `handleCloseTodoHistoryModal()`
- `toggleHistoryDetail(historyId)`

**예상 크기**: ~100줄

---

### 4. `useTodoSubTasks.js` (서브투두 관리)
**책임**: 서브투두 추가, 수정, 삭제

**State** (1개):
- `recentlyEditedIds` (useRef)

**Functions** (1개):
- `handleAddSubTodo(parentId, subTodoText)`

**예상 크기**: ~80줄

---

### 5. `useTodoRoutineSetup.js` (루틴 연동)
**책임**: 투두와 루틴 연결 설정

**State** (5개):
- `showTodoRoutineSetupModal`
- `routineDaysForModal`, `setRoutineDaysForModal`
- `isEditingRoutineInModal`, `setIsEditingRoutineInModal`
- `routineTimeSlotForModal`, `setRoutineTimeSlotForModal`

**Functions** (2개):
- `handleOpenTodoRoutineSetupModal(todo)`
- `handleCloseTodoRoutineSetupModal()`

**예상 크기**: ~120줄

---

### 6. `useTodoTrash.js` (휴지통 관리)
**책임**: 삭제, 복구, 휴지통 관리

**State** (8개):
- `deletedTodo`
- `showUndoToast`
- `showSuccessToast`
- `successToastMessage`
- `lastDeleteAction`
- `showTrashModal`
- `trashedItems`
- `showDeleteConfirmModal`
- `todoToDelete`, `setTodoToDelete`

**Functions** (10개):
- `handleDeleteTodo(id)`
- `executeSimpleDelete(id)`
- `hideOnThisDateOnly(todo)`
- `deleteCompletely(todo)`
- `handleUndoDelete()`
- `handleRestoreFromTrash(id)`
- `handlePermanentDelete(id)`
- `handleEmptyTrash()`
- `handleOpenTrash()`
- `handleCloseTrash()`
- `fetchTrash()`

**예상 크기**: ~300줄

---

### 7. `useTodoDragDrop.js` (드래그 앤 드롭)
**책임**: 투두 순서 변경 (드래그 앤 드롭)

**State** (1개):
- `isDraggingAny`

**Functions** (3개):
- `handleDragStart()`
- `handleDragCancel()`
- `handleDragEnd(event, arrayMove)`

**예상 크기**: ~80줄

---

## 📊 분해 후 예상 결과

### 파일 크기 변화
```
useTodos.js (1,160줄, 36KB)
→ 제거

새 훅 파일 (7개):
1. useTodoCRUD.js          ~350줄 (~11KB)
2. useTodoCarryOver.js     ~200줄 (~6KB)
3. useTodoHistory.js       ~100줄 (~3KB)
4. useTodoSubTasks.js       ~80줄 (~2.5KB)
5. useTodoRoutineSetup.js  ~120줄 (~4KB)
6. useTodoTrash.js         ~300줄 (~9KB)
7. useTodoDragDrop.js       ~80줄 (~2.5KB)

총 예상: ~1,230줄 (~38KB)
```

### App.jsx 변화 예상
```
현재: 1,833줄
- useTodos import 제거
+ 7개 새 훅 import 추가
+ 상태 및 함수 재구성

예상: ~800-900줄 (약 50% 감소)
```

---

## ⚠️ 주의사항

### 순환 종속성 방지
- `todos`, `setTodos`는 여전히 App.jsx에서 관리
- 각 훅은 필요한 state만 props로 받음
- 훅 간 직접 호출 최소화

### 공유 State
- `selectedTodoForModal`: History와 RoutineSetup에서 공유
  → App.jsx에서 관리하거나, Context 사용 고려

### Refs 관리
- `carryOverInProgress`: CarryOver 훅으로 이동
- `routineCreationInProgress`: CRUD 훅으로 이동
- `recentlyEditedIds`: SubTasks 훅으로 이동

---

## ✅ 다음 단계 (Phase 11.2)

1. 분해 설계서 검토 및 승인
2. 각 훅의 인터페이스 상세 설계
3. 순환 종속성 해결 방안 수립
4. 공유 state 관리 전략 결정 (Context vs Props)

---

**📅 작성일**: 2025-12-17
**👤 작성자**: Claude Code
**🔗 관련 문서**: COMPONENT-REFACTOR.md
