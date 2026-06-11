-- ============================================================================
-- Phase 0.7 STEP 1 — 보드 멤버 등록 (데이터 INSERT, RLS 변경 아님)
-- 작성: 2026-06-11 · PLAN-daily-carryover-authority.md Phase 0.7
-- 대상 보드: "업무일지" 0fcc0fee-9467-49f5-a5c2-5b9952964351
-- 내용: sarurufarm.partner(능동 사용자), rlawldus0621(링크 주계정)을 role='member' 로.
--       역할 CHECK = {master, member}. ON CONFLICT 로 멱등.
-- 안전성: additive 데이터. 기존 멤버(master 2명) 안 건드림. 롤백 = 아래 STEP1-ROLLBACK.
-- 실행: 전체 복붙 후 Run → 그다음 검증 블록 결과 확인.
-- ============================================================================

INSERT INTO worklog_board_members (board_id, user_id, role, joined_at)
SELECT '0fcc0fee-9467-49f5-a5c2-5b9952964351'::uuid, u.id, 'member', now()
FROM auth.users u
WHERE LOWER(u.email) IN ('sarurufarm.partner@gmail.com', 'rlawldus0621@gmail.com')
ON CONFLICT (board_id, user_id) DO NOTHING;

-- 검증: 등록 후 이 보드 멤버 전원 (master 2 + member 2 = 4 기대)
SELECT COALESCE(u.email,'(?)') AS email, m.role
FROM worklog_board_members m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.board_id = '0fcc0fee-9467-49f5-a5c2-5b9952964351'::uuid
ORDER BY m.role, email;

-- ── 롤백(STEP1-ROLLBACK, 필요시에만) ──────────────────────────────────────────
-- DELETE FROM worklog_board_members
-- WHERE board_id = '0fcc0fee-9467-49f5-a5c2-5b9952964351'::uuid
--   AND role = 'member'
--   AND user_id IN (SELECT id FROM auth.users
--                   WHERE LOWER(email) IN ('sarurufarm.partner@gmail.com','rlawldus0621@gmail.com'));
