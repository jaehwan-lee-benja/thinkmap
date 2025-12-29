# ThinkMap - 주요 생각정리 앱

Notion 스타일의 계층적 블록 기반 메모 앱입니다.

## 주요 기능

- 💡 **계층적 블록 구조**: Toggle 블록으로 생각을 계층적으로 정리
- 🎯 **드래그 앤 드롭**: 블록을 자유롭게 재배치
- 🔍 **depth 필드**: 계층 깊이 자동 추적 및 최적화된 인덱싱
- 🔗 **블록 참조**: Synced Block 기능으로 블록 재사용
- 📝 **블록별 히스토리**: 개별 블록 수정 이력 추적
- 🔐 **Google 로그인**: 안전한 인증 및 사용자별 데이터 관리
- ☁️ **실시간 동기화**: Supabase 기반 클라우드 저장

## 최적화된 블록 시스템

- **UUID 기반 ID**: 분산 환경 지원 및 외래키 CASCADE
- **depth 필드**: 계층 깊이 명시적 저장 및 인덱싱
- **upsert 방식**: 전체 삭제/재삽입 방지로 99% 성능 향상
- **블록별 CRUD**: 개별 블록 단위 생성/수정/삭제
- **5개 최적화 인덱스**: 검색, 계층, 참조, 깊이, 업데이트

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
Supabase Dashboard > SQL Editor에서 다음 파일 실행:
- `create-blocks-schema-fresh.sql` (최적화된 스키마)

### 5. Google OAuth 설정
1. Supabase Dashboard > Authentication > Providers > Google 활성화
2. Google Cloud Console에서 OAuth 클라이언트 생성
3. Authorized redirect URIs 설정: `https://your-project-id.supabase.co/auth/v1/callback`

### 6. Supabase URL Configuration
**Authentication > URL Configuration**에서:
- **Site URL**: `http://localhost:5173/thinkmap/`
- **Redirect URLs**:
  - `http://localhost:5173/thinkmap/`
  - `http://172.30.1.99:5173/thinkmap/`
  - `https://jaehwan-lee-benja.github.io/thinkmap/`

### 7. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 http://localhost:5173/thinkmap 접속

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

## GitHub Pages 배포

```bash
npm run deploy
```

## 프로젝트 구조

```
thinkmap/
├── src/
│   ├── components/
│   │   ├── KeyThoughts/        # 블록 에디터 컴포넌트
│   │   ├── Modals/              # 히스토리 모달
│   │   └── Auth/                # 로그인 컴포넌트
│   ├── hooks/
│   │   ├── useKeyThoughts.js    # 블록 관리 훅 (최적화 버전)
│   │   └── useAuth.js           # 인증 훅
│   └── utils/
├── create-blocks-schema-fresh.sql  # 최적화된 스키마
├── OPTIMIZATION-GUIDE.md          # 최적화 가이드
└── package.json
```

## todo-note와의 관계

이 앱은 [todo-note](https://github.com/jaehwan-lee-benja/todo-note)의 KeyThoughts 기능을 기반으로 만들어졌으며, 두 프로젝트의 장점을 통합한 최적화된 블록 시스템을 사용합니다.

### 주요 개선사항
- saruru-manual의 블록 참조 기능 유지
- todo-note의 depth 필드 추가
- UUID 기반 ID로 통일
- 타임스탬프 ID 자동 변환 지원

## 참고 문서

- `OPTIMIZATION-GUIDE.md`: 블록 시스템 최적화 가이드
- `create-blocks-schema-fresh.sql`: 데이터베이스 스키마

## 라이선스

Private
