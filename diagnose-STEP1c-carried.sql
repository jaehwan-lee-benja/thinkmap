-- ============================================================================
-- STEP1c — 6/8 이월 토글의 section_id 가 "어느 페이지" 섹션을 가리키는지 (수정 없음)
-- 작성: 2026-06-09
-- 목적: 173개 이월 토글이 6/8 섹션이 아닌 다른 날짜(6/7 등) 섹션을 참조하는지 확정.
--       = carry-over 섹션 재매핑 깨짐(RLS 로 master 섹션이 currentRows 에서 가려짐) 입증.
-- 실행: SQL Editor 전체 복붙 후 Run.
-- ============================================================================

WITH p68 AS (   -- 6/8 비마스터 페이지
  SELECT id FROM pages
  WHERE page_type='daily' AND page_date='2026-06-08' AND deleted_at IS NULL
    AND user_id IN (SELECT auth_uid FROM app_users WHERE role <> 'master')
),
master_sections AS (
  SELECT block_id, page_id FROM daily_blocks
  WHERE block_type='section' AND visibility='master' AND deleted_at IS NULL
),
mytoggles AS (   -- 6/8 의 master 섹션 아래 'all' 비-section 블록
  SELECT t.block_id, t.section_id, t.is_carry_over, t.text_content
  FROM daily_blocks t
  JOIN master_sections ms ON ms.block_id = t.section_id
  WHERE t.page_id IN (SELECT id FROM p68)
    AND t.block_type <> 'section' AND t.visibility='all' AND t.deleted_at IS NULL
)
SELECT q, grp, cnt, sample FROM (
  -- 1) section_id 가 가리키는 섹션 행이 "어느 페이지/날짜"에 있나
  SELECT '1. 이월토글 section_id 의 소속 페이지'::text AS q,
         CASE
           WHEN sec.page_id IN (SELECT id FROM p68) THEN 'on 6/8 (정상 위치)'
           ELSE 'OTHER page: '||COALESCE(sp.page_date::text,'(섹션행 없음)')
         END AS grp,
         COUNT(*)::bigint AS cnt,
         MIN(LEFT(mt.text_content, 30)) AS sample
  FROM mytoggles mt
  LEFT JOIN daily_blocks sec ON sec.block_id = mt.section_id AND sec.block_type='section'
  LEFT JOIN pages sp ON sp.id = sec.page_id
  GROUP BY 2

  UNION ALL
  -- 2) carry 여부 × 위치 교차 (18 vs 173 재확인)
  SELECT '2. carry × 위치',
         'carry='||mt.is_carry_over||' | '||
         CASE WHEN sec.page_id IN (SELECT id FROM p68) THEN 'on 6/8' ELSE 'other page' END,
         COUNT(*)::bigint,
         NULL
  FROM mytoggles mt
  LEFT JOIN daily_blocks sec ON sec.block_id = mt.section_id AND sec.block_type='section'
  GROUP BY 2
) z
ORDER BY q, grp;
