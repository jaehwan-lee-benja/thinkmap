# Google 로그인 설정 가이드

Google 계정으로 로그인할 수 있도록 설정하는 방법입니다.

## 1. Supabase에서 Google OAuth 설정

### 1-1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. **API 및 서비스 > 사용자 인증 정보** 이동
4. **사용자 인증 정보 만들기 > OAuth 클라이언트 ID** 클릭
5. 애플리케이션 유형: **웹 애플리케이션**
6. 승인된 리디렉션 URI에 추가:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
   ```
   (YOUR_SUPABASE_PROJECT_REF는 Supabase 프로젝트 URL에서 확인)
7. **클라이언트 ID**와 **클라이언트 보안 비밀** 복사

### 1-2. Supabase Dashboard 설정

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택
3. **Authentication > Providers** 이동
4. **Google** 찾아서 활성화
5. Google Cloud Console에서 복사한 **Client ID**와 **Client Secret** 입력
6. **Save** 클릭

## 2. 데이터베이스 마이그레이션 (순서대로 실행)

Supabase Dashboard > **SQL Editor**에서 아래 SQL 파일들을 순서대로 실행하세요.

### 2-1. user_id 컬럼 추가
```sql
-- 파일: add-user-id-to-all-tables.sql
```
모든 테이블에 user_id 컬럼과 인덱스를 추가합니다.

### 2-2. RLS 정책 업데이트
```sql
-- 파일: update-rls-policies.sql
```
기존 "모든 사용자 접근 가능" 정책을 "본인만 접근 가능"으로 변경합니다.

### 2-3. 기존 데이터 마이그레이션

**⚠️ 중요: 이 단계 전에 먼저 designerbenja@gmail.com으로 로그인해야 합니다!**

1. 앱에서 Google 로그인 버튼 클릭
2. designerbenja@gmail.com 계정으로 로그인
3. 로그인 후 Supabase Dashboard > **Authentication > Users**에서 해당 사용자 확인
4. SQL Editor에서 `migrate-existing-data-to-user.sql` 실행
   - auth.users 접근 가능하면 **방법 1** 그대로 실행
   - 접근 불가능하면 **방법 2** 주석 해제 후 UUID 입력하여 실행

## 3. 테스트

1. 앱 새로고침
2. 로그아웃 후 다시 로그인
3. 기존 투두/루틴 데이터가 보이는지 확인
4. 새로운 투두 추가/수정/삭제 테스트
5. 다른 Google 계정으로 로그인하여 데이터가 분리되는지 확인

## 4. 주의사항

- **데이터 백업**: 마이그레이션 전에 Supabase에서 데이터 백업 권장
- **테스트 계정**: 가능하면 테스트 계정으로 먼저 테스트
- **로그인 필수**: 이제 로그인하지 않으면 데이터를 볼 수 없습니다
- **RLS 정책**: 각 사용자는 본인의 데이터만 조회/수정/삭제 가능

## 5. 트러블슈팅

### "로그인 오류" 발생 시
- Google OAuth Client ID/Secret이 올바른지 확인
- 리디렉션 URI가 정확한지 확인 (끝에 /auth/v1/callback 포함)

### 로그인 후 데이터가 안 보일 때
- RLS 정책이 적용되었는지 확인
- migrate-existing-data-to-user.sql이 올바르게 실행되었는지 확인
- user_id 컬럼이 모든 테이블에 추가되었는지 확인

### "permission denied" 오류 시
- RLS 정책이 user_id를 체크하는지 확인
- 데이터에 user_id가 설정되어 있는지 확인

## 6. 완료!

이제 Google 계정으로 안전하게 로그인하여 개인 투두를 관리할 수 있습니다. 🎉
