# KeyThoughts - 주요 생각정리 앱

Notion 스타일의 계층적 블록 기반 메모 앱입니다.

## 주요 기능

- 💡 **계층적 블록 구조**: Toggle 블록으로 생각을 계층적으로 정리
- 🎯 **드래그 앤 드롭**: 블록을 자유롭게 재배치
- 🕐 **버전 히스토리**: 자동 저장 및 버전 복구 기능
- 🔐 **Google 로그인**: 안전한 인증 및 사용자별 데이터 관리
- ☁️ **실시간 동기화**: Supabase 기반 클라우드 저장

## 기술 스택

- React 19
- Vite
- Supabase (PostgreSQL + Auth)
- DnD Kit

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. Supabase 프로젝트 생성
1. https://supabase.com/dashboard 에서 새 프로젝트 생성
2. Settings > API에서 Project URL과 anon key 복사

### 3. 환경 변수 설정
`.env` 파일 생성:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Supabase 테이블 생성
Supabase Dashboard > SQL Editor에서 다음 파일들을 순서대로 실행:
1. `create-user-settings-table.sql`
2. `create-key-thoughts-history-table.sql`

### 5. Google OAuth 설정
1. Supabase Dashboard > Authentication > Providers > Google 활성화
2. Google Cloud Console에서 OAuth 클라이언트 생성
3. Authorized redirect URIs 설정: `https://your-project-id.supabase.co/auth/v1/callback`

### 6. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 http://localhost:5173 접속

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

## todo-note와의 관계

이 앱은 [todo-note](https://github.com/jaehwan-lee-benja/todo-note)에서 KeyThoughts 섹션만 추출한 단독 앱입니다.

### 동기화 대상 파일
- `src/components/KeyThoughts/*`
- `src/components/Modals/KeyThoughtsHistoryModal.jsx`
- `src/hooks/useKeyThoughts.js`
- `src/hooks/useAuth.js`

todo-note에서 KeyThoughts 기능 개선 시 해당 파일들을 manual로 복사하여 동기화합니다.

## 라이선스

Private
