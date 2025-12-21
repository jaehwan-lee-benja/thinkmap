# 데이터 구조 리팩토링 계획

## 📋 개요
**날짜**: 2025-11-22
**목적**: 이월 시스템을 복사 기반에서 JSON 기반으로 전환하여 데이터 중복 제거 및 로직 단순화

## 🔄 현재 방식 vs 제안 방식

### 현재 방식 (복사 기반)
```javascript
// 21일 미완료 투두가 22일, 23일로 이월될 때
21일: { id: 1, text: "운동하기", date: "2025-11-21", original_todo_id: null }
22일: { id: 2, text: "운동하기", date: "2025-11-22", original_todo_id: 1 } // 새 레코드
23일: { id: 3, text: "운동하기", date: "2025-11-23", original_todo_id: 1 } // 또 새 레코드
```

**문제점:**
- ❌ 날짜마다 별도 레코드 생성 → 데이터 중복
- ❌ 완료 상태 변경 시 모든 관련 레코드 업데이트 필요
- ❌ 삭제 로직 복잡 (4가지 옵션 필요)
- ❌ original_todo_id 추적 복잡

### 제안 방식 (JSON 기반)
```javascript
// 하나의 레코드로 모든 날짜 관리
{
  id: 1,
  text: "운동하기",
  created_date: "2025-11-21",
  completed: false,
  visible_dates: ["2025-11-21", "2025-11-22", "2025-11-23"], // JSON 배열
  hidden_dates: [], // 특정 날짜에서만 숨긴 경우
  deleted: false,
  deleted_date: null
}
```

**장점:**
- ✅ 레코드 1개로 관리 → 데이터 중복 없음
- ✅ 완료 상태 변경 단순 (1개만 업데이트)
- ✅ 삭제 로직 단순화 (배열 조작만)
- ✅ 이월 추적 명확

## 📊 스키마 변경

### 기존 스키마
```sql
CREATE TABLE todos (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  order_index INTEGER,
  original_todo_id BIGINT REFERENCES todos(id),
  parent_id BIGINT REFERENCES todos(id),
  routine_id BIGINT REFERENCES routines(id),
  deleted BOOLEAN DEFAULT false,
  deleted_date DATE,
  completed_at TIMESTAMP
);
```

### 새 스키마
```sql
ALTER TABLE todos
  ADD COLUMN visible_dates JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN hidden_dates JSONB DEFAULT '[]'::jsonb;

-- original_todo_id는 더 이상 필요 없지만 마이그레이션 후 삭제
```

## 🔧 수정 필요 항목

### 1. 이월 로직 (`moveIncompleteTodosToNextDay`)
**현재**: 새 레코드 복사 생성
```javascript
const todosToInsert = todosNeedCarryOver.map((todo, index) => ({
  text: todo.text,
  completed: false,
  date: toDateStr,
  original_todo_id: originalId
}))
await supabase.from('todos').insert(todosToInsert)
```

**변경 후**: visible_dates 배열에 날짜 추가
```javascript
for (const todo of incompleteTodos) {
  const currentDates = todo.visible_dates || [todo.date]
  if (!currentDates.includes(toDateStr)) {
    await supabase
      .from('todos')
      .update({
        visible_dates: [...currentDates, toDateStr]
      })
      .eq('id', todo.id)
  }
}
```

### 2. 조회 로직 (`fetchTodos`)
**현재**: date로 필터링
```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .eq('date', dateStr)
  .eq('deleted', false)
```

**변경 후**: visible_dates에서 포함 여부 확인
```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .contains('visible_dates', [dateStr]) // JSONB contains
  .not('hidden_dates', 'cs', [dateStr]) // 숨김 날짜 제외
  .eq('deleted', false)
```

### 3. 완료/미완료 토글 (`handleToggleTodo`)
**현재**: 원본 + 모든 이월 레코드 업데이트
```javascript
// 현재 투두 업데이트
await supabase.from('todos').update({ completed: newCompleted }).eq('id', id)

// 원본 투두 완료
await supabase.from('todos').update({ completed: true }).eq('id', originalId)

// 모든 이월 투두들 완료
await supabase.from('todos').update({ completed: true }).eq('original_todo_id', originalId)
```

**변경 후**: 1개만 업데이트
```javascript
await supabase
  .from('todos')
  .update({
    completed: newCompleted,
    completed_at: completedAt
  })
  .eq('id', id)
```

