-- ============================================================================
-- Phase 0.7 사전 진단 — "업무일지" 보드의 멤버십 / 역할 / 링크계정 실태 (읽기만)
-- 작성: 2026-06-10 · PLAN-daily-carryover-authority.md Phase 0.7
-- 목적: 지금 "공유 접근"이 무엇(보드 멤버십 vs 링크계정 vs 공유)에 의존하는지 확인.
--       → board-membership RLS 를 additive 로 넣을 때 현행 접근을 안 깨도록.
-- 실행: SQL Editor 전체 복붙 후 Run.
-- ============================================================================

WITH board AS (SELECT '0fcc0fee-9467-49f5-a5c2-5b9952964351'::uuid AS id)
SELECT q, grp, detail FROM (
  -- 1) 이 보드의 멤버 (worklog_board_members)
  SELECT '1. 보드 멤버'::text AS q,
         COALESCE(u.email,'(?)') || ' | board_role=' || m.role AS grp,
         'joined=' || COALESCE(m.joined_at::text,'?') AS detail
  FROM worklog_board_members m
  CROSS JOIN board b
  LEFT JOIN auth.users u ON u.id = m.user_id
  WHERE m.board_id = b.id

  UNION ALL
  -- 2) 이 보드에 daily 를 만든 적 있는 사람 (멤버와 대조)
  SELECT '2. daily 작성자',
         COALESCE(u.email,'(?)') || ' | app_role=' || COALESCE(au.role,'(none)'),
         'daily 수=' || COUNT(*)::text
  FROM pages p
  CROSS JOIN board b
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN app_users au ON au.auth_uid = p.user_id
  WHERE p.parent_id = b.id AND p.page_type='daily' AND p.deleted_at IS NULL
  GROUP BY u.email, au.role

  UNION ALL
  -- 3) 링크계정 (primary_email 가 linked_email 데이터를 봄) — 현행 공유 의존 확인
  SELECT '3. 링크계정',
         primary_email || ' → ' || linked_email,
         'perm=' || COALESCE(permission,'?')
  FROM linked_accounts

  UNION ALL
  -- 4) app_users 역할 (전역 마스터 판별)
  SELECT '4. app_users 역할',
         COALESCE(email,'?') || ' | ' || COALESCE(role,'?'),
         'status=' || COALESCE(status,'?')
  FROM app_users
) z
ORDER BY q, grp;
