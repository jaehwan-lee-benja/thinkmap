# 🚨 CRITICAL LESSONS - 반드시 읽고 시작할 것

## ⚠️ React + TipTap 통합 시 절대 규칙

### 🔴 절대 하지 말 것: TipTap Extension으로 UI 만들기

```javascript
// ❌ 절대 금지 - Extension에서 DOM 조작
export const DragHandle = Extension.create({
  addProseMirrorPlugins() {
    return [new Plugin({
      view(editorView) {
        const element = document.createElement('div')
        // DOM 조작 시도 → React 렌더링 타이밍 문제 발생
      }
    })]
  }
})
```

**왜 안되나?**
- Extension `view()`는 **React 렌더링 전**에 실행됨
- `editorView.dom.parentElement`가 React DOM에 마운트되기 전
- `closest()`, `setTimeout()`, 재시도 등 모두 **근본 해결 아님**

### ✅ 올바른 방법: React useEffect

```javascript
// ✅ 정답 - React useEffect에서 DOM 조작
function TipTapEditor() {
  const editor = useEditor({ extensions: [...] })

  useEffect(() => {
    if (!editor) return

    // 여기서 DOM 조작 - React 렌더링 완료 후 실행됨
    const wrapper = document.querySelector('.tiptap-wrapper')
    const dragHandle = document.createElement('div')
    wrapper.appendChild(dragHandle)

    return () => cleanup()
  }, [editor])
}
```

---

## 📋 React + 서드파티 통합 원칙

| 담당 | React | TipTap Extension |
|------|-------|------------------|
| ✅ 허용 | UI/DOM 조작, 이벤트 리스너, 스타일 | 데이터 구조, 편집 로직, 키보드 명령 |
| ❌ 금지 | 에디터 내부 로직 | DOM 직접 조작, UI 렌더링 |

**예시**:
- 드래그 핸들 (⋮⋮) → React `useEffect`
- Toggle 블록 구조 → TipTap Extension
- BubbleMenu 위치 계산 → React `useEffect`
- Table 셀 병합 로직 → TipTap Extension

---

## 🛠️ 디버깅 원칙

### 1. 첫 시도 실패 시 접근 방식 재검토
```
시도 1: 실패
시도 2: 실패
시도 3: ❌ 이 시점에 "방법 자체가 틀렸다" 의심
```

**우회책 2-3번 실패 = 근본 원인 못 찾은 것**

### 2. 에러 로그 제대로 읽기
```javascript
parentElement.parentElement: null
```
- ❌ "null이니까 찾는 방법을 바꿔야지" (setTimeout, closest)
- ✅ **"왜 null인가? → React가 아직 렌더링 안함 → 실행 시점 변경"**

### 3. 타이밍 문제 체크리스트
- [ ] React 렌더링 전인가? → `useEffect` 사용
- [ ] 서드파티 초기화 전인가? → 의존성 배열 확인
- [ ] 비동기 작업 중인가? → `async/await` 확인

---

## 🎯 이번 케이스 (DragHandle)

### 실패 과정:
1. **잘못된 접근**: TipTap Extension으로 구현 시도
2. **증상**: `parentElement.parentElement: null`
3. **잘못된 해결**: setTimeout(0, 100, 재시도 10번)
4. **시간 낭비**: 3일

### 올바른 해결:
1. **근본 원인 파악**: Extension은 React 렌더링 전 실행
2. **방법 변경**: Extension 삭제 → React useEffect로 이동
3. **해결 시간**: 10분

### 교훈:
> **"우회책이 3번 실패하면 방향이 틀렸다"**

---

## 📌 다음 세션 시작 시 체크리스트

- [ ] 이 문서 읽음
- [ ] React + 서드파티 통합인가? → 담당 구분 확인
- [ ] DOM 조작이 필요한가? → React useEffect 사용
- [ ] Extension 만들기 전 → "이게 데이터 로직인가? UI인가?" 질문

---

**마지막 경고**:
이 교훈을 무시하고 다시 TipTap Extension으로 UI를 만들려고 하면,
같은 타이밍 문제에 빠져 또 3일을 낭비할 것입니다.

**날짜**: 2026-01-08
**컨텍스트**: Phase 5 DragHandle 구현 중
