-- ============================================================================
-- Phase 0.7 보강 진단 — 전체 보드 멤버십 현황 + 링크계정 로그인 주체 (읽기만)
-- 작성: 2026-06-11 · PLAN-daily-carryover-authority.md Phase 0.7
-- 목적: ① worklog_board_members 전수(모든 보드) ② 각 보드가 어떤 페이지인지
--       ③ linked_accounts 양쪽 계정이 실제 auth.users 로 로그인 이력이 있는지
--       → partner / rlawldus0621 중 누구를 보드 멤버로 넣어야 하는지 판단.
-- 실행: SQL Editor 전체 복붙 후 Run.
-- ============================================================================

SELECT q, grp, detail FROM (
  -- 1) 전체 보드 멤버십 (모든 보드) — 보드명과 함께
  SELECT '1. 전체 보드 멤버'::text AS q,
         COALESCE(bp.name,'(보드?)') || ' | ' || COALESCE(u.email,'(?)') AS grp,
         'role=' || m.role AS detail
  FROM worklog_board_members m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN pages bp     ON bp.id = m.board_id

  UNION ALL
  -- 2) 멤버십 역할별 합계 (전 보드)
  SELECT '2. 역할별 합계',
         'role=' || role,
         'count=' || COUNT(*)::text
  FROM worklog_board_members
  GROUP BY role

  UNION ALL
  -- 3) linked_accounts 양쪽이 auth.users 로 실재하는지 + 로그인(last_sign_in) 이력
  SELECT '3. 링크계정 로그인 주체',
         la.primary_email || ' (primary)',
         'auth=' || CASE WHEN pu.id IS NULL THEN '없음' ELSE '있음' END
                 || ' | last_sign_in=' || COALESCE(pu.last_sign_in_at::text,'(없음)')
  FROM linked_accounts la
  LEFT JOIN auth.users pu ON LOWER(pu.email) = LOWER(la.primary_email)

  UNION ALL
  SELECT '3. 링크계정 로그인 주체',
         la.linked_email || ' (linked)',
         'auth=' || CASE WHEN lu.id IS NULL THEN '없음' ELSE '있음' END
                 || ' | last_sign_in=' || COALESCE(lu.last_sign_in_at::text,'(없음)')
  FROM linked_accounts la
  LEFT JOIN auth.users lu ON LOWER(lu.email) = LOWER(la.linked_email)
) z
ORDER BY q, grp;
