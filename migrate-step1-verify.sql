-- STEP 1 적용 결과 통합 검증 — 1 ~ 5 한 번에.
SELECT '1) board_id col on worklog_sections'      AS check,
       (SELECT COUNT(*)::text FROM information_schema.columns
        WHERE table_name='worklog_sections' AND column_name='board_id')  AS value
UNION ALL
SELECT '2) is_board=true pages (= 보드 수)',
       (SELECT COUNT(*)::text FROM pages WHERE is_board = true)
UNION ALL
SELECT '3) new tables created',
       (SELECT COUNT(*)::text FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN ('worklog_board_members','worklog_board_user_settings'))
UNION ALL
SELECT '4) board_members rows (expect 0)',
       (SELECT COUNT(*)::text FROM worklog_board_members)
UNION ALL
SELECT '5) board_user_settings rows (expect 0)',
       (SELECT COUNT(*)::text FROM worklog_board_user_settings);
