-- ============================================================================
-- Q3 / STEP 1 (DRY-RUN) — master 섹션 아래 'all' 블록 정합화 대상 미리보기
-- 작성: 2026-06-09 · 개정: 2026-06-10 (살아있는 daily 페이지로 범위 한정)
-- 실행: Supabase SQL Editor 에 "이 파일 전체" 복붙 후 Run (수정 없음, 읽기만)
--
-- 목적(P1 정합): visibility='master' 섹션 아래 비-section 블록 중 visibility='all'
--   인 것을 'master' 로 맞춘다. → 공유 보드에서 비마스터가 보던 고아 제거.
--
-- 범위: 살아있는 daily 페이지만(page_type='daily' AND pages.deleted_at IS NULL).
--   삭제된 중복 페이지(과거 dedup) 위의 블록은 아무도 안 보므로 제외 — 구역 3에서 별도 표기.
-- ============================================================================

WITH master_sections AS (
  SELECT block_id
  FROM daily_blocks
  WHERE block_type='section' AND visibility='master' AND deleted_at IS NULL
),
all_targets AS (   -- master 섹션 아래 'all' 비-section 블록 (페이지 상태 무관)
  SELECT t.block_id, t.page_id
  FROM daily_blocks t
  JOIN master_sections ms ON ms.block_id = t.section_id
  WHERE t.block_type <> 'section' AND t.visibility='all' AND t.deleted_at IS NULL
),
classified AS (
  SELECT a.block_id, a.page_id,
         (p.id IS NOT NULL AND p.page_type='daily' AND p.deleted_at IS NULL) AS is_live_daily,
         p.page_date, u.email AS owner, (au.role='master') AS owner_master
  FROM all_targets a
  LEFT JOIN pages p ON p.id = a.page_id
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN app_users au ON au.auth_uid = p.user_id
)
SELECT q, grp, detail FROM (
  -- 1) 범위별 총계 (살아있는 daily = 실제 백필 대상)
  SELECT '1. 범위별 총계'::text AS q,
         CASE WHEN is_live_daily THEN 'LIVE daily (백필 대상)' ELSE 'DEAD/기타 (제외)' END AS grp,
         COUNT(*)::text AS detail
  FROM classified
  GROUP BY is_live_daily

  UNION ALL
  -- 2) 살아있는 daily 페이지별 분해
  SELECT '2. LIVE 페이지별',
         page_date::text || ' | ' || COALESCE(owner,'(?)') || ' | master=' || COALESCE(owner_master::text,'?'),
         COUNT(*)::text
  FROM classified
  WHERE is_live_daily
  GROUP BY page_date, owner, owner_master
) z
ORDER BY q, grp DESC;
-- 확인 포인트: 구역1 의 'LIVE daily' 값 = STEP2 가 실제로 바꿀 수. 이 값으로 STEP2 진행.
