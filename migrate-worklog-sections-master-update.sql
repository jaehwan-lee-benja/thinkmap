-- worklog_sections 테이블에 대해 master 계정은 모든 섹션을 수정할 수 있도록 정책 추가
-- 기존 update 정책은 pinned 섹션의 생성자만 허용 → fixed 섹션은 누구도 수정 불가였음
-- 이 정책 적용 후 master는 visibility / title 등 전체 컬럼 수정 가능

CREATE POLICY "worklog_sections_master_update" ON worklog_sections
  FOR UPDATE TO authenticated
  USING (is_master())
  WITH CHECK (is_master());
