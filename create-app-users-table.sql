-- app_users 테이블 생성 (마스터 계정용 사용자 관리)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('master', 'admin', 'user')),
  status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('active', 'invited', 'inactive')),
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);

-- RLS 활성화
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- 마스터 계정 이메일 목록 (정책에서 사용)
-- 이 목록에 있는 사용자만 모든 사용자 데이터에 접근 가능

-- 마스터만 모든 사용자 조회 가능
CREATE POLICY "Master can view all users"
ON app_users FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
);

-- 마스터만 사용자 추가 가능
CREATE POLICY "Master can insert users"
ON app_users FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
);

-- 마스터만 사용자 수정 가능
CREATE POLICY "Master can update users"
ON app_users FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
)
WITH CHECK (
  auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
);

-- 마스터만 사용자 삭제 가능
CREATE POLICY "Master can delete users"
ON app_users FOR DELETE
TO authenticated
USING (
  auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
);

-- 마스터 계정을 앱 사용자로 등록 (첫 번째 마스터)
INSERT INTO app_users (email, role, status)
VALUES ('designerbenja@gmail.com', 'master', 'active')
ON CONFLICT (email) DO NOTHING;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_app_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION update_app_users_updated_at();
