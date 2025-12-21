# useTodos Hook Decomposition 설계서

> 📅 작성일: 2025-12-17
> 📝 Phase 11.2: useTodos 분해 상세 설계
> 🎯 목적: 7개 새 훅의 인터페이스 및 구조 설계

---

## 📋 목차
- [전체 아키텍처](#전체-아키텍처)
- [공유 State 관리 전략](#공유-state-관리-전략)
- [각 훅 상세 설계](#각-훅-상세-설계)
- [순환 종속성 해결](#순환-종속성-해결)
- [데이터 흐름](#데이터-흐름)
- [구현 순서](#구현-순서)

---

## 🏗️ 전체 아키텍처

### Before (현재)
```
App.jsx
  └─> useTodos(session, supabase, selectedDate, todos, setTodos, routines, setRoutines)
        └─> 모든 투두 관련 로직 포함 (1,160줄)
```

### After (목표)
```
App.jsx
  ├─> useTodoCRUD(...)           # 기본 CRUD
  ├─> useTodoCarryOver(...)      # 이월 로직
  ├─> useTodoHistory(...)        # 히스토리
  ├─> useTodoSubTasks(...)       # 서브투두
  ├─> useTodoRoutineSetup(...)   # 루틴 연동
  ├─> useTodoTrash(...)          # 휴지통
  └─> useTodoDragDrop(...)       # 드래그앤드롭
```

---

## 🔗 공유 State 관리 전략

### 중앙 관리 State (App.jsx)
다음 state들은 **App.jsx에서 관리**하고 각 훅에 props로 전달:

1. **todos** / **setTodos** - 투두 목록 (모든 훅에서 사용)
2. **session** - 사용자 세션 (모든 훅에서 사용)
3. **supabase** - Supabase 클라이언트 (모든 훅에서 사용)
4. **selectedDate** - 선택된 날짜 (CRUD, CarryOver, DragDrop에서 사용)
5. **routines** / **setRoutines** - 루틴 목록 (CRUD, RoutineSetup에서 사용)

### 공유 UI State (App.jsx)
여러 훅에서 공유하는 UI state:

1. **selectedTodoForModal** / **setSelectedTodoForModal**
   - History와 RoutineSetup 모달에서 공유
   - App.jsx에서 관리

2. **focusedTodoId** / **setFocusedTodoId**
   - CRUD와 다른 컴포넌트에서 공유
   - App.jsx에서 관리

### 독립 State (각 훅 내부)
각 훅이 독자적으로 관리하는 state:
- 입력 필드 값 (inputValue 등)
- 모달 표시 여부 (showModal 등)
- 로딩 상태 (loading 등)

---

## 📦 각 훅 상세 설계

### 1. useTodoCRUD

**책임**: 투두의 기본 CRUD 작업 및 루틴 투두 생성

#### 입력 (Parameters)
```javascript
useTodoCRUD({
  session,           // 사용자 세션
  supabase,          // Supabase 클라이언트
  selectedDate,      // 선택된 날짜
  todos,             // 투두 목록 (from App.jsx)
  setTodos,          // 투두 상태 업데이트 함수
  routines,          // 루틴 목록 (from App.jsx)
  setRoutines,       // 루틴 상태 업데이트 함수
  focusedTodoId,     // 포커스된 투두 ID (from App.jsx)
  setFocusedTodoId,  // 포커스 업데이트 함수
})
```

#### 출력 (Return)
```javascript
{
  // State
  inputValue,
  setInputValue,
  routineInputValue,
  setRoutineInputValue,
  normalInputValue,
  setNormalInputValue,
  loading,
  isAdding,

  // Functions
  fetchTodos,                    // 투두 목록 조회
  handleAddTodo,                 // 투두 추가 (통합)
  handleAddRoutineTodo,          // 루틴 투두 추가
  handleAddNormalTodo,           // 일반 투두 추가
  handleToggleTodo,              // 완료/미완료 토글
  handleEditTodo,                // 투두 텍스트 수정
  handleRemoveTodoFromUI,        // UI에서 제거
  createRoutineTodosForDate,     // 특정 날짜 루틴 생성
}
```

#### 내부 State
```javascript
const [inputValue, setInputValue] = useState('')
const [routineInputValue, setRoutineInputValue] = useState('')
const [normalInputValue, setNormalInputValue] = useState('')
const [loading, setLoading] = useState(true)
const [isAdding, setIsAdding] = useState(false)
const routineCreationInProgress = useRef(new Set())
```

#### 주요 함수 로직
- **fetchTodos()**: selectedDate 기준으로 투두 조회 + 루틴 투두 자동 생성
- **handleAddTodo()**: inputValue 기반으로 루틴/일반 투두 구분 후 추가
- **createRoutineTodosForDate()**: 특정 날짜의 루틴을 기반으로 투두 자동 생성

---

### 2. useTodoCarryOver

**책임**: 미완료 투두의 자동/수동 이월 처리

#### 입력 (Parameters)
```javascript
useTodoCarryOver({
  session,        // 사용자 세션
  supabase,       // Supabase 클라이언트
  selectedDate,   // 선택된 날짜
})
```

#### 출력 (Return)
```javascript
{
  // Ref
  carryOverInProgress,           // 이월 진행 중 플래그

  // Functions
  carryOverIncompleteTodos,      // 자동 이월 (오늘 날짜)
  movePastIncompleteTodosToToday, // 과거 투두를 오늘로 이월
}
```

#### 내부 State
```javascript
const carryOverInProgress = useRef(false)
```

#### 주요 함수 로직
- **carryOverIncompleteTodos(todayStr)**: 오늘 이전의 미완료 투두를 오늘로 이월
  - visible_dates에 오늘 추가
  - 중복 실행 방지 (useRef 사용)
- **movePastIncompleteTodosToToday()**: 과거 미완료 투두를 오늘로 복사 생성

---

### 3. useTodoHistory

**책임**: 투두 히스토리 조회 및 모달 관리

#### 입력 (Parameters)
```javascript
useTodoHistory({
  session,                    // 사용자 세션
  supabase,                   // Supabase 클라이언트
  selectedTodoForModal,       // 선택된 투두 (from App.jsx)
  setSelectedTodoForModal,    // 선택된 투두 업데이트
})
```

#### 출력 (Return)
```javascript
{
  // State
  showTodoHistoryModal,
  todoHistory,
  expandedHistoryIds,

  // Functions
  handleOpenTodoHistoryModal,    // 모달 열기 + 히스토리 조회
  handleCloseTodoHistoryModal,   // 모달 닫기
  toggleHistoryDetail,           // 히스토리 상세 토글
}
```

#### 내부 State
```javascript
const [showTodoHistoryModal, setShowTodoHistoryModal] = useState(false)
const [todoHistory, setTodoHistory] = useState({})
const [expandedHistoryIds, setExpandedHistoryIds] = useState([])
```

#### 주요 함수 로직
- **handleOpenTodoHistoryModal(todo)**:
  - selectedTodoForModal 업데이트
  - Supabase에서 히스토리 조회
  - 모달 표시

---

### 4. useTodoSubTasks

**책임**: 서브투두 추가 및 관리

#### 입력 (Parameters)
```javascript
useTodoSubTasks({
  session,        // 사용자 세션
  supabase,       // Supabase 클라이언트
  todos,          // 투두 목록
  setTodos,       // 투두 상태 업데이트
})
```

#### 출력 (Return)
```javascript
{
  // Functions
  handleAddSubTodo,              // 서브투두 추가
}
```

#### 내부 State
```javascript
const recentlyEditedIds = useRef(new Set())
```

#### 주요 함수 로직
- **handleAddSubTodo(parentId, subTodoText)**:
  - parent_id를 가진 새 투두 생성
  - UI 즉시 업데이트

---

### 5. useTodoRoutineSetup

**책임**: 투두와 루틴 연결 설정 모달 관리

#### 입력 (Parameters)
```javascript
useTodoRoutineSetup({
  selectedTodoForModal,       // 선택된 투두 (from App.jsx)
  setSelectedTodoForModal,    // 선택된 투두 업데이트
  routines,                   // 루틴 목록
})
```

#### 출력 (Return)
```javascript
{
  // State
  showTodoRoutineSetupModal,
  routineDaysForModal,
  setRoutineDaysForModal,
  isEditingRoutineInModal,
  setIsEditingRoutineInModal,
  routineTimeSlotForModal,
  setRoutineTimeSlotForModal,

  // Functions
  handleOpenTodoRoutineSetupModal,   // 모달 열기
  handleCloseTodoRoutineSetupModal,  // 모달 닫기
}
```

#### 내부 State
```javascript
const [showTodoRoutineSetupModal, setShowTodoRoutineSetupModal] = useState(false)
const [routineDaysForModal, setRoutineDaysForModal] = useState([])
const [isEditingRoutineInModal, setIsEditingRoutineInModal] = useState(false)
const [routineTimeSlotForModal, setRoutineTimeSlotForModal] = useState('')
```

#### 주요 함수 로직
- **handleOpenTodoRoutineSetupModal(todo)**:
  - selectedTodoForModal 업데이트
  - 해당 투두의 루틴 정보 로드
  - 모달 표시

---

### 6. useTodoTrash

**책임**: 투두 삭제, 복구, 휴지통 관리

#### 입력 (Parameters)
```javascript
useTodoTrash({
  session,        // 사용자 세션
  supabase,       // Supabase 클라이언트
  selectedDate,   // 선택된 날짜
  todos,          // 투두 목록
  setTodos,       // 투두 상태 업데이트
})
```

#### 출력 (Return)
```javascript
{
  // State
  deletedTodo,
  showUndoToast,
  showSuccessToast,
  successToastMessage,
  lastDeleteAction,
  showTrashModal,
  trashedItems,
  showDeleteConfirmModal,
  todoToDelete,
  setTodoToDelete,

  // Functions
  handleDeleteTodo,              // 삭제 진입점
  executeSimpleDelete,           // 단순 삭제
  hideOnThisDateOnly,            // 이 날짜에만 숨김
  deleteCompletely,              // 완전 삭제
  handleUndoDelete,              // 삭제 취소
  handleRestoreFromTrash,        // 휴지통에서 복구
  handlePermanentDelete,         // 영구 삭제
  handleEmptyTrash,              // 휴지통 비우기
  fetchTrash,                    // 휴지통 조회
  handleOpenTrash,               // 휴지통 모달 열기
  handleCloseTrash,              // 휴지통 모달 닫기
}
```

#### 내부 State
```javascript
const [deletedTodo, setDeletedTodo] = useState(null)
const [showUndoToast, setShowUndoToast] = useState(false)
const [showSuccessToast, setShowSuccessToast] = useState(false)
const [successToastMessage, setSuccessToastMessage] = useState('')
const [lastDeleteAction, setLastDeleteAction] = useState(null)
const [showTrashModal, setShowTrashModal] = useState(false)
const [trashedItems, setTrashedItems] = useState([])
const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
const [todoToDelete, setTodoToDelete] = useState(null)
```

#### 주요 함수 로직
- **handleDeleteTodo(id)**:
  - 삭제 타입 결정 (단순/날짜별/완전)
  - 해당 삭제 함수 호출
- **executeSimpleDelete(id)**: deleted=true 설정
- **hideOnThisDateOnly(todo)**: hidden_dates에 날짜 추가
- **deleteCompletely(todo)**: DB에서 완전 삭제

---

### 7. useTodoDragDrop

**책임**: 투두 드래그앤드롭 순서 변경

#### 입력 (Parameters)
```javascript
useTodoDragDrop({
  session,        // 사용자 세션
  supabase,       // Supabase 클라이언트
  selectedDate,   // 선택된 날짜
  todos,          // 투두 목록
  setTodos,       // 투두 상태 업데이트
})
```

#### 출력 (Return)
```javascript
{
  // State
  isDraggingAny,

  // Functions
  handleDragStart,               // 드래그 시작
  handleDragCancel,              // 드래그 취소
  handleDragEnd,                 // 드래그 종료 + 순서 저장
}
```

#### 내부 State
```javascript
const [isDraggingAny, setIsDraggingAny] = useState(false)
```

#### 주요 함수 로직
- **handleDragEnd(event, arrayMove)**:
  - arrayMove로 todos 재정렬
  - order_index 업데이트
  - Supabase에 저장

---

## 🔄 순환 종속성 해결

### 문제점
- 각 훅이 `todos`와 `setTodos`를 공유
- 여러 훅이 동시에 `setTodos`를 호출할 수 있음

### 해결 방안

#### 1. 중앙 집중식 State 관리 (선택된 방안)
```javascript
// App.jsx
const [todos, setTodos] = useState([])

// 각 훅에 todos, setTodos 전달
const crud = useTodoCRUD({ ..., todos, setTodos })
const trash = useTodoTrash({ ..., todos, setTodos })
const drag = useTodoDragDrop({ ..., todos, setTodos })
```

**장점**:
- 단순하고 명확함
- 추가 라이브러리 불필요
- 현재 구조와 유사

**단점**:
- props drilling (하지만 1단계만)
- 여러 훅에서 setTodos 호출 시 경쟁 조건 가능

#### 2. 경쟁 조건 방지 전략
각 훅은 **functional update** 사용:
```javascript
// ❌ 잘못된 방법
setTodos([...todos, newTodo])

// ✅ 올바른 방법
setTodos(prev => [...prev, newTodo])
```

---

## 📊 데이터 흐름

### 투두 생성 흐름
```
User Input → useTodoCRUD.handleAddTodo()
  → Supabase INSERT
  → setTodos(prev => [...prev, newTodo])
  → UI 업데이트
```

### 투두 삭제 흐름
```
User Click → useTodoTrash.handleDeleteTodo()
  → 삭제 타입 결정
  → Supabase UPDATE/DELETE
  → setTodos(prev => prev.filter(...))
  → UI 업데이트
  → Toast 표시
```

### 투두 이월 흐름
```
Page Load → useTodoCarryOver.carryOverIncompleteTodos()
  → Supabase 조회 (미완료 투두)
  → visible_dates 업데이트
  → Supabase UPDATE
  → (fetchTodos 재호출하여 UI 업데이트)
```

### 드래그앤드롭 흐름
```
User Drag → useTodoDragDrop.handleDragEnd()
  → arrayMove로 todos 재정렬
  → setTodos(reorderedTodos)
  → order_index 계산
  → Supabase UPDATE (batch)
  → UI 업데이트
```

---

## 🎯 구현 순서 (권장)

### Step 1: 독립적인 훅부터 (11.3-11.5)
1. **useTodoHistory** (가장 독립적, todos 읽기만)
2. **useTodoRoutineSetup** (독립적, 모달만 관리)
3. **useTodoCarryOver** (독립적, 이월 로직만)

### Step 2: 핵심 훅 (11.6-11.7)
4. **useTodoCRUD** (가장 복잡, 모든 것의 기반)
5. **useTodoSubTasks** (CRUD에 의존)

### Step 3: UI 관련 훅 (11.8)
6. **useTodoDragDrop** (CRUD 이후)
7. **useTodoTrash** (가장 복잡, 삭제 로직)

### Step 4: 통합 및 테스트 (11.9-11.11)
- App.jsx에 모든 훅 적용
- 기존 useTodos.js 제거
- 전체 기능 테스트
- 버그 수정

---

## ⚠️ 구현 시 주의사항

### 1. State 업데이트 타이밍
- 모든 setTodos는 **functional update** 사용
- 여러 훅에서 동시에 업데이트 시 race condition 주의

### 2. Supabase 에러 처리
- 모든 async 함수는 try-catch 필수
- 에러 발생 시 사용자에게 Toast 표시

### 3. 중복 실행 방지
- useRef로 진행 중 플래그 관리
- carryOverInProgress, routineCreationInProgress

### 4. 메모리 누수 방지
- 모달 닫을 때 state 초기화
- useEffect cleanup 함수 사용

### 5. 타입 안정성
- props 검증 (PropTypes 또는 TypeScript)
- undefined/null 체크

---

## 📝 App.jsx 통합 예시

```javascript
// App.jsx (예상 코드)
import { useTodoCRUD } from './hooks/useTodoCRUD'
import { useTodoCarryOver } from './hooks/useTodoCarryOver'
import { useTodoHistory } from './hooks/useTodoHistory'
import { useTodoSubTasks } from './hooks/useTodoSubTasks'
import { useTodoRoutineSetup } from './hooks/useTodoRoutineSetup'
import { useTodoTrash } from './hooks/useTodoTrash'
import { useTodoDragDrop } from './hooks/useTodoDragDrop'

function App() {
  // 중앙 관리 State
  const [todos, setTodos] = useState([])
  const [routines, setRoutines] = useState([])
  const [selectedTodoForModal, setSelectedTodoForModal] = useState(null)
  const [focusedTodoId, setFocusedTodoId] = useState(null)

  // 각 훅 사용
  const crud = useTodoCRUD({
    session, supabase, selectedDate,
    todos, setTodos, routines, setRoutines,
    focusedTodoId, setFocusedTodoId
  })

  const carryOver = useTodoCarryOver({
    session, supabase, selectedDate
  })

  const history = useTodoHistory({
    session, supabase,
    selectedTodoForModal, setSelectedTodoForModal
  })

  const subTasks = useTodoSubTasks({
    session, supabase, todos, setTodos
  })

  const routineSetup = useTodoRoutineSetup({
    selectedTodoForModal, setSelectedTodoForModal, routines
  })

  const trash = useTodoTrash({
    session, supabase, selectedDate, todos, setTodos
  })

  const drag = useTodoDragDrop({
    session, supabase, selectedDate, todos, setTodos
  })

  // 나머지 로직...
}
```

---

## ✅ 다음 단계 (Phase 11.3)

1. useTodoHistory.js 생성 및 구현 (가장 독립적)
2. App.jsx에 통합 및 테스트
3. 문제 발견 시 설계 수정

---

**📅 작성일**: 2025-12-17
**👤 작성자**: Claude Code
**🔗 관련 문서**: USETODOS-ANALYSIS.md, COMPONENT-REFACTOR.md
