-- ============================================================================
-- STEP1b 분해 진단 — "master 섹션 아래 'all' 블록"의 정체 파악 (수정 없음)
-- 작성: 2026-06-09
-- 실행: SQL Editor 에 전체 복붙 후 Run.
--   목적: STEP1 의 큰 숫자(6/8=192, 마스터 페이지 30~230)가 무엇인지 분해.
--         block_type × is_carry_over × visibility 로 쪼개서 18 vs 192 를 설명한다.
--   결과: q(구역) / grp(분류) / cnt(건수) 한 그리드.
-- ============================================================================

WITH master_sections AS (
  SELECT block_id FROM daily_blocks
  WHERE block_type='section' AND visibility='master' AND deleted_at IS NULL
),
under_master AS (   -- master 섹션 아래의 비-section 블록 (visibility 무관) + 페이지 메타
  SELECT
    t.block_id, t.page_id, t.block_type, t.visibility, t.is_carry_over,
    (t.text_content IS NULL OR btrim(t.text_content)='') AS is_empty,
    p.page_date,
    (au.role='master') AS owner_is_master
  FROM daily_blocks t
  JOIN master_sections ms ON ms.block_id = t.section_id
  JOIN pages p ON p.id = t.page_id
  LEFT JOIN app_users au ON au.auth_uid = p.user_id
  WHERE t.block_type <> 'section' AND t.deleted_at IS NULL
    AND p.page_type='daily' AND p.deleted_at IS NULL
)
SELECT q, grp, cnt FROM (
  -- 1) 6/8 비마스터 페이지: block_type × visibility × carry-over × 빈블록 분해
  SELECT '1. 6/8 페이지 분해'::text AS q,
         (block_type||' | vis='||visibility||' | carry='||is_carry_over||' | empty='||is_empty) AS grp,
         COUNT(*)::bigint AS cnt
  FROM under_master
  WHERE page_date='2026-06-08' AND owner_is_master = false
  GROUP BY 2

  UNION ALL
  -- 2) 6/8 페이지: visibility 별 합계 (18 vs 192 빠른 대조)
  SELECT '2. 6/8 visibility 합계',
         'vis='||visibility, COUNT(*)::bigint
  FROM under_master
  WHERE page_date='2026-06-08' AND owner_is_master = false
  GROUP BY 2

  UNION ALL
  -- 3) 마스터 페이지 6/9: block_type × visibility × carry-over 분해 (마스터 실작업 정체)
  SELECT '3. 6/9 마스터페이지 분해',
         (block_type||' | vis='||visibility||' | carry='||is_carry_over),
         COUNT(*)::bigint
  FROM under_master
  WHERE page_date='2026-06-09' AND owner_is_master = true
  GROUP BY 2

  UNION ALL
  -- 4) 전체 영향 요약: owner 마스터 여부별 페이지수 / 'all' 블록수
  SELECT '4. 전체 영향 요약',
         'owner_is_master='||owner_is_master||' | vis='||visibility,
         COUNT(*)::bigint
  FROM under_master
  GROUP BY owner_is_master, visibility
) z
ORDER BY q, grp;