### 4. 삭제 로직 단순화
**현재**: 4가지 복잡한 옵션
- 옵션 1: 현재 + 원본 삭제
- 옵션 2: 현재만 삭제
- 옵션 3: 원본 + 과거 이월 삭제 + 새 원본 생성
- 옵션 4: 원본 + 모든 이월 삭제

**변경 후**: 2가지 단순 옵션
- 옵션 1: 이 날짜에서만 숨김 → `hidden_dates`에 날짜 추가
- 옵션 2: 완전 삭제 → `deleted = true`

```javascript
// 옵션 1: 이 날짜에서만 숨김
const deleteOnlyThisDate = async (todo, dateStr) => {
  const hiddenDates = todo.hidden_dates || []
  await supabase
    .from('todos')
    .update({ hidden_dates: [...hiddenDates, dateStr] })
    .eq('id', todo.id)
}

// 옵션 2: 완전 삭제
const deleteCompletely = async (todo) => {
  await supabase
    .from('todos')
    .update({ deleted: true, deleted_date: formatDateForDB(new Date()) })
    .eq('id', todo.id)
}
```

## 📦 데이터 마이그레이션

### 마이그레이션 스크립트
```sql
-- 1. 새 컬럼 추가
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS visible_dates JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hidden_dates JSONB DEFAULT '[]'::jsonb;

-- 2. 기존 데이터를 새 구조로 변환
-- 원본 투두들 (original_todo_id가 null인 것들)
UPDATE todos
SET visible_dates = (
  SELECT jsonb_agg(DISTINCT t.date ORDER BY t.date)
  FROM todos t
  WHERE t.original_todo_id = todos.id OR t.id = todos.id
)
WHERE original_todo_id IS NULL;

-- 3. 이월된 투두들 삭제 (원본만 남김)
DELETE FROM todos WHERE original_todo_id IS NOT NULL;

-- 4. date 컬럼을 created_date로 의미 변경
ALTER TABLE todos RENAME COLUMN date TO created_date;
```

## ⚠️ 주의사항

1. **백업 필수**: 마이그레이션 전 데이터베이스 전체 백업
2. **단계적 적용**:
   - 먼저 새 컬럼 추가
   - 마이그레이션 스크립트 실행
   - 애플리케이션 코드 배포
   - 구 컬럼 삭제
3. **롤백 계획**: 문제 발생 시 되돌릴 수 있는 방법 준비
4. **테스트**:
   - 로컬 환경에서 충분히 테스트
   - 더미 데이터로 모든 시나리오 검증

## 🎯 예상 효과

### 성능 개선
- ✅ 레코드 수 대폭 감소 (이월된 투두 수만큼)
- ✅ 쿼리 단순화
- ✅ 업데이트 연산 최소화

### 코드 품질
- ✅ 로직 단순화 (약 200라인 감소 예상)
- ✅ 버그 가능성 감소
- ✅ 유지보수 용이

### 사용자 경험
- ✅ 삭제 옵션 단순화 (4개 → 2개)
- ✅ 응답 속도 향상
- ✅ 일관성 있는 동작

## 📝 작업 순서

1. ✅ 현재 버전 커밋 및 배포 (완료)
2. ⏳ 새 브랜치 생성 (`refactor/json-based-carryover`)
3. ⏳ 스키마 변경 적용
4. ⏳ 마이그레이션 스크립트 작성 및 테스트
5. ⏳ fetchTodos 수정
6. ⏳ 이월 로직 재작성
7. ⏳ 삭제 로직 단순화
8. ⏳ 완료/미완료 토글 수정
9. ⏳ 전체 테스트
10. ⏳ PR 생성 및 리뷰
11. ⏳ 메인 브랜치 병합 및 배포

## 🔄 루틴 투두도 JSON 방식으로 전환 (2025-11-23 추가)

### 현재 루틴 방식 (복사 기반)
```javascript
// 매일 새로운 투두 레코드를 생성
// 월요일 루틴이 있으면
2025-11-18: { id: 1, text: "운동하기", routine_id: 1, date: "2025-11-18" }
2025-11-25: { id: 2, text: "운동하기", routine_id: 1, date: "2025-11-25" }
2025-12-02: { id: 3, text: "운동하기", routine_id: 1, date: "2025-12-02" }
// 매주 새 레코드 생성됨
```

