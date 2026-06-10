-- ============================================================================
-- 6/7 → 새 6/9 마스터 콘텐츠 이월 점검 (수정 없음)
-- 작성: 2026-06-09
-- 목적: 비마스터가 만든 새 6/9 페이지에 마스터 섹션 콘텐츠가 왜 비었는지.
--       6/7 에 이월될 콘텐츠가 있는지 / 6/9 가 정말 비었는지 / 무엇이 이월돼야 하는지.
-- 실행: SQL Editor 전체 복붙 후 Run.  board_id = 업무일지.
-- ============================================================================

WITH board AS (SELECT '0fcc0fee-9467-49f5-a5c2-5b9952964351'::uuid AS id),
pages_x AS (   -- 이 보드의 6/7, 6/9 daily 페이지 (삭제 안 된 것)
  SELECT p.id, p.page_date, u.email AS owner, (au.role='master') AS owner_master
  FROM pages p
  CROSS JOIN board b
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN app_users au ON au.auth_uid = p.user_id
  WHERE p.parent_id = b.id AND p.page_type='daily' AND p.deleted_at IS NULL
    AND p.page_date IN ('2026-06-07','2026-06-09')
),
sec AS (   -- 각 페이지의 섹션 행
  SELECT db.page_id, db.block_id, db.section_master_id, db.visibility AS sec_vis, db.text_content AS sec_title
  FROM daily_blocks db
  WHERE db.block_type='section' AND db.deleted_at IS NULL
    AND db.page_id IN (SELECT id FROM pages_x)
),
content AS (  -- 각 섹션 아래 "내용 있는" 비-section 블록 (빈 토글 제외)
  SELECT db.page_id, db.section_id,
         COUNT(*) FILTER (WHERE btrim(COALESCE(db.text_content,'')) <> '') AS content_blocks,
         COUNT(*) FILTER (WHERE db.is_carry_over) AS carried_blocks,
         COUNT(*) AS all_blocks
  FROM daily_blocks db
  WHERE db.block_type <> 'section' AND db.deleted_at IS NULL
    AND db.page_id IN (SELECT id FROM pages_x)
  GROUP BY db.page_id, db.section_id
)
SELECT q, grp, detail FROM (
  -- 1) 페이지 요약
  SELECT '1. 페이지'::text AS q,
         px.page_date||' | '||px.owner||' | master='||px.owner_master AS grp,
         ('sections='||(SELECT COUNT(*) FROM sec s WHERE s.page_id=px.id)
          ||' | content_blocks='||(SELECT COALESCE(SUM(content_blocks),0) FROM content c WHERE c.page_id=px.id))::text AS detail
  FROM pages_x px

  UNION ALL
  -- 2) master 섹션별 콘텐츠 수 (6/7 vs 6/9 비교 — 6/7 엔 있고 6/9 엔 0 이면 미이월 확정)
  SELECT '2. master섹션 콘텐츠(날짜별)',
         s.sec_title||'  ['||px.page_date||']',
         ('vis='||s.sec_vis||' | content='||COALESCE(c.content_blocks,0)||' | carried='||COALESCE(c.carried_blocks,0))::text
  FROM sec s
  JOIN pages_x px ON px.id = s.page_id
  LEFT JOIN content c ON c.page_id = s.page_id AND c.section_id = s.block_id
  WHERE s.sec_vis = 'master'

  UNION ALL
  -- 3) 6/7 에서 "이월돼야 할" 후보 (master 섹션 아래, 텍스트 있는 미완료/일반 토글)
  SELECT '3. 6/7 이월후보 합계(master섹션)',
         'count',
         (SELECT COUNT(*)::text
          FROM daily_blocks db
          JOIN sec s ON s.block_id = db.section_id AND s.sec_vis='master'
          JOIN pages_x px ON px.id = db.page_id AND px.page_date='2026-06-07'
          WHERE db.block_type='toggle' AND db.deleted_at IS NULL
            AND btrim(COALESCE(db.text_content,'')) <> ''
            AND NOT (db.is_todo AND db.todo_checked))
) z
ORDER BY q, grp;
