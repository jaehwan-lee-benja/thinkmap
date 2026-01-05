# TipTap 에디터 마이그레이션 계획서

## 목차
1. [현재 상태 분석](#1-현재-상태-분석)
2. [마이그레이션 목표 및 이유](#2-마이그레이션-목표-및-이유)
3. [기술 스택 비교](#3-기술-스택-비교)
4. [아키텍처 설계](#4-아키텍처-설계)
5. [데이터 마이그레이션 전략](#5-데이터-마이그레이션-전략)
6. [단계별 구현 계획](#6-단계별-구현-계획)
7. [세션 인계 가이드](#7-세션-인계-가이드)
8. [테스트 체크리스트](#8-테스트-체크리스트)
9. [완료 기준](#9-완료-기준)
10. [리스크 관리](#10-리스크-관리)

---

## 1. 현재 상태 분석

### 1.1 코드베이스 현황
```
프로젝트명: ThinkMap
버전: 1.0.0
총 파일 수: 25개
주요 파일:
  - src/components/KeyThoughts/NotionBlock.jsx: 564줄
  - src/App.jsx: 180줄 (잘 구조화됨)
  - src/App.css: 5,372줄
```

### 1.2 현재 기술 스택
| 카테고리 | 기술 |
|---------|------|
| 프레임워크 | React 19.1.1 |
| 빌드 도구 | Vite 5.4.21 |
| 백엔드/DB | Supabase (PostgreSQL + Auth) |
| 드래그앤드롭 | @dnd-kit |
| 에디터 | 커스텀 textarea 기반 |

### 1.3 현재 에디터 시스템 특징

**장점**:
- ✅ 토글 블록 계층 구조 지원
- ✅ 키보드 네비게이션 (Enter, Tab, 화살표)
- ✅ 드래그앤드롭으로 블록 순서 변경
- ✅ 히스토리 시스템 (블록별 수정 이력)
- ✅ 자동 저장 (5초 debounce)
- ✅ 프로젝트/페이지 계층 관리

**단점** (마이그레이션 이유):
- ❌ **여러 블록을 가로질러 텍스트 선택 불가** (textarea 제약)
- ❌ **표(table) 기능 없음** (업무 매뉴얼에 필수)
- ❌ 리치 텍스트 포맷팅 없음 (볼드, 이탤릭 등)
- ❌ 이미지, 링크 등 멀티미디어 제한적
- ❌ 확장성 제한 (새 블록 타입 추가 어려움)

### 1.4 데이터베이스 구조

**Projects 테이블**:
```sql
id UUID, user_id UUID, name TEXT, created_at, updated_at
```

**Pages 테이블**:
```sql
id UUID, project_id UUID, user_id UUID, name TEXT, created_at, updated_at
```

**Blocks 테이블** (현재):
```sql
id UUID,
user_id UUID,
content TEXT,              -- 일반 텍스트
type TEXT,                 -- 'toggle', 'text', 'heading1-3'
parent_id UUID,            -- 계층 구조
position INTEGER,          -- 순서
depth INTEGER,             -- 계층 깊이
is_open BOOLEAN,           -- 토글 열림/닫힘
is_reference BOOLEAN,      -- 참조 블록 여부
original_block_id UUID,    -- 참조 원본
created_at, updated_at
```

**Block_History 테이블**:
```sql
id, block_id, user_id, content_before, content_after, action, created_at
```

---

## 2. 마이그레이션 목표 및 이유

### 2.1 주요 목표
1. **여러 블록 선택 가능**: 노션처럼 블록을 가로질러 텍스트 복사
2. **강력한 표 기능**: 구글 문서 수준의 표 편집 (업무 매뉴얼용)
3. **리치 텍스트**: 볼드, 이탤릭, 코드, 링크 등
4. **확장성**: 새 블록 타입 쉽게 추가 가능
5. **안정성**: 검증된 라이브러리 사용 (브라우저 호환성)

### 2.2 비즈니스 요구사항
- **사용 목적**: 업무 매뉴얼 작성
- **필수 기능**: 표, 계층 구조, 이미지, 코드 블록
- **유지해야 할 것**: 프로젝트/페이지 관리, 히스토리, 자동 저장

---

## 3. 기술 스택 비교

### 3.1 Before vs After

| 항목 | Before (현재) | After (TipTap) |
|------|--------------|----------------|
| **에디터 코어** | 커스텀 textarea | TipTap + ProseMirror |
| **텍스트 선택** | 블록별만 가능 | 여러 블록 가로질러 가능 |
| **표 기능** | 없음 | TableKit (병합, 정렬, 행/열 조작) |
| **리치 텍스트** | 없음 | 볼드, 이탤릭, 링크 등 |
| **드래그앤드롭** | @dnd-kit | TipTap DragHandle extension |
| **데이터 구조** | JSON (blocks 배열) | TipTap JSON (ProseMirror schema) |
| **React 통합** | 직접 구현 | @tiptap/react |

### 3.2 추가될 라이브러리

```json
{
  "dependencies": {
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-table": "^2.x",
    "@tiptap/extension-table-row": "^2.x",
    "@tiptap/extension-table-cell": "^2.x",
    "@tiptap/extension-table-header": "^2.x",
    "@tiptap/extension-placeholder": "^2.x",
    "@tiptap/extension-link": "^2.x",
    "@tiptap/extension-image": "^2.x"
  }
}
```

### 3.3 제거될 라이브러리
- `@dnd-kit/*` (TipTap 자체 드래그 기능 사용)

---

## 4. 아키텍처 설계

### 4.1 컴포넌트 구조 (After)

```
App.jsx
├── Header
├── Sidebar
└── TipTapEditor (NEW)
    ├── EditorToolbar (NEW)
    ├── EditorContent (@tiptap/react)
    └── BubbleMenu (선택 시 포맷팅 메뉴)
```

### 4.2 TipTap Extensions 구성

**Core Extensions**:
- StarterKit (기본 노드/마크)
  - Document, Paragraph, Text
  - Heading (1-6)
  - Bold, Italic, Code
  - Blockquote, CodeBlock
  - BulletList, OrderedList
  - HardBreak, HorizontalRule

**Custom Extensions** (우리가 만들어야 할 것):
- **Toggle Extension**: 토글 블록 (현재 핵심 기능 유지)
- **TableKit**: 표 기능
- **DragHandle**: 드래그앤드롭
- **Placeholder**: 빈 블록 힌트
- **Link**: 링크 삽입
- **Image**: 이미지 삽입

### 4.3 데이터 흐름 설계

**Before (현재)**:
```
User Input → textarea onChange → setBlocks (React state)
→ Supabase blocks table (JSON array)
```

**After (TipTap)**:
```
User Input → TipTap Editor (ProseMirror transaction)
→ onUpdate callback → TipTap JSON
→ Transform to Supabase format → Supabase blocks table
```

**핵심 변경점**:
- TipTap은 단일 에디터 인스턴스에서 모든 블록 관리
- ProseMirror JSON → Supabase blocks 테이블 변환 로직 필요

---

## 5. 데이터 마이그레이션 전략 (병행 운영)

### 5.1 병행 운영 방식 선택 이유

**기존 데이터를 건드리지 않고** 새 컬럼을 추가해서 안전하게 전환:

- ✅ **기존 `content TEXT` 컬럼**: 그대로 유지 (백업 + 롤백용)
- ✅ **새 `content_tiptap JSONB` 컬럼**: TipTap 에디터 전용
- ✅ **자동 변환**: 최초 로드 시 content → content_tiptap 자동 변환
- ✅ **점진적 전환**: 1주일 병행 운영 후 content 삭제 (선택)

### 5.2 Blocks 테이블 스키마 변경 (안전 모드)

**기존 유지**:
```sql
content TEXT  -- 기존 텍스트 (백업용으로 유지)
```

**추가**:
```sql
content_tiptap JSONB  -- TipTap JSON (ProseMirror document)
```

### 5.3 병행 운영 마이그레이션 스크립트

```sql
-- Step 1: 백업 (Supabase Dashboard 또는 pg_dump)
-- Supabase Dashboard → Database → Backups → Create backup

-- Step 2: 새 컬럼 추가 (기존 content는 건드리지 않음)
ALTER TABLE blocks
  ADD COLUMN content_tiptap JSONB DEFAULT NULL;

-- Step 3: 인덱스 추가 (검색 성능)
CREATE INDEX idx_blocks_content_tiptap_search
  ON blocks USING gin(content_tiptap);

-- 완료! 기존 데이터는 전혀 변경되지 않음
```

### 5.4 앱 로직: 자동 변환 및 저장

**로드 시** (useKeyThoughts.js):
```javascript
const fetchKeyThoughtsContent = async () => {
  const { data } = await supabase
    .from('blocks')
    .select('*')
    .order('position')

  return data.map(block => {
    // 1. content_tiptap이 있으면 사용
    if (block.content_tiptap) {
      return { ...block, content: block.content_tiptap }
    }

    // 2. 없으면 기존 content를 TipTap JSON으로 변환
    return {
      ...block,
      content: convertTextToTiptapJSON(block.content)
    }
  })
}

// 텍스트 → TipTap JSON 변환 함수
function convertTextToTiptapJSON(text) {
  if (!text || text === '') {
    return { type: 'doc', content: [] }
  }

  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }]
    }]
  }
}
```

**저장 시**:
```javascript
const handleSaveKeyThoughts = async () => {
  const tiptapJSON = editor.getJSON()

  await supabase
    .from('blocks')
    .update({
      content_tiptap: tiptapJSON  // 새 컬럼에만 저장
      // content는 건드리지 않음 (백업 유지)
    })
}
```

### 5.5 병행 운영 단계별 프로세스

**Week 0 (마이그레이션 시작)**:
- Supabase 백업 생성
- `content_tiptap JSONB` 컬럼 추가
- 앱 배포 (자동 변환 로직 포함)

**Week 1-2 (병행 운영)**:
- 사용자가 블록 편집 → `content_tiptap`에 저장됨
- 점차 모든 블록에 `content_tiptap` 생성
- 기존 `content`는 그대로 유지 (백업)

**Week 2+ (검증 완료 후)**:
- 모든 블록에 `content_tiptap` 존재 확인
- (선택) `content TEXT` 컬럼 삭제
  ```sql
  ALTER TABLE blocks DROP COLUMN content;
  ```

### 5.6 롤백 전략 (병행 운영의 장점)

**문제 발생 시 즉시 롤백 (DB 변경 없이)**:

1. **코드만 되돌리기**:
   ```bash
   git revert [commit-hash]
   npm run deploy
   ```

2. **기존 content로 즉시 복귀**:
   - content_tiptap 사용 중지
   - content TEXT 사용 재개
   - 몇 분 내 완료

3. **DB는 건드릴 필요 없음**:
   - content 컬럼이 그대로 남아있음
   - 백업 복구 불필요

### 5.7 안전성 비교

| 항목 | 병행 운영 (채택) | 일반 마이그레이션 |
|------|----------------|------------------|
| 기존 데이터 보존 | ✅ 100% 유지 | ⚠️ 변환으로 덮어씀 |
| 롤백 시간 | ⚡️ 즉시 (코드만) | 🐢 백업 복구 필요 |
| 검증 기간 | ✅ 충분히 확보 | ⚠️ 즉시 전환 |
| 디스크 사용량 | ⚠️ 약간 증가 (일시적) | ✅ 동일 |
| 리스크 | 🟢 매우 낮음 | 🟡 중간 |

---

## 6. 단계별 구현 계획

### Phase 0: 준비 및 환경 설정 (1-2시간)
- [x] 0.1 Git 브랜치 생성: `feature/tiptap-migration`
- [x] 0.2 TipTap 라이브러리 설치
- [x] 0.3 기존 코드 백업 (NotionBlock.jsx → NotionBlock.backup.jsx)
- [x] 0.4 마이그레이션 계획서 리뷰

### Phase 1: 기본 TipTap 에디터 구현 (2-3시간)
- [x] 1.1 TipTapEditor.jsx 컴포넌트 생성
- [x] 1.2 StarterKit 설정 (기본 노드/마크)
- [x] 1.3 App.jsx에서 TipTapEditor 연동 (NotionBlock 대체)
- [x] 1.4 기본 텍스트 입력/편집 테스트
- [x] 1.5 저장/로드 로직 구현 (TipTap JSON ↔ Supabase)

**완료 기준**: 텍스트 입력하고 저장/로드 가능

### Phase 2: Toggle Extension 구현 (3-4시간)
- [x] 2.1 Custom Toggle Node 정의
  - `type: 'toggle'`
  - `attrs: { isOpen: boolean }`
  - `content: 'block+'` (자식 블록 포함)
- [x] 2.2 Toggle 렌더링 (▶ 버튼 + 열기/닫기)
- [x] 2.3 Toggle 키보드 단축키 (Cmd+Shift+T)
- [ ] 2.4 기존 토글 데이터 마이그레이션

**완료 기준**: 토글 블록 생성/열기/닫기 가능

### Phase 3: 표(Table) 기능 구현 (2-3시간)
- [ ] 3.1 TableKit extension 설치 및 설정
- [ ] 3.2 표 삽입 UI (툴바 버튼)
- [ ] 3.3 표 편집 기능 테스트
  - 행/열 추가/삭제
  - 셀 병합/분할
  - 정렬
- [ ] 3.4 표 스타일링 (CSS)

**완료 기준**: 노션 수준의 표 생성/편집 가능

### Phase 4: Toolbar & BubbleMenu (2시간)
- [ ] 4.1 EditorToolbar 컴포넌트 생성
  - 헤딩, 볼드, 이탤릭, 링크, 표 버튼
- [ ] 4.2 BubbleMenu (텍스트 선택 시 포맷팅 메뉴)
- [ ] 4.3 Slash command menu (/ 입력 시 블록 선택)

**완료 기준**: 노션처럼 포맷팅 쉽게 가능

### Phase 5: 드래그앤드롭 (2-3시간)
- [ ] 5.1 DragHandle extension 구현
- [ ] 5.2 블록 순서 변경 (position 업데이트)
- [ ] 5.3 계층 구조 변경 (parent_id 업데이트)
- [ ] 5.4 드래그 시 시각적 피드백

**완료 기준**: 블록 드래그로 순서/계층 변경 가능

### Phase 6: 추가 Extensions (1-2시간)
- [ ] 6.1 Image extension (이미지 업로드/삽입)
- [ ] 6.2 Link extension (링크 삽입/편집)
- [ ] 6.3 CodeBlock (코드 블록 syntax highlighting)
- [ ] 6.4 Placeholder (빈 에디터 힌트)

**완료 기준**: 이미지, 링크, 코드 블록 사용 가능

### Phase 7: 히스토리 시스템 통합 (2시간)
- [ ] 7.1 TipTap JSON 기반 히스토리 저장
- [ ] 7.2 버전 복구 기능 (TipTap setContent)
- [ ] 7.3 히스토리 모달 업데이트

**완료 기준**: 히스토리 저장/복구 정상 작동

### Phase 8: 데이터 마이그레이션 (병행 운영, 1-2시간)
- [ ] 8.1 Supabase Dashboard에서 백업 생성 및 다운로드
- [ ] 8.2 `content_tiptap JSONB` 컬럼 추가 (SQL 실행)
- [ ] 8.3 인덱스 추가 (검색 성능)
- [ ] 8.4 `convertTextToTiptapJSON` 함수 구현
- [ ] 8.5 useKeyThoughts에 자동 변환 로직 추가
- [ ] 8.6 저장 로직 수정 (content_tiptap 사용)
- [ ] 8.7 테스트: 기존 블록 정상 로드 확인
- [ ] 8.8 배포 후 1주일 병행 운영
- [ ] 8.9 (선택) 검증 완료 후 content 컬럼 삭제

**완료 기준**: 기존 데이터 자동 변환되어 로드, 새 데이터 content_tiptap에 저장

### Phase 9: 스타일링 & UI 개선 (2-3시간)
- [ ] 9.1 TipTap CSS 커스터마이징
- [ ] 9.2 다크모드 지원
- [ ] 9.3 모바일 반응형 최적화
- [ ] 9.4 기존 App.css 정리 (불필요한 스타일 제거)

**완료 기준**: UI가 이전과 유사하거나 개선됨

### Phase 10: 테스트 & 버그 수정 (2-3시간)
- [ ] 10.1 전체 기능 테스트 (체크리스트 기반)
- [ ] 10.2 엣지 케이스 테스트
- [ ] 10.3 브라우저 호환성 테스트 (Chrome, Safari, Firefox)
- [ ] 10.4 성능 테스트 (큰 문서 로딩)
- [ ] 10.5 버그 수정

**완료 기준**: 모든 테스트 통과

### Phase 11: 배포 & 모니터링 (1시간)
- [ ] 11.1 main 브랜치 병합
- [ ] 11.2 프로덕션 배포
- [ ] 11.3 사용자 피드백 수집
- [ ] 11.4 후속 버그 수정

---

## 7. 세션 인계 가이드 (다른 컴퓨터에서 작업 시)

### 7.1 새 컴퓨터에서 처음 시작하는 방법

**1단계: 저장소 클론 및 환경 설정**
```bash
# 1. 저장소 클론
git clone https://github.com/jaehwan-lee-benja/thinkmap.git
cd thinkmap

# 2. 브랜치 확인 (feature/tiptap-migration이 있는지)
git branch -a

# 3. 작업 브랜치로 전환 (있으면)
git checkout feature/tiptap-migration

# 4. 의존성 설치
npm install

# 5. .env 파일 확인 (Supabase 설정)
cat .env
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
```

**2단계: 현재 진행 상황 파악**
```bash
# 계획서에서 완료된 Phase 확인
cat TIPTAP_MIGRATION_PLAN.md | grep "\[x\]"

# 또는 전체 계획서 읽기
cat TIPTAP_MIGRATION_PLAN.md

# 최근 커밋 히스토리 확인
git log --oneline -10

# 현재 변경된 파일 확인
git status
```

**3단계: 개발 서버 실행**
```bash
npm run dev
# → http://localhost:5173/thinkmap/ 접속
```

**4단계: 다음 할 일 확인**
- `TIPTAP_MIGRATION_PLAN.md`에서 다음 `[ ]` Phase 찾기
- 각 Phase의 "완료 기준" 확인
- 필요한 파일 위치 확인 (7.3 참고)

### 7.2 작업 진행 및 커밋 가이드

**작업 중**:
```bash
# 수시로 저장 및 테스트
npm run dev  # 개발 서버 실행 중 유지

# 파일 변경 후 브라우저 자동 새로고침 확인
```

**Phase 완료 후**:
```bash
# 1. 계획서 체크박스 업데이트
# TIPTAP_MIGRATION_PLAN.md에서 [ ] → [x] 변경

# 2. Git 커밋
git add .
git commit -m "feat(tiptap): Phase X.Y - [작업 내용]"

# 예시:
# git commit -m "feat(tiptap): Phase 1.2 - StarterKit 설정 완료"
# git commit -m "feat(tiptap): Phase 2.1 - Custom Toggle Node 정의"

# 3. GitHub에 푸시
git push origin feature/tiptap-migration
```

**작업 종료 시** (다른 컴퓨터로 옮기기 전):
```bash
# 모든 변경사항 커밋 및 푸시
git add .
git commit -m "작업 중단: Phase X.Y 진행 중"
git push origin feature/tiptap-migration

# 다음 컴퓨터에서 git pull하면 이어서 작업 가능
```

### 7.3 주요 파일 위치 (작업 시 참고)

| 파일 경로 | 역할 | Phase |
|----------|------|-------|
| `TIPTAP_MIGRATION_PLAN.md` | 이 계획서 (진행 상황 체크) | 전체 |
| `package.json` | 의존성 관리 | Phase 0 |
| `src/components/TipTapEditor/TipTapEditor.jsx` | 메인 에디터 컴포넌트 | Phase 1 |
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | 커스텀 토글 블록 | Phase 2 |
| `src/components/TipTapEditor/EditorToolbar.jsx` | 툴바 UI | Phase 4 |
| `src/components/TipTapEditor/BubbleMenu.jsx` | 선택 시 포맷팅 메뉴 | Phase 4 |
| `src/hooks/useKeyThoughts.js` | 데이터 로드/저장 로직 | Phase 8 |
| `src/App.jsx` | 에디터 통합 | Phase 1, 9 |
| `src/App.css` | 스타일링 | Phase 9 |

### 7.4 다른 컴퓨터에서 이어서 작업하기

**컴퓨터 A에서 작업 종료**:
```bash
git add .
git commit -m "작업 중: Phase 2.3 Toggle 렌더링 완료"
git push origin feature/tiptap-migration
```

**컴퓨터 B에서 이어서 작업**:
```bash
# 1. 이미 클론되어 있다면
cd thinkmap
git pull origin feature/tiptap-migration

# 2. 처음이라면 7.1 "새 컴퓨터에서 처음 시작" 참고

# 3. 의존성 확인 (package.json 변경 시)
npm install

# 4. 개발 서버 실행
npm run dev

# 5. 계획서에서 다음 할 일 확인
cat TIPTAP_MIGRATION_PLAN.md | grep -A 5 "Phase 2.4"
```

### 7.5 문제 발생 시 트러블슈팅

**개발 서버가 안 열리면**:
```bash
# 1. 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 2. 포트 충돌 확인
lsof -i :5173  # 이미 사용 중이면 프로세스 종료

# 3. Vite 캐시 삭제
rm -rf node_modules/.vite
npm run dev
```

**Git 충돌 발생 시**:
```bash
# 1. 최신 코드 받기
git pull origin feature/tiptap-migration

# 2. 충돌 파일 확인
git status

# 3. 충돌 해결 후
git add .
git commit -m "merge: 충돌 해결"
git push
```

**에디터가 안 보이면**:
- 브라우저 콘솔 에러 확인 (F12)
- TipTap CSS import 확인
- EditorContent 컴포넌트 렌더링 확인

**저장이 안 되면**:
- TipTap JSON 구조 확인 (`editor.getJSON()` 콘솔 출력)
- Supabase 연결 확인 (.env 파일)
- Network 탭에서 API 호출 확인

**토글이 안 되면**:
- Custom Toggle Node 등록 확인 (`useEditor` extensions 배열)
- Toggle 클릭 이벤트 핸들러 확인
- 브라우저 콘솔에서 에러 메시지 확인

### 7.6 환경 변수 설정 (.env)

다른 컴퓨터에서 작업 시 `.env` 파일 필요:

```bash
# .env (Git에는 올라가지 않음)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**`.env` 파일이 없다면**:
1. `.env.example` 복사: `cp .env.example .env`
2. Supabase Dashboard에서 키 확인
3. `.env` 파일 수정

### 7.7 빠른 체크리스트 (새 컴퓨터)

- [ ] `git clone` 및 `cd thinkmap`
- [ ] `git checkout feature/tiptap-migration`
- [ ] `npm install`
- [ ] `.env` 파일 설정 확인
- [ ] `npm run dev` 실행
- [ ] 브라우저에서 http://localhost:5173/thinkmap/ 접속
- [ ] `TIPTAP_MIGRATION_PLAN.md`에서 다음 Phase 확인
- [ ] 작업 시작!

---

## 8. 테스트 체크리스트

### 8.1 기본 기능
- [ ] 텍스트 입력 및 편집
- [ ] 볼드, 이탤릭, 밑줄 등 포맷팅
- [ ] 헤딩 (H1, H2, H3)
- [ ] 불릿 리스트, 번호 리스트
- [ ] 저장 (자동 + 수동)
- [ ] 로드 (페이지 새로고침 시)

### 8.2 토글 블록
- [ ] 토글 블록 생성
- [ ] 토글 열기/닫기
- [ ] 토글 안에 중첩 토글
- [ ] 토글 드래그 이동

### 8.3 표 기능
- [ ] 표 삽입 (3x3)
- [ ] 행/열 추가
- [ ] 행/열 삭제
- [ ] 셀 병합
- [ ] 셀 분할
- [ ] 표 안에서 포맷팅

### 8.4 멀티 블록 선택
- [ ] 여러 블록을 가로질러 텍스트 선택
- [ ] 복사/붙여넣기
- [ ] 드래그로 여러 블록 선택

### 8.5 드래그앤드롭
- [ ] 블록 순서 변경
- [ ] 계층 구조 변경 (들여쓰기/내어쓰기)
- [ ] 드래그 시 시각적 피드백

### 8.6 히스토리
- [ ] 수정 시 히스토리 저장
- [ ] 히스토리 목록 조회
- [ ] 이전 버전 복구
- [ ] 복구 후 정상 작동

### 8.7 추가 기능
- [ ] 이미지 삽입
- [ ] 링크 삽입/편집
- [ ] 코드 블록
- [ ] Slash command (/ 메뉴)

### 8.8 UI/UX
- [ ] 모바일 반응형
- [ ] 다크모드
- [ ] 툴바 작동
- [ ] BubbleMenu 작동
- [ ] 로딩 상태 표시

### 8.9 성능
- [ ] 큰 문서 (100+ 블록) 로딩 속도
- [ ] 타이핑 지연 없음
- [ ] 자동 저장 디바운싱
- [ ] 메모리 누수 없음

### 8.10 브라우저 호환성
- [ ] Chrome (최신)
- [ ] Safari (최신)
- [ ] Firefox (최신)
- [ ] 모바일 Safari (iOS)
- [ ] 모바일 Chrome (Android)

---

## 9. 완료 기준

### 9.1 필수 기준 (Must Have)
✅ 다음을 모두 만족해야 마이그레이션 완료:

1. **여러 블록 선택**: 블록을 가로질러 텍스트 복사 가능
2. **표 기능**: 행/열 추가/삭제, 셀 병합 가능
3. **토글 블록**: 기존처럼 토글 생성/열기/닫기 가능
4. **저장/로드**: 기존 데이터 모두 로드 가능, 새 데이터 저장 가능
5. **히스토리**: 수정 이력 저장 및 복구 가능
6. **반응형**: 모바일에서도 정상 작동
7. **버그 없음**: 치명적 버그 0개

### 9.2 권장 기준 (Should Have)
✅ 가능하면 포함:

1. **Slash command**: / 입력 시 블록 메뉴
2. **이미지 삽입**: 이미지 업로드/표시
3. **링크 편집**: 링크 추가/수정 UI
4. **코드 블록**: Syntax highlighting
5. **다크모드**: 기존처럼 다크모드 지원

### 9.3 선택 기준 (Nice to Have)
✅ 시간 남으면:

1. **AI 자동완성**: Novel 처럼 AI 기능
2. **실시간 협업**: Yjs 통합
3. **Markdown 단축키**: **볼드**, *이탤릭* 등
4. **더 많은 블록 타입**: 캘린더, 임베드 등

---

## 10. 리스크 관리

### 10.1 예상 리스크 및 대응책

| 리스크 | 발생 가능성 | 영향도 | 대응책 |
|--------|------------|--------|--------|
| **TipTap 학습 곡선** | 높음 | 중간 | 공식 문서, 예제 코드 참고 |
| **기존 데이터 손실** | 낮음 | 치명적 | 마이그레이션 전 백업, 롤백 스크립트 |
| **성능 이슈** | 중간 | 높음 | 큰 문서 테스트, lazy loading |
| **브라우저 호환성** | 낮음 | 중간 | ProseMirror는 이미 검증됨 |
| **토글 블록 재구현 실패** | 중간 | 높음 | 기존 NotionBlock.jsx 참고, 단계적 구현 |
| **예산/시간 초과** | 중간 | 중간 | Phase별로 최소 기능 먼저, 추가 기능은 나중에 |

### 10.2 롤백 계획
만약 마이그레이션 실패 시:

1. **Git revert**: `feature/tiptap-migration` 브랜치 삭제
2. **DB 롤백**: 백업에서 복구
3. **기존 코드 복구**: NotionBlock.backup.jsx → NotionBlock.jsx

---

## 현재 진행 상황

### 완료된 Phase
- [x] Phase 0: 준비 및 환경 설정
- [x] Phase 1: 기본 TipTap 에디터 구현
- [ ] Phase 2: Toggle Extension 구현
- [ ] Phase 3: 표(Table) 기능 구현
- [ ] Phase 4: Toolbar & BubbleMenu
- [ ] Phase 5: 드래그앤드롭
- [ ] Phase 6: 추가 Extensions
- [ ] Phase 7: 히스토리 시스템 통합
- [ ] Phase 8: 데이터 마이그레이션 (병행 운영)
- [ ] Phase 9: 스타일링 & UI 개선
- [ ] Phase 10: 테스트 & 버그 수정
- [ ] Phase 11: 배포 & 모니터링

### 다음 단계
👉 **Phase 2: Toggle Extension 구현** 또는 **Phase 3: 표 기능 구현**
(Phase 1 테스트 후 결정)

### 마이그레이션 방식
✅ **병행 운영 (Parallel Operation)**
- 기존 `content TEXT` 컬럼 유지 (백업)
- 새 `content_tiptap JSONB` 컬럼 추가
- 자동 변환 로직으로 점진적 전환
- 롤백 매우 쉬움 (코드만 되돌림)

### 작업 환경
✅ **다중 컴퓨터 지원**
- Git으로 진행 상황 동기화
- 어떤 컴퓨터에서든 이어서 작업 가능
- 환경 설정 가이드 포함 (섹션 7)

---

## 참고 자료

### 공식 문서
- [TipTap 공식 문서](https://tiptap.dev/docs)
- [TipTap Table Extension](https://tiptap.dev/docs/editor/extensions/nodes/table)
- [TipTap Custom Extensions](https://tiptap.dev/docs/editor/extensions/custom-extensions)
- [ProseMirror 가이드](https://prosemirror.net/docs/guide/)
- [ProseMirror Schema](https://prosemirror.net/docs/guide/#schema)

### 예제 코드
- [TipTap Examples](https://tiptap.dev/docs/examples)
- [TipTap Tables Example](https://tiptap.dev/docs/examples/basics/tables)
- [Custom Node 만들기](https://tiptap.dev/docs/editor/extensions/custom-extensions/custom-nodes)
- [React 통합](https://tiptap.dev/docs/editor/getting-started/install/react)

### 유사 프로젝트
- [BlockNote](https://www.blocknotejs.org/) - Notion-style 블록 에디터
- [Novel](https://novel.sh/) - AI 기반 에디터 (UI 참고)
- [Editor.js](https://editorjs.io/) - 블록 기반 에디터

### 블로그/튜토리얼
- [How to Build a Notion-like Editor with TipTap](https://konstantin.digital/blog/how-to-build-a-text-editor-like-notion)
- [TipTap + React Tutorial](https://tiptap.dev/docs/editor/getting-started/install/react)

---

## 작성 정보

| 항목 | 내용 |
|------|------|
| **작성일** | 2026-01-04 |
| **최종 수정일** | 2026-01-04 |
| **작성자** | Claude Sonnet 4.5 |
| **프로젝트** | ThinkMap TipTap Migration |
| **GitHub** | https://github.com/jaehwan-lee-benja/thinkmap |
| **예상 소요 시간** | 20-30시간 (Phase 0-11 합계) |
| **마이그레이션 방식** | 병행 운영 (Parallel Operation) |
| **다중 컴퓨터 지원** | ✅ Yes |

---

## 버전 히스토리

### v1.0 (2026-01-04)
- ✅ 초기 계획서 작성
- ✅ 병행 운영 방식 선택
- ✅ 다중 컴퓨터 작업 환경 가이드 추가
- ✅ Phase 0-11 상세 계획 수립
- ✅ 세션 인계 가이드 작성
- ✅ 테스트 체크리스트 50+ 항목

---

## 📌 빠른 시작 가이드

**새 컴퓨터에서 시작하기**:
```bash
git clone https://github.com/jaehwan-lee-benja/thinkmap.git
cd thinkmap
git checkout feature/tiptap-migration  # 작업 브랜치
npm install
npm run dev
```

**현재 진행 상황 확인**:
```bash
cat TIPTAP_MIGRATION_PLAN.md | grep "\[x\]"
```

**다음 할 일 찾기**:
- 이 문서에서 첫 번째 `[ ]` Phase 찾기
- 각 Phase의 "완료 기준" 확인
- 작업 시작!

---

## 💡 팁 & 베스트 프랙티스

1. **자주 커밋하기**: Phase 세부 단계마다 커밋
2. **테스트 자주 하기**: 브라우저에서 즉시 확인
3. **계획서 업데이트**: `[ ]` → `[x]` 체크 잊지 말기
4. **작업 종료 시 푸시**: 다른 컴퓨터에서 이어서 가능
5. **문제 발생 시**: 섹션 7.5 트러블슈팅 참고

**Happy Coding! 🚀**