**문제점:**
- ❌ 루틴이 반복될 때마다 새 레코드 생성 → 무한정 증가
- ❌ 루틴 통계 조회 시 모든 레코드를 다 가져와야 함
- ❌ 데이터 정합성 문제 (루틴 이름 변경 시 과거 레코드 불일치)

### 제안 방식 (JSON 기반)
```javascript
// 하나의 레코드로 모든 날짜 관리
{
  id: 1,
  text: "운동하기",
  routine_id: 1,
  created_date: "2025-11-18",
  completed: false,
  visible_dates: ["2025-11-18", "2025-11-25", "2025-12-02", ...], // 자동으로 추가됨
  hidden_dates: [], // 특정 날짜에 숨김 가능
}
```

**장점:**
- ✅ 루틴당 1개의 투두만 유지 → 데이터 최소화
- ✅ 루틴 통계는 visible_dates 배열 길이로 즉시 계산 가능
- ✅ 루틴 이름 변경 시 한 번만 업데이트
- ✅ 일반 투두와 동일한 방식으로 관리 (일관성)

### 수정 필요 항목

#### 1. 루틴 투두 생성 로직 (`createRoutineTodosForDate`)
**현재**: 매번 새 레코드 INSERT
```javascript
await supabase.from('todos').insert([{
  text: `${routine.text}-for ${dateDisplay}`,
  date: dateStr,
  routine_id: routine.id
}])
```

**변경 후**: 기존 투두에 날짜만 추가
```javascript
// 1. 해당 루틴의 기존 투두 찾기
const existingTodo = await supabase
  .from('todos')
  .select('*')
  .eq('routine_id', routine.id)
  .eq('deleted', false)
  .single()

if (existingTodo) {
  // 2. visible_dates에 날짜 추가
  await supabase
    .from('todos')
    .update({
      visible_dates: [...existingTodo.visible_dates, dateStr]
    })
    .eq('id', existingTodo.id)
} else {
  // 3. 첫 루틴 투두 생성
  await supabase.from('todos').insert([{
    text: routine.text,
    date: dateStr,
    visible_dates: [dateStr],
    hidden_dates: [],
    routine_id: routine.id
  }])
}
```

#### 2. 루틴 통계 조회 (`fetchRoutineHistory`)
**현재**: 모든 루틴 투두 레코드 조회
```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .eq('routine_id', routine.id)
  .eq('deleted', false)
```

**변경 후**: 1개 투두의 visible_dates로 통계 계산
```javascript
const { data } = await supabase
  .from('todos')
  .select('*')
  .eq('routine_id', routine.id)
  .eq('deleted', false)
  .single()

if (data) {
  // visible_dates 배열을 날짜별 객체 배열로 변환
  const historyData = data.visible_dates.map(date => ({
    date,
    completed: data.completed && data.completed_at?.split('T')[0] === date
  }))
  setRoutineHistoryData(historyData)
}
```

#### 3. UI 날짜 태그 표시
- 텍스트에서 "-for 날짜" 제거
- 대신 `.routine-date-badge` 클래스로 태그 표시
- 예: "운동하기" [for 11/23(토)]

### 마이그레이션 전략

**기존 루틴 투두 정리:**
```sql
-- 기존 루틴 투두 모두 삭제 (깔끔하게 시작)
DELETE FROM todos WHERE routine_id IS NOT NULL;
```

**이유:**
- 루틴은 반복되므로 과거 데이터 보존 불필요
- 새 방식으로 자동 재생성됨
- 마이그레이션 복잡도 제거

## 💬 토론 필요 사항

1. **삭제 옵션**: 2개로 충분한가? 아니면 추가 옵션 필요?
2. **마이그레이션 타이밍**: 언제 진행할 것인가?
3. **롤백 전략**: 문제 발생 시 어떻게 대응할 것인가?

---

**작성자**: Claude Code
**최종 수정**: 2025-11-23 (루틴 투두 JSON 방식 추가)
**다음 세션 참고사항**:
- 일반 투두는 JSON 방식 적용 완료
- 루틴 투두는 다음 세션에서 JSON 방식으로 전환 예정
- 기존 루틴 투두는 Supabase에서 수동 삭제 완료
